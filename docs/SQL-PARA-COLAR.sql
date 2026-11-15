-- COLE TUDO NO SUPABASE: SQL Editor → New query → cole → Run
-- Liga: plano Ilimitado do dono, painel só para o dono e uma conta grátis por aparelho. Remove o usuário de teste.

-- Uma conta grátis por aparelho e por rede.
--
-- No cadastro o servidor registra dois identificadores, sempre como hash (nunca o valor puro):
--   • aparelho: um cookie aleatório do navegador (ww_did);
--   • rede: o IP de quem se cadastrou, com HMAC do segredo do servidor.
-- Se o aparelho já criou outra conta grátis, ou se a mesma rede criou uma conta grátis nos
-- últimos 30 dias, a nova conta é criada normalmente, mas SEM as cotas grátis
-- (pesquisas, mensagens etc. ficam em 0). Os planos pagos continuam funcionando.
-- Contas existentes não são alteradas. O administrador pode liberar manualmente.

alter table public.signup_events add column if not exists device_hash text;
alter table public.signup_events add column if not exists trial_granted boolean not null default true;
create index if not exists signup_events_device_idx on public.signup_events (device_hash) where device_hash is not null;

alter table public.profiles add column if not exists free_trial_denied text;
comment on column public.profiles.free_trial_denied is
  'Motivo de a conta não receber as cotas grátis (same_device | same_network). Nulo = recebeu.';

-- O usuário não pode mudar o próprio motivo de bloqueio do teste grátis.
create or replace function public.protect_profile_columns()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') and not public.is_admin() then
    new.risk_flag := old.risk_flag;
    new.blocked_at := old.blocked_at;
    new.free_trial_denied := old.free_trial_denied;
  end if;
  new.updated_at := now();
  return new;
end $$;

-- Limite efetivo: no plano grátis, contas sem direito ao teste têm cota 0 nos recursos consumíveis.
create or replace function app_private.effective_limit(p_user uuid, p_plan text, p_period text, p_limit integer)
returns integer language sql stable security definer set search_path = '' as $$
  select case
    when p_plan = 'free' and p_period <> 'count'
      and exists (select 1 from public.profiles p where p.id = p_user and p.free_trial_denied is not null)
    then 0 else p_limit end;
$$;
revoke all on function app_private.effective_limit(uuid, text, text, integer) from public, anon, authenticated;

create or replace function public.my_usage()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_plan text; v_out jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  v_plan := public.plan_of(v_uid);
  select jsonb_build_object('plan', v_plan,
    'trial_denied', (select p.free_trial_denied from public.profiles p where p.id = v_uid),
    'quotas', coalesce(jsonb_agg(jsonb_build_object(
    'resource', q.resource, 'limit', app_private.effective_limit(v_uid, v_plan, q.period, q.limit_value), 'period', q.period,
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

create or replace function app_private.consume(p_user uuid, p_resource text, p_amount integer default 1)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_plan text; v_limit integer; v_period text; v_key text; v_used integer;
begin
  v_plan := public.plan_of(p_user);
  select limit_value, period into v_limit, v_period
    from public.plan_quotas where plan_id = v_plan and resource = p_resource;
  if v_limit is null or v_period = 'count' then return -1; end if;
  v_limit := app_private.effective_limit(p_user, v_plan, v_period, v_limit);
  if v_limit <= 0 then return -1; end if;
  v_key := app_private.period_key(v_period);
  insert into public.usage_counters as u (user_id, resource, period_key, used)
    values (p_user, p_resource, v_key, p_amount)
  on conflict (user_id, resource, period_key)
    do update set used = u.used + p_amount, updated_at = now()
    where u.used + p_amount <= v_limit
  returning used into v_used;
  if v_used is null or v_used > v_limit then
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
  select greatest(0, app_private.effective_limit(p_user, q.plan_id, q.period, q.limit_value) - coalesce((select u.used from public.usage_counters u
      where u.user_id = p_user and u.resource = p_resource
        and u.period_key = app_private.period_key(q.period)), 0))
  from public.plan_quotas q
  where q.plan_id = public.plan_of(p_user) and q.resource = p_resource;
$$;

-- Registro do cadastro + decisão do teste grátis.
drop function if exists public.server_register_signup(text, uuid, text);
create or replace function public.server_register_signup(p_secret text, p_user uuid, p_ip_hash text, p_device_hash text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_count integer; v_reason text;
begin
  perform app_private.check_secret(p_secret);
  if exists (select 1 from public.signup_events where user_id = p_user) then
    return jsonb_build_object('status', 'known');
  end if;
  -- Serializa cadastros simultâneos da mesma rede/aparelho para a regra valer mesmo em corrida.
  perform pg_advisory_xact_lock(hashtext('signup:' || p_ip_hash));
  if p_device_hash is not null then perform pg_advisory_xact_lock(hashtext('signup-dev:' || p_device_hash)); end if;

  -- Só contas criadas a partir de agora entram nessa regra (cadastros antigos ficam como estão).
  if exists (select 1 from public.profiles p where p.id = p_user and p.created_at < now() - interval '1 day') then
    insert into public.signup_events (user_id, ip_hash, device_hash, trial_granted) values (p_user, p_ip_hash, p_device_hash, true);
    return jsonb_build_object('status', 'recorded_existing');
  end if;

  if p_device_hash is not null and exists (
      select 1 from public.signup_events e where e.device_hash = p_device_hash and e.trial_granted and e.user_id <> p_user) then
    v_reason := 'same_device';
  elsif exists (
      select 1 from public.signup_events e where e.ip_hash = p_ip_hash and e.trial_granted and e.user_id <> p_user
        and e.created_at > now() - interval '30 days') then
    v_reason := 'same_network';
  end if;

  insert into public.signup_events (user_id, ip_hash, device_hash, trial_granted) values (p_user, p_ip_hash, p_device_hash, v_reason is null);
  if v_reason is not null then
    update public.profiles set free_trial_denied = v_reason where id = p_user;
  end if;

  select count(distinct user_id) into v_count from public.signup_events
    where ip_hash = p_ip_hash and created_at > now() - interval '7 days';
  if v_count > 5 then
    update public.profiles set risk_flag = 'many_accounts_same_network' where id = p_user;
  end if;
  return jsonb_build_object('status', 'recorded', 'trial', v_reason is null, 'reason', v_reason);
end $$;
revoke all on function public.server_register_signup(text, uuid, text, text) from public, anon;
grant execute on function public.server_register_signup(text, uuid, text, text) to anon, authenticated;

-- O administrador pode liberar (ou retirar) o teste grátis de uma conta.
create or replace function public.admin_set_free_trial(p_user uuid, p_allowed boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.profiles set free_trial_denied = case when p_allowed then null else 'admin' end where id = p_user;
  perform public.admin_log(case when p_allowed then 'free_trial_allow' else 'free_trial_deny' end, p_user::text, '{}'::jsonb);
end $$;
revoke all on function public.admin_set_free_trial(uuid, boolean) from public, anon;
grant execute on function public.admin_set_free_trial(uuid, boolean) to authenticated;

-- Plano interno "Ilimitado" para o dono/administrador do Worthwise.
-- Não aparece na página de preços (active = false) e não pode ser assinado: é dado
-- automaticamente a quem tem o papel de administrador em user_roles.

insert into public.plans (id, name, description, price_cents, features, sort_order, active) values
  ('ilimitado', 'Ilimitado', 'Plano interno do administrador.', 0, '["Uso sem limites"]', 99, false)
on conflict (id) do update set name = excluded.name, active = false;

insert into public.plan_quotas (plan_id, resource, limit_value, period) values
  ('ilimitado', 'search', 1000000, 'month'), ('ilimitado', 'ai_message', 1000000, 'month'), ('ilimitado', 'watch', 100000, 'count'),
  ('ilimitado', 'collection', 100000, 'count'), ('ilimitado', 'simulation_saved', 100000, 'count'), ('ilimitado', 'export', 1000000, 'month')
on conflict (plan_id, resource) do update set limit_value = excluded.limit_value, period = excluded.period;

create or replace function public.plan_of(p_user uuid)
returns text language sql stable security definer set search_path = '' as $$
  select case
    when exists (select 1 from public.user_roles r where r.user_id = p_user and r.role = 'admin') then 'ilimitado'
    else coalesce(
      (select s.plan_id from public.subscriptions s
        where s.user_id = p_user
          and s.status in ('active', 'past_due', 'canceled')
          and s.current_period_end > now()
        limit 1),
      'free')
  end;
$$;
revoke all on function public.plan_of(uuid) from public, anon, authenticated;

-- Painel administrativo: além do papel em user_roles, o e-mail (confirmado) precisa estar na lista do dono.
create table if not exists app_private.admin_emails (email text primary key check (email = lower(email)));
insert into app_private.admin_emails (email) values ('duantinti@gmail.com') on conflict do nothing;
revoke all on app_private.admin_emails from public, anon, authenticated;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_roles r
      join auth.users u on u.id = r.user_id
      join app_private.admin_emails a on a.email = lower(u.email)
    where r.user_id = (select auth.uid()) and r.role = 'admin' and u.email_confirmed_at is not null
  );
$$;

delete from auth.users where email = 'e2e@worthwise-test.invalid';
