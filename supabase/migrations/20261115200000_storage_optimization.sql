-- =============================================================================
-- Otimização de armazenamento para o Supabase Free (500 MB)
--
-- Princípios:
--  * Nunca apaga contas, assinaturas, pagamentos, eventos de webhook (financeiros), créditos,
--    favoritos, coleções, simulações, relatórios, conversas, auditoria ou consentimentos.
--  * Só remove o que é temporário (caches vencidos, logs técnicos, limites de requisição,
--    intenções de checkout abandonadas, observações de preço duplicadas) e sempre em lotes pequenos.
--  * Histórico de preços antigo só sai do banco depois de gravado e conferido no Cloudflare R2
--    (manifesto + checksum) e pode ser restaurado.
--  * Cada execução é registrada (quantidade removida, tamanho antes/depois, erros).
--  * Tudo pode ser desligado no painel (app_settings.maintenance).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Tabelas de controle (schema privado: invisíveis para clientes)
-- ---------------------------------------------------------------------------
create table if not exists app_private.maintenance_runs (
  id bigint generated always as identity primary key,
  task text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean not null default true,
  rows_removed integer not null default 0,
  bytes_before bigint,
  bytes_after bigint,
  details jsonb not null default '{}',
  error text
);
create index if not exists maintenance_runs_started_idx on app_private.maintenance_runs (started_at desc);

create table if not exists app_private.storage_snapshots (
  day date primary key,
  db_bytes bigint not null,
  wal_bytes bigint,
  tables jsonb not null default '[]',
  taken_at timestamptz not null default now()
);

create table if not exists app_private.archive_manifest (
  id bigint generated always as identity primary key,
  object_key text not null unique,
  kind text not null default 'price_observations',
  rows integer not null,
  bytes integer not null,
  sha256 text not null,
  min_at timestamptz not null,
  max_at timestamptz not null,
  product_ids uuid[] not null,
  created_at timestamptz not null default now(),
  restored_at timestamptz
);
create index if not exists archive_manifest_products_idx on app_private.archive_manifest using gin (product_ids);

-- Configuração (editável pelo administrador)
insert into public.app_settings (key, value) values ('maintenance', jsonb_build_object(
  'enabled', true,
  'quota_bytes', 524288000,
  'alert_levels', jsonb_build_array(70, 85, 95),
  'last_alert_level', 0,
  'tasks', jsonb_build_object(
    'expire_caches', true,      -- limites de requisição, intenções de checkout abandonadas
    'purge_logs', true,         -- logs técnicos, IPs de cadastro, histórico de execuções
    'dedupe_prices', true,      -- observações de preço repetidas em sequência
    'compact_searches', true,   -- remove atributos não usados do cache das pesquisas
    'archive_prices', true,     -- histórico antigo → Cloudflare R2 (só com o R2 configurado)
    'analyze', true),
  'retention_days', jsonb_build_object(
    'api_logs', 30, 'rate_limits', 1, 'signup_ips', 90, 'checkout_intents', 30,
    'maintenance_runs', 180, 'snapshots', 400),
  'archive_after_days', 365,
  'batch_size', 5000))
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Índices e armazenamento
-- ---------------------------------------------------------------------------
-- Serve a busca "última observação deste produto e métrica" (deduplicação na escrita) e o gráfico.
drop index if exists public.price_obs_product_idx;
create index if not exists price_obs_product_metric_idx on public.price_observations (product_id, metric_type, collected_at desc);
create index if not exists price_obs_collected_idx on public.price_observations (collected_at);
create index if not exists webhook_events_received_idx on public.webhook_events (received_at desc);
create index if not exists alerts_unread_idx on public.alerts (user_id) where read_at is null;
create index if not exists watches_due_idx on public.watches (last_checked_at nulls first) where active;
create index if not exists checkout_intents_open_idx on public.checkout_intents (created_at) where consumed_at is null;

-- JSON grandes comprimidos com LZ4 (mais rápido e geralmente menor que o padrão).
do $$ begin
  alter table public.searches alter column results set compression lz4;
  alter table public.webhook_events alter column payload set compression lz4;
exception when others then null; -- servidor sem LZ4: mantém a compressão padrão
end $$;

-- Tabelas de alta rotatividade: autovacuum mais frequente devolve espaço mais cedo.
alter table public.rate_limits set (autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.05);
alter table public.api_usage_logs set (autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.05);
alter table public.price_observations set (autovacuum_vacuum_scale_factor = 0.05);

-- ---------------------------------------------------------------------------
-- Gravação de preços: trava por produto evita duplicatas em chamadas simultâneas
-- ---------------------------------------------------------------------------
create or replace function public.server_upsert_market_data(p_secret text, p_items jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_item jsonb; v_pid uuid; v_n integer := 0; v_last record; v_price numeric; v_metric text;
begin
  perform app_private.check_secret(p_secret);
  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into public.products as p (source, external_id, title, normalized_title, brand, model, gtin,
        category_id, category_name, image_url, permalink, attributes, provenance)
      values (v_item ->> 'source', v_item ->> 'external_id', v_item ->> 'title', v_item ->> 'normalized_title',
        v_item ->> 'brand', v_item ->> 'model', v_item ->> 'gtin', v_item ->> 'category_id',
        v_item ->> 'category_name', v_item ->> 'image_url', v_item ->> 'permalink',
        coalesce(v_item -> 'attributes', '{}'), coalesce(v_item -> 'provenance', '{}'))
    on conflict (source, external_id) do update set
      title = excluded.title, normalized_title = excluded.normalized_title,
      brand = coalesce(excluded.brand, p.brand), model = coalesce(excluded.model, p.model),
      gtin = coalesce(excluded.gtin, p.gtin), image_url = coalesce(excluded.image_url, p.image_url),
      permalink = coalesce(excluded.permalink, p.permalink), last_seen_at = now()
    returning id into v_pid;
    v_price := nullif(v_item ->> 'price', '')::numeric;
    v_metric := coalesce(v_item ->> 'metric_type', 'listing');
    if v_price is not null then
      perform pg_advisory_xact_lock(hashtextextended(v_pid::text || v_metric, 0));
      select price, collected_at into v_last from public.price_observations
        where product_id = v_pid and metric_type = v_metric
        order by collected_at desc limit 1;
      if v_last is null or v_last.price <> v_price or v_last.collected_at < now() - interval '6 hours' then
        insert into public.price_observations (product_id, source, metric_type, price, currency, offers_count,
            available, observed_at, provenance)
          values (v_pid, v_item ->> 'source', v_metric, v_price,
            coalesce(v_item ->> 'currency', 'BRL'), nullif(v_item ->> 'offers_count', '')::integer,
            nullif(v_item ->> 'available', '')::boolean, app_private.to_ts(v_item ->> 'observed_at'),
            coalesce(v_item -> 'provenance', '{}'));
        v_n := v_n + 1;
      end if;
    end if;
  end loop;
  return v_n;
end $$;

-- ---------------------------------------------------------------------------
-- Medição de uso
-- ---------------------------------------------------------------------------
create or replace function app_private.db_usage()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_db bigint := pg_database_size(current_database()); v_wal bigint; v_tables jsonb; v_idx bigint;
begin
  begin
    select sum(size) into v_wal from pg_ls_waldir();
  exception when others then v_wal := null; -- sem permissão para ler o WAL neste plano
  end;
  select coalesce(jsonb_agg(t order by (t ->> 'total_bytes')::bigint desc), '[]') into v_tables from (
    select jsonb_build_object('table', n.nspname || '.' || c.relname,
      'total_bytes', pg_total_relation_size(c.oid), 'data_bytes', pg_relation_size(c.oid),
      'index_bytes', pg_indexes_size(c.oid),
      'toast_bytes', pg_total_relation_size(c.oid) - pg_relation_size(c.oid) - pg_indexes_size(c.oid),
      'rows', greatest(c.reltuples, 0)::bigint) t
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'r' and n.nspname in ('public', 'app_private', 'auth', 'storage')
    order by pg_total_relation_size(c.oid) desc limit 15) s;
  select coalesce(sum(pg_indexes_size(c.oid)), 0) into v_idx
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'r' and n.nspname in ('public', 'app_private', 'auth', 'storage');
  return jsonb_build_object('db_bytes', v_db, 'wal_bytes', v_wal, 'index_bytes', v_idx, 'tables', v_tables);
end $$;

create or replace function app_private.take_snapshot()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v jsonb := app_private.db_usage();
begin
  insert into app_private.storage_snapshots (day, db_bytes, wal_bytes, tables)
    values (current_date, (v ->> 'db_bytes')::bigint, (v ->> 'wal_bytes')::bigint, v -> 'tables')
  on conflict (day) do update set db_bytes = excluded.db_bytes, wal_bytes = excluded.wal_bytes,
    tables = excluded.tables, taken_at = now();
  return v;
end $$;

-- Avisa os administradores (sino de alertas) ao cruzar 70%, 85% e 95% da cota.
create or replace function app_private.check_storage_alerts(p_db_bytes bigint)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_cfg jsonb; v_quota bigint; v_pct numeric; v_level integer := 0; v_last integer; v_lv jsonb;
begin
  select value into v_cfg from public.app_settings where key = 'maintenance';
  v_quota := coalesce((v_cfg ->> 'quota_bytes')::bigint, 524288000);
  v_pct := p_db_bytes * 100.0 / v_quota;
  for v_lv in select * from jsonb_array_elements(coalesce(v_cfg -> 'alert_levels', '[70,85,95]')) loop
    if v_pct >= (v_lv #>> '{}')::numeric then v_level := greatest(v_level, (v_lv #>> '{}')::integer); end if;
  end loop;
  v_last := coalesce((v_cfg ->> 'last_alert_level')::integer, 0);
  if v_level > v_last then
    insert into public.alerts (user_id, kind, title, message, data)
      select r.user_id, 'system_storage',
        format('Banco de dados em %s%% da cota', v_level),
        format('O banco usa %s MB de %s MB (%s%%). Veja Administração → Saúde do Banco.',
          round(p_db_bytes / 1048576.0, 1), round(v_quota / 1048576.0), round(v_pct, 1)),
        jsonb_build_object('level', v_level, 'db_bytes', p_db_bytes, 'quota_bytes', v_quota)
      from public.user_roles r where r.role = 'admin';
  end if;
  if v_level <> v_last then
    update public.app_settings set value = jsonb_set(value, '{last_alert_level}', to_jsonb(v_level)), updated_at = now()
      where key = 'maintenance';
  end if;
  return v_level;
end $$;

-- ---------------------------------------------------------------------------
-- Manutenção (chamada pelo Cloudflare Cron, de madrugada)
-- ---------------------------------------------------------------------------
create or replace function app_private.maintenance_core(p_force boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_cfg jsonb; v_t jsonb; v_r jsonb; v_batch integer; v_before bigint; v_after bigint;
  v_run bigint; v_out jsonb := '{}'; v_n integer; v_total integer := 0; v_level integer;
begin
  select value into v_cfg from public.app_settings where key = 'maintenance';
  if v_cfg is null then v_cfg := '{}'; end if;
  if not p_force and coalesce((v_cfg ->> 'enabled')::boolean, true) = false then
    return jsonb_build_object('skipped', 'disabled');
  end if;
  v_t := coalesce(v_cfg -> 'tasks', '{}');
  v_r := coalesce(v_cfg -> 'retention_days', '{}');
  v_batch := least(greatest(coalesce((v_cfg ->> 'batch_size')::integer, 5000), 100), 20000);
  v_before := pg_database_size(current_database());
  insert into app_private.maintenance_runs (task, bytes_before) values ('maintenance', v_before) returning id into v_run;

  begin
    -- 1) Caches e registros temporários vencidos
    if coalesce((v_t ->> 'expire_caches')::boolean, true) then
      delete from public.rate_limits where window_start < now() - make_interval(days => coalesce((v_r ->> 'rate_limits')::integer, 1));
      get diagnostics v_n = row_count; v_out := v_out || jsonb_build_object('rate_limits', v_n); v_total := v_total + v_n;
      delete from public.checkout_intents where ctid in (select ctid from public.checkout_intents
        where consumed_at is null and created_at < now() - make_interval(days => coalesce((v_r ->> 'checkout_intents')::integer, 30)) limit v_batch);
      get diagnostics v_n = row_count; v_out := v_out || jsonb_build_object('checkout_intents', v_n); v_total := v_total + v_n;
      -- Assinaturas vencidas mudam de estado (nada é apagado)
      update public.subscriptions set status = 'expired', updated_at = now()
        where status in ('active', 'past_due', 'canceled') and current_period_end < now();
    end if;

    -- 2) Logs técnicos conforme a política de retenção
    if coalesce((v_t ->> 'purge_logs')::boolean, true) then
      delete from public.api_usage_logs where ctid in (select ctid from public.api_usage_logs
        where created_at < now() - make_interval(days => coalesce((v_r ->> 'api_logs')::integer, 30)) limit v_batch);
      get diagnostics v_n = row_count; v_out := v_out || jsonb_build_object('api_logs', v_n); v_total := v_total + v_n;
      delete from public.signup_events where ctid in (select ctid from public.signup_events
        where created_at < now() - make_interval(days => coalesce((v_r ->> 'signup_ips')::integer, 90)) limit v_batch);
      get diagnostics v_n = row_count; v_out := v_out || jsonb_build_object('signup_ips', v_n); v_total := v_total + v_n;
      delete from app_private.maintenance_runs where started_at < now() - make_interval(days => coalesce((v_r ->> 'maintenance_runs')::integer, 180));
      get diagnostics v_n = row_count; v_out := v_out || jsonb_build_object('old_runs', v_n); v_total := v_total + v_n;
      delete from app_private.storage_snapshots where day < current_date - coalesce((v_r ->> 'snapshots')::integer, 400);
    end if;

    -- 3) Observações de preço repetidas: mesma métrica, mesmo preço/estoque/ofertas que a observação
    --    imediatamente anterior, menos de 6 h depois. Nenhum valor é criado ou alterado.
    if coalesce((v_t ->> 'dedupe_prices')::boolean, true) then
      delete from public.price_observations where id in (
        select id from (
          select id, price, currency, available, offers_count, collected_at,
            lag(price) over w as p_price, lag(currency) over w as p_cur, lag(available) over w as p_av,
            lag(offers_count) over w as p_off, lag(collected_at) over w as p_at
          from public.price_observations
          window w as (partition by product_id, metric_type order by collected_at, id)) s
        where p_at is not null and price = p_price and currency = p_cur
          and available is not distinct from p_av and offers_count is not distinct from p_off
          and collected_at - p_at < interval '6 hours'
        limit v_batch);
      get diagnostics v_n = row_count; v_out := v_out || jsonb_build_object('duplicate_prices', v_n); v_total := v_total + v_n;
    end if;

    -- 4) Pesquisas salvas: remove a lista de atributos de cada produto (não é exibida; a página do
    --    produto busca a ficha completa na fonte). Preço, foto, título, avaliação etc. permanecem.
    if coalesce((v_t ->> 'compact_searches')::boolean, true) then
      update public.searches s set results = (
          select coalesce(jsonb_agg(case when jsonb_typeof(e) = 'object' then e - 'attributes' else e end order by n), '[]')
          from jsonb_array_elements(s.results) with ordinality t(e, n))
        where s.id in (select id from public.searches where jsonb_path_exists(results, '$[*].attributes[0]') limit 200);
      get diagnostics v_n = row_count; v_out := v_out || jsonb_build_object('compacted_searches', v_n);
    end if;

    -- 5) Estatísticas do planejador (leve; não bloqueia escrita)
    if coalesce((v_t ->> 'analyze')::boolean, true) then
      analyze public.price_observations; analyze public.searches; analyze public.api_usage_logs;
    end if;

    perform app_private.take_snapshot();
    v_after := pg_database_size(current_database());
    v_level := app_private.check_storage_alerts(v_after);
    update app_private.maintenance_runs set finished_at = now(), rows_removed = v_total, bytes_after = v_after,
      details = v_out || jsonb_build_object('alert_level', v_level) where id = v_run;
    return v_out || jsonb_build_object('run_id', v_run, 'rows_removed', v_total, 'bytes_before', v_before,
      'bytes_after', v_after, 'alert_level', v_level);
  exception when others then
    -- A transação desta etapa foi desfeita: nada foi apagado. Registra o erro em uma nova linha.
    update app_private.maintenance_runs set ok = false, finished_at = now(), error = left(sqlerrm, 500) where id = v_run;
    return jsonb_build_object('ok', false, 'error', sqlerrm);
  end;
end $$;

create or replace function public.server_maintenance(p_secret text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.check_secret(p_secret);
  return app_private.maintenance_core(false);
end $$;

-- A limpeza antiga continua respondendo (compatibilidade), agora delegando à manutenção.
create or replace function public.server_purge(p_secret text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.check_secret(p_secret);
  return app_private.maintenance_core(false);
end $$;

-- Etapas executadas pelo Worker (arquivamento no R2) registram o resultado aqui.
create or replace function public.server_log_maintenance(p_secret text, p_task text, p_ok boolean, p_rows integer, p_details jsonb, p_error text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.check_secret(p_secret);
  insert into app_private.maintenance_runs (task, ok, finished_at, rows_removed, details, error)
    values (left(p_task, 60), p_ok, now(), coalesce(p_rows, 0), coalesce(p_details, '{}'), left(p_error, 500));
end $$;

-- ---------------------------------------------------------------------------
-- Arquivamento do histórico de preços no Cloudflare R2
-- ---------------------------------------------------------------------------
-- 1. O Worker pede um lote de observações antigas.
create or replace function public.server_archive_candidates(p_secret text, p_limit integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_days integer; v_out jsonb;
begin
  perform app_private.check_secret(p_secret);
  select coalesce((value ->> 'archive_after_days')::integer, 365) into v_days from public.app_settings where key = 'maintenance';
  v_days := greatest(coalesce(v_days, 365), 90); -- nunca arquiva os últimos 90 dias
  select coalesce(jsonb_agg(to_jsonb(o) order by o.collected_at, o.id), '[]') into v_out from (
    select id, product_id, source, metric_type, price, currency, offers_count, available, observed_at,
      collected_at, verification, provenance
    from public.price_observations
    where collected_at < now() - make_interval(days => v_days)
    order by collected_at, id
    limit least(greatest(p_limit, 1), 20000)) o;
  return v_out;
end $$;

-- 2. Depois de gravar e conferir o arquivo no R2, o Worker confirma: o manifesto é criado e só
--    então as linhas saem do banco. Ids que não existem mais ou que ainda são recentes são recusados.
create or replace function public.server_archive_commit(p_secret text, p_key text, p_sha256 text, p_bytes integer, p_ids bigint[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_days integer; v_found integer; v_min timestamptz; v_max timestamptz; v_products uuid[]; v_n integer;
begin
  perform app_private.check_secret(p_secret);
  if p_key !~ '^price-history/[0-9]{4}/[0-9]{2}/[A-Za-z0-9_.-]+\.ndjson\.gz$' then raise exception 'invalid_key'; end if;
  if p_sha256 !~ '^[0-9a-f]{64}$' or coalesce(array_length(p_ids, 1), 0) = 0 then raise exception 'invalid_input'; end if;
  select greatest(coalesce((value ->> 'archive_after_days')::integer, 365), 90) into v_days from public.app_settings where key = 'maintenance';
  select count(*), min(collected_at), max(collected_at), array_agg(distinct product_id)
    into v_found, v_min, v_max, v_products
    from public.price_observations where id = any(p_ids) and collected_at < now() - make_interval(days => coalesce(v_days, 365));
  if v_found <> array_length(p_ids, 1) then raise exception 'archive_mismatch: % de %', v_found, array_length(p_ids, 1); end if;
  insert into app_private.archive_manifest (object_key, rows, bytes, sha256, min_at, max_at, product_ids)
    values (p_key, v_found, p_bytes, p_sha256, v_min, v_max, v_products);
  delete from public.price_observations where id = any(p_ids);
  get diagnostics v_n = row_count;
  insert into app_private.maintenance_runs (task, finished_at, rows_removed, details)
    values ('archive_prices', now(), v_n, jsonb_build_object('key', p_key, 'bytes', p_bytes));
  return jsonb_build_object('archived', v_n, 'key', p_key);
end $$;

-- 3. Consulta: arquivos que contêm um produto (para o gráfico de histórico).
create or replace function public.server_archive_lookup(p_secret text, p_product uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.check_secret(p_secret);
  return coalesce((select jsonb_agg(jsonb_build_object('key', object_key, 'sha256', sha256, 'min_at', min_at, 'max_at', max_at) order by min_at)
    from app_private.archive_manifest where p_product = any(product_ids) and restored_at is null), '[]');
end $$;

-- 4. Restauração: devolve ao banco as linhas de um arquivo (mesmos ids e valores).
create or replace function public.server_archive_restore(p_secret text, p_key text, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_n integer;
begin
  perform app_private.check_secret(p_secret);
  if not exists (select 1 from app_private.archive_manifest where object_key = p_key) then raise exception 'unknown_archive'; end if;
  insert into public.price_observations overriding system value
    select * from jsonb_populate_recordset(null::public.price_observations, p_rows)
  on conflict (id) do nothing;
  get diagnostics v_n = row_count;
  update app_private.archive_manifest set restored_at = now() where object_key = p_key;
  insert into app_private.maintenance_runs (task, finished_at, rows_removed, details)
    values ('archive_restore', now(), 0, jsonb_build_object('key', p_key, 'restored', v_n));
  return jsonb_build_object('restored', v_n);
end $$;

-- ---------------------------------------------------------------------------
-- Painel "Saúde do Banco" (somente administradores)
-- ---------------------------------------------------------------------------
create or replace function public.admin_db_health()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v jsonb; v_cfg jsonb; v_quota bigint; v_growth jsonb; v_runs jsonb; v_errors jsonb; v_archive jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  v := app_private.db_usage();
  select value into v_cfg from public.app_settings where key = 'maintenance';
  v_quota := coalesce((v_cfg ->> 'quota_bytes')::bigint, 524288000);
  select coalesce(jsonb_agg(jsonb_build_object('day', day, 'db_bytes', db_bytes) order by day), '[]') into v_growth
    from (select * from app_private.storage_snapshots order by day desc limit 30) s;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.started_at desc), '[]') into v_runs
    from (select id, task, started_at, finished_at, ok, rows_removed, bytes_before, bytes_after, details, error
          from app_private.maintenance_runs order by started_at desc limit 15) r;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.started_at desc), '[]') into v_errors
    from (select task, started_at, error from app_private.maintenance_runs where not ok order by started_at desc limit 10) r;
  select jsonb_build_object('files', count(*), 'rows', coalesce(sum(rows), 0), 'bytes', coalesce(sum(bytes), 0),
      'last_at', max(created_at)) into v_archive from app_private.archive_manifest where restored_at is null;
  return v || jsonb_build_object(
    'quota_bytes', v_quota,
    'percent', round((v ->> 'db_bytes')::bigint * 100.0 / v_quota, 2),
    'settings', v_cfg,
    'growth', v_growth,
    'runs', v_runs,
    'errors', v_errors,
    'archive', v_archive,
    'last_run', (select to_jsonb(r) from (select started_at, finished_at, ok, rows_removed from app_private.maintenance_runs
                  where task = 'maintenance' order by started_at desc limit 1) r));
end $$;

-- Executar agora (pelo painel): mesma rotina, registrada na auditoria.
create or replace function public.admin_run_maintenance()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  v := app_private.maintenance_core(true);
  insert into public.admin_audit_logs (admin_id, action, target, details)
    values ((select auth.uid()), 'maintenance_run', 'database', v);
  return v;
end $$;

-- Ligar/desligar a rotina e cada tarefa (somente chaves conhecidas).
create or replace function public.admin_set_maintenance(p_enabled boolean, p_tasks jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_cfg jsonb; v_key text;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select value into v_cfg from public.app_settings where key = 'maintenance';
  v_cfg := jsonb_set(v_cfg, '{enabled}', to_jsonb(coalesce(p_enabled, true)));
  for v_key in select jsonb_object_keys(coalesce(p_tasks, '{}')) loop
    if v_cfg -> 'tasks' ? v_key and jsonb_typeof(p_tasks -> v_key) = 'boolean' then
      v_cfg := jsonb_set(v_cfg, array['tasks', v_key], p_tasks -> v_key);
    end if;
  end loop;
  update public.app_settings set value = v_cfg, updated_by = (select auth.uid()), updated_at = now() where key = 'maintenance';
  insert into public.admin_audit_logs (admin_id, action, target, details)
    values ((select auth.uid()), 'maintenance_settings', 'database', v_cfg);
  return v_cfg;
end $$;

-- ---------------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema app_private from public, anon, authenticated;
revoke execute on function public.server_maintenance(text), public.server_log_maintenance(text, text, boolean, integer, jsonb, text),
  public.server_archive_candidates(text, integer), public.server_archive_commit(text, text, text, integer, bigint[]),
  public.server_archive_lookup(text, uuid), public.server_archive_restore(text, text, jsonb),
  public.admin_db_health(), public.admin_run_maintenance(), public.admin_set_maintenance(boolean, jsonb) from public;
grant execute on function public.server_maintenance(text), public.server_log_maintenance(text, text, boolean, integer, jsonb, text),
  public.server_archive_candidates(text, integer), public.server_archive_commit(text, text, text, integer, bigint[]),
  public.server_archive_lookup(text, uuid), public.server_archive_restore(text, text, jsonb) to anon, authenticated;
grant execute on function public.admin_db_health(), public.admin_run_maintenance(), public.admin_set_maintenance(boolean, jsonb) to authenticated;
grant execute on function public.server_upsert_market_data(text, jsonb), public.server_purge(text) to anon, authenticated;
