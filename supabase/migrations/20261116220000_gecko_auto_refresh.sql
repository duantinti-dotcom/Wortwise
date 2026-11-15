-- Atualização automática: guarda o pedido feito à GeckoAPI para o servidor refazer sozinho a cada 3 dias.
alter table app_private.gecko_cache add column if not exists req jsonb;
update app_private.gecko_cache set req = case
    when body->>'source' = 'tiktok.com' then jsonb_build_object('target', 'tiktok.com', 'type', 'plp', 'region', 'BR', 'keyword', body->>'query')
    when body->>'source' = 'mercadolivre.com.br' then jsonb_build_object('target', 'mercadolivre.com.br', 'type', 'plp', 'region', 'BR', 'url', body->>'requestUrl', 'page', 1)
    when body->>'source' = 'shopee.com.br' then jsonb_build_object('target', 'shopee.com.br', 'type', 'plp', 'region', 'BR', 'url', body->>'requestUrl')
  end
where req is null and body->>'type' = 'plp';

create or replace function public.server_gecko_put(p_secret text, p_key text, p_body jsonb, p_req jsonb default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.check_secret(p_secret);
  insert into app_private.gecko_cache (key, body, req, fetched_at) values (p_key, p_body, p_req, now())
    on conflict (key) do update set body = excluded.body, req = coalesce(excluded.req, app_private.gecko_cache.req), fetched_at = now();
  delete from app_private.gecko_calls where key = p_key;
end $$;
drop function if exists public.server_gecko_put(text, text, jsonb);

-- Listas (rankings) guardadas há mais de p_hours horas, das mais antigas para as mais novas.
create or replace function public.server_gecko_stale(p_secret text, p_hours integer, p_limit integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.check_secret(p_secret);
  return coalesce((select jsonb_agg(jsonb_build_object('key', key, 'req', req) order by fetched_at)
    from (select key, req, fetched_at from app_private.gecko_cache
          where req is not null and fetched_at < now() - make_interval(hours => p_hours)
          order by fetched_at limit p_limit) s), '[]'::jsonb);
end $$;

revoke all on function public.server_gecko_put(text, text, jsonb, jsonb), public.server_gecko_stale(text, integer, integer) from public;
grant execute on function public.server_gecko_put(text, text, jsonb, jsonb), public.server_gecko_stale(text, integer, integer) to anon, authenticated;
