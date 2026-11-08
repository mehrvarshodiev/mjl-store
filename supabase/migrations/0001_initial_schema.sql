-- MJL Telegram Store: initial schema
create extension if not exists pgcrypto;

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  emoji text,
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories(id) on delete set null,
  name text not null,
  brand text,
  model text,
  price numeric(12,2) not null check (price >= 0),
  currency text not null default 'RUB',
  description text,
  specifications jsonb not null default '{}'::jsonb,
  photo_file_ids text[] not null default '{}',
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  contents text,
  warranty text,
  delivery_terms text,
  status text not null default 'draft' check (status in ('draft','active','archived','out_of_stock')),
  is_new boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id bigint not null unique,
  username text,
  first_name text,
  phone text,
  consent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigint generated always as identity unique,
  customer_id uuid references public.customers(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  currency text not null default 'RUB',
  customer_name text not null,
  phone text not null,
  region text not null,
  fulfillment_method text not null,
  comment text,
  status text not null default 'new' check (status in ('new','confirmed','awaiting_payment','preparing','shipped','completed','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.channel_posts (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete set null,
  chat_id text not null,
  message_id bigint not null,
  publication_status text not null default 'published' check (publication_status in ('draft','scheduled','published','failed','archived')),
  scheduled_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique(chat_id, message_id)
);

create table if not exists public.polls (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  options jsonb not null,
  telegram_poll_id text unique,
  is_anonymous boolean not null default true,
  status text not null default 'draft' check (status in ('draft','published','closed')),
  created_at timestamptz not null default now()
);

create table if not exists public.poll_results (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  option_index integer not null,
  vote_count integer not null default 0,
  updated_at timestamptz not null default now(),
  unique(poll_id, option_index)
);

create table if not exists public.administrators (
  telegram_user_id bigint primary key,
  display_name text,
  role text not null default 'owner' check (role in ('owner','manager','operator')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  source_code text not null unique,
  clicks integer not null default 0,
  conversions integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_activity_logs (
  id uuid primary key default gen_random_uuid(),
  administrator_id bigint,
  action text not null,
  entity_type text,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.store_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.processed_updates (
  update_id bigint primary key,
  processed_at timestamptz not null default now()
);

create index if not exists products_status_created_idx on public.products(status, created_at desc);
create index if not exists products_category_status_idx on public.products(category_id, status);
create index if not exists orders_status_created_idx on public.orders(status, created_at desc);
create index if not exists channel_posts_product_idx on public.channel_posts(product_id);

alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.channel_posts enable row level security;
alter table public.polls enable row level security;
alter table public.poll_results enable row level security;
alter table public.administrators enable row level security;
alter table public.campaigns enable row level security;
alter table public.admin_activity_logs enable row level security;
alter table public.store_settings enable row level security;
alter table public.processed_updates enable row level security;

insert into public.categories(name, slug, emoji, sort_order) values
  ('Наушники', 'headphones', '🎧', 10),
  ('Держатели телефонов', 'phone-holders', '📱', 20),
  ('Камеры видеонаблюдения', 'security-cameras', '📹', 30),
  ('Роутеры', 'routers', '📡', 40),
  ('LED-проекторы', 'projectors', '🎥', 50),
  ('Аксессуары', 'accessories', '🔌', 60),
  ('Другие товары', 'other', '🛒', 70)
on conflict (slug) do nothing;
