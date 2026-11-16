-- Planos novos (sem acesso grátis):
--   • inicial  — Primeiro mês, R$ 9,90 (pagamento único): libera o Essencial por 30 dias. Uma vez por pessoa,
--                aparelho e rede (mesmos identificadores em hash do cadastro).
--   • pro      — Essencial, R$ 19,90/mês.
--   • business — Profissional, R$ 39,90/mês.
--   • free     — continua existindo só como "sem plano" (sem cotas; não aparece na página de preços).

insert into public.plans (id, name, description, price_cents, billing_period, features, sort_order, active) values
  ('inicial', 'Primeiro mês', 'Experimente tudo do Essencial por 30 dias.', 990, 'once',
   '["Tudo do plano Essencial por 30 dias","Pagamento único: não renova sozinho","Uma vez por pessoa","Depois, continue no Essencial por R$ 19,90/mês"]', 0, true)
on conflict (id) do update set name = excluded.name, description = excluded.description, price_cents = excluded.price_cents,
  billing_period = excluded.billing_period, features = excluded.features, sort_order = excluded.sort_order, active = true, updated_at = now();

update public.plans set name = 'Essencial', description = 'Para quem vende e quer decidir com dados.', price_cents = 1990,
  features = '["Mais vendidos do Mercado Livre, Shopee, Amazon e TikTok Shop","150 pesquisas de produtos por mês","Wise, a assistente de vendas: 150 mensagens por mês","Calculadora de lucro e preço recomendado","Histórico de preço dos produtos","Comparador de fornecedores","15 produtos monitorados e 10 coleções"]',
  provider_link_id = null, provider_checkout_url = null, sort_order = 1, active = true, updated_at = now() where id = 'pro';
update public.plans set name = 'Profissional', description = 'Para quem vende todo dia e em várias lojas.', price_cents = 3990,
  features = '["Tudo do Essencial","500 pesquisas de produtos por mês","500 mensagens com a Wise por mês","60 produtos monitorados","50 coleções e 300 simulações salvas","Relatórios completos e 100 exportações por mês"]',
  provider_link_id = null, provider_checkout_url = null, sort_order = 2, active = true, updated_at = now() where id = 'business';
update public.plans set name = 'Sem plano', description = 'Conta sem assinatura.', active = false, updated_at = now() where id = 'free';

insert into public.plan_quotas (plan_id, resource, limit_value, period) values
  ('pro', 'search', 150, 'month'), ('pro', 'ai_message', 150, 'month'), ('pro', 'watch', 15, 'count'),
  ('pro', 'collection', 10, 'count'), ('pro', 'simulation_saved', 100, 'count'), ('pro', 'export', 20, 'month'),
  ('business', 'search', 500, 'month'), ('business', 'ai_message', 500, 'month'), ('business', 'watch', 60, 'count'),
  ('business', 'collection', 50, 'count'), ('business', 'simulation_saved', 300, 'count'), ('business', 'export', 100, 'month'),
  ('inicial', 'search', 150, 'month'), ('inicial', 'ai_message', 150, 'month'), ('inicial', 'watch', 15, 'count'),
  ('inicial', 'collection', 10, 'count'), ('inicial', 'simulation_saved', 100, 'count'), ('inicial', 'export', 20, 'month'),
  ('free', 'search', 0, 'total'), ('free', 'ai_message', 0, 'total'), ('free', 'watch', 0, 'count'),
  ('free', 'collection', 0, 'count'), ('free', 'simulation_saved', 0, 'count'), ('free', 'export', 0, 'month')
on conflict (plan_id, resource) do update set limit_value = excluded.limit_value, period = excluded.period;

-- Pode comprar o primeiro mês? Nunca pagou nada, não usou o primeiro mês e o aparelho/rede do cadastro
-- não pertencem a outra conta que já usou (ou que já teve o teste negado por isso).
create or replace function app_private.intro_eligible(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from public.payments where user_id = p_user and status = 'paid')
    and not exists (select 1 from public.subscriptions where user_id = p_user)
    and not exists (select 1 from public.checkout_intents where user_id = p_user and plan_id = 'inicial' and consumed_at is not null)
    and coalesce((select free_trial_denied is null from public.profiles where id = p_user), true)
    and not exists (
      select 1 from public.signup_events mine
      join public.signup_events other on other.user_id <> mine.user_id
        and (other.device_hash = mine.device_hash or (other.ip_hash = mine.ip_hash and other.created_at > now() - interval '90 days'))
      join public.checkout_intents ci on ci.user_id = other.user_id and ci.plan_id = 'inicial' and ci.consumed_at is not null
      where mine.user_id = p_user);
$$;

create or replace function public.my_intro_eligible()
returns boolean language sql stable security definer set search_path = '' as $$
  select app_private.intro_eligible((select auth.uid()));
$$;
grant execute on function public.my_intro_eligible() to authenticated;

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
  if p_plan = 'inicial' and not app_private.intro_eligible(v_uid) then
    return jsonb_build_object('status', 'intro_unavailable');
  end if;
  v_token := 'ww_' || replace(gen_random_uuid()::text, '-', '');
  insert into public.checkout_intents (token, user_id, plan_id) values (v_token, v_uid, p_plan);
  return jsonb_build_object('status', 'ok', 'token', v_token, 'plan', p_plan,
    'price_cents', v_plan.price_cents, 'checkout_url', v_plan.provider_checkout_url);
end $$;

CREATE OR REPLACE FUNCTION public.server_apply_billing_event(p_secret text, p_trigger text, p_dedupe_key text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_event_id bigint; v_src text; v_email text; v_user uuid; v_plan text; v_plan_row public.plans;
  v_amount integer; v_pay_id text; v_sub_ext text; v_next timestamptz; v_outcome text; v_sub_id uuid;
  v_intent public.checkout_intents; v_eff text;
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
  -- Primeiro mês (pagamento único): libera o Essencial (pro) por 30 dias.
  v_eff := case when v_plan = 'inicial' then 'pro' else v_plan end;
  if v_plan = 'inicial' then v_next := now() + interval '30 days'; v_sub_ext := null; end if;

  if p_trigger in ('spark_payment_confirmed', 'subscription_activate') then
    if v_plan_row.id is null then
      v_outcome := 'unknown_plan';
    elsif p_trigger = 'spark_payment_confirmed' and (v_amount is null or v_amount < v_plan_row.price_cents) then
      -- Valor não confere: registra o pagamento, mas não libera acesso.
      v_outcome := 'amount_mismatch';
    else
      insert into public.subscriptions as s (user_id, plan_id, status, provider_subscription_id,
          payment_method, current_period_end, cancel_at_period_end, canceled_at, cancel_reason)
        values (v_user, v_eff, 'active', v_sub_ext, p_payload #>> '{payment,method}',
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
end $function$
;
