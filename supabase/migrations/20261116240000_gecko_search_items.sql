-- Pesquisa nos produtos já guardados da GeckoAPI (sem gastar crédito): todas as palavras no nome.
create or replace function public.server_gecko_search_items(p_secret text, p_target text, p_words text[], p_limit integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.check_secret(p_secret);
  return coalesce((
    select jsonb_agg(jsonb_build_object('item', s.it, 'at', s.fetched_at))
    from (
      select distinct on (coalesce(it->>'productId', it->>'itemId', it->>'url')) it, c.fetched_at
      from app_private.gecko_cache c, jsonb_array_elements(coalesce(c.body->'items', '[]'::jsonb)) it
      where c.body->>'source' = p_target
        and not exists (select 1 from unnest(p_words) w
                        where lower(translate(it->>'name', 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')) not like '%' || lower(translate(w, 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')) || '%')
      order by coalesce(it->>'productId', it->>'itemId', it->>'url'), c.fetched_at desc
      limit p_limit) s), '[]'::jsonb);
end $$;
revoke all on function public.server_gecko_search_items(text, text, text[], integer) from public;
grant execute on function public.server_gecko_search_items(text, text, text[], integer) to anon, authenticated;
