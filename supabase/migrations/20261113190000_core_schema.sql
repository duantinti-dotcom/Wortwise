-- Worthwise — esquema principal
-- Convenções:
--  * Todo dado comercial externo guarda fonte, identificador externo, data de coleta e proveniência.
--  * Ausência de dado é NULL, nunca zero.
--  * Dados privados do usuário são protegidos por RLS (dono = auth.uid()).
--  * Escritas globais (catálogo, assinaturas, webhooks) só acontecem por funções server_* que
--    exigem o segredo do servidor (app_private.check_secret).

create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

create table app_private.config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

create or replace function app_private.check_secret(p_secret text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_hash text;
begin
  select value into v_hash from app_private.config where key = 'server_secret_sha256';
  if v_hash is null or p_secret is null
     or encode(sha256(convert_to(p_secret, 'UTF8')), 'hex') <> v_hash then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end $$;

-- Rotação do segredo: executar no SQL Editor como postgres.
create or replace function app_private.set_server_secret(p_secret text)
returns void language sql security definer set search_path = '' as $$
  insert into app_private.config(key, value)
  values ('server_secret_sha256', encode(sha256(convert_to(p_secret, 'UTF8')), 'hex'))
  on conflict (key) do update set value = excluded.value, updated_at = now();
$$;
revoke all on function app_private.set_server_secret(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Usuários, perfis e papéis
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  seller_stage text check (seller_stage in ('starting', 'selling')),
  marketplaces text[] not null default '{}',
  categories text[] not null default '{}',
  budget_range text,
  onboarded_at timestamptz,
  risk_flag text,
  blocked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin')),
  granted_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_roles where user_id = (select auth.uid()) and role = 'admin');
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Colunas sensíveis do perfil não podem ser alteradas pelo próprio usuário.
create or replace function public.protect_profile_columns()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') and not public.is_admin() then
    new.risk_flag := old.risk_flag;
    new.blocked_at := old.blocked_at;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger profiles_protect before update on public.profiles
  for each row execute function public.protect_profile_columns();

-- Registro de cadastro para antifraude proporcional (IP com hash e retenção de 90 dias).
create table public.signup_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  ip_hash text not null,
  created_at timestamptz not null default now()
);
create index signup_events_ip_idx on public.signup_events (ip_hash, created_at desc);

-- ---------------------------------------------------------------------------
-- Planos, cotas, assinaturas e pagamentos
-- ---------------------------------------------------------------------------
create table public.plans (
  id text primary key,
  name text not null,
  description text,
  price_cents integer not null check (price_cents >= 0),
  currency text not null default 'BRL',
  billing_period text not null default 'monthly',
  features jsonb not null default '[]',
  provider_link_id text,
  provider_checkout_url text,
  active boolean not null default true,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

create table public.plan_quotas (
  plan_id text not null references public.plans(id) on delete cascade,
  resource text not null,
  limit_value integer not null check (limit_value >= 0),
  -- total: vida da conta | month: por mês-calendário (America/Sao_Paulo) | count: itens simultâneos
  period text not null check (period in ('total', 'month', 'count')),
  primary key (plan_id, resource)
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id text not null references public.plans(id),
  status text not null check (status in ('active', 'past_due', 'canceled', 'expired')),
  provider text not null default 'heropay',
  provider_subscription_id text,
  payment_method text,
  current_period_end timestamptz not null,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index subscriptions_user_idx on public.subscriptions (user_id);
create index subscriptions_provider_idx on public.subscriptions (provider, provider_subscription_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  provider text not null default 'heropay',
  provider_payment_id text not null,
  plan_id text references public.plans(id),
  amount_cents integer,
  net_cents integer,
  method text,
  status text not null check (status in ('paid', 'refused', 'refunded', 'chargeback', 'pending')),
  refused_message text,
  occurred_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, provider_payment_id)
);
create index payments_user_idx on public.payments (user_id, created_at desc);

create table public.webhook_events (
  id bigint generated always as identity primary key,
  provider text not null,
  dedupe_key text not null,
  trigger text not null,
  payload jsonb not null,
  outcome text,
  error text,
  received_at timestamptz not null default now(),
  unique (provider, dedupe_key)
);

create table public.checkout_intents (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id text not null references public.plans(id),
  created_at timestamptz not null default now(),
  consumed_at timestamptz
);
create index checkout_intents_user_idx on public.checkout_intents (user_id, created_at desc);

create table public.usage_counters (
  user_id uuid not null references auth.users(id) on delete cascade,
  resource text not null,
  period_key text not null,
  used integer not null default 0 check (used >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, resource, period_key)
);

-- ---------------------------------------------------------------------------
-- Fontes de dados, catálogo e observações de mercado
-- ---------------------------------------------------------------------------
create table public.data_sources (
  id text primary key,
  name text not null,
  kind text not null check (kind in ('marketplace', 'registry', 'ai')),
  -- connected: respondendo | not_configured: faltam credenciais | pending_approval: depende de credenciamento
  -- error: falha recente | planned: ainda não implementado
  status text not null check (status in ('connected', 'not_configured', 'pending_approval', 'error', 'planned')),
  status_detail text,
  last_ok_at timestamptz,
  last_error_at timestamptz,
  docs_url text,
  updated_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  source text not null references public.data_sources(id),
  external_id text not null,
  title text not null,
  normalized_title text,
  brand text,
  model text,
  gtin text,
  category_id text,
  category_name text,
  image_url text,
  permalink text,
  attributes jsonb not null default '{}',
  provenance jsonb not null default '{}',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (source, external_id)
);
create index products_gtin_idx on public.products (gtin) where gtin is not null;
create index products_norm_idx on public.products (normalized_title);

create table public.offers (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  source text not null references public.data_sources(id),
  external_id text not null,
  seller_id text,
  seller_name text,
  price numeric(14, 2),
  original_price numeric(14, 2),
  currency text,
  condition text,
  free_shipping boolean,
  listing_type text,
  available boolean,
  permalink text,
  provenance jsonb not null default '{}',
  collected_at timestamptz not null default now(),
  unique (source, external_id)
);
create index offers_product_idx on public.offers (product_id, price);

create table public.price_observations (
  id bigint generated always as identity primary key,
  product_id uuid not null references public.products(id) on delete cascade,
  source text not null references public.data_sources(id),
  metric_type text not null check (metric_type in ('buy_box', 'min_offer', 'max_offer', 'listing')),
  price numeric(14, 2) not null,
  currency text not null,
  offers_count integer,
  available boolean,
  observed_at timestamptz,
  collected_at timestamptz not null default now(),
  verification text not null default 'source_reported',
  provenance jsonb not null default '{}'
);
create index price_obs_product_idx on public.price_observations (product_id, collected_at desc);

create table public.demand_signals (
  id bigint generated always as identity primary key,
  product_id uuid references public.products(id) on delete cascade,
  source text not null references public.data_sources(id),
  -- bestseller_rank | trend_rank | reviews_count | rating | sold_quantity_reported
  signal_type text not null,
  scope text,
  value numeric not null,
  -- confirmed: número informado pela fonte | indirect: indicador indireto de interesse
  nature text not null check (nature in ('confirmed', 'indirect')),
  observed_at timestamptz,
  collected_at timestamptz not null default now(),
  provenance jsonb not null default '{}'
);
create index demand_product_idx on public.demand_signals (product_id, collected_at desc);

create table public.api_usage_logs (
  id bigint generated always as identity primary key,
  source text not null,
  endpoint text not null,
  status integer,
  ok boolean not null,
  duration_ms integer,
  error text,
  created_at timestamptz not null default now()
);
create index api_usage_created_idx on public.api_usage_logs (created_at desc);

-- ---------------------------------------------------------------------------
-- Dados privados do usuário
-- ---------------------------------------------------------------------------
create table public.searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  fingerprint text not null,
  query text not null,
  filters jsonb not null default '{}',
  result_count integer not null,
  results jsonb not null,
  sources jsonb not null default '[]',
  charged boolean not null default true,
  created_at timestamptz not null default now(),
  last_opened_at timestamptz not null default now(),
  unique (user_id, fingerprint)
);
create index searches_user_idx on public.searches (user_id, last_opened_at desc);

create table public.favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null,
  external_id text not null,
  title text not null,
  image_url text,
  price numeric(14, 2),
  currency text,
  permalink text,
  snapshot_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (user_id, source, external_id)
);

create table public.collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  description text check (char_length(description) <= 300),
  created_at timestamptz not null default now()
);
create index collections_user_idx on public.collections (user_id);

create table public.collection_items (
  collection_id uuid not null references public.collections(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null,
  external_id text not null,
  title text not null,
  image_url text,
  note text check (char_length(note) <= 500),
  added_at timestamptz not null default now(),
  primary key (collection_id, source, external_id)
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  -- owner_id NULL = diretório Worthwise (curado por administradores); caso contrário, privado do usuário
  owner_id uuid references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 160),
  legal_name text,
  cnpj text check (cnpj is null or cnpj ~ '^[0-9]{14}$'),
  website text,
  city text,
  state text,
  country text not null default 'BR',
  categories text[] not null default '{}',
  contact_email text,
  contact_phone text,
  notes text,
  -- unverified | doc_verified | source_reputation | insufficient
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'doc_verified', 'source_reputation', 'insufficient')),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index suppliers_owner_idx on public.suppliers (owner_id);
create index suppliers_name_idx on public.suppliers (lower(name));

create table public.supplier_verifications (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  kind text not null check (kind in ('cnpj_registry')),
  status text not null check (status in ('passed', 'failed', 'unavailable')),
  source text not null,
  result jsonb not null default '{}',
  checked_at timestamptz not null default now()
);
create index supplier_verif_idx on public.supplier_verifications (supplier_id, checked_at desc);

create table public.supplier_quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  comparison_name text not null default 'Comparação',
  supplier_id uuid references public.suppliers(id) on delete set null,
  supplier_name text not null,
  product_title text not null,
  product_source text,
  product_external_id text,
  unit_price numeric(14, 2) not null check (unit_price >= 0),
  currency text not null default 'BRL',
  quantity integer not null check (quantity > 0),
  min_order integer,
  freight numeric(14, 2),
  taxes numeric(14, 2),
  other_costs numeric(14, 2),
  lead_time_days integer,
  offer_url text,
  -- origem de cada custo: source (informado pela fonte) | estimated | user
  cost_origins jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index supplier_quotes_user_idx on public.supplier_quotes (user_id, comparison_name);

create table public.watches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null,
  external_id text not null,
  title text not null,
  image_url text,
  permalink text,
  rule_type text not null check (rule_type in ('price_below', 'price_drop_pct', 'any_change')),
  threshold numeric(14, 2),
  active boolean not null default true,
  last_price numeric(14, 2),
  last_currency text,
  last_checked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (user_id, source, external_id, rule_type)
);
create index watches_due_idx on public.watches (active, last_checked_at nulls first);

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  watch_id uuid references public.watches(id) on delete cascade,
  kind text not null,
  title text not null,
  message text not null,
  data jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index alerts_user_idx on public.alerts (user_id, created_at desc);

create table public.simulations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  product_source text,
  product_external_id text,
  inputs jsonb not null,
  results jsonb not null,
  created_at timestamptz not null default now()
);
create index simulations_user_idx on public.simulations (user_id, created_at desc);

create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Nova conversa',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ai_conv_user_idx on public.ai_conversations (user_id, updated_at desc);

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  blocks jsonb not null default '[]',
  model text,
  tokens_in integer,
  tokens_out integer,
  created_at timestamptz not null default now()
);
create index ai_msg_conv_idx on public.ai_messages (conversation_id, created_at);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  kind text not null check (kind in ('product_analysis', 'supplier_comparison', 'simulation', 'assistant')),
  content jsonb not null,
  created_at timestamptz not null default now()
);
create index reports_user_idx on public.reports (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Configuração, auditoria, blog e rate limiting
-- ---------------------------------------------------------------------------
create table public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.admin_audit_logs (
  id bigint generated always as identity primary key,
  admin_id uuid references auth.users(id) on delete set null,
  action text not null,
  target text,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null,
  excerpt text not null,
  content_md text not null,
  category text not null default 'guias',
  status text not null default 'draft' check (status in ('draft', 'published')),
  seo_title text,
  seo_description text,
  author_id uuid references auth.users(id) on delete set null,
  author_name text not null default 'Equipe Worthwise',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index blog_published_idx on public.blog_posts (status, published_at desc);

create table public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (key, window_start)
);
