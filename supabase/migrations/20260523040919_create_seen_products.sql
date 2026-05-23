create table if not exists public.seen_products (
  url text primary key,
  first_seen_at timestamptz not null default now()
);
