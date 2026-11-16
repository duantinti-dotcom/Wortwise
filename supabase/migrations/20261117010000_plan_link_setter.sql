-- O servidor salva o link de pagamento criado na HeroPay no plano correspondente.
create or replace function public.server_set_plan_link(p_secret text, p_plan text, p_link_id text, p_url text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.check_secret(p_secret);
  update public.plans set provider_link_id = p_link_id, provider_checkout_url = p_url, updated_at = now() where id = p_plan;
end $$;
revoke all on function public.server_set_plan_link(text, text, text, text) from public;
grant execute on function public.server_set_plan_link(text, text, text, text) to anon, authenticated;
