-- Vitrine montada pelo dono: produtos reais escolhidos nas lojas (link, foto, preço, avaliação),
-- com histórico de preço a cada atualização. Leitura para usuários logados; escrita só do administrador.
create table if not exists public.curated_products (
  id uuid primary key default gen_random_uuid(),
  store text not null check (store in ('mercadolivre', 'shopee', 'amazon', 'tiktokshop')),
  title text not null check (char_length(title) between 2 and 300),
  image_url text check (image_url is null or image_url ~ '^https://'),
  link text not null check (link ~ '^https://'),
  price numeric(12,2) check (price is null or price >= 0),
  rating numeric(3,2) check (rating is null or (rating >= 0 and rating <= 5)),
  reviews_count integer check (reviews_count is null or reviews_count >= 0),
  sold_text text check (sold_text is null or char_length(sold_text) <= 60),
  category text check (category is null or char_length(category) <= 60),
  position integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists curated_products_store_idx on public.curated_products (store, active, position);

create table if not exists public.curated_price_history (
  id bigint generated always as identity primary key,
  product_id uuid not null references public.curated_products(id) on delete cascade,
  price numeric(12,2) not null check (price >= 0),
  recorded_at timestamptz not null default now()
);
create index if not exists curated_price_history_idx on public.curated_price_history (product_id, recorded_at);

alter table public.curated_products enable row level security;
alter table public.curated_price_history enable row level security;

drop policy if exists curated_products_read on public.curated_products;
create policy curated_products_read on public.curated_products for select to authenticated using (active or public.is_admin());
drop policy if exists curated_products_admin on public.curated_products;
create policy curated_products_admin on public.curated_products for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists curated_history_read on public.curated_price_history;
create policy curated_history_read on public.curated_price_history for select to authenticated using (true);
drop policy if exists curated_history_admin on public.curated_price_history;
create policy curated_history_admin on public.curated_price_history for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.curated_products to authenticated;
grant select, insert, delete on public.curated_price_history to authenticated;

-- Todo preço novo entra no histórico (é assim que o gráfico se forma).
create or replace function public.curated_touch()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists curated_products_touch on public.curated_products;
create trigger curated_products_touch before update on public.curated_products
  for each row execute function public.curated_touch();

create or replace function public.curated_track_price()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.price is not null and (tg_op = 'INSERT' or new.price is distinct from old.price) then
    insert into public.curated_price_history (product_id, price) values (new.id, new.price);
  end if;
  return null;
end $$;
drop trigger if exists curated_products_price on public.curated_products;
create trigger curated_products_price after insert or update on public.curated_products
  for each row execute function public.curated_track_price();
