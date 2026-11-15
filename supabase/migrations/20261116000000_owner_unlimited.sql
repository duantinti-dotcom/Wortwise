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
