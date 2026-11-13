-- =====================================================================
-- 0004 PROCUREMENT, INVENTORY, SALES ORDERS, DELIVERIES, TENDERS
-- Foundations only. No warehouse, stock or supplier is assumed to exist;
-- every table starts empty and the inventory module ships disabled.
-- =====================================================================

-- Suppliers
create table public.suppliers (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null check (length(name) between 2 and 160),
  contact_name       text,
  email              text,
  phone              text,
  address            text,
  location           text,
  registration_info  text,
  notes              text,
  is_active          boolean not null default true,
  deleted_at         timestamptz,
  created_by         uuid references public.profiles(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index suppliers_name_idx on public.suppliers (lower(name)) where deleted_at is null;

create table public.supplier_categories (
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  category_id uuid not null references public.product_categories(id) on delete cascade,
  primary key (supplier_id, category_id)
);

-- Documents attached to any business record (private bucket)
create table public.record_documents (
  id           uuid primary key default gen_random_uuid(),
  entity_type  text not null check (entity_type in ('supplier','supplier_quote','purchase_order','tender','delivery','quotation')),
  entity_id    uuid not null,
  media_id     uuid not null references public.media_assets(id) on delete restrict,
  label        text,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index record_documents_entity_idx on public.record_documents(entity_type, entity_id);

create table public.supplier_quotes (
  id             uuid primary key default gen_random_uuid(),
  supplier_id    uuid not null references public.suppliers(id) on delete restrict,
  enquiry_id     uuid references public.enquiries(id) on delete set null,
  product_id     uuid references public.products(id) on delete set null,
  product_text   text not null,
  unit_price     numeric(14,2) not null check (unit_price >= 0),
  unit_id        uuid references public.units(id) on delete set null,
  quantity       numeric(14,3) check (quantity is null or quantity > 0),
  additional_costs numeric(14,2) not null default 0 check (additional_costs >= 0),
  additional_costs_note text,
  currency       text not null default 'KES' check (currency ~ '^[A-Z]{3}$'),
  valid_until    date,
  notes          text,
  created_by     uuid references public.profiles(id) on delete set null,
  deleted_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index supplier_quotes_supplier_idx on public.supplier_quotes(supplier_id);
create index supplier_quotes_enquiry_idx on public.supplier_quotes(enquiry_id);

-- Purchase orders
create sequence public.po_no_seq start 1001;

create table public.purchase_orders (
  id            uuid primary key default gen_random_uuid(),
  number        text not null unique default ('PO-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.po_no_seq')::text, 5, '0')),
  supplier_id   uuid not null references public.suppliers(id) on delete restrict,
  supplier_quote_id uuid references public.supplier_quotes(id) on delete set null,
  status        text not null default 'draft' check (status in ('draft','pending_approval','approved','sent','partially_received','received','cancelled')),
  currency      text not null default 'KES' check (currency ~ '^[A-Z]{3}$'),
  order_date    date,
  expected_date date,
  notes         text,
  created_by    uuid references public.profiles(id) on delete set null,
  approved_by   uuid references public.profiles(id) on delete set null,
  approved_at   timestamptz,
  deleted_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index purchase_orders_supplier_idx on public.purchase_orders(supplier_id);
create index purchase_orders_status_idx on public.purchase_orders(status);

create table public.purchase_order_items (
  id          uuid primary key default gen_random_uuid(),
  po_id       uuid not null references public.purchase_orders(id) on delete cascade,
  line_no     integer not null check (line_no > 0),
  product_id  uuid references public.products(id) on delete set null,
  description text not null,
  quantity    numeric(14,3) not null check (quantity > 0),
  unit_id     uuid references public.units(id) on delete set null,
  unit_price  numeric(14,2) not null check (unit_price >= 0),
  received_quantity numeric(14,3) not null default 0 check (received_quantity >= 0),
  unique (po_id, line_no)
);

-- Inventory (disabled by default via the module registry)
create table public.warehouses (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  address    text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.storage_locations (
  id           uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  code         text not null check (length(code) between 1 and 40),
  description  text,
  is_active    boolean not null default true,
  unique (warehouse_id, code)
);

create table public.stock_movements (
  id            uuid primary key default gen_random_uuid(),
  variant_id    uuid not null references public.product_variants(id) on delete restrict,
  warehouse_id  uuid not null references public.warehouses(id) on delete restrict,
  location_id   uuid references public.storage_locations(id) on delete set null,
  movement_type text not null check (movement_type in ('receipt','issue','adjustment','transfer_in','transfer_out','return')),
  quantity      numeric(14,3) not null check (quantity <> 0),   -- signed: receipts positive, issues negative
  reference_type text check (reference_type in ('purchase_order','sales_order','delivery','manual')),
  reference_id  uuid,
  note          text,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  check ((movement_type in ('receipt','transfer_in','return') and quantity > 0)
      or (movement_type in ('issue','transfer_out') and quantity < 0)
      or movement_type = 'adjustment')
);
create index stock_movements_variant_idx on public.stock_movements(variant_id, warehouse_id);

-- Movements are append-only: corrections are made with new adjustment rows.
create or replace function public.block_movement_changes()
returns trigger language plpgsql as $$
begin
  raise exception 'stock_movements is append-only; record an adjustment instead';
end;
$$;
create trigger stock_movements_immutable before update or delete on public.stock_movements
  for each row execute function public.block_movement_changes();

-- Balances are derived from movements, so they can never drift.
create or replace view public.inventory_balances with (security_invoker = true) as
select m.variant_id, m.warehouse_id,
       sum(m.quantity)::numeric(16,3) as quantity_on_hand,
       v.reorder_level,
       (v.reorder_level is not null and sum(m.quantity) <= v.reorder_level) as needs_reorder
from public.stock_movements m
join public.product_variants v on v.id = m.variant_id
group by m.variant_id, m.warehouse_id, v.reorder_level;

-- Sales orders & deliveries
create sequence public.so_no_seq start 1001;
create sequence public.delivery_no_seq start 1001;

create table public.sales_orders (
  id            uuid primary key default gen_random_uuid(),
  number        text not null unique default ('SO-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.so_no_seq')::text, 5, '0')),
  customer_id   uuid not null references public.customers(id) on delete restrict,
  quotation_id  uuid references public.quotations(id) on delete set null,
  status        text not null default 'draft' check (status in ('draft','confirmed','processing','partially_delivered','delivered','invoiced','cancelled')),
  currency      text not null default 'KES' check (currency ~ '^[A-Z]{3}$'),
  order_date    date not null default current_date,
  delivery_address text,
  notes         text,
  created_by    uuid references public.profiles(id) on delete set null,
  deleted_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index sales_orders_customer_idx on public.sales_orders(customer_id);

create table public.sales_order_items (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.sales_orders(id) on delete cascade,
  line_no     integer not null check (line_no > 0),
  product_id  uuid references public.products(id) on delete set null,
  description text not null,
  quantity    numeric(14,3) not null check (quantity > 0),
  unit_id     uuid references public.units(id) on delete set null,
  unit_price  numeric(14,2) not null check (unit_price >= 0),
  unique (order_id, line_no)
);

create table public.deliveries (
  id            uuid primary key default gen_random_uuid(),
  number        text not null unique default ('DN-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.delivery_no_seq')::text, 5, '0')),
  sales_order_id uuid not null references public.sales_orders(id) on delete restrict,
  status        text not null default 'scheduled' check (status in ('scheduled','in_transit','delivered','failed','cancelled')),
  scheduled_date date,
  delivered_at  timestamptz,
  driver_name   text,
  vehicle_reg   text,
  recipient_name text,
  notes         text,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index deliveries_order_idx on public.deliveries(sales_order_id);

-- Tenders
create table public.tenders (
  id                 uuid primary key default gen_random_uuid(),
  reference          text not null check (length(reference) between 1 and 80),
  procuring_entity   text not null,
  title              text not null,
  submission_deadline timestamptz,
  eligibility_requirements text,
  estimated_cost     numeric(16,2) check (estimated_cost is null or estimated_cost >= 0),
  currency           text not null default 'KES' check (currency ~ '^[A-Z]{3}$'),
  bid_status         text not null default 'monitoring' check (bid_status in ('monitoring','preparing','ready','abandoned')),
  submission_status  text not null default 'not_submitted' check (submission_status in ('not_submitted','submitted','late','withdrawn')),
  award_outcome      text not null default 'pending' check (award_outcome in ('pending','won','lost','cancelled','not_applicable')),
  internal_notes     text,
  owner_id           uuid references public.profiles(id) on delete set null,
  deleted_at         timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (procuring_entity, reference)
);
create index tenders_deadline_idx on public.tenders(submission_deadline) where deleted_at is null;

create table public.tender_categories (
  tender_id   uuid not null references public.tenders(id) on delete cascade,
  category_id uuid not null references public.product_categories(id) on delete cascade,
  primary key (tender_id, category_id)
);

do $$
declare t text;
begin
  foreach t in array array['suppliers','supplier_quotes','purchase_orders','warehouses','sales_orders','deliveries','tenders'] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_updated', t);
  end loop;
end $$;
