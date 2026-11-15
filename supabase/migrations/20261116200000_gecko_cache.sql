-- Cache permanente das respostas da GeckoAPI (economia de créditos) + limite diário de consultas.
create table if not exists app_private.gecko_cache (
  key text primary key,
  body jsonb not null,
  fetched_at timestamptz not null default now()
);
create table if not exists app_private.gecko_calls (
  key text primary key,
  claimed_at timestamptz not null default now()
);
create table if not exists app_private.gecko_daily (
  day date primary key,
  calls integer not null default 0
);

create or replace function public.server_gecko_get(p_secret text, p_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  perform app_private.check_secret(p_secret);
  select body, fetched_at into r from app_private.gecko_cache where key = p_key;
  if not found then return null; end if;
  return jsonb_build_object('data', r.body, 'at', r.fetched_at);
end $$;

create or replace function public.server_gecko_put(p_secret text, p_key text, p_body jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.check_secret(p_secret);
  insert into app_private.gecko_cache (key, body, fetched_at) values (p_key, p_body, now())
    on conflict (key) do update set body = excluded.body, fetched_at = now();
  delete from app_private.gecko_calls where key = p_key;
end $$;

-- Autoriza 1 consulta paga: bloqueia repetição da mesma chave por 15 min e respeita o limite do dia.
create or replace function public.server_gecko_claim(p_secret text, p_key text, p_max_per_day integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  perform app_private.check_secret(p_secret);
  if exists (select 1 from app_private.gecko_calls where key = p_key and claimed_at > now() - interval '15 minutes') then
    return false;
  end if;
  insert into app_private.gecko_daily (day, calls) values (current_date, 0) on conflict (day) do nothing;
  update app_private.gecko_daily set calls = calls + 1 where day = current_date and calls < p_max_per_day returning calls into n;
  if n is null then return false; end if;
  insert into app_private.gecko_calls (key, claimed_at) values (p_key, now())
    on conflict (key) do update set claimed_at = now();
  return true;
end $$;

revoke all on function public.server_gecko_get(text, text), public.server_gecko_put(text, text, jsonb), public.server_gecko_claim(text, text, integer) from public;
grant execute on function public.server_gecko_get(text, text), public.server_gecko_put(text, text, jsonb), public.server_gecko_claim(text, text, integer) to anon, authenticated;
