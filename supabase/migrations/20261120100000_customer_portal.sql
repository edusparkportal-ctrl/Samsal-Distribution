-- =====================================================================
-- CUSTOMER PORTAL, PHASE 1 (module `portal`) - ships DISABLED.
--
-- Wholesale customers get their own login to browse the catalogue (with their own prices and stock
-- availability), build a cart, place orders, and track deliveries.
--
-- HOW CUSTOMER DATA IS PROTECTED
--   * Customers are ordinary Supabase Auth users who have NO staff role. The existing staff policies
--     (can(...)) therefore deny them every row of every business table: they have no direct table access.
--   * The only door is a set of SECURITY DEFINER functions (portal_*). Every one of them starts from
--     portal_customer_id(), which is the customer linked to the caller's own APPROVED account, and filters
--     by it. Nothing a customer sends can name a different customer.
--   * Prices, minimums, availability and totals are always recomputed in the database. The browser only
--     says "product X, quantity N".
--   * The module switch is part of portal_customer_id(), so turning the module off is a real stop.
--   * Staff approve each account (fresh MFA required) and decide which customer record it is linked to.
--
-- Nothing in this file changes existing data. It adds tables/columns and widens one status check.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Module and permissions
-- ---------------------------------------------------------------------
insert into public.modules (key, name, description, is_core, enabled, sort_order) values
  ('portal', 'Customer portal', 'Wholesale customer logins: catalogue with customer prices, ordering, order tracking. Off until accounts, prices and email are ready.', false, false, 32)
on conflict (key) do nothing;

insert into public.permissions (key, module, description) values
  ('portal.view',    'portal', 'View portal accounts, prices and tracking updates'),
  ('portal.manage',  'portal', 'Approve, suspend or reject customer portal accounts and post tracking updates'),
  ('portal.pricing', 'portal', 'Set list prices and customer-specific prices')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_key)
select r.id, p.perm
from public.roles r
join (values
  ('sales_manager', 'portal.view'), ('sales_manager', 'portal.manage'), ('sales_manager', 'portal.pricing'),
  ('director', 'portal.view'), ('finance_manager', 'portal.view')
) as p(role_key, perm) on p.role_key = r.key
on conflict do nothing;

-- ---------------------------------------------------------------------
-- Order columns the portal needs (all optional, so existing rows and staff screens are unaffected)
-- ---------------------------------------------------------------------
alter table public.sales_orders
  add column if not exists source text not null default 'staff',
  add column if not exists placed_by uuid references auth.users(id) on delete set null,
  add column if not exists customer_reference text,
  add column if not exists customer_notes text,
  add column if not exists requested_delivery_date date,
  add column if not exists submitted_at timestamptz,
  add column if not exists cancelled_reason text,
  add column if not exists idempotency_key uuid;

alter table public.sales_orders drop constraint if exists sales_orders_source_check;
alter table public.sales_orders add constraint sales_orders_source_check check (source in ('staff', 'portal', 'bulk_upload'));
alter table public.sales_orders drop constraint if exists sales_orders_customer_reference_check;
alter table public.sales_orders add constraint sales_orders_customer_reference_check check (customer_reference is null or length(customer_reference) <= 60);
alter table public.sales_orders drop constraint if exists sales_orders_customer_notes_check;
alter table public.sales_orders add constraint sales_orders_customer_notes_check check (customer_notes is null or length(customer_notes) <= 1000);
alter table public.sales_orders drop constraint if exists sales_orders_cancelled_reason_check;
alter table public.sales_orders add constraint sales_orders_cancelled_reason_check check (cancelled_reason is null or length(cancelled_reason) <= 300);

-- A new first state: the customer has sent it, staff have not yet confirmed it.
alter table public.sales_orders drop constraint if exists sales_orders_status_check;
alter table public.sales_orders add constraint sales_orders_status_check
  check (status in ('draft', 'submitted', 'confirmed', 'processing', 'partially_delivered', 'delivered', 'invoiced', 'cancelled'));

create unique index if not exists sales_orders_idem_idx on public.sales_orders (customer_id, idempotency_key) where idempotency_key is not null;
create index if not exists sales_orders_customer_idx on public.sales_orders (customer_id, created_at desc) where deleted_at is null;

-- ---------------------------------------------------------------------
-- Customer accounts (one auth user -> at most one customer; several users may share a customer)
-- ---------------------------------------------------------------------
create table public.customer_accounts (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  customer_id  uuid references public.customers(id) on delete set null,
  status       text not null default 'pending' check (status in ('pending', 'active', 'suspended', 'rejected')),
  company_name text not null check (length(company_name) between 2 and 160),
  contact_name text not null check (length(contact_name) between 1 and 120),
  phone        text check (phone is null or length(phone) between 7 and 20),
  kra_pin      text check (kra_pin is null or kra_pin ~ '^[A-Za-z][0-9]{9}[A-Za-z]$'),
  location     text check (location is null or length(location) <= 160),
  review_note  text check (review_note is null or length(review_note) <= 500),
  reviewed_by  uuid references public.profiles(id) on delete set null,
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint customer_accounts_active_needs_customer check (status <> 'active' or customer_id is not null)
);
create index customer_accounts_status_idx on public.customer_accounts (status, created_at desc);
create index customer_accounts_customer_idx on public.customer_accounts (customer_id);
create trigger customer_accounts_updated before update on public.customer_accounts for each row execute function public.set_updated_at();
create trigger customer_accounts_audit after insert or update or delete on public.customer_accounts for each row execute function public.audit_row('pii');

-- An application is created from the sign-up metadata, so it works even when the person must confirm their
-- email before they can sign in. It can only ever create a PENDING application with no customer attached;
-- failing to create one never blocks the sign-up itself.
create or replace function public.portal_application_from_signup()
returns trigger language plpgsql security definer set search_path = public as $$
declare m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  if coalesce(m ->> 'portal_signup', '') <> 'true' then return new; end if;
  if not public.module_enabled('portal') then return new; end if;
  insert into public.customer_accounts (user_id, company_name, contact_name, phone, kra_pin, location)
  values (
    new.id,
    left(btrim(coalesce(m ->> 'company_name', '')), 160),
    left(btrim(coalesce(m ->> 'contact_name', '')), 120),
    nullif(left(btrim(coalesce(m ->> 'phone', '')), 20), ''),
    nullif(upper(btrim(coalesce(m ->> 'kra_pin', ''))), ''),
    nullif(left(btrim(coalesce(m ->> 'location', '')), 160), '')
  )
  on conflict (user_id) do nothing;
  return new;
exception when others then
  raise warning 'portal application not created: %', sqlerrm;
  return new;
end;
$$;
revoke all on function public.portal_application_from_signup() from public, anon, authenticated;
create trigger on_auth_user_portal_application after insert on auth.users for each row execute function public.portal_application_from_signup();

alter table public.customer_accounts enable row level security;
revoke all on public.customer_accounts from anon, authenticated;
grant select on public.customer_accounts to authenticated;
-- A person sees only their own application; staff with the permission see all. Nobody updates directly:
-- approval, rejection and suspension go through portal_review_account().
create policy customer_accounts_own on public.customer_accounts for select to authenticated using (user_id = auth.uid());
create policy customer_accounts_staff on public.customer_accounts for select to authenticated using (public.can('portal.view', 'portal'));

-- The customer record the caller may act for. NULL means "not an approved portal customer".
create or replace function public.portal_customer_id()
returns uuid language sql stable security definer set search_path = public as $$
  select a.customer_id
  from public.customer_accounts a
  join public.customers c on c.id = a.customer_id and c.deleted_at is null
  where a.user_id = auth.uid() and a.status = 'active' and public.module_enabled('portal')
  limit 1
$$;
revoke all on function public.portal_customer_id() from public, anon;
grant execute on function public.portal_customer_id() to authenticated;

create or replace function public.portal_require()
returns uuid language plpgsql stable security definer set search_path = public as $$
declare cid uuid := public.portal_customer_id();
begin
  if cid is null then raise exception 'Your account is not active for the customer portal.' using errcode = 'P0001'; end if;
  return cid;
end;
$$;
revoke all on function public.portal_require() from public, anon, authenticated;

-- Staff decision on an application. Approving links the login to a customer record (an existing one the
-- staff member chooses, or a new one built from the application). Needs a fresh authenticator code,
-- because it grants access to a customer's orders and prices.
create or replace function public.portal_review_account(p_user uuid, p_decision text, p_customer uuid default null, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare a public.customer_accounts%rowtype; cid uuid; em text;
begin
  if not public.can('portal.manage', 'portal') then raise exception 'Not permitted'; end if;
  if not public.mfa_ok() then raise exception '[mfa] Confirm a fresh authenticator code before changing portal access.' using errcode = 'P0001'; end if;
  if p_decision not in ('approve', 'reject', 'suspend', 'reactivate') then raise exception 'Unknown decision'; end if;
  select * into a from public.customer_accounts where user_id = p_user for update;
  if not found then raise exception 'Application not found'; end if;

  if p_decision = 'approve' then
    if a.status not in ('pending', 'rejected') then raise exception 'Only a pending or rejected application can be approved'; end if;
    if p_customer is not null then
      select id into cid from public.customers where id = p_customer and deleted_at is null;
      if cid is null then raise exception 'Customer record not found'; end if;
    else
      select email into em from public.profiles where id = p_user;
      if em is null then raise exception 'No email address on this account'; end if;
      insert into public.customers (company_name, contact_name, email, phone, location)
      values (a.company_name, a.contact_name, em, a.phone, a.location) returning id into cid;
    end if;
    update public.customer_accounts set status = 'active', customer_id = cid, review_note = left(p_note, 500), reviewed_by = auth.uid(), reviewed_at = now() where user_id = p_user;
  elsif p_decision = 'reject' then
    if a.status <> 'pending' then raise exception 'Only a pending application can be rejected'; end if;
    update public.customer_accounts set status = 'rejected', review_note = left(p_note, 500), reviewed_by = auth.uid(), reviewed_at = now() where user_id = p_user;
  elsif p_decision = 'suspend' then
    if a.status <> 'active' then raise exception 'Only an active account can be suspended'; end if;
    update public.customer_accounts set status = 'suspended', review_note = left(p_note, 500), reviewed_by = auth.uid(), reviewed_at = now() where user_id = p_user;
  else
    if a.status <> 'suspended' then raise exception 'Only a suspended account can be reactivated'; end if;
    update public.customer_accounts set status = 'active', review_note = left(p_note, 500), reviewed_by = auth.uid(), reviewed_at = now() where user_id = p_user;
  end if;
end;
$$;
revoke all on function public.portal_review_account(uuid, text, uuid, text) from public, anon;
grant execute on function public.portal_review_account(uuid, text, uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- Prices
-- ---------------------------------------------------------------------
create table public.product_prices (
  product_id    uuid primary key references public.products(id) on delete cascade,
  unit_price    numeric(14,2) not null check (unit_price >= 0 and unit_price <= 100000000),
  currency      text not null default 'KES' check (currency = 'KES'),
  min_order_qty numeric(14,3) not null default 1 check (min_order_qty > 0 and min_order_qty <= 1000000),
  qty_step      numeric(14,3) not null default 1 check (qty_step > 0 and qty_step <= 1000000),
  is_orderable  boolean not null default true,
  updated_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.customer_prices (
  id               uuid primary key default gen_random_uuid(),
  customer_id      uuid not null references public.customers(id) on delete cascade,
  product_id       uuid not null references public.products(id) on delete cascade,
  unit_price       numeric(14,2) check (unit_price is null or (unit_price >= 0 and unit_price <= 100000000)),
  discount_percent numeric(5,2) check (discount_percent is null or (discount_percent >= 0 and discount_percent <= 100)),
  valid_from       date,
  valid_to         date,
  note             text check (note is null or length(note) <= 300),
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (customer_id, product_id),
  constraint customer_prices_one_basis check ((unit_price is null) <> (discount_percent is null)),
  constraint customer_prices_dates check (valid_to is null or valid_from is null or valid_to >= valid_from)
);
create index customer_prices_product_idx on public.customer_prices (product_id);

create trigger product_prices_updated  before update on public.product_prices  for each row execute function public.set_updated_at();
create trigger customer_prices_updated before update on public.customer_prices for each row execute function public.set_updated_at();
create trigger product_prices_audit  after insert or update or delete on public.product_prices  for each row execute function public.audit_row('full');
create trigger customer_prices_audit after insert or update or delete on public.customer_prices for each row execute function public.audit_row('full');

alter table public.product_prices  enable row level security;
alter table public.customer_prices enable row level security;
revoke all on public.product_prices, public.customer_prices from anon, authenticated;
grant select, insert, update, delete on public.product_prices, public.customer_prices to authenticated;
do $$
declare t text;
begin
  foreach t in array array['product_prices', 'customer_prices'] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.can(''portal.view'', ''portal''))', t || '_read', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.can(''portal.pricing'', ''portal''))', t || '_ins', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.can(''portal.pricing'', ''portal'')) with check (public.can(''portal.pricing'', ''portal''))', t || '_upd', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.can(''portal.pricing'', ''portal''))', t || '_del', t);
  end loop;
end $$;

-- The price a given customer pays today. No row = the product has no portal price.
create or replace function public.portal_price_info(p_customer uuid, p_product uuid)
returns table (effective numeric, list numeric, special boolean, currency text, min_qty numeric, step numeric, orderable boolean)
language sql stable security definer set search_path = public as $$
  select
    case when cp.id is null then pp.unit_price
         when cp.unit_price is not null then cp.unit_price
         else round(pp.unit_price * (1 - cp.discount_percent / 100), 2) end,
    pp.unit_price, (cp.id is not null), pp.currency, pp.min_order_qty, pp.qty_step, pp.is_orderable
  from public.product_prices pp
  left join lateral (
    select c.* from public.customer_prices c
    where c.customer_id = p_customer and c.product_id = p_product
      and (c.valid_from is null or c.valid_from <= current_date)
      and (c.valid_to is null or c.valid_to >= current_date)
    limit 1
  ) cp on true
  where pp.product_id = p_product
$$;
revoke all on function public.portal_price_info(uuid, uuid) from public, anon, authenticated;

-- Stock as a band, plus the exact figure for internal checks only. A product with no stock movements on
-- record is "on request" (not tracked), never "out of stock".
create or replace function public.portal_stock_info(p_product uuid)
returns table (status text, available numeric, tracked boolean)
language sql stable security definer set search_path = public as $$
  with v as (select id, reorder_level from public.product_variants where product_id = p_product and is_active),
       s as (select coalesce(sum(m.quantity), 0) as qty, count(m.id) as mv from public.stock_movements m where m.variant_id in (select id from v))
  select
    case when (select count(*) from v) = 0 or s.mv = 0 then 'on_request'
         when s.qty <= 0 then 'out_of_stock'
         when s.qty <= coalesce((select max(reorder_level) from v), 0) then 'low_stock'
         else 'in_stock' end,
    greatest(s.qty, 0),
    ((select count(*) from v) > 0 and s.mv > 0)
  from s
$$;
revoke all on function public.portal_stock_info(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Catalogue
-- ---------------------------------------------------------------------
create or replace function public.portal_catalog(
  p_search text default null, p_category uuid default null, p_slug text default null, p_limit integer default 48, p_offset integer default 0
) returns table (
  product_id uuid, slug text, name text, summary text, description text, category_id uuid, category_name text, packaging text, unit text,
  photo_path text, fallback_image text, image_alt text,
  unit_price numeric, list_price numeric, special boolean, currency text, min_order_qty numeric, qty_step numeric, orderable boolean, availability text, total_count bigint
) language plpgsql stable security definer set search_path = public as $$
declare cid uuid := public.portal_customer_id(); q text; lim integer := least(greatest(coalesce(p_limit, 48), 1), 200); off integer := greatest(coalesce(p_offset, 0), 0);
begin
  if cid is null then return; end if;
  q := nullif(btrim(coalesce(p_search, '')), '');
  if q is not null then q := '%' || replace(replace(replace(left(q, 80), '\', '\\'), '%', '\%'), '_', '\_') || '%'; end if;
  return query
  select p.id, p.slug, p.name, p.summary, p.description, p.category_id, c.name, p.packaging, u.abbreviation,
         (select ma.storage_path from public.media_assets ma where ma.id = p.photo_media_id and ma.bucket = 'public-media'), p.fallback_image, p.image_alt,
         pi.effective, pi.list, coalesce(pi.special, false), coalesce(pi.currency, 'KES'), pi.min_qty, pi.step,
         coalesce(pi.orderable, false) and pi.effective is not null,
         si.status,
         count(*) over ()
  from public.products p
  left join public.product_categories c on c.id = p.category_id
  left join public.units u on u.id = p.unit_id
  left join lateral public.portal_price_info(cid, p.id) pi on true
  left join lateral public.portal_stock_info(p.id) si on true
  where p.status = 'published' and p.deleted_at is null
    and (p_category is null or p.category_id = p_category)
    and (p_slug is null or p.slug = p_slug)
    and (q is null or p.name ilike q or p.summary ilike q or p.slug ilike q or p.packaging ilike q or c.name ilike q)
  order by p.sort_order, p.name
  limit lim offset off;
end;
$$;
revoke all on function public.portal_catalog(text, uuid, text, integer, integer) from public, anon;
grant execute on function public.portal_catalog(text, uuid, text, integer, integer) to authenticated;

create or replace function public.portal_categories()
returns table (id uuid, slug text, name text, product_count bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if public.portal_customer_id() is null then return; end if;
  return query
  select c.id, c.slug, c.name, count(p.id)
  from public.product_categories c
  left join public.products p on p.category_id = c.id and p.status = 'published' and p.deleted_at is null
  where c.is_active
  group by c.id, c.slug, c.name, c.sort_order
  order by c.sort_order, c.name;
end;
$$;
revoke all on function public.portal_categories() from public, anon;
grant execute on function public.portal_categories() to authenticated;

-- ---------------------------------------------------------------------
-- Cart (server side, so it follows the customer between phone and desktop)
-- ---------------------------------------------------------------------
create table public.portal_cart_items (
  user_id    uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity   numeric(14,3) not null check (quantity > 0 and quantity <= 1000000),
  updated_at timestamptz not null default now(),
  primary key (user_id, product_id)
);
alter table public.portal_cart_items enable row level security;
revoke all on public.portal_cart_items from anon, authenticated;   -- reached only through the functions below

create or replace function public.portal_cart_set(p_product uuid, p_quantity numeric)
returns void language plpgsql security definer set search_path = public as $$
declare cid uuid := public.portal_require(); pi record;
begin
  if p_quantity is null or p_quantity < 0 or p_quantity > 1000000 then raise exception 'Enter a valid quantity.' using errcode = 'P0001'; end if;
  if p_quantity = 0 then
    delete from public.portal_cart_items where user_id = auth.uid() and product_id = p_product;
    return;
  end if;
  if not exists (select 1 from public.products where id = p_product and status = 'published' and deleted_at is null) then
    raise exception 'That product is not available.' using errcode = 'P0001';
  end if;
  select * into pi from public.portal_price_info(cid, p_product);
  if not found or not pi.orderable then raise exception 'That product is not available to order online. Please request a quotation.' using errcode = 'P0001'; end if;
  if (select count(*) from public.portal_cart_items where user_id = auth.uid()) >= 100
     and not exists (select 1 from public.portal_cart_items where user_id = auth.uid() and product_id = p_product) then
    raise exception 'A cart can hold up to 100 products.' using errcode = 'P0001';
  end if;
  insert into public.portal_cart_items (user_id, product_id, quantity) values (auth.uid(), p_product, p_quantity)
  on conflict (user_id, product_id) do update set quantity = excluded.quantity, updated_at = now();
end;
$$;
revoke all on function public.portal_cart_set(uuid, numeric) from public, anon;
grant execute on function public.portal_cart_set(uuid, numeric) to authenticated;

create or replace function public.portal_cart_clear()
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.portal_require();
  delete from public.portal_cart_items where user_id = auth.uid();
end;
$$;
revoke all on function public.portal_cart_clear() from public, anon;
grant execute on function public.portal_cart_clear() to authenticated;

-- The cart with today's prices and a plain-language issue per line. Totals are exclusive of VAT.
create or replace function public.portal_cart()
returns table (
  product_id uuid, slug text, name text, packaging text, unit text, fallback_image text, photo_path text, image_alt text,
  quantity numeric, unit_price numeric, line_total numeric, currency text, min_order_qty numeric, qty_step numeric, availability text, issue text
) language plpgsql stable security definer set search_path = public as $$
declare cid uuid := public.portal_customer_id();
begin
  if cid is null then return; end if;
  return query
  select p.id, p.slug, p.name, p.packaging, u.abbreviation, p.fallback_image,
         (select ma.storage_path from public.media_assets ma where ma.id = p.photo_media_id and ma.bucket = 'public-media'), p.image_alt,
         ci.quantity, pi.effective, round(ci.quantity * pi.effective, 2), coalesce(pi.currency, 'KES'), pi.min_qty, pi.step, si.status,
         case
           when p.status <> 'published' or p.deleted_at is not null then 'unavailable'
           when pi.effective is null or not pi.orderable then 'no_price'
           when ci.quantity < pi.min_qty then 'below_minimum'
           when pi.step > 0 and mod(ci.quantity - pi.min_qty, pi.step) <> 0 then 'step'
           when si.tracked and ci.quantity > si.available then 'exceeds_stock'
         end
  from public.portal_cart_items ci
  join public.products p on p.id = ci.product_id
  left join public.units u on u.id = p.unit_id
  left join lateral public.portal_price_info(cid, p.id) pi on true
  left join lateral public.portal_stock_info(p.id) si on true
  where ci.user_id = auth.uid()
  order by ci.updated_at, p.name;
end;
$$;
revoke all on function public.portal_cart() from public, anon;
grant execute on function public.portal_cart() to authenticated;

-- ---------------------------------------------------------------------
-- Placing an order. Everything that matters is decided here, not in the browser.
-- ---------------------------------------------------------------------
create or replace function public.portal_create_order(
  p_user uuid, p_customer uuid, p_items jsonb, p_address text, p_reference text, p_notes text, p_requested date, p_key uuid, p_source text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  oid uuid; r record; n integer := 0; addr text := btrim(coalesce(p_address, ''));
  ref text := nullif(btrim(coalesce(p_reference, '')), ''); notes text := nullif(btrim(coalesce(p_notes, '')), '');
  pi record; si record; cur text := null; total numeric := 0; need integer;
begin
  if p_source not in ('portal', 'bulk_upload') then raise exception 'Invalid source'; end if;
  if p_key is not null then
    select id into oid from public.sales_orders where customer_id = p_customer and idempotency_key = p_key;
    if found then return oid; end if;     -- a double click or a retry: hand back the first order
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Your cart is empty.' using errcode = 'P0001'; end if;
  if jsonb_array_length(p_items) > 500 then raise exception 'Too many lines in one order (limit 500).' using errcode = 'P0001'; end if;
  if length(addr) < 5 or length(addr) > 500 then raise exception 'Enter a delivery address (5 to 500 characters).' using errcode = 'P0001'; end if;
  if ref is not null and length(ref) > 60 then raise exception 'Your reference can be up to 60 characters.' using errcode = 'P0001'; end if;
  if notes is not null and length(notes) > 1000 then raise exception 'Notes can be up to 1000 characters.' using errcode = 'P0001'; end if;
  if p_requested is not null and (p_requested < current_date or p_requested > current_date + 365) then
    raise exception 'Choose a delivery date within the next year.' using errcode = 'P0001';
  end if;
  select count(*) into need from public.sales_orders where customer_id = p_customer and source <> 'staff' and created_at > now() - interval '1 hour';
  if need >= 20 then raise exception 'Too many orders were placed in the last hour. Please contact us.' using errcode = 'P0001'; end if;

  -- Validate every line first (collect all problems) so nothing is half created.
  create temp table if not exists _portal_lines (product_id uuid, qty numeric, name text, descr text, unit uuid, price numeric, cur text) on commit drop;
  delete from _portal_lines;
  begin
    insert into _portal_lines (product_id, qty)
    select (e ->> 'product_id')::uuid, sum((e ->> 'quantity')::numeric)
    from jsonb_array_elements(p_items) e group by 1;
  exception when others then
    raise exception 'One of the lines is not valid.' using errcode = 'P0001';
  end;

  for r in select l.*, p.name as pname, p.packaging, p.unit_id, p.status as pstatus, p.deleted_at as pdel from _portal_lines l left join public.products p on p.id = l.product_id loop
    if r.pname is null or r.pstatus <> 'published' or r.pdel is not null then raise exception 'A product in your order is no longer available.' using errcode = 'P0001'; end if;
    select * into pi from public.portal_price_info(p_customer, r.product_id);
    if not found or not pi.orderable then raise exception '% cannot be ordered online. Please request a quotation.', r.pname using errcode = 'P0001'; end if;
    if r.qty <= 0 or r.qty > 1000000 then raise exception 'Enter a valid quantity for %.', r.pname using errcode = 'P0001'; end if;
    if r.qty < pi.min_qty then raise exception 'The minimum order for % is %.', r.pname, trim(trailing '.' from trim(trailing '0' from pi.min_qty::text)) using errcode = 'P0001'; end if;
    if mod(r.qty - pi.min_qty, pi.step) <> 0 then raise exception '% must be ordered in steps of %.', r.pname, trim(trailing '.' from trim(trailing '0' from pi.step::text)) using errcode = 'P0001'; end if;
    select * into si from public.portal_stock_info(r.product_id);
    if si.tracked and r.qty > si.available then raise exception 'We do not have enough % in stock for that quantity. Please reduce it or contact us.', r.pname using errcode = 'P0001'; end if;
    if cur is not null and cur <> pi.currency then raise exception 'Mixed currencies in one order are not supported.' using errcode = 'P0001'; end if;
    cur := pi.currency;
    update _portal_lines set name = r.pname || coalesce(' (' || r.packaging || ')', ''), unit = r.unit_id, price = pi.effective, cur = pi.currency where product_id = r.product_id;
    total := total + round(r.qty * pi.effective, 2);
  end loop;

  insert into public.sales_orders (customer_id, status, currency, order_date, delivery_address, source, placed_by, customer_reference, customer_notes, requested_delivery_date, submitted_at, idempotency_key)
  values (p_customer, 'submitted', coalesce(cur, 'KES'), current_date, addr, p_source, p_user, ref, notes, p_requested, now(), p_key)
  returning id into oid;
  insert into public.sales_order_items (order_id, line_no, product_id, description, quantity, unit_id, unit_price)
  select oid, row_number() over (order by name), product_id, left(name, 500), qty, unit, price from _portal_lines;
  return oid;
end;
$$;
revoke all on function public.portal_create_order(uuid, uuid, jsonb, text, text, text, date, uuid, text) from public, anon, authenticated;

create or replace function public.portal_checkout(p_address text, p_reference text, p_notes text, p_requested date, p_key uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare cid uuid := public.portal_require(); items jsonb; oid uuid;
begin
  select coalesce(jsonb_agg(jsonb_build_object('product_id', product_id, 'quantity', quantity)), '[]'::jsonb) into items
  from public.portal_cart_items where user_id = auth.uid();
  oid := public.portal_create_order(auth.uid(), cid, items, p_address, p_reference, p_notes, p_requested, p_key, 'portal');
  delete from public.portal_cart_items where user_id = auth.uid();
  return oid;
end;
$$;
revoke all on function public.portal_checkout(text, text, text, date, uuid) from public, anon;
grant execute on function public.portal_checkout(text, text, text, date, uuid) to authenticated;

-- Copy a previous order's lines into the cart (current prices apply). Returns how many lines could not be added.
create or replace function public.portal_repeat_order(p_order uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare cid uuid := public.portal_require(); r record; skipped integer := 0; pi record;
begin
  if not exists (select 1 from public.sales_orders where id = p_order and customer_id = cid and deleted_at is null and status <> 'draft') then
    raise exception 'Order not found.' using errcode = 'P0001';
  end if;
  for r in select product_id, sum(quantity) as qty from public.sales_order_items where order_id = p_order and product_id is not null group by product_id loop
    select * into pi from public.portal_price_info(cid, r.product_id);
    if found and pi.orderable and exists (select 1 from public.products where id = r.product_id and status = 'published' and deleted_at is null) then
      insert into public.portal_cart_items (user_id, product_id, quantity) values (auth.uid(), r.product_id, least(greatest(r.qty, pi.min_qty), 1000000))
      on conflict (user_id, product_id) do update set quantity = excluded.quantity, updated_at = now();
    else
      skipped := skipped + 1;
    end if;
  end loop;
  skipped := skipped + (select count(*) from public.sales_order_items where order_id = p_order and product_id is null);
  return skipped;
end;
$$;
revoke all on function public.portal_repeat_order(uuid) from public, anon;
grant execute on function public.portal_repeat_order(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Tracking: a timeline per order. Staff post updates; status changes add entries automatically.
-- ---------------------------------------------------------------------
create table public.order_events (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references public.sales_orders(id) on delete cascade,
  delivery_id      uuid references public.deliveries(id) on delete set null,
  kind             text not null default 'order' check (kind in ('order', 'delivery', 'payment', 'note')),
  title            text not null check (length(title) between 1 and 120),
  detail           text check (detail is null or length(detail) <= 500),
  customer_visible boolean not null default true,
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now()
);
create index order_events_order_idx on public.order_events (order_id, created_at);
alter table public.order_events enable row level security;
revoke all on public.order_events from anon, authenticated;
grant select, insert on public.order_events to authenticated;     -- append-only for staff; customers read through portal_order()
create policy order_events_read on public.order_events for select to authenticated using (public.can('orders.view', 'orders'));
create policy order_events_ins  on public.order_events for insert to authenticated
  with check ((public.can('portal.manage', 'portal') or public.can('orders.manage', 'orders')) and created_by = auth.uid());

create or replace function public.trg_order_status_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare t text;
begin
  if tg_op = 'UPDATE' and new.status = old.status then return new; end if;
  t := case new.status
    when 'submitted' then 'Order received' when 'confirmed' then 'Order confirmed' when 'processing' then 'Being prepared'
    when 'partially_delivered' then 'Partly delivered' when 'delivered' then 'Delivered' when 'invoiced' then 'Invoiced'
    when 'cancelled' then 'Order cancelled' else null end;
  if t is not null then
    insert into public.order_events (order_id, kind, title) values (new.id, 'order', t);
  end if;
  return new;
exception when others then
  raise warning 'order event not written: %', sqlerrm;
  return new;
end;
$$;
revoke all on function public.trg_order_status_event() from public, anon, authenticated;
create trigger sales_orders_status_event after insert or update of status on public.sales_orders for each row execute function public.trg_order_status_event();

create or replace function public.trg_delivery_status_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare t text; d text;
begin
  if tg_op = 'UPDATE' and new.status = old.status and new.scheduled_date is not distinct from old.scheduled_date then return new; end if;
  t := case new.status
    when 'scheduled' then 'Delivery scheduled' when 'in_transit' then 'Out for delivery' when 'delivered' then 'Delivered'
    when 'failed' then 'Delivery attempt unsuccessful' when 'cancelled' then 'Delivery cancelled' else null end;
  d := new.number || case when new.status = 'scheduled' and new.scheduled_date is not null then ' for ' || to_char(new.scheduled_date, 'DD Mon YYYY') else '' end;
  if t is not null then
    insert into public.order_events (order_id, delivery_id, kind, title, detail) values (new.sales_order_id, new.id, 'delivery', t, d);
  end if;
  return new;
exception when others then
  raise warning 'delivery event not written: %', sqlerrm;
  return new;
end;
$$;
revoke all on function public.trg_delivery_status_event() from public, anon, authenticated;
create trigger deliveries_status_event after insert or update of status, scheduled_date on public.deliveries for each row execute function public.trg_delivery_status_event();

-- Give orders that already exist a starting point on their timeline.
insert into public.order_events (order_id, kind, title, created_at)
select o.id, 'order',
  case o.status when 'confirmed' then 'Order confirmed' when 'processing' then 'Being prepared' when 'partially_delivered' then 'Partly delivered'
                when 'delivered' then 'Delivered' when 'invoiced' then 'Invoiced' else 'Order cancelled' end,
  o.updated_at
from public.sales_orders o
where o.status <> 'draft' and o.deleted_at is null
  and not exists (select 1 from public.order_events e where e.order_id = o.id);

-- ---------------------------------------------------------------------
-- Reading orders (customer side)
-- ---------------------------------------------------------------------
create or replace function public.portal_orders(p_status text default null, p_limit integer default 25, p_offset integer default 0)
returns table (id uuid, number text, status text, order_date date, submitted_at timestamptz, customer_reference text, currency text, item_count bigint, total numeric, delivery_address text, total_count bigint)
language plpgsql stable security definer set search_path = public as $$
declare cid uuid := public.portal_customer_id();
begin
  if cid is null then return; end if;
  return query
  select o.id, o.number, o.status, o.order_date, o.submitted_at, o.customer_reference, o.currency,
         (select count(*) from public.sales_order_items i where i.order_id = o.id),
         (select coalesce(round(sum(i.quantity * i.unit_price), 2), 0) from public.sales_order_items i where i.order_id = o.id),
         o.delivery_address, count(*) over ()
  from public.sales_orders o
  where o.customer_id = cid and o.deleted_at is null and o.status <> 'draft'
    and (p_status is null or o.status = p_status)
  order by o.created_at desc
  limit least(greatest(coalesce(p_limit, 25), 1), 100) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;
revoke all on function public.portal_orders(text, integer, integer) from public, anon;
grant execute on function public.portal_orders(text, integer, integer) to authenticated;

-- One order: header, lines and the customer-visible timeline. Returns NULL for anyone else's order.
create or replace function public.portal_order(p_order uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare cid uuid := public.portal_customer_id(); o public.sales_orders%rowtype;
begin
  if cid is null then return null; end if;
  select * into o from public.sales_orders where id = p_order and customer_id = cid and deleted_at is null and status <> 'draft';
  if not found then return null; end if;
  return jsonb_build_object(
    'id', o.id, 'number', o.number, 'status', o.status, 'currency', o.currency, 'order_date', o.order_date, 'submitted_at', o.submitted_at,
    'delivery_address', o.delivery_address, 'customer_reference', o.customer_reference, 'customer_notes', o.customer_notes,
    'requested_delivery_date', o.requested_delivery_date, 'cancelled_reason', o.cancelled_reason, 'source', o.source,
    'can_cancel', o.status = 'submitted',
    'total', (select coalesce(round(sum(i.quantity * i.unit_price), 2), 0) from public.sales_order_items i where i.order_id = o.id),
    'items', coalesce((select jsonb_agg(jsonb_build_object('line_no', i.line_no, 'product_id', i.product_id, 'description', i.description, 'quantity', i.quantity,
                'unit', u.abbreviation, 'unit_price', i.unit_price, 'line_total', round(i.quantity * i.unit_price, 2)) order by i.line_no)
              from public.sales_order_items i left join public.units u on u.id = i.unit_id where i.order_id = o.id), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object('kind', e.kind, 'title', e.title, 'detail', e.detail, 'at', e.created_at) order by e.created_at, e.id)
              from public.order_events e where e.order_id = o.id and e.customer_visible), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.portal_order(uuid) from public, anon;
grant execute on function public.portal_order(uuid) to authenticated;

create or replace function public.portal_cancel_order(p_order uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare cid uuid := public.portal_require();
begin
  update public.sales_orders set status = 'cancelled', cancelled_reason = left(nullif(btrim(coalesce(p_reason, '')), ''), 300)
  where id = p_order and customer_id = cid and status = 'submitted' and deleted_at is null;
  if not found then raise exception 'Only an order that has not yet been confirmed can be cancelled. Please contact us.' using errcode = 'P0001'; end if;
end;
$$;
revoke all on function public.portal_cancel_order(uuid, text) from public, anon;
grant execute on function public.portal_cancel_order(uuid, text) to authenticated;

create or replace function public.portal_dashboard()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare cid uuid := public.portal_customer_id();
begin
  if cid is null then return null; end if;
  return jsonb_build_object(
    'customer', (select coalesce(company_name, contact_name) from public.customers where id = cid),
    'open_orders', (select count(*) from public.sales_orders where customer_id = cid and deleted_at is null and status in ('submitted', 'confirmed', 'processing', 'partially_delivered')),
    'awaiting_delivery', (select count(distinct d.sales_order_id) from public.deliveries d join public.sales_orders o on o.id = d.sales_order_id where o.customer_id = cid and o.deleted_at is null and d.status in ('scheduled', 'in_transit')),
    'ordered_90_days', (select coalesce(round(sum(i.quantity * i.unit_price), 2), 0) from public.sales_orders o join public.sales_order_items i on i.order_id = o.id
                        where o.customer_id = cid and o.deleted_at is null and o.status not in ('draft', 'cancelled') and o.order_date >= current_date - 90),
    'cart_lines', (select count(*) from public.portal_cart_items where user_id = auth.uid())
  );
end;
$$;
revoke all on function public.portal_dashboard() from public, anon;
grant execute on function public.portal_dashboard() to authenticated;

-- ---------------------------------------------------------------------
-- Staff alerts (rule ships OFF, like every other automation)
-- ---------------------------------------------------------------------
insert into public.automation_rules (key, name, description, category, kind, module, schedule_minutes, params, params_help, sort_order, email_capable) values
  ('portal_staff_alerts', 'Customer portal alerts', 'Tells the sales team when a customer applies for portal access or places an order online.', 'orders', 'event', 'portal', null, '{}', '{}', 130, false)
on conflict (key) do nothing;

create or replace function public.trg_portal_account_alert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status <> 'pending' or not public.auto_rule_active('portal_staff_alerts') then return new; end if;
  perform public.auto_notify_perm('portal_staff_alerts', 'portal.manage', null, 'New portal application: ' || new.company_name,
    'Review and approve or reject it in Customer portal > Accounts.', '/admin/portal/accounts', 'info', 'portal-app:' || new.user_id);
  return new;
exception when others then
  raise warning 'portal alert failed: %', sqlerrm;
  return new;
end;
$$;
revoke all on function public.trg_portal_account_alert() from public, anon, authenticated;
create trigger customer_accounts_alert after insert on public.customer_accounts for each row execute function public.trg_portal_account_alert();

create or replace function public.trg_portal_order_alert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.source = 'staff' or not public.auto_rule_active('portal_staff_alerts') then return new; end if;
  perform public.auto_notify_perm('portal_staff_alerts', 'orders.manage', null, 'New online order ' || new.number,
    'Placed by a customer through the portal. Review and confirm it.', '/admin/orders/sales-orders', 'info', 'portal-order:' || new.id);
  return new;
exception when others then
  raise warning 'portal alert failed: %', sqlerrm;
  return new;
end;
$$;
revoke all on function public.trg_portal_order_alert() from public, anon, authenticated;
create trigger sales_orders_portal_alert after insert on public.sales_orders for each row execute function public.trg_portal_order_alert();
