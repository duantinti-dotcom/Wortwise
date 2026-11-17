-- Primeiro mês (R$ 9,90): só some depois que alguém COMPRA.
-- Contas novas no mesmo celular/internet continuam vendo a oferta até que uma delas pague o primeiro mês;
-- a partir daí, nenhuma conta desse aparelho, dessa internet (IP, 90 dias) ou a própria conta pode usar de novo.
create or replace function app_private.intro_eligible(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from public.payments where user_id = p_user and status = 'paid')
    and not exists (select 1 from public.subscriptions where user_id = p_user and plan_id <> 'ilimitado')
    and not exists (select 1 from public.checkout_intents where user_id = p_user and plan_id = 'inicial' and consumed_at is not null)
    and not exists (
      select 1 from public.signup_events mine
      join public.signup_events other on other.user_id <> mine.user_id
        and ((mine.device_hash is not null and other.device_hash = mine.device_hash)
             or (other.ip_hash = mine.ip_hash and other.created_at > now() - interval '90 days'))
      where mine.user_id = p_user
        and (exists (select 1 from public.checkout_intents ci where ci.user_id = other.user_id and ci.plan_id = 'inicial' and ci.consumed_at is not null)
             or exists (select 1 from public.payments pay where pay.user_id = other.user_id and pay.status = 'paid' and pay.plan_id = 'inicial')));
$$;
