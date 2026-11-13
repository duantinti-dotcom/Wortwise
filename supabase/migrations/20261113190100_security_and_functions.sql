-- Worthwise — RLS, cotas, créditos, cobrança e funções de servidor

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Tabelas privadas simples: dono lê e escreve.
do $$
declare t text;
begin
  foreach t in array array['favorites', 'collections', 'collection_items', 'supplier_quotes',
                           'simulations', 'ai_conversations', 'reports'] loop
    execute format($f$create policy %I on public.%I for all to authenticated
      using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))$f$, t || '_owner', t);
  end loop;
end $$;

create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_admin());
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid()) or public.is_admin())
  with check (id = (select auth.uid()) or public.is_admin());

create policy user_roles_select on public.user_roles for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

create policy plans_read on public.plans for select to anon, authenticated using (true);
create policy plans_admin on public.plans for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy plan_quotas_read on public.plan_quotas for select to anon, authenticated using (true);
create policy plan_quotas_admin on public.plan_quotas for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy subscriptions_select on public.subscriptions for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());
create policy payments_select on public.payments for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());
create policy webhook_events_admin on public.webhook_events for select to authenticated
  using (public.is_admin());
create policy usage_select on public.usage_counters for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());
create policy signup_events_admin on public.signup_events for select to authenticated
  using (public.is_admin());

create policy data_sources_read on public.data_sources for select to anon, authenticated using (true);
create policy data_sources_admin on public.data_sources for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy products_read on public.products for select to authenticated using (true);
create policy offers_read on public.offers for select to authenticated using (true);
create policy price_obs_read on public.price_observations for select to authenticated using (true);
create policy demand_read on public.demand_signals for select to authenticated using (true);
create policy api_usage_admin on public.api_usage_logs for select to authenticated using (public.is_admin());

-- Pesquisas: leitura pelo dono; escrita apenas via record_search().
create policy searches_select on public.searches for select to authenticated
  using (user_id = (select auth.uid()));
create policy searches_delete on public.searches for delete to authenticated
  using (user_id = (select auth.uid()));

-- Fornecedores: diretório (owner_id null) é público para usuários logados; privados só do dono.
create policy suppliers_select on public.suppliers for select to authenticated
  using (owner_id is null or owner_id = (select auth.uid()) or public.is_admin());
create policy suppliers_insert on public.suppliers for insert to authenticated
  with check ((owner_id = (select auth.uid()) and verification_status = 'unverified') or public.is_admin());
create policy suppliers_update on public.suppliers for update to authenticated
  using (owner_id = (select auth.uid()) or public.is_admin())
  with check (owner_id = (select auth.uid()) or public.is_admin());
create policy suppliers_delete on public.suppliers for delete to authenticated
  using (owner_id = (select auth.uid()) or public.is_admin());
create policy supplier_verif_select on public.supplier_verifications for select to authenticated
  using (exists (select 1 from public.suppliers s where s.id = supplier_id
                 and (s.owner_id is null or s.owner_id = (select auth.uid()) or public.is_admin())));

-- O status de verificação só muda por procedimento real (função de servidor) ou por administrador.
create or replace function public.protect_supplier_verification()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') and not public.is_admin() then
    new.verification_status := old.verification_status;
    new.verified_at := old.verified_at;
    new.owner_id := old.owner_id;
    if new.cnpj is distinct from old.cnpj then
      new.verification_status := 'unverified';
      new.verified_at := null;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger suppliers_protect before update on public.suppliers
  for each row execute function public.protect_supplier_verification();

create policy watches_select on public.watches for select to authenticated using (user_id = (select auth.uid()));
create policy watches_insert on public.watches for insert to authenticated with check (user_id = (select auth.uid()));
create policy watches_update on public.watches for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy watches_delete on public.watches for delete to authenticated using (user_id = (select auth.uid()));

create policy alerts_select on public.alerts for select to authenticated using (user_id = (select auth.uid()));
create policy alerts_update on public.alerts for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy alerts_delete on public.alerts for delete to authenticated using (user_id = (select auth.uid()));

create policy ai_messages_select on public.ai_messages for select to authenticated
  using (user_id = (select auth.uid()));

create policy app_settings_read on public.app_settings for select to anon, authenticated using (true);
create policy app_settings_admin on public.app_settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy audit_admin on public.admin_audit_logs for select to authenticated using (public.is_admin());

create policy blog_read on public.blog_posts for select to anon, authenticated
  using (status = 'published' or public.is_admin());
create policy blog_admin on public.blog_posts for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- checkout_intents, rate_limits: sem políticas (apenas funções security definer).

-- ---------------------------------------------------------------------------
-- Plano atual e cotas
-- ---------------------------------------------------------------------------
create or replace function public.plan_of(p_user uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select s.plan_id from public.subscriptions s
      where s.user_id = p_user
        and s.status in ('active', 'past_due', 'canceled')
        and s.current_period_end > now()
      limit 1),
    'free');
$$;
revoke all on function public.plan_of(uuid) from public, anon, authenticated;

create or replace function public.my_plan()
returns text language sql stable security definer set search_path = '' as $$
  select public.plan_of((select auth.uid()));
$$;

create or replace function app_private.period_key(p_period text)
returns text language sql stable set search_path = '' as $$
  select case when p_period = 'month'
    then to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM') else 'total' end;
$$;

-- Resumo de uso do usuário logado: [{resource, limit, used, period}]
create or replace function public.my_usage()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_plan text; v_out jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  v_plan := public.plan_of(v_uid);
  select jsonb_build_object('plan', v_plan, 'quotas', coalesce(jsonb_agg(jsonb_build_object(
    'resource', q.resource, 'limit', q.limit_value, 'period', q.period,
    'used', case q.resource
      when 'watch' then (select count(*) from public.watches w where w.user_id = v_uid and w.active)
      when 'collection' then (select count(*) from public.collections c where c.user_id = v_uid)
      when 'simulation_saved' then (select count(*) from public.simulations s where s.user_id = v_uid)
      else coalesce((select u.used from public.usage_counters u
                     where u.user_id = v_uid and u.resource = q.resource
                       and u.period_key = app_private.period_key(q.period)), 0)
    end)), '[]'::jsonb))
  into v_out from public.plan_quotas q where q.plan_id = v_plan;
  return v_out;
end $$;

-- Consumo atômico: incrementa somente se ainda houver saldo. Retorna o restante ou -1 se esgotado.
create or replace function app_private.consume(p_user uuid, p_resource text, p_amount integer default 1)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_plan text; v_limit integer; v_period text; v_key text; v_used integer;
begin
  v_plan := public.plan_of(p_user);
  select limit_value, period into v_limit, v_period
    from public.plan_quotas where plan_id = v_plan and resource = p_resource;
  if v_limit is null or v_period = 'count' then return -1; end if;
  v_key := app_private.period_key(v_period);
  insert into public.usage_counters as u (user_id, resource, period_key, used)
    values (p_user, p_resource, v_key, p_amount)
  on conflict (user_id, resource, period_key)
    do update set used = u.used + p_amount, updated_at = now()
    where u.used + p_amount <= v_limit
  returning used into v_used;
  if v_used is null or v_used > v_limit then
    -- Linha nova acima do limite (limite 0) ou conflito sem saldo.
    if v_used is not null then
      update public.usage_counters set used = used - p_amount
        where user_id = p_user and resource = p_resource and period_key = v_key;
    end if;
    return -1;
  end if;
  return v_limit - v_used;
end $$;

create or replace function app_private.remaining(p_user uuid, p_resource text)
returns integer language sql stable security definer set search_path = '' as $$
  select q.limit_value - coalesce((select u.used from public.usage_counters u
      where u.user_id = p_user and u.resource = p_resource
        and u.period_key = app_private.period_key(q.period)), 0)
  from public.plan_quotas q
  where q.plan_id = public.plan_of(p_user) and q.resource = p_resource;
$$;

create or replace function app_private.assert_active_user(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_user is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if exists (select 1 from public.profiles where id = p_user and blocked_at is not null) then
    raise exception 'account_blocked' using errcode = '42501';
  end if;
end $$;

-- Pré-checagem antes de consultar fontes externas (não consome).
create or replace function public.search_precheck(p_fingerprint text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_search public.searches; v_rem integer;
begin
  perform app_private.assert_active_user(v_uid);
  select * into v_search from public.searches where user_id = v_uid and fingerprint = p_fingerprint;
  if found then
    update public.searches set last_opened_at = now() where id = v_search.id;
    return jsonb_build_object('status', 'cached', 'search_id', v_search.id, 'results', v_search.results,
      'sources', v_search.sources, 'created_at', v_search.created_at,
      'remaining', app_private.remaining(v_uid, 'search'), 'plan', public.plan_of(v_uid));
  end if;
  v_rem := coalesce(app_private.remaining(v_uid, 'search'), 0);
  if v_rem <= 0 then
    return jsonb_build_object('status', 'quota_exceeded', 'remaining', 0, 'plan', public.plan_of(v_uid));
  end if;
  return jsonb_build_object('status', 'proceed', 'remaining', v_rem, 'plan', public.plan_of(v_uid));
end $$;

-- Registra uma pesquisa entregue e consome 1 crédito de forma atômica.
-- A mesma pesquisa (mesmo fingerprint) nunca é cobrada duas vezes, mesmo em requisições simultâneas.
create or replace function public.record_search(
  p_fingerprint text, p_query text, p_filters jsonb, p_results jsonb, p_sources jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_id uuid; v_rem integer; v_count integer;
begin
  perform app_private.assert_active_user(v_uid);
  v_count := coalesce(jsonb_array_length(p_results), 0);
  if v_count = 0 then
    return jsonb_build_object('status', 'empty', 'remaining', app_private.remaining(v_uid, 'search'));
  end if;
  if char_length(p_fingerprint) > 128 or char_length(p_query) > 200 or pg_column_size(p_results) > 600000 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || p_fingerprint, 0));
  select id into v_id from public.searches where user_id = v_uid and fingerprint = p_fingerprint;
  if found then
    return jsonb_build_object('status', 'cached', 'search_id', v_id,
      'remaining', app_private.remaining(v_uid, 'search'));
  end if;
  v_rem := app_private.consume(v_uid, 'search', 1);
  if v_rem < 0 then
    return jsonb_build_object('status', 'quota_exceeded', 'remaining', 0);
  end if;
  insert into public.searches (user_id, fingerprint, query, filters, result_count, results, sources)
    values (v_uid, p_fingerprint, p_query, coalesce(p_filters, '{}'), v_count, p_results, coalesce(p_sources, '[]'))
    returning id into v_id;
  return jsonb_build_object('status', 'charged', 'search_id', v_id, 'remaining', v_rem);
end $$;

-- Consumo genérico para recursos medidos (IA, exportações).
create or replace function public.consume_quota(p_resource text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_rem integer;
begin
  perform app_private.assert_active_user(v_uid);
  if p_resource not in ('ai_message', 'export') then
    raise exception 'invalid_resource' using errcode = '22023';
  end if;
  v_rem := app_private.consume(v_uid, p_resource, 1);
  return jsonb_build_object('allowed', v_rem >= 0, 'remaining', greatest(v_rem, 0), 'plan', public.plan_of(v_uid));
end $$;

-- Limites por contagem (itens simultâneos).
create or replace function public.enforce_count_quota()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_limit integer; v_count integer; v_resource text := tg_argv[0];
begin
  select limit_value into v_limit from public.plan_quotas
    where plan_id = public.plan_of(new.user_id) and resource = v_resource;
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text || ':' || v_resource, 0));
  execute format('select count(*) from public.%I where user_id = $1 %s', tg_table_name,
    case when tg_table_name = 'watches' then 'and active' else '' end)
    into v_count using new.user_id;
  if v_count >= coalesce(v_limit, 0) then
    raise exception 'quota_exceeded:%', v_resource using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger watches_quota before insert on public.watches
  for each row execute function public.enforce_count_quota('watch');
create trigger collections_quota before insert on public.collections
  for each row execute function public.enforce_count_quota('collection');
create trigger simulations_quota before insert on public.simulations
  for each row execute function public.enforce_count_quota('simulation_saved');

-- Reativar um monitoramento também respeita a cota.
create or replace function public.enforce_watch_reactivation()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_limit integer; v_count integer;
begin
  if new.active and not old.active then
    select limit_value into v_limit from public.plan_quotas
      where plan_id = public.plan_of(new.user_id) and resource = 'watch';
    select count(*) into v_count from public.watches where user_id = new.user_id and active;
    if v_count >= coalesce(v_limit, 0) then
      raise exception 'quota_exceeded:watch' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create trigger watches_reactivate before update on public.watches
  for each row execute function public.enforce_watch_reactivation();

-- ---------------------------------------------------------------------------
-- Rate limiting (janela fixa)
-- ---------------------------------------------------------------------------
create or replace function app_private.rate_hit(p_key text, p_limit integer, p_window integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_start timestamptz; v_count integer;
begin
  v_start := to_timestamp(floor(extract(epoch from now()) / p_window) * p_window);
  insert into public.rate_limits as r (key, window_start, count) values (p_key, v_start, 1)
  on conflict (key, window_start) do update set count = r.count + 1
  returning count into v_count;
  return v_count <= p_limit;
end $$;

-- Por usuário logado. Os limites são fixos no banco para que o cliente não possa escolhê-los.
create or replace function public.rate_limit_me(p_bucket text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_limit integer; v_window integer;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  case p_bucket
    when 'search' then v_limit := 12; v_window := 60;
    when 'assistant' then v_limit := 10; v_window := 60;
    when 'checkout' then v_limit := 5; v_window := 600;
    when 'verify' then v_limit := 6; v_window := 600;
    when 'product' then v_limit := 40; v_window := 60;
    else raise exception 'invalid_bucket' using errcode = '22023';
  end case;
  return app_private.rate_hit('u:' || v_uid::text || ':' || p_bucket, v_limit, v_window);
end $$;

create or replace function public.server_rate_limit(p_secret text, p_key text, p_limit integer, p_window integer)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.check_secret(p_secret);
  return app_private.rate_hit(p_key, p_limit, p_window);
end $$;

-- ---------------------------------------------------------------------------
-- Checkout e cobrança
-- ---------------------------------------------------------------------------
create or replace function public.create_checkout_intent(p_plan text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_plan public.plans; v_token text; v_current text;
begin
  perform app_private.assert_active_user(v_uid);
  select * into v_plan from public.plans where id = p_plan and active and price_cents > 0;
  if not found then raise exception 'invalid_plan' using errcode = '22023'; end if;
  v_current := public.plan_of(v_uid);
  if v_current <> 'free' and exists (select 1 from public.subscriptions
      where user_id = v_uid and status = 'active' and current_period_end > now()) then
    return jsonb_build_object('status', 'already_subscribed', 'plan', v_current);
  end if;
  v_token := 'ww_' || replace(gen_random_uuid()::text, '-', '');
  insert into public.checkout_intents (token, user_id, plan_id) values (v_token, v_uid, p_plan);
  return jsonb_build_object('status', 'ok', 'token', v_token, 'plan', p_plan,
    'price_cents', v_plan.price_cents, 'checkout_url', v_plan.provider_checkout_url);
end $$;

create or replace function app_private.to_cents(p text)
returns integer language plpgsql immutable set search_path = '' as $$
begin
  if p is null or btrim(p) = '' then return null; end if;
  return round(replace(btrim(p), ',', '.')::numeric * 100)::integer;
exception when others then return null;
end $$;

create or replace function app_private.to_ts(p text)
returns timestamptz language plpgsql immutable set search_path = '' as $$
begin
  if p is null or btrim(p) = '' then return null; end if;
  return p::timestamptz;
exception when others then return null;
end $$;

-- Aplica um evento de webhook HeroPay já com assinatura validada pelo servidor.
-- Idempotente: (provider, dedupe_key) único; ações são "definir estado", nunca "somar".
create or replace function public.server_apply_billing_event(
  p_secret text, p_trigger text, p_dedupe_key text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_event_id bigint; v_src text; v_email text; v_user uuid; v_plan text; v_plan_row public.plans;
  v_amount integer; v_pay_id text; v_sub_ext text; v_next timestamptz; v_outcome text; v_sub_id uuid;
  v_intent public.checkout_intents;
begin
  perform app_private.check_secret(p_secret);
  insert into public.webhook_events (provider, dedupe_key, trigger, payload)
    values ('heropay', p_dedupe_key, p_trigger, p_payload)
    on conflict (provider, dedupe_key) do nothing
    returning id into v_event_id;
  if v_event_id is null then
    return jsonb_build_object('outcome', 'duplicate');
  end if;

  v_src := nullif(p_payload #>> '{cart,src}', '');
  v_email := lower(nullif(p_payload #>> '{buyer,email}', ''));
  v_pay_id := nullif(p_payload #>> '{payment,id}', '');
  v_sub_ext := nullif(p_payload #>> '{subscription,id}', '');
  v_amount := app_private.to_cents(p_payload #>> '{payment,value}');
  v_next := coalesce(app_private.to_ts(p_payload #>> '{subscription,next_invoice_at}'),
                     app_private.to_ts(p_payload #>> '{subscription,available_until}'),
                     app_private.to_ts(p_payload #>> '{subscription,expiration_at}'));

  -- 1) Identificação do usuário: token do checkout (cart.src) > assinatura conhecida > e-mail confirmado.
  if v_src is not null then
    select * into v_intent from public.checkout_intents where token = v_src;
    if found then v_user := v_intent.user_id; v_plan := v_intent.plan_id; end if;
  end if;
  if v_user is null and v_sub_ext is not null then
    select user_id, plan_id into v_user, v_plan from public.subscriptions
      where provider = 'heropay' and provider_subscription_id = v_sub_ext;
  end if;
  if v_user is null and v_email is not null then
    select id into v_user from auth.users where lower(email) = v_email and email_confirmed_at is not null;
    if v_user is not null then
      select plan_id into v_plan from public.subscriptions where user_id = v_user;
    end if;
  end if;
  if v_user is null then
    update public.webhook_events set outcome = 'unmatched_user' where id = v_event_id;
    return jsonb_build_object('outcome', 'unmatched_user');
  end if;
  if v_plan is null then
    -- Último recurso: plano pago cujo preço corresponde exatamente ao valor cobrado.
    select id into v_plan from public.plans where price_cents = v_amount and price_cents > 0 and active limit 1;
  end if;
  select * into v_plan_row from public.plans where id = v_plan;

  if p_trigger in ('spark_payment_confirmed', 'subscription_activate') then
    if v_plan_row.id is null then
      v_outcome := 'unknown_plan';
    elsif p_trigger = 'spark_payment_confirmed' and (v_amount is null or v_amount < v_plan_row.price_cents) then
      -- Valor não confere: registra o pagamento, mas não libera acesso.
      v_outcome := 'amount_mismatch';
    else
      insert into public.subscriptions as s (user_id, plan_id, status, provider_subscription_id,
          payment_method, current_period_end, cancel_at_period_end, canceled_at, cancel_reason)
        values (v_user, v_plan, 'active', v_sub_ext, p_payload #>> '{payment,method}',
          coalesce(v_next, now() + interval '1 month') + interval '2 days', false, null, null)
      on conflict (user_id) do update set
        plan_id = excluded.plan_id, status = 'active',
        provider_subscription_id = coalesce(excluded.provider_subscription_id, s.provider_subscription_id),
        payment_method = coalesce(excluded.payment_method, s.payment_method),
        current_period_end = greatest(excluded.current_period_end, s.current_period_end),
        cancel_at_period_end = false, canceled_at = null, cancel_reason = null, updated_at = now()
      returning id into v_sub_id;
      update public.checkout_intents set consumed_at = now() where token = v_src and consumed_at is null;
      v_outcome := 'activated';
    end if;
    if p_trigger = 'spark_payment_confirmed' and v_pay_id is not null then
      insert into public.payments (user_id, subscription_id, provider_payment_id, plan_id, amount_cents,
          net_cents, method, status, occurred_at)
        values (v_user, v_sub_id, v_pay_id, v_plan, v_amount,
          nullif(p_payload #>> '{payment,net_value_cents}', '')::integer,
          p_payload #>> '{payment,method}', 'paid', app_private.to_ts(p_payload #>> '{payment,date}'))
      on conflict (provider, provider_payment_id) do update set status = 'paid';
    end if;

  elsif p_trigger = 'subscription_update' then
    update public.subscriptions set
      provider_subscription_id = coalesce(v_sub_ext, provider_subscription_id),
      current_period_end = case when v_next is not null and status in ('active', 'past_due')
        then greatest(current_period_end, v_next + interval '2 days') else current_period_end end,
      updated_at = now()
    where user_id = v_user;
    v_outcome := 'synced';

  elsif p_trigger = 'payment_credit_cart_refused' then
    update public.subscriptions set status = 'past_due', updated_at = now()
      where user_id = v_user and status = 'active';
    if v_pay_id is not null then
      insert into public.payments (user_id, provider_payment_id, plan_id, amount_cents, method, status,
          refused_message, occurred_at)
        values (v_user, v_pay_id, v_plan, v_amount, 'credit_card', 'refused',
          left(p_payload #>> '{payment_methods,credit_card,refused_message}', 300),
          app_private.to_ts(p_payload #>> '{payment,date}'))
      on conflict (provider, provider_payment_id) do nothing;
    end if;
    v_outcome := 'past_due';

  elsif p_trigger = 'subscription_cancel' then
    -- Acesso permanece até o fim do período já pago.
    update public.subscriptions set status = 'canceled', cancel_at_period_end = true,
        canceled_at = coalesce(canceled_at, now()), cancel_reason = coalesce(cancel_reason, 'provider'),
        updated_at = now()
      where user_id = v_user and status <> 'expired';
    v_outcome := 'canceled';

  elsif p_trigger in ('refunded', 'chargeback_request') then
    -- Estorno/chargeback: benefício pago é revogado imediatamente.
    update public.subscriptions set status = 'expired', current_period_end = now(),
        canceled_at = coalesce(canceled_at, now()), cancel_reason = p_trigger, updated_at = now()
      where user_id = v_user;
    if v_pay_id is not null then
      insert into public.payments (user_id, provider_payment_id, plan_id, amount_cents, method, status, occurred_at)
        values (v_user, v_pay_id, v_plan, v_amount, p_payload #>> '{payment,method}',
          case when p_trigger = 'refunded' then 'refunded' else 'chargeback' end,
          app_private.to_ts(p_payload #>> '{payment,date}'))
      on conflict (provider, provider_payment_id) do update set status = excluded.status;
    end if;
    v_outcome := 'revoked';
  else
    v_outcome := 'ignored';
  end if;

  update public.webhook_events set outcome = v_outcome where id = v_event_id;
  return jsonb_build_object('outcome', v_outcome, 'user_id', v_user, 'plan', v_plan);
end $$;

-- Cancelamento solicitado pelo usuário e já confirmado pelo provedor (chamado pelo servidor).
create or replace function public.server_mark_canceled(p_secret text, p_user uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.check_secret(p_secret);
  update public.subscriptions set status = 'canceled', cancel_at_period_end = true,
    canceled_at = now(), cancel_reason = left(p_reason, 100), updated_at = now()
  where user_id = p_user and status in ('active', 'past_due');
end $$;

-- ---------------------------------------------------------------------------
-- Funções de servidor: catálogo, monitoramento, fontes, cadastro
-- ---------------------------------------------------------------------------
-- p_items: [{source, external_id, title, normalized_title, brand, model, gtin, category_id, category_name,
--            image_url, permalink, attributes, price, currency, metric_type, offers_count, available, observed_at}]
-- Grava observação de preço apenas quando o preço mudou ou a última tem mais de 6 horas.
create or replace function public.server_upsert_market_data(p_secret text, p_items jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_item jsonb; v_pid uuid; v_n integer := 0; v_last record; v_price numeric;
begin
  perform app_private.check_secret(p_secret);
  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into public.products as p (source, external_id, title, normalized_title, brand, model, gtin,
        category_id, category_name, image_url, permalink, attributes, provenance)
      values (v_item ->> 'source', v_item ->> 'external_id', v_item ->> 'title', v_item ->> 'normalized_title',
        v_item ->> 'brand', v_item ->> 'model', v_item ->> 'gtin', v_item ->> 'category_id',
        v_item ->> 'category_name', v_item ->> 'image_url', v_item ->> 'permalink',
        coalesce(v_item -> 'attributes', '{}'), coalesce(v_item -> 'provenance', '{}'))
    on conflict (source, external_id) do update set
      title = excluded.title, normalized_title = excluded.normalized_title,
      brand = coalesce(excluded.brand, p.brand), model = coalesce(excluded.model, p.model),
      gtin = coalesce(excluded.gtin, p.gtin), image_url = coalesce(excluded.image_url, p.image_url),
      permalink = coalesce(excluded.permalink, p.permalink), last_seen_at = now()
    returning id into v_pid;
    v_price := nullif(v_item ->> 'price', '')::numeric;
    if v_price is not null then
      select price, collected_at into v_last from public.price_observations
        where product_id = v_pid and metric_type = coalesce(v_item ->> 'metric_type', 'listing')
        order by collected_at desc limit 1;
      if v_last is null or v_last.price <> v_price or v_last.collected_at < now() - interval '6 hours' then
        insert into public.price_observations (product_id, source, metric_type, price, currency, offers_count,
            available, observed_at, provenance)
          values (v_pid, v_item ->> 'source', coalesce(v_item ->> 'metric_type', 'listing'), v_price,
            coalesce(v_item ->> 'currency', 'BRL'), nullif(v_item ->> 'offers_count', '')::integer,
            nullif(v_item ->> 'available', '')::boolean, app_private.to_ts(v_item ->> 'observed_at'),
            coalesce(v_item -> 'provenance', '{}'));
        v_n := v_n + 1;
      end if;
    end if;
  end loop;
  return v_n;
end $$;

create or replace function public.server_set_source_status(
  p_secret text, p_source text, p_status text, p_detail text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.check_secret(p_secret);
  update public.data_sources set status = p_status, status_detail = left(p_detail, 300),
    last_ok_at = case when p_status = 'connected' then now() else last_ok_at end,
    last_error_at = case when p_status = 'error' then now() else last_error_at end,
    updated_at = now()
  where id = p_source;
end $$;

create or replace function public.server_log_api(
  p_secret text, p_source text, p_endpoint text, p_status integer, p_ok boolean, p_ms integer, p_error text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.check_secret(p_secret);
  insert into public.api_usage_logs (source, endpoint, status, ok, duration_ms, error)
    values (p_source, left(p_endpoint, 200), p_status, p_ok, p_ms, left(p_error, 300));
end $$;

-- Monitoramentos devidos, agrupáveis por produto para evitar consultas repetidas à fonte.
create or replace function public.server_due_watches(p_secret text, p_limit integer, p_min_age_minutes integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_out jsonb;
begin
  perform app_private.check_secret(p_secret);
  select coalesce(jsonb_agg(to_jsonb(w)), '[]'::jsonb) into v_out from (
    select id, user_id, source, external_id, title, rule_type, threshold, last_price, last_currency
    from public.watches
    where active and (last_checked_at is null or last_checked_at < now() - make_interval(mins => p_min_age_minutes))
    order by last_checked_at nulls first
    limit p_limit) w;
  return v_out;
end $$;

-- Registra o resultado de uma verificação e cria alerta quando a regra dispara.
create or replace function public.server_record_watch_check(
  p_secret text, p_watch uuid, p_price numeric, p_currency text, p_error text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_w public.watches; v_fire boolean := false; v_title text; v_msg text;
begin
  perform app_private.check_secret(p_secret);
  select * into v_w from public.watches where id = p_watch for update;
  if not found then return jsonb_build_object('status', 'missing'); end if;
  if p_error is not null or p_price is null then
    update public.watches set last_checked_at = now(), last_error = left(coalesce(p_error, 'sem preço'), 200)
      where id = p_watch;
    return jsonb_build_object('status', 'error');
  end if;
  if v_w.rule_type = 'price_below' and p_price < v_w.threshold
     and (v_w.last_price is null or v_w.last_price >= v_w.threshold) then
    v_fire := true; v_title := 'Preço abaixo do alvo';
    v_msg := format('%s está por %s %s, abaixo do seu alvo de %s.', v_w.title, p_currency, p_price, v_w.threshold);
  elsif v_w.rule_type = 'price_drop_pct' and v_w.last_price is not null and v_w.last_price > 0
     and (v_w.last_price - p_price) / v_w.last_price * 100 >= v_w.threshold then
    v_fire := true; v_title := 'Queda de preço';
    v_msg := format('%s caiu de %s para %s %s.', v_w.title, v_w.last_price, p_price, p_currency);
  elsif v_w.rule_type = 'any_change' and v_w.last_price is not null and v_w.last_price <> p_price then
    v_fire := true; v_title := 'Preço alterado';
    v_msg := format('%s mudou de %s para %s %s.', v_w.title, v_w.last_price, p_price, p_currency);
  end if;
  if v_fire then
    insert into public.alerts (user_id, watch_id, kind, title, message, data)
      values (v_w.user_id, v_w.id, v_w.rule_type, v_title, v_msg,
        jsonb_build_object('previous', v_w.last_price, 'current', p_price, 'currency', p_currency,
          'source', v_w.source, 'external_id', v_w.external_id));
  end if;
  update public.watches set last_price = p_price, last_currency = p_currency, last_checked_at = now(),
    last_error = null where id = p_watch;
  return jsonb_build_object('status', 'ok', 'alert', v_fire);
end $$;

-- Registro antifraude do cadastro. Não bloqueia: apenas sinaliza para revisão quando há muitas contas
-- recentes no mesmo IP (IP compartilhado é comum; por isso o limite é alto e a ação é só um sinal).
create or replace function public.server_register_signup(p_secret text, p_user uuid, p_ip_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  perform app_private.check_secret(p_secret);
  if exists (select 1 from public.signup_events where user_id = p_user) then
    return jsonb_build_object('status', 'known');
  end if;
  insert into public.signup_events (user_id, ip_hash) values (p_user, p_ip_hash);
  select count(distinct user_id) into v_count from public.signup_events
    where ip_hash = p_ip_hash and created_at > now() - interval '7 days';
  if v_count > 5 then
    update public.profiles set risk_flag = 'many_accounts_same_network' where id = p_user;
  end if;
  return jsonb_build_object('status', 'recorded', 'accounts_same_network_7d', v_count);
end $$;

create or replace function public.server_record_verification(
  p_secret text, p_supplier uuid, p_status text, p_source text, p_result jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.check_secret(p_secret);
  insert into public.supplier_verifications (supplier_id, kind, status, source, result)
    values (p_supplier, 'cnpj_registry', p_status, p_source, p_result);
  if p_status = 'passed' then
    update public.suppliers set verification_status = 'doc_verified', verified_at = now(),
      legal_name = coalesce(p_result ->> 'razao_social', legal_name),
      city = coalesce(city, p_result ->> 'municipio'), state = coalesce(state, p_result ->> 'uf')
    where id = p_supplier;
  elsif p_status = 'failed' then
    update public.suppliers set verification_status = 'insufficient', verified_at = null where id = p_supplier;
  end if;
end $$;

create or replace function public.server_save_ai_message(
  p_secret text, p_conversation uuid, p_user uuid, p_role text, p_content text, p_blocks jsonb,
  p_model text, p_tokens_in integer, p_tokens_out integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform app_private.check_secret(p_secret);
  if not exists (select 1 from public.ai_conversations where id = p_conversation and user_id = p_user) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.ai_messages (conversation_id, user_id, role, content, blocks, model, tokens_in, tokens_out)
    values (p_conversation, p_user, p_role, p_content, coalesce(p_blocks, '[]'), p_model, p_tokens_in, p_tokens_out)
    returning id into v_id;
  update public.ai_conversations set updated_at = now() where id = p_conversation;
  return v_id;
end $$;

-- Retenção: IPs (90 dias), janelas de rate limit, logs técnicos (30 dias), intents antigos.
create or replace function public.server_purge(p_secret text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a integer; b integer; c integer;
begin
  perform app_private.check_secret(p_secret);
  delete from public.signup_events where created_at < now() - interval '90 days'; get diagnostics a = row_count;
  delete from public.rate_limits where window_start < now() - interval '1 day'; get diagnostics b = row_count;
  delete from public.api_usage_logs where created_at < now() - interval '30 days'; get diagnostics c = row_count;
  delete from public.checkout_intents where consumed_at is null and created_at < now() - interval '30 days';
  update public.subscriptions set status = 'expired', updated_at = now()
    where status in ('active', 'past_due', 'canceled') and current_period_end < now();
  return jsonb_build_object('signup_events', a, 'rate_limits', b, 'api_logs', c);
end $$;

-- ---------------------------------------------------------------------------
-- Conta e administração
-- ---------------------------------------------------------------------------
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if exists (select 1 from public.subscriptions where user_id = v_uid and status = 'active'
             and not cancel_at_period_end and current_period_end > now()) then
    raise exception 'active_subscription' using errcode = 'P0001';
  end if;
  delete from auth.users where id = v_uid;
end $$;

create or replace function public.admin_log(p_action text, p_target text, p_details jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into public.admin_audit_logs (admin_id, action, target, details)
    values ((select auth.uid()), p_action, p_target, coalesce(p_details, '{}'));
end $$;

create or replace function public.admin_overview()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'users', (select count(*) from public.profiles),
    'users_7d', (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'flagged', (select count(*) from public.profiles where risk_flag is not null),
    'subs_active', (select count(*) from public.subscriptions where status = 'active' and current_period_end > now()),
    'subs_past_due', (select count(*) from public.subscriptions where status = 'past_due'),
    'subs_canceled', (select count(*) from public.subscriptions where status in ('canceled', 'expired')),
    'subs_by_plan', (select coalesce(jsonb_object_agg(plan_id, n), '{}') from
        (select plan_id, count(*) n from public.subscriptions
          where status = 'active' and current_period_end > now() group by plan_id) x),
    'mrr_cents', (select coalesce(sum(p.price_cents), 0) from public.subscriptions s
        join public.plans p on p.id = s.plan_id
        where s.status = 'active' and not s.cancel_at_period_end and s.current_period_end > now()),
    'searches_total', (select count(*) from public.searches),
    'searches_30d', (select count(*) from public.searches where created_at > now() - interval '30 days'),
    'ai_messages_30d', (select count(*) from public.ai_messages
        where role = 'assistant' and created_at > now() - interval '30 days'),
    'ai_tokens_30d', (select coalesce(sum(coalesce(tokens_in, 0) + coalesce(tokens_out, 0)), 0)
        from public.ai_messages where created_at > now() - interval '30 days'),
    'watches_active', (select count(*) from public.watches where active),
    'alerts_30d', (select count(*) from public.alerts where created_at > now() - interval '30 days'),
    'api_calls_24h', (select count(*) from public.api_usage_logs where created_at > now() - interval '1 day'),
    'api_errors_24h', (select count(*) from public.api_usage_logs
        where not ok and created_at > now() - interval '1 day'),
    'webhooks_7d', (select count(*) from public.webhook_events where received_at > now() - interval '7 days')
  );
end $$;

create or replace function public.admin_list_users(p_search text, p_limit integer, p_offset integer)
returns table (id uuid, email text, full_name text, created_at timestamptz, plan text, risk_flag text,
               blocked_at timestamptz, searches bigint, is_admin boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select p.id, u.email::text, p.full_name, p.created_at, public.plan_of(p.id), p.risk_flag, p.blocked_at,
      (select count(*) from public.searches s where s.user_id = p.id),
      exists (select 1 from public.user_roles r where r.user_id = p.id)
    from public.profiles p join auth.users u on u.id = p.id
    where p_search is null or p_search = '' or u.email ilike '%' || p_search || '%'
       or p.full_name ilike '%' || p_search || '%'
    order by p.created_at desc
    limit least(coalesce(p_limit, 50), 100) offset coalesce(p_offset, 0);
end $$;

create or replace function public.admin_set_blocked(p_user uuid, p_blocked boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.profiles set blocked_at = case when p_blocked then now() else null end,
    risk_flag = case when p_blocked then risk_flag else null end where id = p_user;
  insert into public.admin_audit_logs (admin_id, action, target, details)
    values ((select auth.uid()), case when p_blocked then 'user.block' else 'user.unblock' end, p_user::text, '{}');
end $$;

-- ---------------------------------------------------------------------------
-- Permissões de execução
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
revoke execute on all functions in schema app_private from public, anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function
  public.server_rate_limit(text, text, integer, integer),
  public.server_apply_billing_event(text, text, text, jsonb),
  public.server_mark_canceled(text, uuid, text),
  public.server_upsert_market_data(text, jsonb),
  public.server_set_source_status(text, text, text, text),
  public.server_log_api(text, text, text, integer, boolean, integer, text),
  public.server_due_watches(text, integer, integer),
  public.server_record_watch_check(text, uuid, numeric, text, text),
  public.server_register_signup(text, uuid, text),
  public.server_record_verification(text, uuid, text, text, jsonb),
  public.server_save_ai_message(text, uuid, uuid, text, text, jsonb, text, integer, integer),
  public.server_purge(text)
  to anon, authenticated;
revoke execute on function public.plan_of(uuid), public.handle_new_user(), public.protect_profile_columns(),
  public.protect_supplier_verification(), public.enforce_count_quota(), public.enforce_watch_reactivation()
  from authenticated;
alter default privileges in schema public revoke execute on functions from public, anon;

-- Colunas sensíveis: clientes não escrevem diretamente em tabelas controladas pelo servidor.
revoke insert, update, delete on public.subscriptions, public.payments, public.webhook_events,
  public.usage_counters, public.checkout_intents, public.rate_limits, public.signup_events,
  public.products, public.offers, public.price_observations, public.demand_signals,
  public.api_usage_logs, public.user_roles, public.admin_audit_logs, public.searches,
  public.supplier_verifications, public.ai_messages, public.alerts
  from anon, authenticated;
grant delete on public.searches to authenticated;
grant update (read_at), delete on public.alerts to authenticated;
revoke all on all tables in schema public from anon;
grant select on public.plans, public.plan_quotas, public.data_sources, public.app_settings, public.blog_posts to anon;
