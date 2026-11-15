-- Quais respostas da GeckoAPI já estão guardadas e quantas consultas ainda cabem hoje (não gasta crédito).
create or replace function public.server_gecko_status(p_secret text, p_keys text[], p_max_per_day integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.check_secret(p_secret);
  return jsonb_build_object(
    'have', coalesce((select jsonb_agg(key) from app_private.gecko_cache where key = any(p_keys)), '[]'::jsonb),
    'left', greatest(0, p_max_per_day - coalesce((select calls from app_private.gecko_daily where day = current_date), 0)));
end $$;
revoke all on function public.server_gecko_status(text, text[], integer) from public;
grant execute on function public.server_gecko_status(text, text[], integer) to anon, authenticated;
