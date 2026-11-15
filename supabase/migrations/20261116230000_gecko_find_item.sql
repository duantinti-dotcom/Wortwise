-- Acha um produto dentro das listas já guardadas da GeckoAPI (para a página do produto sem gastar crédito).
create or replace function public.server_gecko_find_item(p_secret text, p_target text, p_match jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r jsonb;
begin
  perform app_private.check_secret(p_secret);
  select jsonb_build_object('item', it, 'at', c.fetched_at) into r
  from app_private.gecko_cache c, jsonb_array_elements(coalesce(c.body->'items', '[]'::jsonb)) it
  where c.body->>'source' = p_target and it @> p_match
  order by c.fetched_at desc limit 1;
  return r;
end $$;
revoke all on function public.server_gecko_find_item(text, text, jsonb) from public;
grant execute on function public.server_gecko_find_item(text, text, jsonb) to anon, authenticated;
