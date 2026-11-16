-- Várias respostas guardadas da GeckoAPI em uma chamada só (o Worker tem limite de chamadas por pedido).
create or replace function public.server_gecko_get_many(p_secret text, p_keys text[])
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.check_secret(p_secret);
  return coalesce((select jsonb_object_agg(key, jsonb_build_object('data', body, 'at', fetched_at))
    from app_private.gecko_cache where key = any(p_keys)), '{}'::jsonb);
end $$;
revoke all on function public.server_gecko_get_many(text, text[]) from public;
grant execute on function public.server_gecko_get_many(text, text[]) to anon, authenticated;
