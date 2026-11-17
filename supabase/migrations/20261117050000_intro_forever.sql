-- Primeiro mês (R$ 9,90): vale UMA vez, para sempre, por pessoa, aparelho e internet.
-- Quando alguém compra, o aparelho e a internet (só hashes com o segredo do servidor, nunca o IP puro)
-- vão para app_private.intro_claims, que a limpeza automática não apaga.
create table if not exists app_private.intro_claims (
  id bigint generated always as identity primary key,
  user_id uuid,
  ip_hash text,
  device_hash text,
  created_at timestamptz not null default now()
);
create index if not exists intro_claims_ip_idx on app_private.intro_claims (ip_hash) where ip_hash is not null;
create index if not exists intro_claims_dev_idx on app_private.intro_claims (device_hash) where device_hash is not null;

alter table public.checkout_intents add column if not exists ip_hash text;
alter table public.checkout_intents add column if not exists device_hash text;

-- Quem já comprou antes desta regra também entra na lista.
insert into app_private.intro_claims (user_id, ip_hash, device_hash)
select ci.user_id, se.ip_hash, se.device_hash from public.checkout_intents ci
join public.signup_events se on se.user_id = ci.user_id
where ci.plan_id = 'inicial' and ci.consumed_at is not null
  and not exists (select 1 from app_private.intro_claims c where c.user_id = ci.user_id);

drop function if exists app_private.intro_eligible(uuid);
create or replace function app_private.intro_eligible(p_user uuid, p_ip_hash text default null, p_device_hash text default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from public.payments where user_id = p_user and status = 'paid')
    and not exists (select 1 from public.subscriptions where user_id = p_user and plan_id <> 'ilimitado')
    and not exists (select 1 from public.checkout_intents where user_id = p_user and plan_id = 'inicial' and consumed_at is not null)
    and not exists (select 1 from app_private.intro_claims c where c.user_id = p_user)
    and not exists (
      select 1 from app_private.intro_claims c
      where (p_ip_hash is not null and c.ip_hash = p_ip_hash)
         or (p_device_hash is not null and c.device_hash = p_device_hash)
         or exists (select 1 from public.signup_events se where se.user_id = p_user
                    and ((se.device_hash is not null and se.device_hash = c.device_hash) or se.ip_hash = c.ip_hash)));
$$;

drop function if exists public.create_checkout_intent(text);
create or replace function public.create_checkout_intent(p_plan text, p_ip_hash text default null, p_device_hash text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_plan public.plans; v_token text; v_current text;
begin
  perform app_private.assert_active_user(v_uid);
  select * into v_plan from public.plans where id = p_plan and active and price_cents > 0;
  if not found then raise exception 'invalid_plan' using errcode = '22023'; end if;
  v_current := public.plan_of(v_uid);
  if v_current <> 'free' and exists (select 1 from public.subscriptions
      where user_id = v_uid and status = 'active' and current_period_end > now() and provider_subscription_id is not null) then
    return jsonb_build_object('status', 'already_subscribed', 'plan', v_current);
  end if;
  if p_plan = 'inicial' and not app_private.intro_eligible(v_uid, p_ip_hash, p_device_hash) then
    return jsonb_build_object('status', 'intro_unavailable');
  end if;
  v_token := 'ww_' || replace(gen_random_uuid()::text, '-', '');
  insert into public.checkout_intents (token, user_id, plan_id, ip_hash, device_hash) values (v_token, v_uid, p_plan, p_ip_hash, p_device_hash);
  return jsonb_build_object('status', 'ok', 'token', v_token, 'plan', p_plan,
    'price_cents', v_plan.price_cents, 'checkout_url', v_plan.provider_checkout_url);
end $$;
grant execute on function public.create_checkout_intent(text, text, text) to authenticated;

-- Ao confirmar o pagamento do primeiro mês: guarda aparelho e internet da compra e do cadastro, para sempre.
create or replace function app_private.record_intro_claim() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.plan_id = 'inicial' and new.consumed_at is not null and old.consumed_at is null then
    insert into app_private.intro_claims (user_id, ip_hash, device_hash) values (new.user_id, new.ip_hash, new.device_hash);
    insert into app_private.intro_claims (user_id, ip_hash, device_hash)
      select new.user_id, se.ip_hash, se.device_hash from public.signup_events se where se.user_id = new.user_id;
  end if;
  return new;
end $$;
drop trigger if exists checkout_intents_intro_claim on public.checkout_intents;
create trigger checkout_intents_intro_claim after update of consumed_at on public.checkout_intents
  for each row execute function app_private.record_intro_claim();
