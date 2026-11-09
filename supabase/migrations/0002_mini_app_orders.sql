-- MJL Store: Mini App order support.
-- Apply after 0001_initial_schema.sql in Supabase SQL Editor.

alter table public.products
  add column if not exists image_url text;

alter table public.orders
  add column if not exists total_amount numeric(12,2) not null default 0,
  add column if not exists payment_method text not null default 'manual',
  add column if not exists payment_status text not null default 'pending'
    check (payment_status in ('pending','confirmed','refunded')),
  add column if not exists delivery_city text,
  add column if not exists delivery_address text,
  add column if not exists idempotency_key text;

create unique index if not exists orders_customer_idempotency_idx
  on public.orders(customer_id, idempotency_key)
  where idempotency_key is not null;

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  currency text not null,
  created_at timestamptz not null default now()
);

create index if not exists order_items_order_idx on public.order_items(order_id);
alter table public.order_items enable row level security;

create or replace function public.create_mjl_order(
  p_telegram_user_id bigint,
  p_username text,
  p_first_name text,
  p_customer_name text,
  p_phone text,
  p_delivery_city text,
  p_delivery_address text,
  p_fulfillment_method text,
  p_payment_method text,
  p_comment text,
  p_idempotency_key text,
  p_items jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_order_id uuid;
  v_order_number bigint;
  v_existing jsonb;
  v_item jsonb;
  v_product public.products%rowtype;
  v_quantity integer;
  v_total numeric(12,2) := 0;
  v_currency text;
  v_line_count integer := 0;
begin
  if p_telegram_user_id is null or p_telegram_user_id <= 0 then
    raise exception 'INVALID_CUSTOMER';
  end if;
  if length(trim(coalesce(p_customer_name, ''))) < 2
     or length(trim(coalesce(p_phone, ''))) < 5 then
    raise exception 'INVALID_CONTACT';
  end if;
  if p_fulfillment_method not in ('delivery','pickup') then
    raise exception 'INVALID_FULFILLMENT';
  end if;
  if p_payment_method not in ('cash','transfer') then
    raise exception 'INVALID_PAYMENT_METHOD';
  end if;
  if p_idempotency_key is null or length(p_idempotency_key) < 12 then
    raise exception 'INVALID_IDEMPOTENCY_KEY';
  end if;
  if jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) < 1
     or jsonb_array_length(p_items) > 30 then
    raise exception 'INVALID_ITEMS';
  end if;
  if p_fulfillment_method = 'delivery'
     and length(trim(coalesce(p_delivery_address, ''))) < 5 then
    raise exception 'DELIVERY_ADDRESS_REQUIRED';
  end if;

  insert into public.customers(telegram_user_id, username, first_name)
  values (p_telegram_user_id, p_username, p_first_name)
  on conflict (telegram_user_id) do update
    set username = excluded.username,
        first_name = excluded.first_name,
        updated_at = now()
  returning id into v_customer_id;

  select jsonb_build_object('order_id', id, 'order_number', order_number, 'total_amount', total_amount)
    into v_existing
    from public.orders
   where customer_id = v_customer_id and idempotency_key = p_idempotency_key;
  if v_existing is not null then
    return v_existing || jsonb_build_object('duplicate', true);
  end if;

  insert into public.orders(
    customer_id, quantity, unit_price, currency, customer_name, phone,
    region, fulfillment_method, comment, status, total_amount,
    payment_method, payment_status, delivery_city, delivery_address, idempotency_key
  ) values (
    v_customer_id, 1, 0, 'RUB', trim(p_customer_name), trim(p_phone),
    coalesce(nullif(trim(p_delivery_city), ''), 'Не указан'),
    p_fulfillment_method, nullif(trim(coalesce(p_comment, '')), ''),
    'new', 0, p_payment_method, 'pending',
    nullif(trim(coalesce(p_delivery_city, '')), ''),
    nullif(trim(coalesce(p_delivery_address, '')), ''),
    p_idempotency_key
  ) returning id, order_number into v_order_id, v_order_number;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_quantity := (v_item->>'quantity')::integer;
    if v_quantity < 1 or v_quantity > 99 then
      raise exception 'INVALID_QUANTITY';
    end if;

    update public.products
       set stock_quantity = stock_quantity - v_quantity,
           status = case when stock_quantity - v_quantity = 0 then 'out_of_stock' else status end,
           updated_at = now()
     where id = (v_item->>'product_id')::uuid
       and status = 'active'
       and stock_quantity >= v_quantity
    returning * into v_product;

    if not found then
      raise exception 'PRODUCT_UNAVAILABLE';
    end if;

    if v_currency is null then
      v_currency := v_product.currency;
    elsif v_currency <> v_product.currency then
      raise exception 'MIXED_CURRENCIES_NOT_SUPPORTED';
    end if;

    insert into public.order_items(order_id, product_id, product_name, quantity, unit_price, currency)
    values (v_order_id, v_product.id, v_product.name, v_quantity, v_product.price, v_product.currency);

    v_total := v_total + (v_product.price * v_quantity);
    v_line_count := v_line_count + 1;
  end loop;

  update public.orders
     set total_amount = v_total,
         unit_price = v_total,
         currency = coalesce(v_currency, 'RUB'),
         quantity = v_line_count
   where id = v_order_id;

  return jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'total_amount', v_total,
    'currency', coalesce(v_currency, 'RUB'),
    'duplicate', false
  );
end;
$$;

revoke all on function public.create_mjl_order(bigint,text,text,text,text,text,text,text,text,text,text,jsonb) from public;
grant execute on function public.create_mjl_order(bigint,text,text,text,text,text,text,text,text,text,text,jsonb) to service_role;
