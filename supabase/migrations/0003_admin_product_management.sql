-- Persistent state for multi-step admin product workflows.
create table if not exists public.admin_sessions (
  telegram_user_id bigint primary key,
  state text not null,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.admin_sessions enable row level security;

-- Support a preorder product state while preserving existing rows.
alter table public.products drop constraint if exists products_status_check;
alter table public.products add constraint products_status_check
  check (status in ('draft','active','archived','out_of_stock','preorder'));

create index if not exists admin_activity_product_created_idx
  on public.admin_activity_logs(entity_type, entity_id, created_at desc);
