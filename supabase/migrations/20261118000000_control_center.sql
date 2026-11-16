-- =============================================================================
-- Worthwise Control — central administrativa (admin.worthwise.site)
--
-- Princípios
--  * Reutiliza as tabelas do Worthwise (pagamentos, assinaturas, perfis, logs). Nada é duplicado:
--    só se guardam agregados diários, eventos de segurança e configurações do próprio painel.
--  * Toda leitura passa por app_private.ctl_require(área): papel administrativo + MFA (aal2 no JWT).
--    Nenhuma tabela nova é exposta pela API (schema app_private).
--  * Dados pessoais: IPs e identificadores só como hash truncado; nenhum conteúdo de conversa é lido.
--  * Logs de alta frequência têm retenção curta; o histórico longo fica em agregados diários.
--  * Movimentações financeiras são somente leitura. O painel apenas classifica pagamentos
--    (ex.: "teste") e registra despesas externas — sempre com trilha de auditoria.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Utilitários de data (dia de Brasília) e do JWT
-- ---------------------------------------------------------------------------
create or replace function app_private.sp_day(p_ts timestamptz)
returns date language sql immutable as $$ select (p_ts at time zone 'America/Sao_Paulo')::date $$;

create or replace function app_private.sp_today()
returns date language sql stable as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;

create or replace function app_private.jwt_claims()
returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;

create or replace function app_private.short_hash(p text)
returns text language sql immutable as $$ select left(encode(sha256(convert_to(coalesce(p, ''), 'UTF8')), 'hex'), 16) $$;

-- E-mail mascarado para listagens (ex.: du***@gmail.com).
create or replace function app_private.mask_email(p text)
returns text language sql immutable as $$
  select case when p is null or position('@' in p) = 0 then null
    else left(split_part(p, '@', 1), 2) || '***@' || split_part(p, '@', 2) end
$$;

-- ---------------------------------------------------------------------------
-- Acesso: SOMENTE os donos (public.is_admin(): papel admin em user_roles + e-mail confirmado
-- na lista app_private.admin_emails). Hoje: duantinti@gmail.com e a conta interna do login "admin".
-- Não existem outros papéis; ninguém mais pode ser adicionado pela interface.
-- ---------------------------------------------------------------------------
create or replace function app_private.ctl_role()
returns text language sql stable security definer set search_path = '' as $$
  select case when (select auth.uid()) is not null and public.is_admin() then 'owner' end
$$;

create or replace function app_private.ctl_areas(p_role text)
returns text[] language sql immutable as $$
  select case p_role
    when 'owner' then array['overview','subscribers','finance','funnel','security','gecko','ai','infra','alerts','audit','settings','export']
    else array[]::text[] end
$$;

-- Ações de escrita permitidas por papel.
create or replace function app_private.ctl_can_write(p_role text, p_what text)
returns boolean language sql immutable as $$
  select p_role = 'owner' and p_what in ('expenses', 'payment_flags', 'costs', 'incidents', 'rules', 'ai_limits', 'refresh')
$$;

-- Exige papel, MFA (aal2) e permissão para a área. Retorna o papel.
create or replace function app_private.ctl_require(p_area text)
returns text language plpgsql stable security definer set search_path = '' as $$
declare v_role text := app_private.ctl_role();
begin
  if v_role is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if coalesce(app_private.jwt_claims() ->> 'aal', 'aal1') <> 'aal2' then
    raise exception 'mfa_required' using errcode = '42501';
  end if;
  if not (p_area = any(app_private.ctl_areas(v_role))) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return v_role;
end $$;

create or replace function app_private.ctl_require_write(p_what text)
returns text language plpgsql stable security definer set search_path = '' as $$
declare v_role text := app_private.ctl_role();
begin
  if v_role is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if coalesce(app_private.jwt_claims() ->> 'aal', 'aal1') <> 'aal2' then
    raise exception 'mfa_required' using errcode = '42501';
  end if;
  if not app_private.ctl_can_write(v_role, p_what) then raise exception 'forbidden' using errcode = '42501'; end if;
  return v_role;
end $$;

create or replace function app_private.ctl_audit(p_action text, p_target text, p_details jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.admin_audit_logs (admin_id, action, target, details)
  values ((select auth.uid()), 'control.' || p_action, left(p_target, 200), coalesce(p_details, '{}'));
$$;

-- Sessão atual do painel (não lança erro): usada pela interface para decidir login/MFA.
create or replace function public.control_session()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_role text := app_private.ctl_role();
begin
  return jsonb_build_object(
    'role', v_role,
    'aal', coalesce(app_private.jwt_claims() ->> 'aal', 'aal1'),
    'areas', to_jsonb(app_private.ctl_areas(v_role)),
    'writes', (select coalesce(jsonb_agg(w), '[]') from unnest(array['expenses','payment_flags','costs','incidents','rules','ai_limits','refresh']) w
               where app_private.ctl_can_write(v_role, w)));
end $$;

-- Registro de ações relevantes feitas pela interface (login, exportação, etc.).
create or replace function public.control_audit(p_action text, p_target text, p_details jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if app_private.ctl_role() is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_action !~ '^[a-z_.]{3,40}$' then raise exception 'invalid_action' using errcode = '22023'; end if;
  perform app_private.ctl_audit(p_action, p_target, p_details);
end $$;

-- ---------------------------------------------------------------------------
-- Configurações do painel (privadas: app_settings é legível publicamente)
-- ---------------------------------------------------------------------------
create table if not exists app_private.control_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
-- Valores nulos = "não informado": o painel não calcula o custo e diz isso.
insert into app_private.control_settings (key, value) values
  ('costs', jsonb_build_object(
    'usd_brl', null,
    'heropay', jsonb_build_object('credit_card_pct', 3.49, 'pix_pct', 0, 'bank_slip_pct', 0, 'source', 'Tarifas publicadas pela HeroPay (docs/INTEGRACOES.md)'),
    'gecko', jsonb_build_object('brl_per_credit', null, 'credits_per_call', 1),
    'ai_prices_usd_per_mtok', '{}'::jsonb,
    'fixed_monthly', jsonb_build_array(
      jsonb_build_object('name', 'Cloudflare Workers Paid', 'amount', 5, 'currency', 'USD'),
      jsonb_build_object('name', 'Supabase Free', 'amount', 0, 'currency', 'BRL')))),
  ('ai_limits', jsonb_build_object('monthly_budget_usd', null, 'per_user_daily_requests', null, 'enforce', false)),
  ('gecko', jsonb_build_object('low_balance_credits', 200, 'low_balance_days', 7))
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Agregados diários (fonte do histórico longo) e visitantes anônimos
-- ---------------------------------------------------------------------------
create table if not exists app_private.metrics_daily (
  day date not null,
  metric text not null,
  dim text not null default '',
  value numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (day, metric, dim)
);
create index if not exists metrics_daily_metric_idx on app_private.metrics_daily (metric, day);

create or replace function app_private.metric_add(p_day date, p_metric text, p_dim text, p_delta numeric)
returns void language sql security definer set search_path = '' as $$
  insert into app_private.metrics_daily as m (day, metric, dim, value) values (p_day, p_metric, coalesce(p_dim, ''), p_delta)
  on conflict (day, metric, dim) do update set value = m.value + excluded.value, updated_at = now();
$$;

create or replace function app_private.metric_set(p_day date, p_metric text, p_dim text, p_value numeric)
returns void language sql security definer set search_path = '' as $$
  insert into app_private.metrics_daily as m (day, metric, dim, value) values (p_day, p_metric, coalesce(p_dim, ''), p_value)
  on conflict (day, metric, dim) do update set value = excluded.value, updated_at = now();
$$;

-- Visitantes: hash diário (sal rotativo no Worker: impossível ligar visitas de dias diferentes) sem cookie.
create table if not exists app_private.visitor_days (
  day date not null,
  vhash text not null,
  primary key (day, vhash)
);

create or replace function public.server_track_visit(p_secret text, p_vhash text, p_country text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_day date := app_private.sp_today(); v_new integer;
begin
  perform app_private.check_secret(p_secret);
  if p_vhash is null or p_vhash !~ '^[a-f0-9]{16,64}$' then return; end if;
  insert into app_private.visitor_days (day, vhash) values (v_day, left(p_vhash, 32)) on conflict do nothing;
  get diagnostics v_new = row_count;
  if v_new > 0 then
    perform app_private.metric_add(v_day, 'visitors', '', 1);
    if p_country ~ '^[A-Z]{2}$' then perform app_private.metric_add(v_day, 'visitors_country', p_country, 1); end if;
  end if;
  perform app_private.metric_add(v_day, 'pageviews', '', 1);
end $$;

-- ---------------------------------------------------------------------------
-- Eventos de segurança e operação (retenção de 90 dias; contagem diária permanente)
-- class: suspicious (suspeito) | blocked (bloqueado) | incident (incidente confirmado) | info
-- ---------------------------------------------------------------------------
create table if not exists app_private.control_events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  category text not null check (category in ('security', 'ops')),
  kind text not null,
  severity text not null check (severity in ('info', 'low', 'medium', 'high', 'critical')),
  class text not null default 'suspicious' check (class in ('suspicious', 'blocked', 'incident', 'info')),
  actor text,
  country text,
  path text,
  hits integer not null default 1,
  detail jsonb not null default '{}'
);
create index if not exists control_events_at_idx on app_private.control_events (at desc);
create index if not exists control_events_dedupe_idx on app_private.control_events (kind, actor, last_at desc);

create or replace function app_private.sev_rank(p text)
returns integer language sql immutable as $$
  select case p when 'critical' then 5 when 'high' then 4 when 'medium' then 3 when 'low' then 2 else 1 end
$$;

-- Grava (ou agrupa) um evento. O mesmo tipo/origem/caminho em 10 minutos vira um só, com contador.
create or replace function app_private.ctl_event(p_category text, p_kind text, p_severity text, p_class text,
  p_actor text, p_country text, p_path text, p_detail jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_id bigint;
begin
  perform app_private.metric_add(app_private.sp_today(), 'ev:' || p_category || ':' || p_kind, coalesce(p_severity, 'info'), 1);
  update app_private.control_events set hits = hits + 1, last_at = now(),
      severity = case when app_private.sev_rank(p_severity) > app_private.sev_rank(severity) then p_severity else severity end
    where id = (select id from app_private.control_events
                where kind = p_kind and actor is not distinct from p_actor and path is not distinct from p_path
                  and last_at > now() - interval '10 minutes' order by last_at desc limit 1)
    returning id into v_id;
  if v_id is not null then return; end if;
  -- Proteção contra inundação: acima de 3.000 eventos/hora só a contagem diária é mantida.
  if (select count(*) from app_private.control_events where at > now() - interval '1 hour') >= 3000 then return; end if;
  insert into app_private.control_events (category, kind, severity, class, actor, country, path, detail)
    values (p_category, left(p_kind, 40), p_severity, coalesce(p_class, 'suspicious'), left(p_actor, 32),
            case when p_country ~ '^[A-Z]{2}$' then p_country end, left(p_path, 160), coalesce(p_detail, '{}'));
end $$;

create or replace function public.server_control_event(p_secret text, p_category text, p_kind text, p_severity text,
  p_class text, p_actor text, p_country text, p_path text, p_detail jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.check_secret(p_secret);
  if p_category not in ('security', 'ops') or p_kind !~ '^[a-z0-9_]{3,40}$'
     or p_severity not in ('info', 'low', 'medium', 'high', 'critical')
     or coalesce(p_class, 'suspicious') not in ('suspicious', 'blocked', 'incident', 'info') then
    raise exception 'invalid_event' using errcode = '22023';
  end if;
  perform app_private.ctl_event(p_category, p_kind, p_severity, p_class, p_actor, p_country, p_path,
    case when pg_column_size(p_detail) > 2000 then '{}'::jsonb else p_detail end);
end $$;

-- Limite de requisições: mesmo comportamento de antes + registra o primeiro estouro de cada janela.
create or replace function app_private.rate_hit(p_key text, p_limit integer, p_window integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_start timestamptz; v_count integer;
begin
  v_start := to_timestamp(floor(extract(epoch from now()) / p_window) * p_window);
  insert into public.rate_limits as r (key, window_start, count) values (p_key, v_start, 1)
  on conflict (key, window_start) do update set count = r.count + 1
  returning count into v_count;
  if v_count = p_limit + 1 then
    begin
      perform app_private.ctl_event('security', 'rate_limited', 'low', 'blocked',
        app_private.short_hash(regexp_replace(p_key, ':[^:]*$', '')), null,
        regexp_replace(p_key, '^.*:', ''), jsonb_build_object('limit', p_limit, 'window_s', p_window));
    exception when others then null; -- o registro nunca impede o limite de funcionar
    end;
  end if;
  return v_count <= p_limit;
end $$;

-- ---------------------------------------------------------------------------
-- GeckoAPI: saldo oficial (GET /v1/me/credits) e consultas atendidas pelo cache
-- ---------------------------------------------------------------------------
create table if not exists app_private.gecko_balance_snapshots (
  at timestamptz primary key default now(),
  current_credits numeric not null,
  consumed_24h numeric,
  consumed_7d numeric,
  consumed_30d numeric,
  plan_id text
);

create or replace function public.server_gecko_balance(p_secret text, p_current numeric, p_24h numeric, p_7d numeric, p_30d numeric, p_plan text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.check_secret(p_secret);
  insert into app_private.gecko_balance_snapshots (at, current_credits, consumed_24h, consumed_7d, consumed_30d, plan_id)
    values (now(), p_current, p_24h, p_7d, p_30d, left(p_plan, 40)) on conflict (at) do nothing;
  perform app_private.metric_set(app_private.sp_today(), 'gecko_balance', '', p_current);
  if p_24h is not null then perform app_private.metric_set(app_private.sp_today(), 'gecko_consumed_24h', '', p_24h); end if;
end $$;

-- Retorna o instante da última leitura do saldo (para ler no máximo 1x por hora).
create or replace function public.server_gecko_balance_last(p_secret text)
returns timestamptz language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.check_secret(p_secret);
  return (select max(at) from app_private.gecko_balance_snapshots);
end $$;

create or replace function app_private.gecko_hit(p_dim text, p_n integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_n > 0 then perform app_private.metric_add(app_private.sp_today(), 'gecko_cache_hit', p_dim, p_n); end if;
exception when others then null;
end $$;

-- As funções de leitura do cache passam a contar quantas consultas foram atendidas sem gastar crédito.
create or replace function public.server_gecko_get(p_secret text, p_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  perform app_private.check_secret(p_secret);
  select body, fetched_at into r from app_private.gecko_cache where key = p_key;
  if not found then return null; end if;
  perform app_private.gecko_hit(split_part(p_key, ':', 2) || ':' || split_part(p_key, ':', 3), 1);
  return jsonb_build_object('data', r.body, 'at', r.fetched_at);
end $$;

create or replace function public.server_gecko_get_many(p_secret text, p_keys text[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v jsonb; d record;
begin
  perform app_private.check_secret(p_secret);
  v := coalesce((select jsonb_object_agg(key, jsonb_build_object('data', body, 'at', fetched_at))
    from app_private.gecko_cache where key = any(p_keys)), '{}'::jsonb);
  for d in select split_part(k, ':', 2) || ':' || split_part(k, ':', 3) dim, count(*)::integer n
           from jsonb_object_keys(v) k group by 1 loop
    perform app_private.gecko_hit(d.dim, d.n);
  end loop;
  return v;
end $$;

create or replace function public.server_gecko_find_item(p_secret text, p_target text, p_match jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r jsonb;
begin
  perform app_private.check_secret(p_secret);
  select jsonb_build_object('item', it, 'at', c.fetched_at) into r
  from app_private.gecko_cache c, jsonb_array_elements(coalesce(c.body->'items', '[]'::jsonb)) it
  where c.body->>'source' = p_target and it @> p_match
  order by c.fetched_at desc limit 1;
  if r is not null then perform app_private.gecko_hit(p_target || ':item', 1); end if;
  return r;
end $$;

create or replace function public.server_gecko_search_items(p_secret text, p_target text, p_words text[], p_limit integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  perform app_private.check_secret(p_secret);
  v := coalesce((
    select jsonb_agg(jsonb_build_object('item', s.it, 'at', s.fetched_at))
    from (
      select distinct on (coalesce(it->>'productId', it->>'itemId', it->>'url')) it, c.fetched_at
      from app_private.gecko_cache c, jsonb_array_elements(coalesce(c.body->'items', '[]'::jsonb)) it
      where c.body->>'source' = p_target
        and not exists (select 1 from unnest(p_words) w
                        where lower(translate(it->>'name', 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')) not like '%' || lower(translate(w, 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')) || '%')
      order by coalesce(it->>'productId', it->>'itemId', it->>'url'), c.fetched_at desc
      limit p_limit) s), '[]'::jsonb);
  if jsonb_array_length(v) > 0 then perform app_private.gecko_hit(p_target || ':search', 1); end if;
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- IA: uso por requisição (sem conteúdo), limites de gasto e cotas por usuário
-- ---------------------------------------------------------------------------
create table if not exists app_private.ai_usage_events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null,
  plan text,
  feature text not null default 'assistant',
  provider text,
  model text,
  tokens_in integer,
  tokens_out integer,
  latency_ms integer,
  ok boolean not null,
  error_code text
);
create index if not exists ai_usage_events_at_idx on app_private.ai_usage_events (at desc);
create index if not exists ai_usage_events_user_idx on app_private.ai_usage_events (user_id, at desc);

create table if not exists app_private.ai_user_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  daily_requests integer check (daily_requests is null or daily_requests >= 0),
  blocked boolean not null default false,
  note text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create or replace function public.server_ai_usage(p_secret text, p_user uuid, p_feature text, p_provider text, p_model text,
  p_tokens_in integer, p_tokens_out integer, p_latency_ms integer, p_ok boolean, p_error text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_day date := app_private.sp_today(); v_model text := coalesce(left(p_model, 80), 'desconhecido');
begin
  perform app_private.check_secret(p_secret);
  insert into app_private.ai_usage_events (user_id, plan, feature, provider, model, tokens_in, tokens_out, latency_ms, ok, error_code)
    values (p_user, case when p_user is null then null else public.plan_of(p_user) end, coalesce(left(p_feature, 30), 'assistant'),
            left(p_provider, 60), v_model, p_tokens_in, p_tokens_out, p_latency_ms, coalesce(p_ok, false), left(p_error, 60));
  perform app_private.metric_add(v_day, 'ai_requests', v_model, 1);
  if not coalesce(p_ok, false) then perform app_private.metric_add(v_day, 'ai_errors', v_model, 1); end if;
  if p_tokens_in is not null then perform app_private.metric_add(v_day, 'ai_tokens_in', v_model, p_tokens_in); end if;
  if p_tokens_out is not null then perform app_private.metric_add(v_day, 'ai_tokens_out', v_model, p_tokens_out); end if;
end $$;

-- Gasto estimado de IA no mês corrente (USD), com os preços cadastrados. Modelos sem preço não entram.
create or replace function app_private.ai_month_spend_usd()
returns numeric language sql stable security definer set search_path = '' as $$
  with p as (select value -> 'ai_prices_usd_per_mtok' pr from app_private.control_settings where key = 'costs')
  select coalesce(sum(
      coalesce(m.tokens_in, 0) / 1e6 * nullif(p.pr -> m.model ->> 'in', '')::numeric
    + coalesce(m.tokens_out, 0) / 1e6 * nullif(p.pr -> m.model ->> 'out', '')::numeric), 0)
  from public.ai_messages m, p
  where m.role = 'assistant' and m.created_at >= date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'
$$;

-- Verificação antes de cada mensagem da assistente. Sem limites configurados, sempre libera.
create or replace function public.server_ai_guard(p_secret text, p_user uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_cfg jsonb; v_lim app_private.ai_user_limits; v_daily integer; v_used integer;
begin
  perform app_private.check_secret(p_secret);
  if exists (select 1 from public.user_roles where user_id = p_user and role = 'admin') then
    return jsonb_build_object('allowed', true);
  end if;
  select * into v_lim from app_private.ai_user_limits where user_id = p_user;
  if v_lim.blocked then return jsonb_build_object('allowed', false, 'reason', 'user_blocked'); end if;
  select value into v_cfg from app_private.control_settings where key = 'ai_limits';
  v_daily := coalesce(v_lim.daily_requests, nullif(v_cfg ->> 'per_user_daily_requests', '')::integer);
  if v_daily is not null then
    select count(*) into v_used from app_private.ai_usage_events
      where user_id = p_user and at >= (app_private.sp_today()::timestamp at time zone 'America/Sao_Paulo');
    if v_used >= v_daily then return jsonb_build_object('allowed', false, 'reason', 'user_daily_limit'); end if;
  end if;
  if coalesce((v_cfg ->> 'enforce')::boolean, false) and nullif(v_cfg ->> 'monthly_budget_usd', '') is not null
     and app_private.ai_month_spend_usd() >= (v_cfg ->> 'monthly_budget_usd')::numeric then
    return jsonb_build_object('allowed', false, 'reason', 'budget_exceeded');
  end if;
  return jsonb_build_object('allowed', true);
end $$;

-- ---------------------------------------------------------------------------
-- Financeiro: despesas externas e classificação de pagamentos (sem alterar pagamentos)
-- ---------------------------------------------------------------------------
create table if not exists app_private.control_expenses (
  id uuid primary key default gen_random_uuid(),
  occurred_on date not null,
  category text not null check (category in ('ads', 'tools', 'hosting', 'api', 'ai', 'services', 'taxes', 'other')),
  description text not null check (char_length(description) between 2 and 160),
  amount_cents integer not null check (amount_cents > 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null
);
create index if not exists control_expenses_day_idx on app_private.control_expenses (occurred_on) where deleted_at is null;

create table if not exists app_private.payment_flags (
  payment_id uuid primary key references public.payments(id) on delete cascade,
  flag text not null check (flag in ('test')),
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Pagamentos normalizados para relatórios.
--  valid: pagamento de assinatura reconhecido (plano conhecido e valor >= preço atual do plano, ou plano de entrada).
create or replace function app_private.ctl_payments()
returns table (id uuid, user_id uuid, plan_id text, at timestamptz, amount integer, net integer, net_estimated boolean,
               method text, status text, valid boolean, is_test boolean, refused_message text)
language sql stable security definer set search_path = '' as $$
  with fees as (select value -> 'heropay' h from app_private.control_settings where key = 'costs')
  select p.id, p.user_id, p.plan_id, coalesce(p.occurred_at, p.created_at), p.amount_cents,
    coalesce(p.net_cents, case when p.amount_cents is null then null else
      round(p.amount_cents * (1 - coalesce(case p.method when 'credit_card' then (f.h ->> 'credit_card_pct')::numeric
        when 'pix' then (f.h ->> 'pix_pct')::numeric when 'bank_slip' then (f.h ->> 'bank_slip_pct')::numeric end, 0) / 100))::integer end),
    p.net_cents is null and p.amount_cents is not null,
    p.method, p.status,
    p.plan_id is not null and pl.price_cents > 0 and coalesce(p.amount_cents, 0) >= pl.price_cents,
    coalesce(pf.flag = 'test', false),
    p.refused_message
  from public.payments p
  left join public.plans pl on pl.id = p.plan_id
  left join app_private.payment_flags pf on pf.payment_id = p.id
  cross join fees f
$$;

-- ---------------------------------------------------------------------------
-- Alertas: regras configuráveis, incidentes deduplicados
-- ---------------------------------------------------------------------------
create table if not exists app_private.control_alert_rules (
  key text primary key,
  label text not null,
  description text not null,
  category text not null check (category in ('security', 'finance', 'growth', 'infra', 'integrations')),
  enabled boolean not null default true,
  threshold numeric not null,
  unit text not null,
  priority text not null default 'P2' check (priority in ('P1', 'P2', 'P3', 'P4')),
  cooldown_minutes integer not null default 180 check (cooldown_minutes between 10 and 10080),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into app_private.control_alert_rules (key, label, description, category, threshold, unit, priority, cooldown_minutes) values
  ('error_rate', 'Aumento de erros', 'Porcentagem de chamadas a APIs externas com erro na última hora (mínimo de 20 chamadas).', 'infra', 25, '%', 'P2', 120),
  ('integration_down', 'Integração indisponível', 'Uma integração falhou na verificação automática ou está marcada com erro nas últimas 2 horas.', 'integrations', 1, 'falhas', 'P1', 180),
  ('suspicious_traffic', 'Tráfego suspeito anormal', 'Ocorrências de eventos de segurança de gravidade alta ou crítica na última hora.', 'security', 30, 'ocorrências/h', 'P1', 60),
  ('brute_force', 'Possível força bruta', 'Falhas de login de uma mesma origem em 15 minutos.', 'security', 10, 'falhas', 'P1', 60),
  ('admin_intrusion', 'Acesso administrativo negado', 'Tentativas de abrir o painel ou rotas administrativas sem autorização na última hora.', 'security', 3, 'tentativas/h', 'P2', 120),
  ('payment_refusals', 'Muitos pagamentos recusados', 'Pagamentos recusados nas últimas 24 horas.', 'finance', 5, 'recusas/24h', 'P2', 360),
  ('conversion_drop', 'Queda nas conversões', 'Queda da conversão cadastro→pagamento dos últimos 7 dias em relação aos 28 dias anteriores (mínimo de 20 cadastros na base).', 'growth', 50, '% de queda', 'P3', 1440),
  ('gecko_low_credits', 'Créditos GeckoAPI baixos', 'Saldo oficial da GeckoAPI abaixo do limite (ou previsão de esgotamento abaixo do configurado em Configurações).', 'integrations', 200, 'créditos', 'P2', 720),
  ('db_near_limit', 'Banco perto do limite', 'Uso do banco Supabase em relação à cota do plano.', 'infra', 80, '%', 'P2', 1440),
  ('resource_spike', 'Consumo inesperado', 'Tokens de IA ou consultas GeckoAPI de hoje acima de N vezes a média diária dos 7 dias anteriores.', 'infra', 3, 'x a média', 'P3', 720),
  ('webhook_failures', 'Falhas de webhook', 'Webhooks de pagamento com erro, assinatura inválida ou sem correspondência nas últimas 24 horas.', 'finance', 3, 'falhas/24h', 'P1', 120)
on conflict (key) do nothing;

create table if not exists app_private.control_incidents (
  id bigint generated always as identity primary key,
  rule_key text not null references app_private.control_alert_rules(key),
  fingerprint text not null,
  title text not null,
  priority text not null,
  status text not null default 'open' check (status in ('open', 'acknowledged', 'resolved')),
  confirmed boolean not null default false,
  value numeric,
  details jsonb not null default '{}',
  occurrences integer not null default 1,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  notified_at timestamptz,
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  auto_resolved boolean not null default false
);
create unique index if not exists control_incidents_open_idx on app_private.control_incidents (fingerprint) where status <> 'resolved';
create index if not exists control_incidents_seen_idx on app_private.control_incidents (last_seen desc);

-- Abre/atualiza/resolve o incidente de uma regra. Retorna 'opened' | 'updated' | 'resolved' | 'none'.
create or replace function app_private.ctl_fire(p_rule text, p_fp text, p_firing boolean, p_value numeric, p_title text, p_details jsonb)
returns text language plpgsql security definer set search_path = '' as $$
declare v_rule app_private.control_alert_rules; v_inc app_private.control_incidents;
begin
  select * into v_rule from app_private.control_alert_rules where key = p_rule;
  select * into v_inc from app_private.control_incidents where fingerprint = p_fp and status <> 'resolved';
  if not coalesce(p_firing, false) or not v_rule.enabled then
    if v_inc.id is not null then
      update app_private.control_incidents set status = 'resolved', resolved_at = now(), auto_resolved = true where id = v_inc.id;
      return 'resolved';
    end if;
    return 'none';
  end if;
  if v_inc.id is not null then
    update app_private.control_incidents set last_seen = now(), occurrences = occurrences + 1, value = p_value,
      details = coalesce(p_details, details), title = p_title where id = v_inc.id;
    return 'updated';
  end if;
  insert into app_private.control_incidents (rule_key, fingerprint, title, priority, value, details)
    values (p_rule, p_fp, p_title, v_rule.priority, p_value, coalesce(p_details, '{}'));
  return 'opened';
end $$;

-- Avalia todas as regras. p_ext traz medições externas feitas pelo Worker:
--   {"gecko": {"current_credits": n, "days_left": n|null},
--    "integrations": [{"id": "...", "name": "...", "ok": bool, "detail": "..."}]}
-- Retorna os incidentes a notificar (novos ou lembretes após o intervalo da regra).
create or replace function public.server_control_evaluate(p_secret text, p_ext jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r record; v numeric; v2 numeric; v_cfg jsonb; v_quota numeric; v_db numeric; v_out jsonb := '[]';
  v_opened integer := 0; v_resolved integer := 0; v_res text; i jsonb;
  v_rules jsonb := coalesce((select jsonb_object_agg(key, to_jsonb(x)) from app_private.control_alert_rules x), '{}');
  function_result text;
begin
  perform app_private.check_secret(p_secret);

  -- error_rate
  select count(*), count(*) filter (where not ok) into v, v2 from public.api_usage_logs where created_at > now() - interval '1 hour';
  v_res := app_private.ctl_fire('error_rate', 'error_rate', v >= 20 and v2 * 100.0 / greatest(v, 1) >= (v_rules #>> '{error_rate,threshold}')::numeric,
    round(v2 * 100.0 / greatest(v, 1), 1), format('%s%% das chamadas externas com erro na última hora', round(v2 * 100.0 / greatest(v, 1))),
    jsonb_build_object('calls', v, 'errors', v2));

  -- integration_down: medições do Worker + fontes marcadas com erro recente
  for i in select * from jsonb_array_elements(coalesce(p_ext -> 'integrations', '[]')) loop
    v_res := app_private.ctl_fire('integration_down', 'integration:' || (i ->> 'id'), not coalesce((i ->> 'ok')::boolean, true), null,
      format('%s indisponível', coalesce(i ->> 'name', i ->> 'id')), jsonb_build_object('detail', left(i ->> 'detail', 300)));
  end loop;
  for r in select id, name, status, status_detail, last_error_at from public.data_sources where status in ('connected', 'error') loop
    v_res := app_private.ctl_fire('integration_down', 'source:' || r.id, r.status = 'error' and r.last_error_at > now() - interval '2 hours', null,
      format('%s com erro', r.name), jsonb_build_object('detail', r.status_detail));
  end loop;

  -- suspicious_traffic
  select coalesce(sum(hits), 0) into v from app_private.control_events
    where category = 'security' and severity in ('high', 'critical') and last_at > now() - interval '1 hour';
  v_res := app_private.ctl_fire('suspicious_traffic', 'suspicious_traffic', v >= (v_rules #>> '{suspicious_traffic,threshold}')::numeric, v,
    format('%s ocorrências de segurança graves na última hora', v), '{}');

  -- brute_force (por origem)
  for r in select actor, sum(hits) n from app_private.control_events
           where kind in ('control_login_failed', 'auth_failed', 'mfa_failed') and last_at > now() - interval '15 minutes' and actor is not null
           group by actor loop
    v_res := app_private.ctl_fire('brute_force', 'brute_force:' || r.actor, r.n >= (v_rules #>> '{brute_force,threshold}')::numeric, r.n,
      format('%s falhas de login da origem %s em 15 min', r.n, left(r.actor, 8)), jsonb_build_object('actor', r.actor));
  end loop;
  for r in select fingerprint from app_private.control_incidents where rule_key = 'brute_force' and status <> 'resolved'
           and last_seen < now() - interval '15 minutes' loop
    v_res := app_private.ctl_fire('brute_force', r.fingerprint, false, null, '', null);
  end loop;

  -- admin_intrusion
  select coalesce(sum(hits), 0) into v from app_private.control_events
    where kind in ('control_denied', 'admin_denied', 'control_unauthenticated') and last_at > now() - interval '1 hour';
  v_res := app_private.ctl_fire('admin_intrusion', 'admin_intrusion', v >= (v_rules #>> '{admin_intrusion,threshold}')::numeric, v,
    format('%s tentativas de acesso administrativo negadas na última hora', v), '{}');

  -- payment_refusals
  select count(*) into v from public.payments where status = 'refused' and coalesce(occurred_at, created_at) > now() - interval '24 hours';
  v_res := app_private.ctl_fire('payment_refusals', 'payment_refusals', v >= (v_rules #>> '{payment_refusals,threshold}')::numeric, v,
    format('%s pagamentos recusados em 24 horas', v), '{}');

  -- conversion_drop: taxa cadastro→pagamento válido (7 dias) vs 28 dias anteriores
  declare a_s numeric; a_p numeric; b_s numeric; b_p numeric; rate_a numeric; rate_b numeric;
  begin
    select count(*), count(*) filter (where exists (select 1 from app_private.ctl_payments() p where p.user_id = pr.id and p.valid and not p.is_test))
      into a_s, a_p from public.profiles pr where pr.created_at > now() - interval '7 days';
    select count(*), count(*) filter (where exists (select 1 from app_private.ctl_payments() p where p.user_id = pr.id and p.valid and not p.is_test))
      into b_s, b_p from public.profiles pr where pr.created_at between now() - interval '35 days' and now() - interval '7 days';
    rate_a := a_p / nullif(a_s, 0); rate_b := b_p / nullif(b_s, 0);
    v := case when rate_b > 0 then round((1 - coalesce(rate_a, 0) / rate_b) * 100, 1) end;
    v_res := app_private.ctl_fire('conversion_drop', 'conversion_drop', b_s >= 20 and a_s >= 5 and v >= (v_rules #>> '{conversion_drop,threshold}')::numeric, v,
      format('Conversão caiu %s%% (%s%% → %s%%)', v, round(coalesce(rate_b, 0) * 100, 1), round(coalesce(rate_a, 0) * 100, 1)),
      jsonb_build_object('signups_7d', a_s, 'paid_7d', a_p, 'signups_base', b_s, 'paid_base', b_p));
  end;

  -- gecko_low_credits
  if p_ext ? 'gecko' and (p_ext #>> '{gecko,current_credits}') is not null then
    select value into v_cfg from app_private.control_settings where key = 'gecko';
    v := (p_ext #>> '{gecko,current_credits}')::numeric;
    v2 := nullif(p_ext #>> '{gecko,days_left}', '')::numeric;
    v_res := app_private.ctl_fire('gecko_low_credits', 'gecko_low_credits',
      v < (v_rules #>> '{gecko_low_credits,threshold}')::numeric or (v2 is not null and v2 < coalesce((v_cfg ->> 'low_balance_days')::numeric, 7)), v,
      format('GeckoAPI com %s créditos%s', v, case when v2 is not null then format(' (≈ %s dias no ritmo atual)', round(v2, 1)) else '' end), '{}');
  end if;

  -- db_near_limit
  select value into v_cfg from public.app_settings where key = 'maintenance';
  v_quota := coalesce((v_cfg ->> 'quota_bytes')::numeric, 524288000);
  v_db := pg_database_size(current_database());
  v := round(v_db * 100 / v_quota, 1);
  v_res := app_private.ctl_fire('db_near_limit', 'db_near_limit', v >= (v_rules #>> '{db_near_limit,threshold}')::numeric, v,
    format('Banco em %s%% da cota (%s MB)', v, round(v_db / 1048576, 1)), '{}');

  -- resource_spike: tokens de IA e chamadas GeckoAPI de hoje vs média de 7 dias
  select coalesce(sum(coalesce(tokens_in, 0) + coalesce(tokens_out, 0)) filter (where app_private.sp_day(created_at) = app_private.sp_today()), 0),
         coalesce(sum(coalesce(tokens_in, 0) + coalesce(tokens_out, 0)) filter (where app_private.sp_day(created_at) < app_private.sp_today()), 0) / 7.0
    into v, v2 from public.ai_messages where created_at > now() - interval '8 days';
  v_res := app_private.ctl_fire('resource_spike', 'resource_spike:ai', v2 > 1000 and v > v2 * (v_rules #>> '{resource_spike,threshold}')::numeric,
    round(v / nullif(v2, 0), 1), format('Tokens de IA hoje: %s (média diária %s)', v, round(v2)), '{}');
  select coalesce(sum(calls) filter (where day = current_date), 0), coalesce(sum(calls) filter (where day < current_date and day >= current_date - 7), 0) / 7.0
    into v, v2 from app_private.gecko_daily;
  v_res := app_private.ctl_fire('resource_spike', 'resource_spike:gecko', v2 >= 1 and v > v2 * (v_rules #>> '{resource_spike,threshold}')::numeric,
    round(v / nullif(v2, 0), 1), format('Consultas GeckoAPI hoje: %s (média diária %s)', v, round(v2, 1)), '{}');

  -- webhook_failures
  select count(*) into v from public.webhook_events
    where received_at > now() - interval '24 hours' and (error is not null or outcome in ('unmatched_user', 'unknown_plan', 'amount_mismatch'));
  select v + coalesce(sum(hits), 0) into v from app_private.control_events where kind = 'webhook_invalid_signature' and last_at > now() - interval '24 hours';
  v_res := app_private.ctl_fire('webhook_failures', 'webhook_failures', v >= (v_rules #>> '{webhook_failures,threshold}')::numeric, v,
    format('%s webhooks de pagamento com falha em 24 horas', v), '{}');

  -- Notificações: novos incidentes e lembretes após o intervalo da regra.
  with cand as (
    select c.id, (c.notified_at is null) first_time from app_private.control_incidents c
    join app_private.control_alert_rules ru on ru.key = c.rule_key
    where c.status = 'open' and ru.enabled
      and (c.notified_at is null or c.notified_at < now() - make_interval(mins => ru.cooldown_minutes))
    for update of c
  ), due as (
    update app_private.control_incidents c set notified_at = now() from cand where c.id = cand.id
    returning c.id, c.rule_key, c.title, c.priority, c.value, c.first_seen, c.occurrences, cand.first_time
  )
  select coalesce(jsonb_agg(to_jsonb(due)), '[]') into v_out from due;

  -- Sino de alertas do Worthwise para os administradores (só incidentes novos).
  insert into public.alerts (user_id, kind, title, message, data)
    select ur.user_id, 'system_control', d ->> 'title', 'Abra admin.worthwise.site → Alertas para detalhes.',
           jsonb_build_object('incident', d -> 'id', 'priority', d -> 'priority')
    from jsonb_array_elements(v_out) d cross join public.user_roles ur
    where ur.role = 'admin' and (d ->> 'first_time')::boolean;

  select count(*) into v_opened from app_private.control_incidents where status = 'open';
  return jsonb_build_object('notify', v_out, 'open', v_opened);
end $$;

-- ---------------------------------------------------------------------------
-- Consolidação (Cron a cada 30 min) e retenção
-- ---------------------------------------------------------------------------
create or replace function public.server_control_rollup(p_secret text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare d date; v_from timestamptz; v_to timestamptz; r record; v_del integer := 0; n integer;
begin
  perform app_private.check_secret(p_secret);
  foreach d in array array[app_private.sp_today() - 1, app_private.sp_today()] loop
    v_from := d::timestamp at time zone 'America/Sao_Paulo';
    v_to := (d + 1)::timestamp at time zone 'America/Sao_Paulo';
    delete from app_private.metrics_daily where day = d and metric in ('api_calls', 'api_errors', 'api_latency_avg', 'gecko_call', 'gecko_fail');
    for r in select source, count(*) n, count(*) filter (where not ok) e, avg(duration_ms) ms from public.api_usage_logs
             where created_at >= v_from and created_at < v_to group by source loop
      perform app_private.metric_set(d, 'api_calls', r.source, r.n);
      perform app_private.metric_set(d, 'api_errors', r.source, r.e);
      if r.ms is not null then perform app_private.metric_set(d, 'api_latency_avg', r.source, round(r.ms)); end if;
    end loop;
    -- Endpoint gravado pelo conector: "POST /v1/extract <alvo> <tipo> [<funcionalidade>]"
    for r in select split_part(endpoint, ' ', 3) || ':' || split_part(endpoint, ' ', 4) || ':' || coalesce(nullif(trim(both '[]' from split_part(endpoint, ' ', 5)), ''), 'geral') dim,
                    count(*) filter (where ok) c, count(*) filter (where not ok) f
             from public.api_usage_logs where endpoint like 'POST /v1/extract%' and created_at >= v_from and created_at < v_to group by 1 loop
      if r.c > 0 then perform app_private.metric_set(d, 'gecko_call', r.dim, r.c); end if;
      if r.f > 0 then perform app_private.metric_set(d, 'gecko_fail', r.dim, r.f); end if;
    end loop;
    perform app_private.metric_set(d, 'signups', '', (select count(*) from public.profiles where created_at >= v_from and created_at < v_to));
  end loop;
  -- Foto do dia: assinantes com acesso pago por plano e total de usuários.
  delete from app_private.metrics_daily where day = app_private.sp_today() and metric = 'subs_active';
  for r in select s.plan_id, count(*) n from public.subscriptions s join public.plans p on p.id = s.plan_id
           where s.status in ('active', 'past_due', 'canceled') and s.current_period_end > now() and p.price_cents > 0 group by s.plan_id loop
    perform app_private.metric_set(app_private.sp_today(), 'subs_active', r.plan_id, r.n);
  end loop;
  perform app_private.metric_set(app_private.sp_today(), 'users_total', '', (select count(*) from public.profiles));

  -- Retenção (lotes pequenos)
  delete from app_private.visitor_days where day < app_private.sp_today() - 2; get diagnostics n = row_count; v_del := v_del + n;
  delete from app_private.control_events where id in (select id from app_private.control_events where last_at < now() - interval '90 days' limit 5000);
  get diagnostics n = row_count; v_del := v_del + n;
  delete from app_private.ai_usage_events where id in (select id from app_private.ai_usage_events where at < now() - interval '180 days' limit 5000);
  get diagnostics n = row_count; v_del := v_del + n;
  delete from app_private.gecko_balance_snapshots g where g.at < now() - interval '14 days'
    and g.at <> (select max(x.at) from app_private.gecko_balance_snapshots x where app_private.sp_day(x.at) = app_private.sp_day(g.at));
  get diagnostics n = row_count; v_del := v_del + n;
  delete from app_private.metrics_daily where day < app_private.sp_today() - 800; get diagnostics n = row_count; v_del := v_del + n;
  delete from app_private.control_incidents where status = 'resolved' and resolved_at < now() - interval '365 days';
  return jsonb_build_object('ok', true, 'removed', v_del, 'at', now());
end $$;

-- =============================================================================
-- Relatórios do painel (somente leitura, exigem papel + MFA)
-- =============================================================================

-- Série de datas do período (dia/semana/mês), começando no início real da coleta.
create or replace function app_private.ctl_buckets(p_from timestamptz, p_to timestamptz, p_bucket text, p_since date)
returns table (b date) language sql stable as $$
  select generate_series(
    date_trunc(p_bucket, greatest(app_private.sp_day(p_from), coalesce(p_since, app_private.sp_day(p_from)))::timestamp)::date,
    date_trunc(p_bucket, app_private.sp_day(p_to)::timestamp)::date,
    ('1 ' || p_bucket)::interval)::date
$$;

create or replace function app_private.ctl_bucket_of(p_ts timestamptz, p_bucket text)
returns date language sql immutable as $$ select date_trunc(p_bucket, app_private.sp_day(p_ts)::timestamp)::date $$;

create or replace function app_private.ctl_check_range(p_from timestamptz, p_to timestamptz, p_bucket text)
returns void language plpgsql immutable as $$
begin
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '731 days' then
    raise exception 'invalid_range' using errcode = '22023';
  end if;
  if p_bucket is not null and p_bucket not in ('day', 'week', 'month') then raise exception 'invalid_bucket' using errcode = '22023'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- Visão executiva
-- ---------------------------------------------------------------------------
create or replace function public.control_overview(p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_len interval := p_to - p_from; v_pf timestamptz := p_from - (p_to - p_from);
  v_today timestamptz := app_private.sp_today()::timestamp at time zone 'America/Sao_Paulo';
  v_month timestamptz := date_trunc('month', app_private.sp_today()::timestamp) at time zone 'America/Sao_Paulo';
  v jsonb;
begin
  perform app_private.ctl_require('overview');
  perform app_private.ctl_check_range(p_from, p_to, null);
  with pay as (select * from app_private.ctl_payments() where not is_test),
  firsts as (select user_id, min(at) first_at from pay where valid and status in ('paid', 'refunded', 'chargeback') group by user_id)
  select jsonb_build_object(
    'revenue', jsonb_build_object(
      'today', (select coalesce(sum(amount), 0) from pay where status = 'paid' and at >= v_today),
      'today_net', (select coalesce(sum(net), 0) from pay where status = 'paid' and at >= v_today),
      'month', (select coalesce(sum(amount), 0) from pay where status = 'paid' and at >= v_month),
      'month_net', (select coalesce(sum(net), 0) from pay where status = 'paid' and at >= v_month),
      'range', (select coalesce(sum(amount), 0) from pay where status = 'paid' and at >= p_from and at < p_to),
      'range_net', (select coalesce(sum(net), 0) from pay where status = 'paid' and at >= p_from and at < p_to),
      'range_net_estimated_share', (select round(coalesce(sum(net) filter (where net_estimated), 0) * 1.0 / nullif(sum(net), 0), 3) from pay where status = 'paid' and at >= p_from and at < p_to),
      'prev', (select coalesce(sum(amount), 0) from pay where status = 'paid' and at >= v_pf and at < p_from),
      'prev_net', (select coalesce(sum(net), 0) from pay where status = 'paid' and at >= v_pf and at < p_from),
      'refunds', (select coalesce(sum(amount), 0) from pay where status in ('refunded', 'chargeback') and at >= p_from and at < p_to),
      'last_at', (select max(at) from pay)),
    'mrr_cents', (select coalesce(sum(p.price_cents), 0) from public.subscriptions s join public.plans p on p.id = s.plan_id
        where s.status = 'active' and not s.cancel_at_period_end and s.current_period_end > now() and p.billing_period = 'monthly' and p.price_cents > 0),
    'subs', jsonb_build_object(
      'active', (select count(*) from public.subscriptions s join public.plans p on p.id = s.plan_id
          where s.status in ('active', 'past_due', 'canceled') and s.current_period_end > now() and p.price_cents > 0),
      'renewing', (select count(*) from public.subscriptions s join public.plans p on p.id = s.plan_id
          where s.status = 'active' and not s.cancel_at_period_end and s.current_period_end > now() and p.price_cents > 0),
      'past_due', (select count(*) from public.subscriptions where status = 'past_due' and current_period_end > now()),
      'new', (select count(*) from firsts where first_at >= p_from and first_at < p_to),
      'new_prev', (select count(*) from firsts where first_at >= v_pf and first_at < p_from),
      'canceled', (select count(*) from public.subscriptions where canceled_at >= p_from and canceled_at < p_to),
      'canceled_prev', (select count(*) from public.subscriptions where canceled_at >= v_pf and canceled_at < p_from),
      'last_at', (select max(updated_at) from public.subscriptions)),
    'users', jsonb_build_object(
      'total', (select count(*) from public.profiles),
      'free', (select count(*) from public.profiles pr where public.plan_of(pr.id) = 'free'),
      'signups', (select count(*) from public.profiles where created_at >= p_from and created_at < p_to),
      'signups_prev', (select count(*) from public.profiles where created_at >= v_pf and created_at < p_from),
      'converted', (select count(*) from public.profiles pr where pr.created_at >= p_from and pr.created_at < p_to
          and exists (select 1 from firsts f where f.user_id = pr.id)),
      'converted_prev', (select count(*) from public.profiles pr where pr.created_at >= v_pf and pr.created_at < p_from
          and exists (select 1 from firsts f where f.user_id = pr.id)),
      'paying_ever', (select count(*) from firsts),
      'last_at', (select max(created_at) from public.profiles)),
    'visitors', jsonb_build_object(
      'range', (select sum(value) from app_private.metrics_daily where metric = 'visitors' and day >= app_private.sp_day(p_from) and day <= app_private.sp_day(p_to - interval '1 second')),
      'prev', (select sum(value) from app_private.metrics_daily where metric = 'visitors' and day >= app_private.sp_day(v_pf) and day < app_private.sp_day(p_from)),
      'since', (select min(day) from app_private.metrics_daily where metric = 'visitors'),
      'last_at', (select max(updated_at) from app_private.metrics_daily where metric = 'visitors')),
    'usage', jsonb_build_object(
      'gecko_calls', (select coalesce(sum(calls), 0) from app_private.gecko_daily where day >= app_private.sp_day(p_from) and day <= app_private.sp_day(p_to - interval '1 second')),
      'gecko_since', (select min(day) from app_private.gecko_daily),
      'ai_tokens', (select coalesce(jsonb_object_agg(model, jsonb_build_object('in', tin, 'out', tout)), '{}') from (
          select coalesce(model, 'desconhecido') model, sum(coalesce(tokens_in, 0)) tin, sum(coalesce(tokens_out, 0)) tout from public.ai_messages
          where role = 'assistant' and created_at >= p_from and created_at < p_to group by 1) x),
      'fees', (select coalesce(sum(amount - net), 0) from pay where status = 'paid' and at >= p_from and at < p_to),
      'expenses', (select coalesce(sum(amount_cents), 0) from app_private.control_expenses
          where deleted_at is null and occurred_on >= app_private.sp_day(p_from) and occurred_on <= app_private.sp_day(p_to - interval '1 second'))),
    'series', (select coalesce(jsonb_agg(jsonb_build_object('day', b.b, 'revenue', coalesce(r.rv, 0), 'net', coalesce(r.nt, 0),
        'signups', coalesce(s.sg, 0), 'visitors', m.value) order by b.b), '[]')
      from app_private.ctl_buckets(p_from, p_to, 'day', null) b
      left join (select app_private.sp_day(at) d, sum(amount) rv, sum(net) nt from pay where status = 'paid' and at >= p_from and at < p_to group by 1) r on r.d = b.b
      left join (select app_private.sp_day(created_at) d, count(*) sg from public.profiles where created_at >= p_from and created_at < p_to group by 1) s on s.d = b.b
      left join app_private.metrics_daily m on m.metric = 'visitors' and m.dim = '' and m.day = b.b),
    'sources', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'status', status, 'detail', status_detail,
        'last_ok_at', last_ok_at, 'last_error_at', last_error_at) order by name), '[]') from public.data_sources),
    'incidents', (select coalesce(jsonb_agg(to_jsonb(i) order by i.priority, i.last_seen desc), '[]') from (
        select id, rule_key, title, priority, status, last_seen, occurrences from app_private.control_incidents where status <> 'resolved' limit 20) i),
    'security_24h', (select jsonb_build_object('events', coalesce(sum(hits), 0), 'high', coalesce(sum(hits) filter (where severity in ('high', 'critical')), 0))
        from app_private.control_events where category = 'security' and last_at > now() - interval '24 hours'),
    'generated_at', now()) into v;
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- Assinantes
-- ---------------------------------------------------------------------------
create or replace function public.control_subscribers(p_from timestamptz, p_to timestamptz, p_bucket text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v jsonb; v_since date; v_start_active numeric; v_start_method text;
begin
  perform app_private.ctl_require('subscribers');
  perform app_private.ctl_check_range(p_from, p_to, p_bucket);
  select app_private.sp_day(min(at)) into v_since from app_private.ctl_payments() where not is_test;

  -- Ativos no início do período: foto diária, se existir; senão, estimativa por pagamentos (30 dias + 2 de carência).
  select sum(value) into v_start_active from app_private.metrics_daily where metric = 'subs_active' and day = app_private.sp_day(p_from) - 1;
  if v_start_active is not null then v_start_method := 'snapshot';
  else
    select count(distinct user_id) into v_start_active from app_private.ctl_payments()
      where valid and not is_test and status = 'paid' and at < p_from and at >= p_from - interval '32 days';
    v_start_method := 'estimated_from_payments';
  end if;

  with pay as (select * from app_private.ctl_payments() where not is_test),
  vp as (select *, row_number() over (partition by user_id order by at) rn from pay where valid and status in ('paid', 'refunded', 'chargeback')),
  firsts as (select user_id, at first_at, plan_id from vp where rn = 1)
  select jsonb_build_object(
    'since', v_since,
    'bucket', p_bucket,
    'series', (select coalesce(jsonb_agg(jsonb_build_object(
        'b', b.b, 'new', coalesce(n.c, 0), 'canceled', coalesce(c.c, 0), 'renewals', coalesce(rw.c, 0), 'refused', coalesce(rf.c, 0),
        'cumulative', (select count(*) from firsts f where app_private.ctl_bucket_of(f.first_at, p_bucket) <= b.b),
        'active_snapshot', snap.v) order by b.b), '[]')
      from app_private.ctl_buckets(p_from, p_to, p_bucket, v_since) b
      left join (select app_private.ctl_bucket_of(first_at, p_bucket) k, count(*) c from firsts group by 1) n on n.k = b.b
      left join (select app_private.ctl_bucket_of(canceled_at, p_bucket) k, count(*) c from public.subscriptions where canceled_at is not null group by 1) c on c.k = b.b
      left join (select app_private.ctl_bucket_of(at, p_bucket) k, count(*) c from vp where rn > 1 and status = 'paid' group by 1) rw on rw.k = b.b
      left join (select app_private.ctl_bucket_of(at, p_bucket) k, count(*) c from pay where status = 'refused' group by 1) rf on rf.k = b.b
      left join lateral (select sum(m.value) v from app_private.metrics_daily m where m.metric = 'subs_active'
          and m.day = (select max(m2.day) from app_private.metrics_daily m2 where m2.metric = 'users_total'
                       and date_trunc(p_bucket, m2.day::timestamp)::date = b.b)) snap on true),
    'distribution', (select coalesce(jsonb_agg(jsonb_build_object('plan', plan, 'users', n) order by n desc), '[]') from (
        select public.plan_of(pr.id) plan, count(*) n from public.profiles pr group by 1) x where plan <> 'ilimitado'),
    'revenue_by_plan', (select coalesce(jsonb_agg(jsonb_build_object('plan', coalesce(plan_id, 'sem_plano'), 'amount', a, 'count', c) order by a desc), '[]') from (
        select plan_id, sum(amount) a, count(*) c from pay where status = 'paid' and at >= p_from and at < p_to group by plan_id) x),
    'churn', jsonb_build_object(
        'canceled', (select count(*) from public.subscriptions where canceled_at >= p_from and canceled_at < p_to),
        'refunded', (select count(*) from pay where status in ('refunded', 'chargeback') and at >= p_from and at < p_to),
        'active_start', v_start_active, 'method', v_start_method),
    'conversion', jsonb_build_object(
        'signups', (select count(*) from public.profiles where created_at >= p_from and created_at < p_to),
        'converted', (select count(*) from public.profiles pr where pr.created_at >= p_from and pr.created_at < p_to and exists (select 1 from firsts f where f.user_id = pr.id)),
        'median_days', (select percentile_cont(0.5) within group (order by extract(epoch from f.first_at - pr.created_at) / 86400)
            from firsts f join public.profiles pr on pr.id = f.user_id where f.first_at >= p_from and f.first_at < p_to)),
    -- Coortes mensais de cadastro: % com pagamento válido em cada mês após o cadastro.
    'cohorts', (select coalesce(jsonb_agg(c order by c ->> 'cohort'), '[]') from (
        select jsonb_build_object('cohort', to_char(cm, 'YYYY-MM'), 'size', count(*),
          'converted', count(*) filter (where exists (select 1 from firsts f where f.user_id = pr.id)),
          'months', (select jsonb_agg(jsonb_build_object('k', k,
              'paying', (select count(distinct vp2.user_id) from vp vp2 join public.profiles p2 on p2.id = vp2.user_id
                 where date_trunc('month', p2.created_at at time zone 'America/Sao_Paulo') = cm and vp2.status = 'paid'
                   and date_trunc('month', vp2.at at time zone 'America/Sao_Paulo') = cm + make_interval(months => k))) order by k)
            from generate_series(0, least(11, (extract(year from age(date_trunc('month', now() at time zone 'America/Sao_Paulo'), cm)) * 12
                  + extract(month from age(date_trunc('month', now() at time zone 'America/Sao_Paulo'), cm)))::integer)) k)) c
        from public.profiles pr, lateral (select date_trunc('month', pr.created_at at time zone 'America/Sao_Paulo') cm) x
        where pr.created_at >= now() - interval '13 months'
        group by cm) s),
    'payment_failures', (select coalesce(jsonb_agg(jsonb_build_object('reason', coalesce(r, 'Sem motivo informado'), 'count', n) order by n desc), '[]') from (
        select left(refused_message, 80) r, count(*) n from pay where status = 'refused' and at >= p_from and at < p_to group by 1 limit 10) x),
    'generated_at', now()) into v;
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- Financeiro
-- ---------------------------------------------------------------------------
create or replace function public.control_finance(p_from timestamptz, p_to timestamptz, p_bucket text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v jsonb; v_pf timestamptz := p_from - (p_to - p_from); v_buckets integer;
begin
  perform app_private.ctl_require('finance');
  perform app_private.ctl_check_range(p_from, p_to, p_bucket);
  with pay as (select * from app_private.ctl_payments()),
  real_pay as (select * from pay where not is_test),
  pend as (
    -- Pix/boleto gerados cujo pagamento ainda não aparece como pago/estornado.
    select w.received_at at, app_private.to_cents(w.payload #>> '{payment,value}') amount, w.trigger, w.payload #>> '{payment,id}' pid
    from public.webhook_events w
    where w.trigger in ('payment_pix_created', 'spark_payment_boleto_created')
      and not exists (select 1 from public.payments p where p.provider_payment_id = w.payload #>> '{payment,id}'))
  select jsonb_build_object(
    'bucket', p_bucket,
    'since', (select app_private.sp_day(min(at)) from real_pay),
    'series', (select coalesce(jsonb_agg(jsonb_build_object('b', b.b, 'gross', coalesce(g.gross, 0), 'paid', coalesce(g.paid, 0),
        'net', coalesce(g.net, 0), 'refunds', coalesce(g.refunds, 0)) order by b.b), '[]')
      from app_private.ctl_buckets(p_from, p_to, p_bucket, null) b
      left join (select app_private.ctl_bucket_of(at, p_bucket) k,
          sum(amount) filter (where status in ('paid', 'refunded', 'chargeback')) gross, sum(amount) filter (where status = 'paid') paid,
          sum(net) filter (where status = 'paid') net, sum(amount) filter (where status in ('refunded', 'chargeback')) refunds
        from real_pay where at >= p_from - interval '31 days' and at < p_to group by 1) g on g.k = b.b),
    'prev_series', (select coalesce(jsonb_agg(jsonb_build_object('b', b.b, 'paid', coalesce(g.paid, 0), 'net', coalesce(g.net, 0)) order by b.b), '[]')
      from app_private.ctl_buckets(v_pf, p_from - interval '1 second', p_bucket, null) b
      left join (select app_private.ctl_bucket_of(at, p_bucket) k, sum(amount) filter (where status = 'paid') paid, sum(net) filter (where status = 'paid') net
        from real_pay where at >= v_pf - interval '31 days' and at < p_from group by 1) g on g.k = b.b),
    'totals', (select jsonb_build_object(
        'paid', coalesce(sum(amount) filter (where status = 'paid'), 0), 'paid_n', count(*) filter (where status = 'paid'),
        'net', coalesce(sum(net) filter (where status = 'paid'), 0),
        'net_estimated', coalesce(sum(net) filter (where status = 'paid' and net_estimated), 0),
        'refunded', coalesce(sum(amount) filter (where status = 'refunded'), 0), 'refunded_n', count(*) filter (where status = 'refunded'),
        'chargeback', coalesce(sum(amount) filter (where status = 'chargeback'), 0), 'chargeback_n', count(*) filter (where status = 'chargeback'),
        'refused', coalesce(sum(amount) filter (where status = 'refused'), 0), 'refused_n', count(*) filter (where status = 'refused'),
        'fees', coalesce(sum(amount - net) filter (where status = 'paid'), 0),
        'invalid_paid', coalesce(sum(amount) filter (where status = 'paid' and not valid), 0), 'invalid_paid_n', count(*) filter (where status = 'paid' and not valid))
      from real_pay where at >= p_from and at < p_to),
    'prev_totals', (select jsonb_build_object('paid', coalesce(sum(amount) filter (where status = 'paid'), 0), 'net', coalesce(sum(net) filter (where status = 'paid'), 0))
      from real_pay where at >= v_pf and at < p_from),
    'pending', (select jsonb_build_object('count', count(*), 'amount', coalesce(sum(amount), 0)) from pend where at >= p_from and at < p_to),
    'pending_all', (select jsonb_build_object('count', count(*), 'amount', coalesce(sum(amount), 0)) from pend where at > now() - interval '7 days'),
    'cancellations', (select count(*) from public.subscriptions where canceled_at >= p_from and canceled_at < p_to),
    'methods', (select coalesce(jsonb_agg(jsonb_build_object('method', coalesce(method, 'desconhecido'), 'amount', a, 'count', c) order by a desc), '[]') from (
        select method, sum(amount) a, count(*) c from real_pay where status = 'paid' and at >= p_from and at < p_to group by method) x),
    'test', (select jsonb_build_object('count', count(*), 'amount', coalesce(sum(amount), 0)) from pay where is_test and at >= p_from and at < p_to),
    -- Previsto: renovações esperadas nos próximos 30 dias (assinaturas mensais ativas que não serão canceladas).
    'forecast_30d', (select jsonb_build_object('count', count(*), 'amount', coalesce(sum(p.price_cents), 0))
      from public.subscriptions s join public.plans p on p.id = s.plan_id
      where s.status = 'active' and not s.cancel_at_period_end and p.billing_period = 'monthly' and p.price_cents > 0
        and s.current_period_end - interval '2 days' between now() and now() + interval '30 days'),
    'at_risk', (select jsonb_build_object('count', count(*), 'amount', coalesce(sum(p.price_cents), 0))
      from public.subscriptions s join public.plans p on p.id = s.plan_id where s.status = 'past_due' and s.current_period_end > now()),
    'payments', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'at', x.at, 'plan', x.plan_id, 'method', x.method, 'status', x.status,
        'amount', x.amount, 'net', x.net, 'net_estimated', x.net_estimated, 'valid', x.valid, 'is_test', x.is_test,
        'customer', app_private.mask_email(u.email::text), 'refused', left(x.refused_message, 80)) order by x.at desc), '[]')
      from (select * from pay where at >= p_from and at < p_to order by at desc limit 1000) x left join auth.users u on u.id = x.user_id),
    'expenses', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'day', e.occurred_on, 'category', e.category, 'description', e.description,
        'amount', e.amount_cents, 'created_at', e.created_at) order by e.occurred_on desc), '[]')
      from app_private.control_expenses e where e.deleted_at is null
        and e.occurred_on >= app_private.sp_day(p_from) and e.occurred_on <= app_private.sp_day(p_to - interval '1 second')),
    'unit', jsonb_build_object(
        'paying_customers', (select count(distinct user_id) from real_pay where valid and status = 'paid'),
        'new_customers', (select count(*) from (select user_id, min(at) f from real_pay where valid and status in ('paid', 'refunded', 'chargeback') group by user_id) f where f.f >= p_from and f.f < p_to),
        'ads', (select coalesce(sum(amount_cents), 0) from app_private.control_expenses where deleted_at is null and category = 'ads'
            and occurred_on >= app_private.sp_day(p_from) and occurred_on <= app_private.sp_day(p_to - interval '1 second')),
        'history_days', (select extract(day from now() - min(at))::integer from real_pay where valid and status = 'paid'),
        'paid_90d', (select coalesce(sum(amount), 0) from real_pay where valid and status = 'paid' and at > now() - interval '90 days'),
        'paying_90d', (select count(distinct user_id) from real_pay where valid and status = 'paid' and at > now() - interval '90 days'),
        'canceled_90d', (select count(*) from public.subscriptions where canceled_at > now() - interval '90 days')),
    'heropay_webhooks_last', (select max(received_at) from public.webhook_events where provider = 'heropay'),
    'generated_at', now()) into v;
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- Funil e atividade
-- ---------------------------------------------------------------------------
create or replace function public.control_funnel(p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  perform app_private.ctl_require('funnel');
  perform app_private.ctl_check_range(p_from, p_to, null);
  with cohort as (select id from public.profiles where created_at >= p_from and created_at < p_to),
  sc as (select s.user_id, count(*) n from public.searches s join cohort c on c.id = s.user_id group by s.user_id),
  act as (
    select user_id, app_private.sp_day(created_at) d from public.searches where created_at >= p_from and created_at < p_to
    union select user_id, app_private.sp_day(last_opened_at) from public.searches where last_opened_at >= p_from and last_opened_at < p_to
    union select user_id, app_private.sp_day(created_at) from public.ai_messages where role = 'user' and created_at >= p_from and created_at < p_to)
  select jsonb_build_object(
    'stages', jsonb_build_array(
      jsonb_build_object('key', 'visitors', 'label', 'Visitantes', 'count',
        (select sum(value) from app_private.metrics_daily where metric = 'visitors' and day >= app_private.sp_day(p_from) and day <= app_private.sp_day(p_to - interval '1 second')),
        'since', (select min(day) from app_private.metrics_daily where metric = 'visitors')),
      jsonb_build_object('key', 'signup', 'label', 'Cadastro', 'count', (select count(*) from cohort)),
      jsonb_build_object('key', 'search1', 'label', 'Primeira pesquisa', 'count', (select count(*) from sc where n >= 1)),
      jsonb_build_object('key', 'search3', 'label', 'Terceira pesquisa', 'count', (select count(*) from sc where n >= 3)),
      jsonb_build_object('key', 'checkout', 'label', 'Checkout', 'count', (select count(distinct ci.user_id) from public.checkout_intents ci join cohort c on c.id = ci.user_id)),
      jsonb_build_object('key', 'paid', 'label', 'Assinatura paga', 'count',
        (select count(distinct p.user_id) from app_private.ctl_payments() p join cohort c on c.id = p.user_id where p.valid and not p.is_test and p.status in ('paid', 'refunded', 'chargeback')))),
    'activity', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'plan', plan, 'users', n) order by d, plan), '[]') from (
        select a.d, public.plan_of(a.user_id) plan, count(distinct a.user_id) n from act a group by 1, 2) x where plan <> 'ilimitado'),
    -- Retenção semanal por plano atual: das pessoas cadastradas em cada semana, quantas voltaram a usar nas semanas seguintes.
    'retention', (select coalesce(jsonb_agg(r order by r ->> 'week', r ->> 'plan'), '[]') from (
        select jsonb_build_object('week', to_char(w, 'YYYY-MM-DD'), 'plan', plan, 'size', count(*),
          'weeks', (select jsonb_agg((select count(distinct pr2.id) from public.profiles pr2
              where date_trunc('week', pr2.created_at at time zone 'America/Sao_Paulo') = w and public.plan_of(pr2.id) = plan
                and (exists (select 1 from public.searches s where s.user_id = pr2.id and date_trunc('week', s.last_opened_at at time zone 'America/Sao_Paulo') = w + make_interval(weeks => k))
                  or exists (select 1 from public.ai_messages m where m.user_id = pr2.id and m.role = 'user' and date_trunc('week', m.created_at at time zone 'America/Sao_Paulo') = w + make_interval(weeks => k))))
              order by k) from generate_series(0, least(7, (extract(epoch from date_trunc('week', now() at time zone 'America/Sao_Paulo') - w) / 604800)::integer)) k)) r
        from public.profiles pr, lateral (select date_trunc('week', pr.created_at at time zone 'America/Sao_Paulo') w, public.plan_of(pr.id) plan) x
        where pr.created_at >= greatest(p_from, now() - interval '12 weeks') and pr.created_at < p_to and plan <> 'ilimitado'
        group by w, plan) s),
    'generated_at', now()) into v;
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- Security Center
-- ---------------------------------------------------------------------------
create or replace function public.control_security(p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  perform app_private.ctl_require('security');
  perform app_private.ctl_check_range(p_from, p_to, null);
  with ev as (select * from app_private.control_events where category = 'security' and last_at >= p_from and at < p_to)
  select jsonb_build_object(
    'since', (select min(at) from app_private.control_events),
    'totals', (select jsonb_build_object('events', count(*), 'hits', coalesce(sum(hits), 0),
        'suspicious', coalesce(sum(hits) filter (where class = 'suspicious'), 0),
        'blocked', coalesce(sum(hits) filter (where class = 'blocked'), 0),
        'incident', coalesce(sum(hits) filter (where class = 'incident'), 0),
        'high', coalesce(sum(hits) filter (where severity in ('high', 'critical')), 0)) from ev),
    'by_kind', (select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'hits', h, 'events', n, 'severity', sv) order by h desc), '[]')
      from (select kind, sum(hits) h, count(*) n, max(severity) sv from ev group by kind) x),
    'by_hour', (select coalesce(jsonb_agg(jsonb_build_object('hour', h, 'hits', coalesce(n, 0)) order by h), '[]')
      from generate_series(0, 23) h left join (select extract(hour from at at time zone 'America/Sao_Paulo')::integer hr, sum(hits) n from ev group by 1) x on x.hr = h),
    'by_day', (select coalesce(jsonb_agg(jsonb_build_object('day', day, 'suspicious', s, 'blocked', b, 'incident', i) order by day), '[]') from (
        select app_private.sp_day(at) as day, sum(hits) filter (where class = 'suspicious') s, sum(hits) filter (where class = 'blocked') b,
               sum(hits) filter (where class = 'incident') i from ev group by 1) x),
    'daily_history', (select coalesce(jsonb_agg(jsonb_build_object('day', day, 'kind', replace(metric, 'ev:security:', ''), 'severity', dim, 'n', value) order by day), '[]')
      from app_private.metrics_daily where metric like 'ev:security:%' and day >= app_private.sp_day(p_from) and day <= app_private.sp_day(p_to - interval '1 second')),
    'countries', (select coalesce(jsonb_agg(jsonb_build_object('country', country, 'hits', h) order by h desc), '[]') from (
        select country, sum(hits) h from ev where country is not null group by country order by 2 desc limit 20) x),
    'timeline', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'at', at, 'last_at', last_at, 'kind', kind, 'severity', severity, 'class', class,
        'actor', left(actor, 10), 'country', country, 'path', path, 'hits', hits, 'detail', detail) order by last_at desc), '[]')
      from (select * from ev order by last_at desc limit 400) t),
    'brute_force', (select coalesce(jsonb_agg(jsonb_build_object('actor', left(actor, 10), 'hits', h, 'first', f, 'last', l) order by h desc), '[]') from (
        select actor, sum(hits) h, min(at) f, max(last_at) l from ev where kind in ('control_login_failed', 'auth_failed', 'mfa_failed') and actor is not null
        group by actor having sum(hits) >= 5 order by 2 desc limit 20) x),
    -- Abuso do acesso grátis: aparelhos/redes (hash) com várias contas no período.
    'credit_abuse', jsonb_build_object(
      'devices_multi', (select count(*) from (select device_hash from public.signup_events where created_at >= p_from and created_at < p_to and device_hash is not null
          group by device_hash having count(distinct user_id) >= 2) x),
      'networks_multi', (select count(*) from (select ip_hash from public.signup_events where created_at >= p_from and created_at < p_to
          group by ip_hash having count(distinct user_id) >= 3) x),
      'trial_denied', (select count(*) from public.profiles where free_trial_denied is not null and created_at >= p_from and created_at < p_to),
      'signups', (select count(*) from public.signup_events where created_at >= p_from and created_at < p_to),
      'top', (select coalesce(jsonb_agg(jsonb_build_object('device', left(device_hash, 10), 'accounts', n, 'last', l) order by n desc), '[]') from (
          select device_hash, count(distinct user_id) n, max(created_at) l from public.signup_events
          where created_at >= p_from and created_at < p_to and device_hash is not null group by 1 having count(distinct user_id) >= 2 order by 2 desc limit 10) x)),
    'incidents', (select coalesce(jsonb_agg(to_jsonb(i) order by i.last_seen desc), '[]') from (
        select c.id, c.rule_key, c.title, c.priority, c.status, c.confirmed, c.first_seen, c.last_seen, c.occurrences, c.value
        from app_private.control_incidents c join app_private.control_alert_rules r on r.key = c.rule_key
        where (r.category = 'security' or c.confirmed) and c.last_seen >= p_from - interval '30 days' order by c.last_seen desc limit 100) i),
    'generated_at', now()) into v;
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- GeckoAPI
-- ---------------------------------------------------------------------------
create or replace function public.control_gecko(p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  perform app_private.ctl_require('gecko');
  perform app_private.ctl_check_range(p_from, p_to, null);
  select jsonb_build_object(
    'latest', (select to_jsonb(s) from (select * from app_private.gecko_balance_snapshots order by at desc limit 1) s),
    'balance', (select coalesce(jsonb_agg(jsonb_build_object('at', at, 'credits', current_credits, 'c24', consumed_24h) order by at), '[]')
      from app_private.gecko_balance_snapshots where at >= p_from and at < p_to),
    'claimed', (select coalesce(jsonb_agg(jsonb_build_object('day', day, 'calls', calls) order by day), '[]')
      from app_private.gecko_daily where day >= app_private.sp_day(p_from) and day <= app_private.sp_day(p_to - interval '1 second')),
    'claimed_since', (select min(day) from app_private.gecko_daily),
    'calls', (select coalesce(jsonb_agg(jsonb_build_object('day', day, 'metric', metric, 'dim', dim, 'n', value) order by day), '[]')
      from app_private.metrics_daily where metric in ('gecko_call', 'gecko_fail', 'gecko_cache_hit')
        and day >= app_private.sp_day(p_from) and day <= app_private.sp_day(p_to - interval '1 second')),
    'cache_since', (select min(day) from app_private.metrics_daily where metric = 'gecko_cache_hit'),
    'failures', (select coalesce(jsonb_agg(jsonb_build_object('at', created_at, 'source', source, 'endpoint', endpoint, 'status', status, 'error', error, 'ms', duration_ms) order by created_at desc), '[]')
      from (select * from public.api_usage_logs where endpoint like 'POST /v1/extract%' and not ok and created_at >= p_from and created_at < p_to order by created_at desc limit 100) x),
    'latency', (select jsonb_build_object('p50', percentile_cont(0.5) within group (order by duration_ms), 'p95', percentile_cont(0.95) within group (order by duration_ms), 'n', count(*))
      from public.api_usage_logs where endpoint like 'POST /v1/extract%' and ok and created_at >= p_from and created_at < p_to),
    'stored', (select coalesce(jsonb_agg(jsonb_build_object('target', split_part(key, ':', 2), 'type', split_part(key, ':', 3),
        'what', coalesce(req ->> 'keyword', req ->> 'url', body ->> 'query', body ->> 'requestUrl'), 'items', jsonb_array_length(coalesce(body -> 'items', '[]')),
        'fetched_at', fetched_at, 'auto_refresh', req is not null) order by fetched_at desc), '[]')
      from app_private.gecko_cache),
    'top_queries', (select coalesce(jsonb_agg(jsonb_build_object('query', query, 'count', n, 'users', u) order by n desc), '[]') from (
        select query, count(*) n, count(distinct user_id) u from public.searches where created_at >= p_from and created_at < p_to group by query order by 2 desc limit 15) x),
    'searches', (select count(*) from public.searches where created_at >= p_from and created_at < p_to),
    'settings', (select value from app_private.control_settings where key = 'gecko'),
    'costs', (select value -> 'gecko' from app_private.control_settings where key = 'costs'),
    'generated_at', now()) into v;
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- Inteligência artificial (somente contadores; nenhum conteúdo de conversa é lido)
-- ---------------------------------------------------------------------------
create or replace function public.control_ai(p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  perform app_private.ctl_require('ai');
  perform app_private.ctl_check_range(p_from, p_to, null);
  with m as (select user_id, model, tokens_in, tokens_out, created_at from public.ai_messages where role = 'assistant' and created_at >= p_from and created_at < p_to),
  e as (select * from app_private.ai_usage_events where at >= p_from and at < p_to)
  select jsonb_build_object(
    'totals', (select jsonb_build_object('responses', count(*), 'tokens_in', coalesce(sum(tokens_in), 0), 'tokens_out', coalesce(sum(tokens_out), 0),
        'users', count(distinct user_id), 'without_usage', count(*) filter (where tokens_in is null and tokens_out is null)) from m),
    'by_day', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'model', model, 'responses', n, 'tin', tin, 'tout', tout) order by d), '[]') from (
        select app_private.sp_day(created_at) d, coalesce(model, 'desconhecido') model, count(*) n, sum(coalesce(tokens_in, 0)) tin, sum(coalesce(tokens_out, 0)) tout from m group by 1, 2) x),
    'by_model', (select coalesce(jsonb_agg(jsonb_build_object('model', model, 'responses', n, 'tin', tin, 'tout', tout) order by n desc), '[]') from (
        select coalesce(model, 'desconhecido') model, count(*) n, sum(coalesce(tokens_in, 0)) tin, sum(coalesce(tokens_out, 0)) tout from m group by 1) x),
    'by_plan', (select coalesce(jsonb_agg(jsonb_build_object('plan', plan, 'responses', n, 'tokens', t, 'users', u) order by t desc), '[]') from (
        select public.plan_of(user_id) plan, count(*) n, sum(coalesce(tokens_in, 0) + coalesce(tokens_out, 0)) t, count(distinct user_id) u from m group by 1) x),
    'top_users', (select coalesce(jsonb_agg(jsonb_build_object('user_id', x.user_id, 'customer', app_private.mask_email(u.email::text), 'plan', public.plan_of(x.user_id),
        'responses', x.n, 'tokens', x.t, 'limit', to_jsonb(l)) order by x.t desc), '[]') from (
        select user_id, count(*) n, sum(coalesce(tokens_in, 0) + coalesce(tokens_out, 0)) t from m group by 1 order by 3 desc limit 20) x
        left join auth.users u on u.id = x.user_id left join app_private.ai_user_limits l on l.user_id = x.user_id),
    'events', (select jsonb_build_object('requests', count(*), 'errors', count(*) filter (where not ok),
        'p50', percentile_cont(0.5) within group (order by latency_ms), 'p95', percentile_cont(0.95) within group (order by latency_ms),
        'since', (select min(at) from app_private.ai_usage_events)) from e),
    'errors', (select coalesce(jsonb_agg(jsonb_build_object('code', coalesce(error_code, 'desconhecido'), 'n', n) order by n desc), '[]') from (
        select error_code, count(*) n from e where not ok group by 1) x),
    'latency_by_day', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'p50', p50, 'p95', p95, 'n', n, 'errors', er) order by d), '[]') from (
        select app_private.sp_day(at) d, percentile_cont(0.5) within group (order by latency_ms) p50, percentile_cont(0.95) within group (order by latency_ms) p95,
               count(*) n, count(*) filter (where not ok) er from e group by 1) x),
    'by_feature', (select coalesce(jsonb_agg(jsonb_build_object('feature', feature, 'provider', provider, 'n', n) order by n desc), '[]') from (
        select feature, provider, count(*) n from e group by 1, 2) x),
    'month_spend_usd', app_private.ai_month_spend_usd(),
    'limits', (select value from app_private.control_settings where key = 'ai_limits'),
    'user_limits', (select coalesce(jsonb_agg(jsonb_build_object('user_id', l.user_id, 'customer', app_private.mask_email(u.email::text),
        'daily_requests', l.daily_requests, 'blocked', l.blocked, 'note', l.note, 'updated_at', l.updated_at) order by l.updated_at desc), '[]')
      from app_private.ai_user_limits l left join auth.users u on u.id = l.user_id),
    'prices', (select value -> 'ai_prices_usd_per_mtok' from app_private.control_settings where key = 'costs'),
    'usd_brl', (select value -> 'usd_brl' from app_private.control_settings where key = 'costs'),
    'generated_at', now()) into v;
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- Infraestrutura (banco)
-- ---------------------------------------------------------------------------
create or replace function public.control_infra()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v jsonb; v_usage jsonb; v_stmts jsonb; v_cfg jsonb;
begin
  perform app_private.ctl_require('infra');
  v_usage := app_private.db_usage();
  select value into v_cfg from public.app_settings where key = 'maintenance';
  begin
    execute $q$select coalesce(jsonb_agg(jsonb_build_object('query', left(regexp_replace(query, '\s+', ' ', 'g'), 160), 'calls', calls,
        'total_ms', round(total_exec_time::numeric), 'mean_ms', round(mean_exec_time::numeric, 2)) order by total_exec_time desc), '[]')
      from (select * from extensions.pg_stat_statements where query not ilike '%pg_stat_statements%' order by total_exec_time desc limit 8) s$q$ into v_stmts;
  exception when others then v_stmts := null;
  end;
  select jsonb_build_object(
    'db', v_usage,
    'quota_bytes', coalesce((v_cfg ->> 'quota_bytes')::bigint, 524288000),
    'growth', (select coalesce(jsonb_agg(jsonb_build_object('day', day, 'bytes', db_bytes) order by day), '[]') from (
        select * from app_private.storage_snapshots order by day desc limit 90) s),
    'connections', (select jsonb_build_object('total', count(*), 'active', count(*) filter (where state = 'active'),
        'idle', count(*) filter (where state = 'idle'), 'idle_tx', count(*) filter (where state like 'idle in transaction%'),
        'max', current_setting('max_connections')::integer) from pg_stat_activity where datname = current_database()),
    'cache_hit', (select round(sum(blks_hit) * 100.0 / nullif(sum(blks_hit) + sum(blks_read), 0), 2) from pg_stat_database where datname = current_database()),
    'tx', (select jsonb_build_object('commit', xact_commit, 'rollback', xact_rollback, 'deadlocks', deadlocks, 'temp_bytes', temp_bytes, 'stats_reset', stats_reset)
        from pg_stat_database where datname = current_database()),
    'statements', v_stmts,
    'api_latency', (select coalesce(jsonb_agg(jsonb_build_object('source', source, 'n', n, 'errors', e, 'p50', p50, 'p95', p95) order by n desc), '[]') from (
        select source, count(*) n, count(*) filter (where not ok) e, percentile_cont(0.5) within group (order by duration_ms) p50,
          percentile_cont(0.95) within group (order by duration_ms) p95 from public.api_usage_logs where created_at > now() - interval '24 hours' group by source) x),
    'api_daily', (select coalesce(jsonb_agg(jsonb_build_object('day', day, 'metric', metric, 'source', dim, 'n', value) order by day), '[]')
        from app_private.metrics_daily where metric in ('api_calls', 'api_errors') and day > app_private.sp_today() - 30),
    'maintenance', (select coalesce(jsonb_agg(to_jsonb(r) order by r.started_at desc), '[]') from (
        select task, started_at, finished_at, ok, rows_removed, error from app_private.maintenance_runs order by started_at desc limit 10) r),
    'sources', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'kind', kind, 'status', status, 'detail', status_detail,
        'last_ok_at', last_ok_at, 'last_error_at', last_error_at) order by name), '[]') from public.data_sources),
    'retention', jsonb_build_object(
        'control_events', (select count(*) from app_private.control_events),
        'ai_usage_events', (select count(*) from app_private.ai_usage_events),
        'metrics_daily', (select count(*) from app_private.metrics_daily),
        'visitor_days', (select count(*) from app_private.visitor_days),
        'api_usage_logs', (select count(*) from public.api_usage_logs)),
    'last_rollup', (select max(updated_at) from app_private.metrics_daily where metric = 'users_total'),
    'generated_at', now()) into v;
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- Alertas, auditoria e equipe
-- ---------------------------------------------------------------------------
create or replace function public.control_alerts()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform app_private.ctl_require('alerts');
  return jsonb_build_object(
    'rules', (select coalesce(jsonb_agg(to_jsonb(r) order by r.category, r.key), '[]') from app_private.control_alert_rules r),
    'incidents', (select coalesce(jsonb_agg(to_jsonb(i) order by (i.status = 'resolved'), i.last_seen desc), '[]') from (
        select id, rule_key, fingerprint, title, priority, status, confirmed, value, details, occurrences, first_seen, last_seen, notified_at, resolved_at, auto_resolved
        from app_private.control_incidents order by last_seen desc limit 300) i),
    'generated_at', now());
end $$;

-- Contador leve para o menu (incidentes abertos).
create or replace function public.control_badge()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if app_private.ctl_role() is null or coalesce(app_private.jwt_claims() ->> 'aal', 'aal1') <> 'aal2' then return jsonb_build_object('open', 0); end if;
  return jsonb_build_object('open', (select count(*) from app_private.control_incidents where status = 'open'));
end $$;

create or replace function public.control_audit_log(p_search text, p_limit integer, p_offset integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform app_private.ctl_require('audit');
  return jsonb_build_object(
    'rows', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'at', a.created_at, 'admin', u.email, 'action', a.action, 'target', a.target, 'details', a.details) order by a.id desc), '[]')
      from (select * from public.admin_audit_logs a
            where p_search is null or p_search = '' or a.action ilike '%' || p_search || '%' or a.target ilike '%' || p_search || '%'
            order by a.id desc limit least(coalesce(p_limit, 100), 500) offset greatest(coalesce(p_offset, 0), 0)) a
      left join auth.users u on u.id = a.admin_id),
    'total', (select count(*) from public.admin_audit_logs));
end $$;

-- ---------------------------------------------------------------------------
-- Escritas permitidas (todas auditadas)
-- ---------------------------------------------------------------------------
create or replace function public.control_add_expense(p_day date, p_category text, p_description text, p_amount_cents integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform app_private.ctl_require_write('expenses');
  if p_day is null or p_day > app_private.sp_today() + 31 or p_day < app_private.sp_today() - 731 then raise exception 'invalid_date' using errcode = '22023'; end if;
  insert into app_private.control_expenses (occurred_on, category, description, amount_cents, created_by)
    values (p_day, p_category, trim(p_description), p_amount_cents, (select auth.uid())) returning id into v_id;
  perform app_private.ctl_audit('expense.add', v_id::text, jsonb_build_object('day', p_day, 'category', p_category, 'amount_cents', p_amount_cents, 'description', left(p_description, 80)));
  return v_id;
end $$;

create or replace function public.control_delete_expense(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.ctl_require_write('expenses');
  update app_private.control_expenses set deleted_at = now(), deleted_by = (select auth.uid()) where id = p_id and deleted_at is null;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform app_private.ctl_audit('expense.delete', p_id::text, '{}');
end $$;

create or replace function public.control_flag_payment(p_payment uuid, p_test boolean, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.ctl_require_write('payment_flags');
  if not exists (select 1 from public.payments where id = p_payment) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_test then
    insert into app_private.payment_flags (payment_id, flag, note, created_by) values (p_payment, 'test', left(p_note, 200), (select auth.uid()))
      on conflict (payment_id) do update set note = excluded.note, created_by = excluded.created_by, created_at = now();
  else
    delete from app_private.payment_flags where payment_id = p_payment;
  end if;
  perform app_private.ctl_audit(case when p_test then 'payment.flag_test' else 'payment.unflag_test' end, p_payment::text, jsonb_build_object('note', left(p_note, 200)));
end $$;

create or replace function public.control_incident_action(p_id bigint, p_action text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.ctl_require_write('incidents');
  if p_action = 'acknowledge' then
    update app_private.control_incidents set status = 'acknowledged' where id = p_id and status = 'open';
  elsif p_action = 'resolve' then
    update app_private.control_incidents set status = 'resolved', resolved_at = now(), resolved_by = (select auth.uid()) where id = p_id and status <> 'resolved';
  elsif p_action = 'confirm' then
    update app_private.control_incidents set confirmed = true where id = p_id;
  elsif p_action = 'unconfirm' then
    update app_private.control_incidents set confirmed = false where id = p_id;
  else
    raise exception 'invalid_action' using errcode = '22023';
  end if;
  perform app_private.ctl_audit('incident.' || p_action, p_id::text, '{}');
end $$;

create or replace function public.control_update_rule(p_key text, p_enabled boolean, p_threshold numeric, p_priority text, p_cooldown integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.ctl_require_write('rules');
  if p_threshold is null or p_threshold < 0 or p_priority not in ('P1', 'P2', 'P3', 'P4') or p_cooldown not between 10 and 10080 then
    raise exception 'invalid_rule' using errcode = '22023';
  end if;
  update app_private.control_alert_rules set enabled = coalesce(p_enabled, enabled), threshold = p_threshold, priority = p_priority,
    cooldown_minutes = p_cooldown, updated_by = (select auth.uid()), updated_at = now() where key = p_key;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform app_private.ctl_audit('rule.update', p_key, jsonb_build_object('enabled', p_enabled, 'threshold', p_threshold, 'priority', p_priority, 'cooldown', p_cooldown));
end $$;

create or replace function public.control_get_settings()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_role text := app_private.ctl_role();
begin
  if v_role is null or coalesce(app_private.jwt_claims() ->> 'aal', 'aal1') <> 'aal2' then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((select jsonb_object_agg(key, value) from app_private.control_settings), '{}');
end $$;

-- Atualiza configurações conhecidas, validando o formato básico.
create or replace function public.control_set_setting(p_key text, p_value jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_key in ('costs', 'gecko') then perform app_private.ctl_require_write('costs');
  elsif p_key = 'ai_limits' then perform app_private.ctl_require_write('ai_limits');
  else raise exception 'invalid_key' using errcode = '22023'; end if;
  if jsonb_typeof(p_value) <> 'object' or pg_column_size(p_value) > 20000 then raise exception 'invalid_value' using errcode = '22023'; end if;
  update app_private.control_settings set value = p_value, updated_by = (select auth.uid()), updated_at = now() where key = p_key;
  perform app_private.ctl_audit('settings.' || p_key, p_key, p_value);
end $$;

create or replace function public.control_set_ai_user_limit(p_user uuid, p_daily integer, p_blocked boolean, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.ctl_require_write('ai_limits');
  if p_daily is null and not coalesce(p_blocked, false) then
    delete from app_private.ai_user_limits where user_id = p_user;
  else
    insert into app_private.ai_user_limits (user_id, daily_requests, blocked, note, updated_by)
      values (p_user, p_daily, coalesce(p_blocked, false), left(p_note, 200), (select auth.uid()))
      on conflict (user_id) do update set daily_requests = excluded.daily_requests, blocked = excluded.blocked, note = excluded.note,
        updated_by = excluded.updated_by, updated_at = now();
  end if;
  perform app_private.ctl_audit('ai.user_limit', p_user::text, jsonb_build_object('daily', p_daily, 'blocked', p_blocked));
end $$;

-- Exportação CSV: devolve linhas já sem dados sensíveis; o servidor converte e registra na auditoria.
create or replace function public.control_export(p_dataset text, p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_role text := app_private.ctl_require('export'); v jsonb;
begin
  perform app_private.ctl_check_range(p_from, p_to, null);
  if p_dataset in ('payments', 'expenses') and not ('finance' = any(app_private.ctl_areas(v_role))) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_dataset = 'security_events' and not ('security' = any(app_private.ctl_areas(v_role))) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_dataset = 'payments' then
    select coalesce(jsonb_agg(jsonb_build_object('data', x.at, 'plano', x.plan_id, 'metodo', x.method, 'status', x.status, 'valor_centavos', x.amount,
        'liquido_centavos', x.net, 'liquido_estimado', x.net_estimated, 'assinatura_reconhecida', x.valid, 'teste', x.is_test,
        'cliente', app_private.mask_email(u.email::text)) order by x.at), '[]') into v
      from app_private.ctl_payments() x left join auth.users u on u.id = x.user_id where x.at >= p_from and x.at < p_to;
  elsif p_dataset = 'expenses' then
    select coalesce(jsonb_agg(jsonb_build_object('data', occurred_on, 'categoria', category, 'descricao', description, 'valor_centavos', amount_cents) order by occurred_on), '[]') into v
      from app_private.control_expenses where deleted_at is null and occurred_on >= app_private.sp_day(p_from) and occurred_on <= app_private.sp_day(p_to - interval '1 second');
  elsif p_dataset = 'security_events' then
    select coalesce(jsonb_agg(jsonb_build_object('inicio', at, 'ultimo', last_at, 'tipo', kind, 'gravidade', severity, 'classe', class, 'origem_hash', left(actor, 10),
        'pais', country, 'caminho', path, 'ocorrencias', hits) order by at), '[]') into v
      from app_private.control_events where category = 'security' and last_at >= p_from and at < p_to;
  elsif p_dataset = 'metrics' then
    select coalesce(jsonb_agg(jsonb_build_object('dia', day, 'metrica', metric, 'dimensao', dim, 'valor', value) order by day, metric, dim), '[]') into v
      from app_private.metrics_daily where day >= app_private.sp_day(p_from) and day <= app_private.sp_day(p_to - interval '1 second')
        and (metric not like 'ev:%' or 'security' = any(app_private.ctl_areas(v_role)));
  elsif p_dataset = 'incidents' then
    select coalesce(jsonb_agg(jsonb_build_object('id', id, 'regra', rule_key, 'titulo', title, 'prioridade', priority, 'status', status, 'confirmado', confirmed,
        'inicio', first_seen, 'ultimo', last_seen, 'ocorrencias', occurrences) order by first_seen), '[]') into v
      from app_private.control_incidents where last_seen >= p_from and first_seen < p_to;
  else
    raise exception 'invalid_dataset' using errcode = '22023';
  end if;
  return v;
end $$;

create or replace function public.control_refresh()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.ctl_require_write('refresh');
  perform app_private.ctl_audit('refresh', 'metrics', '{}');
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------------
revoke all on all tables in schema app_private from public, anon, authenticated;
revoke execute on all functions in schema app_private from public, anon, authenticated;

revoke execute on function
  public.control_session(), public.control_audit(text, text, jsonb),
  public.control_overview(timestamptz, timestamptz), public.control_subscribers(timestamptz, timestamptz, text),
  public.control_finance(timestamptz, timestamptz, text), public.control_funnel(timestamptz, timestamptz),
  public.control_security(timestamptz, timestamptz), public.control_gecko(timestamptz, timestamptz),
  public.control_ai(timestamptz, timestamptz), public.control_infra(), public.control_alerts(),
  public.control_audit_log(text, integer, integer),
  public.control_add_expense(date, text, text, integer), public.control_delete_expense(uuid), public.control_flag_payment(uuid, boolean, text),
  public.control_incident_action(bigint, text), public.control_update_rule(text, boolean, numeric, text, integer),
  public.control_get_settings(), public.control_set_setting(text, jsonb), public.control_set_ai_user_limit(uuid, integer, boolean, text),
  public.control_export(text, timestamptz, timestamptz), public.control_refresh(), public.control_badge(),
  public.server_track_visit(text, text, text), public.server_control_event(text, text, text, text, text, text, text, text, jsonb),
  public.server_gecko_balance(text, numeric, numeric, numeric, numeric, text), public.server_gecko_balance_last(text),
  public.server_ai_usage(text, uuid, text, text, text, integer, integer, integer, boolean, text), public.server_ai_guard(text, uuid),
  public.server_control_evaluate(text, jsonb), public.server_control_rollup(text),
  public.server_gecko_get(text, text), public.server_gecko_get_many(text, text[]),
  public.server_gecko_find_item(text, text, jsonb), public.server_gecko_search_items(text, text, text[], integer)
from public, anon, authenticated;

grant execute on function
  public.control_session(), public.control_audit(text, text, jsonb),
  public.control_overview(timestamptz, timestamptz), public.control_subscribers(timestamptz, timestamptz, text),
  public.control_finance(timestamptz, timestamptz, text), public.control_funnel(timestamptz, timestamptz),
  public.control_security(timestamptz, timestamptz), public.control_gecko(timestamptz, timestamptz),
  public.control_ai(timestamptz, timestamptz), public.control_infra(), public.control_alerts(),
  public.control_audit_log(text, integer, integer),
  public.control_add_expense(date, text, text, integer), public.control_delete_expense(uuid), public.control_flag_payment(uuid, boolean, text),
  public.control_incident_action(bigint, text), public.control_update_rule(text, boolean, numeric, text, integer),
  public.control_get_settings(), public.control_set_setting(text, jsonb), public.control_set_ai_user_limit(uuid, integer, boolean, text),
  public.control_export(text, timestamptz, timestamptz), public.control_refresh(), public.control_badge()
to authenticated;

-- Funções de servidor: exigem o segredo do servidor (mesmo padrão das demais server_*).
grant execute on function
  public.server_track_visit(text, text, text), public.server_control_event(text, text, text, text, text, text, text, text, jsonb),
  public.server_gecko_balance(text, numeric, numeric, numeric, numeric, text), public.server_gecko_balance_last(text),
  public.server_ai_usage(text, uuid, text, text, text, integer, integer, integer, boolean, text), public.server_ai_guard(text, uuid),
  public.server_control_evaluate(text, jsonb), public.server_control_rollup(text),
  public.server_gecko_get(text, text), public.server_gecko_get_many(text, text[]),
  public.server_gecko_find_item(text, text, jsonb), public.server_gecko_search_items(text, text, text[], integer)
to anon, authenticated;
