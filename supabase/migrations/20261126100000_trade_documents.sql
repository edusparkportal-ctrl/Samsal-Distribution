-- Trading & Operations Documents, phase 1: shared foundation + the purchasing chain.
--
--   Purchase Requisition -> RFQ -> Supplier Quotation -> Comparison Sheet -> Purchase Approval -> Purchase Order
--   -> Proforma Invoice -> Payment Voucher -> Payment Confirmation -> Supplier Delivery Note -> GRN
--   -> Inspection Report -> Supplier Tax Invoice
--
-- One engine serves every document type (later phases only add rows to doc_types / doc_flow):
--   * numbering is automatic and gap-free per type and year (PR-2026-00001)
--   * every change is written to the document's own event trail, plus the global audit log
--   * documents that commit money go through the approvals engine; the approver can never be the preparer
--   * issuing a Purchase Order creates the real purchase_orders row; a GRN receives stock and updates the PO;
--     a Supplier Tax Invoice creates the supplier bill. Each next document can be created automatically.
-- All writes go through the SECURITY DEFINER functions below; the tables allow staff to read only.

-- ---------------------------------------------------------------------
-- Module, permissions, roles
-- ---------------------------------------------------------------------
insert into public.modules (key, name, description, is_core, enabled, sort_order) values
  ('trade', 'Trade documents', 'Procurement, sales, warehouse, logistics, finance, quality and contract documents: numbered, approved, signed, linked and archived.', false, true, 28)
on conflict (key) do nothing;

insert into public.permissions (key, module, description) values
  ('trade.view',        'trade', 'View trade documents and the archive'),
  ('trade.procurement', 'trade', 'Prepare and issue procurement documents'),
  ('trade.sales',       'trade', 'Prepare and issue sales documents'),
  ('trade.warehouse',   'trade', 'Prepare and issue warehouse documents (GRN, picking, packing, adjustments)'),
  ('trade.logistics',   'trade', 'Prepare and issue logistics documents'),
  ('trade.finance',     'trade', 'Prepare and issue finance documents (vouchers, confirmations, invoices, receipts)'),
  ('trade.quality',     'trade', 'Prepare and issue inspection and quality documents'),
  ('trade.contracts',   'trade', 'Prepare and issue contracts and tender documents'),
  ('trade.approve',     'trade', 'Approve requisitions and purchases'),
  ('trade.approve_payment', 'trade', 'Approve payment vouchers'),
  ('trade.manage',      'trade', 'Cancel any document and change document settings')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_key)
select r.id, p.perm
from public.roles r
join (values
  ('procurement_manager', 'trade.view'), ('procurement_manager', 'trade.procurement'), ('procurement_manager', 'trade.warehouse'),
  ('inventory_manager',   'trade.view'), ('inventory_manager',   'trade.warehouse'),   ('inventory_manager',   'trade.quality'), ('inventory_manager', 'trade.logistics'),
  ('sales_manager',       'trade.view'), ('sales_manager',       'trade.sales'),       ('sales_manager',       'trade.contracts'), ('sales_manager', 'trade.logistics'),
  ('finance_manager',     'trade.view'), ('finance_manager',     'trade.finance'),     ('finance_manager',     'trade.approve_payment'),
  ('accountant',          'trade.view'), ('accountant',          'trade.finance'),
  ('director',            'trade.view'), ('director',            'trade.approve'),     ('director',            'trade.approve_payment')
) as p(role_key, perm) on p.role_key = r.key
on conflict do nothing;

-- ---------------------------------------------------------------------
-- Catalogue of document types and how they follow each other
-- ---------------------------------------------------------------------
create table public.doc_types (
  key          text primary key check (key ~ '^[a-z_]+$'),
  name         text not null,
  module_group text not null check (module_group in ('procurement', 'sales', 'warehouse', 'logistics', 'finance', 'quality', 'contracts')),
  chain        text not null check (chain in ('purchasing', 'sales', 'returns', 'tenders')),
  prefix       text not null check (prefix ~ '^[A-Z]{2,5}$') unique,
  step_no      integer not null,
  party        text not null check (party in ('supplier', 'customer', 'none')),
  permission   text not null references public.permissions(key) on update cascade,
  approval_subject text,                      -- when set, issuing needs approval under this policy subject
  has_lines    boolean not null default true,
  has_prices   boolean not null default true,
  description  text,
  sort_order   integer not null default 0
);

create table public.doc_flow (
  from_type  text not null references public.doc_types(key) on delete cascade,
  to_type    text not null references public.doc_types(key) on delete cascade,
  auto       boolean not null default true,   -- created automatically when the earlier document is completed/approved
  primary key (from_type, to_type)
);

insert into public.doc_types (key, name, module_group, chain, prefix, step_no, party, permission, approval_subject, has_lines, has_prices, description, sort_order) values
  ('purchase_requisition',  'Purchase Requisition',   'procurement', 'purchasing', 'PR',  1,  'none',     'trade.procurement', 'trade_requisition', true,  false, 'Internal request to buy items, with quantities and the reason.', 10),
  ('rfq',                   'Request for Quotation',  'procurement', 'purchasing', 'RFQ', 2,  'supplier', 'trade.procurement', null,                true,  false, 'Sent to a supplier asking for a price on the requisitioned items.', 20),
  ('supplier_quotation',    'Supplier Quotation',     'procurement', 'purchasing', 'SQT', 3,  'supplier', 'trade.procurement', null,                true,  true,  'A supplier''s priced answer to an RFQ.', 30),
  ('comparison_sheet',      'Comparison Sheet',       'procurement', 'purchasing', 'CMP', 4,  'none',     'trade.procurement', null,                true,  true,  'Supplier quotations side by side, with the chosen supplier and the reason.', 40),
  ('purchase_approval',     'Purchase Approval',      'procurement', 'purchasing', 'PAP', 5,  'supplier', 'trade.procurement', 'trade_purchase',    true,  true,  'Authority to buy from the chosen supplier at the compared price.', 50),
  ('purchase_order',        'Purchase Order',         'procurement', 'purchasing', 'LPO', 6,  'supplier', 'trade.procurement', null,                true,  true,  'The order sent to the supplier. Issuing it creates the purchase order record.', 60),
  ('proforma_invoice',      'Proforma Invoice',       'finance',     'purchasing', 'PFI', 7,  'supplier', 'trade.finance',     null,                true,  true,  'The supplier''s proforma invoice, received before payment.', 70),
  ('payment_voucher',       'Payment Voucher',        'finance',     'purchasing', 'PV',  8,  'supplier', 'trade.finance',     'trade_payment',     false, true,  'Authority to pay the supplier. Needs approval.', 80),
  ('payment_confirmation',  'Payment Confirmation',   'finance',     'purchasing', 'PCF', 9,  'supplier', 'trade.finance',     null,                false, true,  'Proof that the supplier was paid (bank or M-Pesa reference).', 90),
  ('supplier_delivery_note','Supplier Delivery Note', 'logistics',   'purchasing', 'SDN', 10, 'supplier', 'trade.logistics',   null,                true,  false, 'The supplier''s delivery note that arrives with the goods.', 100),
  ('grn',                   'Goods Received Note',    'warehouse',   'purchasing', 'GRN', 11, 'supplier', 'trade.warehouse',   null,                true,  false, 'Goods counted into the warehouse. Issuing it adds the stock and updates the purchase order.', 110),
  ('inspection_report',     'Inspection Report',      'quality',     'purchasing', 'INS', 12, 'supplier', 'trade.quality',     null,                true,  false, 'Quality inspection of the received goods: accepted and rejected quantities.', 120),
  ('supplier_tax_invoice',  'Supplier Tax Invoice',   'finance',     'purchasing', 'STI', 13, 'supplier', 'trade.finance',     null,                true,  true,  'The supplier''s final tax invoice. Issuing it creates the supplier bill.', 130);

insert into public.doc_flow (from_type, to_type) values
  ('purchase_requisition', 'rfq'), ('rfq', 'supplier_quotation'), ('supplier_quotation', 'comparison_sheet'),
  ('comparison_sheet', 'purchase_approval'), ('purchase_approval', 'purchase_order'), ('purchase_order', 'proforma_invoice'),
  ('proforma_invoice', 'payment_voucher'), ('payment_voucher', 'payment_confirmation'), ('payment_confirmation', 'supplier_delivery_note'),
  ('supplier_delivery_note', 'grn'), ('grn', 'inspection_report'), ('inspection_report', 'supplier_tax_invoice');

-- Approval policy subjects for the new documents (widen the constraints, then add default policies)
alter table public.approval_policies drop constraint approval_policies_subject_check;
alter table public.approval_policies add constraint approval_policies_subject_check
  check (subject in ('leave', 'expense', 'bill', 'payroll', 'trade_requisition', 'trade_purchase', 'trade_payment'));
alter table public.approval_requests drop constraint approval_requests_subject_check;
alter table public.approval_requests add constraint approval_requests_subject_check
  check (subject in ('leave', 'expense', 'bill', 'payroll', 'trade_requisition', 'trade_purchase', 'trade_payment'));

do $$
declare pid uuid;
begin
  insert into public.approval_policies (subject, name) values ('trade_requisition', 'Purchase requisitions: director approval') returning id into pid;
  insert into public.approval_policy_steps (policy_id, step_no, label, approver_type, permission_key) values (pid, 1, 'Approver', 'permission', 'trade.approve');
  insert into public.approval_policies (subject, name) values ('trade_purchase', 'Purchase approvals: director approval') returning id into pid;
  insert into public.approval_policy_steps (policy_id, step_no, label, approver_type, permission_key) values (pid, 1, 'Approver', 'permission', 'trade.approve');
  insert into public.approval_policies (subject, name) values ('trade_payment', 'Payment vouchers: finance approval') returning id into pid;
  insert into public.approval_policy_steps (policy_id, step_no, label, approver_type, permission_key) values (pid, 1, 'Finance approver', 'permission', 'trade.approve_payment');
end $$;

-- Automation switch for the "next document is created for you" behaviour
insert into public.automation_rules
  (key, name, description, category, kind, module, schedule_minutes, params, params_help, email_capable, sort_order) values
  ('trade_auto_next', 'Create the next trade document automatically',
   'When a trade document is issued or approved, creates the next document in its chain as a draft with the details carried over, and tells the people who prepare it. Switch off to create each next document by hand.',
   'procurement', 'event', 'trade', null, '{}', '{}', false, 45)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- Numbering
-- ---------------------------------------------------------------------
create table public.doc_counters (
  doc_type text not null references public.doc_types(key) on delete cascade,
  year     integer not null,
  last_no  integer not null default 0,
  primary key (doc_type, year)
);

create or replace function public.trade_next_number(p_type text)
returns text language plpgsql security definer set search_path = public as $$
declare pfx text; yr integer := extract(year from now())::integer; n integer;
begin
  select prefix into pfx from public.doc_types where key = p_type;
  if pfx is null then raise exception 'Unknown document type'; end if;
  insert into public.doc_counters (doc_type, year, last_no) values (p_type, yr, 1)
  on conflict (doc_type, year) do update set last_no = public.doc_counters.last_no + 1
  returning last_no into n;
  return pfx || '-' || yr || '-' || lpad(n::text, 5, '0');
end;
$$;

-- ---------------------------------------------------------------------
-- Documents
-- ---------------------------------------------------------------------
create table public.trade_docs (
  id             uuid primary key default gen_random_uuid(),
  doc_type       text not null references public.doc_types(key),
  number         text not null unique,
  status         text not null default 'draft' check (status in ('draft', 'pending_approval', 'approved', 'rejected', 'issued', 'completed', 'cancelled')),
  title          text check (title is null or length(title) <= 200),
  reference      text check (reference is null or length(reference) <= 120),     -- the other party's own number
  supplier_id    uuid references public.suppliers(id) on delete restrict,
  customer_id    uuid references public.customers(id) on delete restrict,
  parent_id      uuid references public.trade_docs(id) on delete set null,
  root_id        uuid,                                                           -- first document of the chain
  po_id          uuid references public.purchase_orders(id) on delete set null,
  bill_id        uuid references public.supplier_bills(id) on delete set null,
  warehouse_id   uuid references public.warehouses(id) on delete set null,
  currency       text not null default 'KES' check (currency ~ '^[A-Z]{3}$'),
  doc_date       date not null default current_date,
  due_date       date,
  total          numeric(16,2) not null default 0 check (total >= 0),
  notes          text check (notes is null or length(notes) <= 2000),
  data           jsonb not null default '{}'::jsonb,                             -- type-specific fields
  approval_id    uuid,
  created_by     uuid references public.profiles(id) on delete set null,
  issued_by      uuid references public.profiles(id) on delete set null,
  issued_at      timestamptz,
  completed_at   timestamptz,
  cancel_reason  text,
  deleted_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index trade_docs_type_idx on public.trade_docs(doc_type, status);
create index trade_docs_root_idx on public.trade_docs(root_id);
create index trade_docs_parent_idx on public.trade_docs(parent_id);
create index trade_docs_supplier_idx on public.trade_docs(supplier_id);
create index trade_docs_customer_idx on public.trade_docs(customer_id);
create index trade_docs_po_idx on public.trade_docs(po_id);
create index trade_docs_search_idx on public.trade_docs using gin (to_tsvector('simple', coalesce(number, '') || ' ' || coalesce(title, '') || ' ' || coalesce(reference, '')));

create table public.trade_doc_lines (
  id           uuid primary key default gen_random_uuid(),
  doc_id       uuid not null references public.trade_docs(id) on delete cascade,
  line_no      integer not null check (line_no > 0),
  product_id   uuid references public.products(id) on delete set null,
  variant_id   uuid references public.product_variants(id) on delete set null,
  po_item_id   uuid references public.purchase_order_items(id) on delete set null,
  description  text not null check (length(description) between 1 and 300),
  quantity     numeric(14,3) not null check (quantity > 0),
  accepted_qty numeric(14,3) check (accepted_qty is null or accepted_qty >= 0),
  unit_id      uuid references public.units(id) on delete set null,
  unit_price   numeric(14,2) not null default 0 check (unit_price >= 0),
  note         text,
  unique (doc_id, line_no)
);

create table public.trade_doc_events (
  id        uuid primary key default gen_random_uuid(),
  doc_id    uuid not null references public.trade_docs(id) on delete cascade,
  at        timestamptz not null default now(),
  actor     uuid references public.profiles(id) on delete set null,
  action    text not null,
  detail    text
);
create index trade_doc_events_doc_idx on public.trade_doc_events(doc_id, at);

create table public.trade_doc_signatures (
  id          uuid primary key default gen_random_uuid(),
  doc_id      uuid not null references public.trade_docs(id) on delete cascade,
  role        text not null check (length(role) between 1 and 60),
  signer_name text not null check (length(signer_name) between 2 and 120),
  signed_by   uuid references public.profiles(id) on delete set null,
  signed_at   timestamptz not null default now(),
  unique (doc_id, role)
);

create trigger trade_docs_updated before update on public.trade_docs for each row execute function public.set_updated_at();
create trigger trade_docs_audit after insert or update or delete on public.trade_docs for each row execute function public.audit_row('full');

alter table public.doc_types enable row level security;
alter table public.doc_flow enable row level security;
alter table public.doc_counters enable row level security;
alter table public.trade_docs enable row level security;
alter table public.trade_doc_lines enable row level security;
alter table public.trade_doc_events enable row level security;
alter table public.trade_doc_signatures enable row level security;

create policy doc_types_read on public.doc_types for select to authenticated using (public.can('trade.view', 'trade'));
create policy doc_flow_read on public.doc_flow for select to authenticated using (public.can('trade.view', 'trade'));
create policy trade_docs_read on public.trade_docs for select to authenticated using (public.can('trade.view', 'trade') and deleted_at is null);
create policy trade_lines_read on public.trade_doc_lines for select to authenticated
  using (public.can('trade.view', 'trade') and exists (select 1 from public.trade_docs d where d.id = doc_id and d.deleted_at is null));
create policy trade_events_read on public.trade_doc_events for select to authenticated using (public.can('trade.view', 'trade'));
create policy trade_sigs_read on public.trade_doc_signatures for select to authenticated using (public.can('trade.view', 'trade'));

grant select on public.doc_types, public.doc_flow, public.trade_docs, public.trade_doc_lines, public.trade_doc_events, public.trade_doc_signatures to authenticated;

-- Staff who prepare trade documents need to read the parties and products (read only; the module must be on).
create policy suppliers_trade_read on public.suppliers for select to authenticated
  using (public.can('trade.procurement', 'trade') or public.can('trade.finance', 'trade') or public.can('trade.warehouse', 'trade') or public.can('trade.quality', 'trade') or public.can('trade.manage', 'trade'));
create policy customers_trade_read on public.customers for select to authenticated
  using (public.can('trade.sales', 'trade') or public.can('trade.finance', 'trade') or public.can('trade.logistics', 'trade') or public.can('trade.contracts', 'trade') or public.can('trade.warehouse', 'trade') or public.can('trade.manage', 'trade'));

-- The purchase-order approval guard also accepts a purchase order created by the trade module, which sets a
-- transaction-local flag only after finding an approved Purchase Approval document for the same chain.
create or replace function public.guard_po_approval()
returns trigger language plpgsql security definer set search_path = public as $$
declare was_unapproved boolean := true;
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' and coalesce(current_setting('app.trade_po', true), '') = 'on' then
    new.approved_by := auth.uid();
    new.approved_at := now();
    return new;
  end if;
  if tg_op = 'UPDATE' then
    was_unapproved := old.status in ('draft','pending_approval','cancelled');
  end if;
  if new.status in ('approved','sent','partially_received','received') and was_unapproved then
    if not public.has_permission('purchasing.approve') then
      raise exception 'Purchase order approval requires the purchasing.approve permission';
    end if;
    if new.created_by = auth.uid() and not public.is_super_admin() then
      raise exception 'A purchase order cannot be approved by the person who created it';
    end if;
    new.approved_by := auth.uid();
    new.approved_at := now();
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------
create or replace function public.trade_log(p_doc uuid, p_action text, p_detail text default null)
returns void language sql security definer set search_path = public as $$
  insert into public.trade_doc_events (doc_id, actor, action, detail) values (p_doc, auth.uid(), p_action, left(p_detail, 500));
$$;

create or replace function public.trade_can_write(p_type text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare perm text;
begin
  select permission into perm from public.doc_types where key = p_type;
  return perm is not null and (public.can(perm, 'trade') or public.can('trade.manage', 'trade'));
end;
$$;

-- Replaces the lines of a document from a JSON array and recomputes the total.
create or replace function public.trade_set_lines(p_doc uuid, p_lines jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare l jsonb; n integer := 0; q numeric; pr numeric;
begin
  delete from public.trade_doc_lines where doc_id = p_doc;
  for l in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    continue when length(btrim(coalesce(l ->> 'description', ''))) = 0;
    n := n + 1;
    q := coalesce(nullif(l ->> 'quantity', '')::numeric, 0);
    if q <= 0 then raise exception 'Line %: enter a quantity above zero', n; end if;
    pr := coalesce(nullif(l ->> 'unit_price', '')::numeric, 0);
    if pr < 0 then raise exception 'Line %: the price cannot be negative', n; end if;
    insert into public.trade_doc_lines (doc_id, line_no, product_id, variant_id, po_item_id, description, quantity, accepted_qty, unit_id, unit_price, note)
    values (p_doc, n, nullif(l ->> 'product_id', '')::uuid, nullif(l ->> 'variant_id', '')::uuid, nullif(l ->> 'po_item_id', '')::uuid,
            left(btrim(l ->> 'description'), 300), q, nullif(l ->> 'accepted_qty', '')::numeric, nullif(l ->> 'unit_id', '')::uuid, pr, nullif(btrim(coalesce(l ->> 'note', '')), ''));
  end loop;
  update public.trade_docs set total = coalesce((select round(sum(quantity * unit_price), 2) from public.trade_doc_lines where doc_id = p_doc), 0) where id = p_doc;
end;
$$;

-- Lines for a follow-on document: those of the nearest earlier document in the chain that has lines.
create or replace function public.trade_source_lines(p_doc uuid, p_prices boolean)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare cur uuid := p_doc; res jsonb; guard integer := 0;
begin
  while cur is not null and guard < 30 loop
    select jsonb_agg(jsonb_build_object('product_id', l.product_id, 'variant_id', l.variant_id, 'po_item_id', l.po_item_id,
      'description', l.description, 'quantity', l.quantity, 'unit_id', l.unit_id,
      'unit_price', case when p_prices then l.unit_price else 0 end) order by l.line_no)
      into res from public.trade_doc_lines l where l.doc_id = cur;
    if res is not null then return res; end if;
    select parent_id into cur from public.trade_docs where id = cur;
    guard := guard + 1;
  end loop;
  return '[]'::jsonb;
end;
$$;

-- ---------------------------------------------------------------------
-- Create / update (drafts only)
-- ---------------------------------------------------------------------
create or replace function public.trade_create_doc(
  p_type text, p_parent uuid default null, p_supplier uuid default null, p_customer uuid default null,
  p_title text default null, p_reference text default null, p_doc_date date default null, p_due_date date default null,
  p_currency text default null, p_notes text default null, p_data jsonb default null, p_lines jsonb default null, p_warehouse uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare t public.doc_types%rowtype; par public.trade_docs%rowtype; new_id uuid; lines jsonb := p_lines; num text;
begin
  if auth.uid() is null or not public.is_staff() then raise exception 'Not permitted'; end if;
  select * into t from public.doc_types where key = p_type;
  if not found then raise exception 'Unknown document type'; end if;
  if not public.trade_can_write(p_type) then raise exception 'Not permitted'; end if;
  if p_parent is not null then
    select * into par from public.trade_docs where id = p_parent and deleted_at is null;
    if not found then raise exception 'The earlier document was not found'; end if;
    if par.status = 'cancelled' then raise exception 'The earlier document was cancelled'; end if;
    if not exists (select 1 from public.doc_flow f where f.from_type = par.doc_type and f.to_type = p_type) then
      raise exception '% cannot follow %', t.name, (select name from public.doc_types where key = par.doc_type);
    end if;
  end if;

  if lines is null and p_parent is not null then
    lines := public.trade_source_lines(p_parent, t.has_prices);
  end if;

  num := public.trade_next_number(p_type);
  insert into public.trade_docs (doc_type, number, title, reference, supplier_id, customer_id, parent_id, root_id, po_id, warehouse_id,
                                 currency, doc_date, due_date, notes, data, created_by)
  values (p_type, num, nullif(btrim(coalesce(p_title, par.title, '')), ''), nullif(btrim(coalesce(p_reference, '')), ''),
          coalesce(p_supplier, par.supplier_id), coalesce(p_customer, par.customer_id), p_parent, par.root_id, par.po_id,
          coalesce(p_warehouse, par.warehouse_id), coalesce(nullif(p_currency, ''), par.currency, 'KES'),
          coalesce(p_doc_date, current_date), p_due_date, nullif(btrim(coalesce(p_notes, '')), ''), coalesce(p_data, '{}'::jsonb), auth.uid())
  returning trade_docs.id into new_id;
  update public.trade_docs set root_id = coalesce(root_id, new_id) where trade_docs.id = new_id;
  if lines is not null and t.has_lines then perform public.trade_set_lines(new_id, lines);
  elsif t.has_prices and not t.has_lines then
    -- amount-only documents (voucher, confirmation): the amount is typed in, or carried over from the earlier document
    update public.trade_docs set total = coalesce(round((p_lines -> 0 ->> 'unit_price')::numeric, 2), par.total, 0) where trade_docs.id = new_id;
  end if;
  perform public.trade_log(new_id, 'created', num || case when p_parent is not null then ' (from ' || par.number || ')' else '' end);
  return new_id;
end;
$$;

create or replace function public.trade_update_doc(
  p_doc uuid, p_supplier uuid, p_customer uuid, p_title text, p_reference text, p_doc_date date, p_due_date date,
  p_currency text, p_notes text, p_data jsonb, p_lines jsonb, p_warehouse uuid
) returns void language plpgsql security definer set search_path = public as $$
declare d public.trade_docs%rowtype; t public.doc_types%rowtype;
begin
  select * into d from public.trade_docs where id = p_doc and deleted_at is null for update;
  if not found then raise exception 'Document not found'; end if;
  if not public.trade_can_write(d.doc_type) then raise exception 'Not permitted'; end if;
  if d.status not in ('draft', 'rejected') then raise exception 'Only a draft can be edited. Cancel it and raise a new one if it must change.'; end if;
  select * into t from public.doc_types where key = d.doc_type;
  update public.trade_docs set supplier_id = p_supplier, customer_id = p_customer, title = nullif(btrim(coalesce(p_title, '')), ''),
    reference = nullif(btrim(coalesce(p_reference, '')), ''), doc_date = coalesce(p_doc_date, doc_date), due_date = p_due_date,
    currency = coalesce(nullif(p_currency, ''), currency), notes = nullif(btrim(coalesce(p_notes, '')), ''),
    data = coalesce(p_data, data), warehouse_id = p_warehouse, status = 'draft'
   where id = p_doc;
  if p_lines is not null and t.has_lines then perform public.trade_set_lines(p_doc, p_lines);
  elsif t.has_prices and not t.has_lines and p_lines is not null then
    update public.trade_docs set total = greatest(coalesce(round((p_lines -> 0 ->> 'unit_price')::numeric, 2), 0), 0) where id = p_doc;
  end if;
  perform public.trade_log(p_doc, 'edited', null);
end;
$$;

-- ---------------------------------------------------------------------
-- Next document in the chain
-- ---------------------------------------------------------------------
create or replace function public.trade_next_doc(p_doc uuid, p_type text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare d public.trade_docs%rowtype; nxt text; nid uuid;
begin
  if auth.uid() is null or not public.is_staff() then raise exception 'Not permitted'; end if;
  select * into d from public.trade_docs where id = p_doc and deleted_at is null;
  if not found then raise exception 'Document not found'; end if;
  if d.status not in ('approved', 'issued', 'completed') then raise exception 'Issue or approve this document before creating the next one'; end if;
  nxt := coalesce(p_type, (select to_type from public.doc_flow where from_type = d.doc_type order by to_type limit 1));
  if nxt is null then raise exception 'This is the last step of the chain'; end if;
  select id into nid from public.trade_docs where parent_id = d.id and doc_type = nxt and status <> 'cancelled' and deleted_at is null limit 1;
  if nid is not null then return nid; end if;
  return public.trade_create_doc(nxt, d.id);
end;
$$;

-- Same, but run by the system after an issue/approval (no permission check; failures never block the issue).
create or replace function public.trade_auto_advance(p_doc uuid)
returns void language plpgsql security definer set search_path = public as $$
declare d public.trade_docs%rowtype; f record; t public.doc_types%rowtype; nid uuid; num text; par public.trade_docs%rowtype; lines jsonb;
begin
  if not public.auto_rule_active('trade_auto_next') then return; end if;
  select * into d from public.trade_docs where id = p_doc;
  for f in select * from public.doc_flow where from_type = d.doc_type and auto order by to_type loop
    continue when exists (select 1 from public.trade_docs x where x.parent_id = d.id and x.doc_type = f.to_type and x.status <> 'cancelled' and x.deleted_at is null);
    select * into t from public.doc_types where key = f.to_type;
    continue when t.party = 'supplier' and d.supplier_id is null;
    continue when t.party = 'customer' and d.customer_id is null;
    lines := public.trade_source_lines(d.id, t.has_prices);
    num := public.trade_next_number(f.to_type);
    insert into public.trade_docs (doc_type, number, title, supplier_id, customer_id, parent_id, root_id, po_id, warehouse_id, currency, data, created_by)
    values (f.to_type, num, d.title, d.supplier_id, d.customer_id, d.id, d.root_id, d.po_id, d.warehouse_id, d.currency, '{}'::jsonb, null)
    returning id into nid;
    if t.has_lines then perform public.trade_set_lines(nid, lines);
    elsif t.has_prices then update public.trade_docs set total = d.total where id = nid; end if;
    insert into public.trade_doc_events (doc_id, actor, action, detail) values (nid, null, 'created', num || ' (automatically, from ' || d.number || ')');
    perform public.auto_notify_perm('trade_auto_next', t.permission, null, 'Next document ready: ' || t.name, num || ' was created from ' || d.number || '. Review and complete it.', '/admin/trade/doc/' || nid, 'info', 'trade-next:' || nid);
    perform public.auto_record_event('trade_auto_next', 1);
  end loop;
exception when others then
  perform public.auto_record_failure('trade_auto_next', sqlerrm);
end;
$$;

-- ---------------------------------------------------------------------
-- Submit / issue / complete / cancel / sign
-- ---------------------------------------------------------------------

-- Side effects of issuing, by type. Runs inside trade_issue_internal.
create or replace function public.trade_apply_issue(p_doc uuid)
returns void language plpgsql security definer set search_path = public as $$
declare d public.trade_docs%rowtype; l record; poid uuid; item uuid; billid uuid; ln integer := 0; mv integer := 0;
  need numeric; allr boolean; wh uuid;
begin
  select * into d from public.trade_docs where id = p_doc;

  if d.doc_type = 'purchase_order' then
    if d.total <= 0 then raise exception 'Add priced lines before issuing the purchase order'; end if;
    if not exists (select 1 from public.trade_docs a where a.root_id = d.root_id and a.doc_type = 'purchase_approval' and a.status in ('approved', 'issued', 'completed') and a.deleted_at is null) then
      raise exception 'The purchase has not been approved yet. Complete the Purchase Approval first.';
    end if;
    perform set_config('app.trade_po', 'on', true);
    insert into public.purchase_orders (supplier_id, status, currency, order_date, expected_date, notes, created_by, approved_by, approved_at)
    values (d.supplier_id, 'sent', d.currency, current_date, d.due_date, 'Created from ' || d.number, d.created_by, auth.uid(), now())
    returning id into poid;
    perform set_config('app.trade_po', 'off', true);
    for l in select * from public.trade_doc_lines where doc_id = d.id order by line_no loop
      ln := ln + 1;
      insert into public.purchase_order_items (po_id, line_no, product_id, description, quantity, unit_id, unit_price)
      values (poid, ln, l.product_id, l.description, l.quantity, l.unit_id, l.unit_price) returning id into item;
      update public.trade_doc_lines set po_item_id = item where id = l.id;
    end loop;
    update public.trade_docs set po_id = poid where root_id = d.root_id and po_id is null;
    update public.trade_docs set po_id = poid where id = d.id;
    perform public.trade_log(d.id, 'purchase order created', (select number from public.purchase_orders where id = poid));

  elsif d.doc_type = 'grn' then
    if d.po_id is null then raise exception 'This GRN is not linked to a purchase order'; end if;
    wh := d.warehouse_id;
    for l in select * from public.trade_doc_lines where doc_id = d.id order by line_no loop
      if l.po_item_id is not null then
        select quantity - received_quantity into need from public.purchase_order_items where id = l.po_item_id and po_id = d.po_id;
        if need is null then raise exception 'Line %: not part of the linked purchase order', l.line_no; end if;
        if l.quantity > need then raise exception 'Line %: % received but only % still expected on the purchase order', l.line_no, l.quantity, need; end if;
        update public.purchase_order_items set received_quantity = received_quantity + l.quantity where id = l.po_item_id;
      end if;
      if l.variant_id is not null then
        if wh is null then raise exception 'Choose the warehouse the goods were received into'; end if;
        insert into public.stock_movements (variant_id, warehouse_id, movement_type, quantity, reference_type, reference_id, note, created_by)
        values (l.variant_id, wh, 'receipt', l.quantity, 'purchase_order', d.po_id, d.number, auth.uid());
        mv := mv + 1;
      end if;
    end loop;
    select bool_and(received_quantity >= quantity) into allr from public.purchase_order_items where po_id = d.po_id;
    update public.purchase_orders set status = case when coalesce(allr, false) then 'received' else 'partially_received' end
     where id = d.po_id and status in ('sent', 'approved', 'partially_received');
    perform public.trade_log(d.id, 'stock received', mv || ' stock line(s) posted; purchase order updated');

  elsif d.doc_type = 'supplier_tax_invoice' then
    select id into billid from public.supplier_bills where purchase_order_id = d.po_id and status <> 'void' limit 1;
    if billid is null then
      insert into public.supplier_bills (supplier_id, purchase_order_id, supplier_reference, status, currency, bill_date, due_date, amount, description, created_by)
      values (d.supplier_id, d.po_id, d.reference, 'draft', d.currency, d.doc_date, d.due_date, d.total, 'Created from ' || d.number, auth.uid())
      returning id into billid;
      perform public.trade_log(d.id, 'supplier bill created', null);
    else
      perform public.trade_log(d.id, 'linked to existing supplier bill', null);
    end if;
    update public.trade_docs set bill_id = billid where id = d.id;

  elsif d.doc_type = 'payment_confirmation' then
    if length(btrim(coalesce(d.data ->> 'payment_reference', ''))) < 3 then raise exception 'Enter the payment reference from the bank or M-Pesa'; end if;
    if d.parent_id is not null then
      update public.trade_docs set status = 'completed', completed_at = now() where id = d.parent_id and doc_type = 'payment_voucher' and status = 'issued';
    end if;

  elsif d.doc_type = 'inspection_report' then
    if exists (select 1 from public.trade_doc_lines where doc_id = d.id and accepted_qty is null) then
      raise exception 'Enter the accepted quantity on every line (0 if all were rejected)';
    end if;
    if exists (select 1 from public.trade_doc_lines where doc_id = d.id and accepted_qty > quantity) then
      raise exception 'Accepted quantity cannot be more than the quantity inspected';
    end if;
  end if;
end;
$$;

create or replace function public.trade_issue_internal(p_doc uuid)
returns void language plpgsql security definer set search_path = public as $$
declare d public.trade_docs%rowtype; t public.doc_types%rowtype;
begin
  select * into d from public.trade_docs where id = p_doc for update;
  select * into t from public.doc_types where key = d.doc_type;
  if t.has_lines and not exists (select 1 from public.trade_doc_lines where doc_id = d.id) then raise exception 'Add at least one line before issuing'; end if;
  perform public.trade_apply_issue(p_doc);
  update public.trade_docs set status = 'issued', issued_by = auth.uid(), issued_at = now() where id = p_doc;
  perform public.trade_log(p_doc, 'issued', null);
  perform public.trade_auto_advance(p_doc);
end;
$$;

-- Prepare -> (approval) -> issue
create or replace function public.trade_submit(p_doc uuid)
returns text language plpgsql security definer set search_path = public as $$
declare d public.trade_docs%rowtype; t public.doc_types%rowtype; rid uuid;
begin
  select * into d from public.trade_docs where id = p_doc and deleted_at is null for update;
  if not found then raise exception 'Document not found'; end if;
  if not public.trade_can_write(d.doc_type) then raise exception 'Not permitted'; end if;
  if d.status not in ('draft', 'rejected') then raise exception 'This document has already been submitted'; end if;
  select * into t from public.doc_types where key = d.doc_type;
  if t.party = 'supplier' and d.supplier_id is null then raise exception 'Choose the supplier first'; end if;
  if t.party = 'customer' and d.customer_id is null then raise exception 'Choose the customer first'; end if;
  if t.has_lines and not exists (select 1 from public.trade_doc_lines where doc_id = d.id) then raise exception 'Add at least one line first'; end if;
  if d.doc_type = 'payment_voucher' and d.total <= 0 then raise exception 'Enter the amount to pay'; end if;
  if t.approval_subject is null then
    perform public.trade_issue_internal(p_doc);
    return 'issued';
  end if;
  rid := public.approval_submit(t.approval_subject, d.id, d.total, null, auth.uid(), t.name || ' ' || d.number,
    t.name || ' ' || d.number || coalesce(' - ' || d.title, '') || ' (' || d.currency || ' ' || d.total || ')', '/admin/trade/doc/' || d.id);
  update public.trade_docs set status = 'pending_approval', approval_id = rid where id = d.id;
  perform public.trade_log(d.id, 'submitted for approval', null);
  return 'pending_approval';
end;
$$;

-- Outcome of the approvals engine
create or replace function public.trade_apply_approval(p_record uuid, p_outcome text)
returns void language plpgsql security definer set search_path = public as $$
declare d public.trade_docs%rowtype;
begin
  select * into d from public.trade_docs where id = p_record;
  if not found or d.status <> 'pending_approval' then return; end if;
  if p_outcome = 'approved' then
    update public.trade_docs set status = 'approved' where id = p_record;
    perform public.trade_log(p_record, 'approved', null);
    -- A requisition or purchase approval is complete once approved; a voucher still has to be issued deliberately.
    if d.doc_type in ('purchase_requisition', 'purchase_approval', 'payment_voucher') then
      update public.trade_docs set status = 'issued', issued_by = coalesce(
        (select decided_by from public.approval_decisions where request_id = d.approval_id order by decided_at desc limit 1), issued_by), issued_at = now() where id = p_record;
      perform public.trade_log(p_record, 'issued', 'on approval');
      perform public.trade_auto_advance(p_record);
    end if;
  else
    update public.trade_docs set status = 'rejected' where id = p_record;
    perform public.trade_log(p_record, 'rejected', (select string_agg(comment, ' ') from public.approval_decisions where request_id = d.approval_id and decision = 'rejected'));
  end if;
end;
$$;
create or replace function public.approval_apply_trade_requisition(p_record uuid, p_outcome text, p_request uuid) returns void language sql security definer set search_path = public as $$ select public.trade_apply_approval(p_record, p_outcome); $$;
create or replace function public.approval_apply_trade_purchase(p_record uuid, p_outcome text, p_request uuid) returns void language sql security definer set search_path = public as $$ select public.trade_apply_approval(p_record, p_outcome); $$;
create or replace function public.approval_apply_trade_payment(p_record uuid, p_outcome text, p_request uuid) returns void language sql security definer set search_path = public as $$ select public.trade_apply_approval(p_record, p_outcome); $$;

create or replace function public.trade_complete(p_doc uuid)
returns void language plpgsql security definer set search_path = public as $$
declare d public.trade_docs%rowtype;
begin
  select * into d from public.trade_docs where id = p_doc and deleted_at is null for update;
  if not found then raise exception 'Document not found'; end if;
  if not public.trade_can_write(d.doc_type) then raise exception 'Not permitted'; end if;
  if d.status <> 'issued' then raise exception 'Only an issued document can be marked complete'; end if;
  update public.trade_docs set status = 'completed', completed_at = now() where id = p_doc;
  perform public.trade_log(p_doc, 'completed', null);
end;
$$;

create or replace function public.trade_cancel(p_doc uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare d public.trade_docs%rowtype;
begin
  select * into d from public.trade_docs where id = p_doc and deleted_at is null for update;
  if not found then raise exception 'Document not found'; end if;
  if not public.trade_can_write(d.doc_type) then raise exception 'Not permitted'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'Say why it is being cancelled'; end if;
  if d.status = 'cancelled' then return; end if;
  if d.doc_type in ('grn') and d.status in ('issued', 'completed') then
    raise exception 'A received GRN cannot be cancelled. Record a stock adjustment or return instead.';
  end if;
  if d.status in ('issued', 'completed') and not public.can('trade.manage', 'trade') then
    raise exception 'Only a document manager can cancel an issued document';
  end if;
  if d.status = 'pending_approval' and d.approval_id is not null then
    update public.approval_requests set status = 'cancelled' where id = d.approval_id and status = 'pending';
  end if;
  update public.trade_docs set status = 'cancelled', cancel_reason = left(btrim(p_reason), 300) where id = p_doc;
  if d.doc_type = 'purchase_order' and d.po_id is not null then
    update public.purchase_orders set status = 'cancelled' where id = d.po_id and status in ('draft', 'pending_approval', 'approved', 'sent');
  end if;
  perform public.trade_log(p_doc, 'cancelled', p_reason);
end;
$$;

create or replace function public.trade_sign(p_doc uuid, p_role text, p_name text)
returns void language plpgsql security definer set search_path = public as $$
declare d public.trade_docs%rowtype;
begin
  select * into d from public.trade_docs where id = p_doc and deleted_at is null;
  if not found then raise exception 'Document not found'; end if;
  if not public.trade_can_write(d.doc_type) then raise exception 'Not permitted'; end if;
  if d.status not in ('issued', 'completed', 'approved') then raise exception 'Issue the document before signing it'; end if;
  if length(btrim(coalesce(p_name, ''))) < 2 then raise exception 'Enter the signer''s name'; end if;
  insert into public.trade_doc_signatures (doc_id, role, signer_name, signed_by) values (p_doc, left(btrim(p_role), 60), left(btrim(p_name), 120), auth.uid())
  on conflict (doc_id, role) do update set signer_name = excluded.signer_name, signed_by = auth.uid(), signed_at = now();
  perform public.trade_log(p_doc, 'signed', p_role || ': ' || p_name);
end;
$$;

-- ---------------------------------------------------------------------
-- Dashboard figures (one round trip; respects the module and permission)
-- ---------------------------------------------------------------------
create or replace function public.trade_dashboard()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.can('trade.view', 'trade') then raise exception 'Not permitted'; end if;
  select jsonb_build_object(
    'pending_approvals', (select count(*) from public.trade_docs where status = 'pending_approval' and deleted_at is null),
    'drafts',            (select count(*) from public.trade_docs where status in ('draft', 'rejected') and deleted_at is null),
    'issued',            (select count(*) from public.trade_docs where status = 'issued' and deleted_at is null),
    'completed_30d',     (select count(*) from public.trade_docs where status = 'completed' and completed_at > now() - interval '30 days' and deleted_at is null),
    'unpaid_vouchers',   (select count(*) from public.trade_docs d where d.doc_type = 'payment_voucher' and d.status = 'issued' and d.deleted_at is null),
    'unpaid_amount',     (select coalesce(sum(d.total), 0) from public.trade_docs d where d.doc_type = 'payment_voucher' and d.status = 'issued' and d.deleted_at is null),
    'by_type', coalesce((select jsonb_object_agg(doc_type, n) from (select doc_type, count(*) n from public.trade_docs where deleted_at is null and status <> 'cancelled' group by doc_type) x), '{}'::jsonb)
  ) into r;
  return r;
end;
$$;

-- ---------------------------------------------------------------------
-- Grants: the workflow functions are callable by signed-in staff only; helpers stay internal.
-- ---------------------------------------------------------------------
revoke all on function
  public.trade_next_number(text), public.trade_source_lines(uuid, boolean), public.trade_log(uuid, text, text), public.trade_can_write(text), public.trade_set_lines(uuid, jsonb),
  public.trade_auto_advance(uuid), public.trade_apply_issue(uuid), public.trade_issue_internal(uuid), public.trade_apply_approval(uuid, text),
  public.approval_apply_trade_requisition(uuid, text, uuid), public.approval_apply_trade_purchase(uuid, text, uuid), public.approval_apply_trade_payment(uuid, text, uuid)
from public, anon, authenticated;

revoke all on function
  public.trade_create_doc(text, uuid, uuid, uuid, text, text, date, date, text, text, jsonb, jsonb, uuid),
  public.trade_update_doc(uuid, uuid, uuid, text, text, date, date, text, text, jsonb, jsonb, uuid),
  public.trade_next_doc(uuid, text), public.trade_submit(uuid), public.trade_complete(uuid), public.trade_cancel(uuid, text),
  public.trade_sign(uuid, text, text), public.trade_dashboard()
from public, anon;
grant execute on function
  public.trade_create_doc(text, uuid, uuid, uuid, text, text, date, date, text, text, jsonb, jsonb, uuid),
  public.trade_update_doc(uuid, uuid, uuid, text, text, date, date, text, text, jsonb, jsonb, uuid),
  public.trade_next_doc(uuid, text), public.trade_submit(uuid), public.trade_complete(uuid), public.trade_cancel(uuid, text),
  public.trade_sign(uuid, text, text), public.trade_dashboard()
to authenticated;
