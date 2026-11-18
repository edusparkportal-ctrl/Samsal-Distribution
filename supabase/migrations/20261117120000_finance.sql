-- =====================================================================
-- 0017 FINANCE (module `finance`, ships DISABLED)
-- Income and expenses ledger, budgets, customer invoices (receivables), supplier bills (payables),
-- expense claims, cash flow and report snapshots.
--
-- Safety rules built into the database:
--  * This system RECORDS money. It never moves money. "Paid" means a person recorded that a payment was made elsewhere.
--  * A supplier bill, expense claim or payroll run cannot be recorded as paid until the approval engine has approved it.
--  * The person who prepared a bill cannot record its payment; the claimant cannot record their own reimbursement.
--  * An invoice only becomes "issued" when a person issues it. Automations may create DRAFT invoices and bills only.
--  * Ledger rows created by the system (receipts, payments) cannot be edited or deleted. Corrections are new entries.
--  * Statuses can only be changed through the functions below, never by a direct update from a signed-in user.
--  * No tax rate is hard-coded. VAT (or any tax) is a per-invoice percentage a person enters; confirm it with your adviser.
-- =====================================================================

insert into public.permissions (key, module, description) values
  ('finance.claims', 'finance', 'Submit and see your own expense claims')
on conflict (key) do nothing;
insert into public.role_permissions (role_id, permission_key)
select r.id, 'finance.claims' from public.roles r where not r.is_super
on conflict do nothing;

create sequence public.invoice_no_seq start 1;
create sequence public.bill_no_seq start 1;
create sequence public.expense_no_seq start 1;

-- ---------------------------------------------------------------------
-- Categories and ledger
-- ---------------------------------------------------------------------
create table public.finance_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(name) between 1 and 80),
  kind       text not null check (kind in ('income', 'expense')),
  system_key text unique check (system_key is null or system_key ~ '^[a-z_]+$'),   -- used by automatic postings
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name, kind)
);
insert into public.finance_categories (name, kind, system_key) values
  ('Sales', 'income', 'sales'),
  ('Other income', 'income', 'other_income'),
  ('Purchases of goods', 'expense', 'purchases'),
  ('Payroll', 'expense', 'payroll'),
  ('Staff expense claims', 'expense', 'claims'),
  ('Operating expenses', 'expense', 'operating')
on conflict do nothing;

create table public.finance_transactions (
  id          uuid primary key default gen_random_uuid(),
  txn_date    date not null default current_date,
  kind        text not null check (kind in ('income', 'expense')),
  category_id uuid not null references public.finance_categories(id) on delete restrict,
  amount      numeric(16,2) not null check (amount > 0),
  currency    text not null default 'KES' check (currency ~ '^[A-Z]{3}$'),
  description text not null check (length(description) between 1 and 300),
  counterparty text check (counterparty is null or length(counterparty) <= 160),
  reference   text check (reference is null or length(reference) <= 120),
  source      text not null default 'manual' check (source in ('manual', 'invoice_payment', 'bill_payment', 'expense_claim', 'payroll')),
  source_id   uuid,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index finance_transactions_date_idx on public.finance_transactions(txn_date);
create index finance_transactions_category_idx on public.finance_transactions(category_id);
create unique index finance_transactions_source_idx on public.finance_transactions(source, source_id) where source_id is not null;

create or replace function public.guard_ledger()
returns trigger language plpgsql set search_path = public as $$
declare k text;
begin
  if tg_op = 'INSERT' then
    if current_user in ('authenticated', 'anon') then
      new.source := 'manual'; new.source_id := null; new.created_by := auth.uid();
    end if;
    select kind into k from public.finance_categories where id = new.category_id;
    if k is distinct from new.kind then raise exception 'The category is for % entries, not %', k, new.kind; end if;
    return new;
  end if;
  if old.source <> 'manual' then raise exception 'Entries created by the system cannot be changed. Add a correcting entry instead.'; end if;
  if tg_op = 'DELETE' then return old; end if;
  new.source := 'manual'; new.source_id := null;
  select kind into k from public.finance_categories where id = new.category_id;
  if k is distinct from new.kind then raise exception 'The category is for % entries, not %', k, new.kind; end if;
  return new;
end;
$$;
create trigger finance_transactions_guard before insert or update or delete on public.finance_transactions for each row execute function public.guard_ledger();

create or replace function public.fin_post(p_source text, p_source_id uuid, p_kind text, p_system_key text, p_amount numeric, p_currency text,
                                           p_desc text, p_counterparty text, p_ref text, p_date date)
returns void language plpgsql security definer set search_path = public as $$
declare cat uuid;
begin
  select id into cat from public.finance_categories where system_key = p_system_key;
  if cat is null then raise exception 'Finance category % is missing', p_system_key; end if;
  insert into public.finance_transactions (txn_date, kind, category_id, amount, currency, description, counterparty, reference, source, source_id, created_by)
  values (coalesce(p_date, current_date), p_kind, cat, p_amount, p_currency, left(p_desc, 300), left(p_counterparty, 160), left(p_ref, 120), p_source, p_source_id, auth.uid());
end;
$$;

-- ---------------------------------------------------------------------
-- Budgets
-- ---------------------------------------------------------------------
create table public.budgets (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (length(name) between 1 and 120),
  category_id  uuid not null references public.finance_categories(id) on delete restrict,
  period_start date not null,
  period_end   date not null,
  amount       numeric(16,2) not null check (amount >= 0),
  currency     text not null default 'KES' check (currency ~ '^[A-Z]{3}$'),
  notes        text check (notes is null or length(notes) <= 1000),
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (period_end >= period_start)
);

create or replace view public.budget_vs_actual with (security_invoker = true) as
select b.id as budget_id, b.name, b.category_id, c.name as category, c.kind, b.period_start, b.period_end, b.currency, b.amount as budget,
       coalesce((select sum(t.amount) from public.finance_transactions t
                 where t.category_id = b.category_id and t.currency = b.currency and t.txn_date between b.period_start and b.period_end), 0)::numeric(16,2) as actual
from public.budgets b join public.finance_categories c on c.id = b.category_id;

-- ---------------------------------------------------------------------
-- Customer invoices (accounts receivable)
-- ---------------------------------------------------------------------
create table public.invoices (
  id             uuid primary key default gen_random_uuid(),
  number         text not null unique default ('INV-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.invoice_no_seq')::text, 5, '0')),
  customer_id    uuid not null references public.customers(id) on delete restrict,
  sales_order_id uuid references public.sales_orders(id) on delete set null,
  status         text not null default 'draft' check (status in ('draft', 'issued', 'partially_paid', 'paid', 'void')),
  currency       text not null default 'KES' check (currency ~ '^[A-Z]{3}$'),
  issue_date     date,
  due_date       date,
  tax_rate       numeric(5,2) not null default 0 check (tax_rate between 0 and 100),
  notes          text check (notes is null or length(notes) <= 2000),
  void_reason    text,
  created_by     uuid references public.profiles(id) on delete set null,
  issued_by      uuid references public.profiles(id) on delete set null,
  issued_at      timestamptz,
  deleted_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index invoices_order_idx on public.invoices(sales_order_id) where sales_order_id is not null and status <> 'void';
create index invoices_due_idx on public.invoices(due_date) where status in ('issued', 'partially_paid');

create table public.invoice_items (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references public.invoices(id) on delete cascade,
  line_no     integer not null check (line_no > 0),
  description text not null check (length(description) between 1 and 300),
  quantity    numeric(14,3) not null check (quantity > 0),
  unit_price  numeric(14,2) not null check (unit_price >= 0),
  unique (invoice_id, line_no)
);

create table public.invoice_payments (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references public.invoices(id) on delete restrict,
  paid_on     date not null default current_date,
  amount      numeric(16,2) not null check (amount > 0),
  method      text not null default 'bank' check (method in ('bank', 'mpesa', 'cash', 'cheque', 'other')),
  reference   text check (reference is null or length(reference) <= 120),
  recorded_by uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index invoice_payments_invoice_idx on public.invoice_payments(invoice_id);

create or replace view public.invoice_totals with (security_invoker = true) as
select i.id as invoice_id,
       coalesce(s.sub, 0)::numeric(16,2) as subtotal,
       round(coalesce(s.sub, 0) * i.tax_rate / 100, 2)::numeric(16,2) as tax,
       (coalesce(s.sub, 0) + round(coalesce(s.sub, 0) * i.tax_rate / 100, 2))::numeric(16,2) as total,
       coalesce(p.paid, 0)::numeric(16,2) as paid,
       (coalesce(s.sub, 0) + round(coalesce(s.sub, 0) * i.tax_rate / 100, 2) - coalesce(p.paid, 0))::numeric(16,2) as balance
from public.invoices i
left join lateral (select sum(round(x.quantity * x.unit_price, 2)) as sub from public.invoice_items x where x.invoice_id = i.id) s on true
left join lateral (select sum(y.amount) as paid from public.invoice_payments y where y.invoice_id = i.id) p on true;

create or replace function public.guard_invoice()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if current_user in ('authenticated', 'anon') then new.status := 'draft'; new.created_by := auth.uid(); new.issued_by := null; new.issued_at := null; new.void_reason := null; end if;
    return new;
  end if;
  if current_user in ('authenticated', 'anon') then
    if new.status is distinct from old.status then raise exception 'Invoice status changes only through Issue, Void or recorded payments'; end if;
    if old.status <> 'draft' then raise exception 'An issued invoice cannot be edited. Void it and create a new one if it is wrong.'; end if;
    new.issued_by := old.issued_by; new.issued_at := old.issued_at; new.void_reason := old.void_reason;
  end if;
  return new;
end;
$$;
create trigger invoices_guard before insert or update on public.invoices for each row execute function public.guard_invoice();

create or replace function public.guard_invoice_items()
returns trigger language plpgsql security definer set search_path = public as $$
declare iid uuid := case when tg_op = 'DELETE' then old.invoice_id else new.invoice_id end; st text;
begin
  select status into st from public.invoices where id = iid;
  if st <> 'draft' then raise exception 'Invoice lines can only be changed while the invoice is a draft'; end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
create trigger invoice_items_guard before insert or update or delete on public.invoice_items for each row execute function public.guard_invoice_items();

create or replace function public.issue_invoice(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare i public.invoices%rowtype; t public.invoice_totals%rowtype;
begin
  if not public.can('finance.invoices', 'finance') then raise exception 'Not permitted'; end if;
  select * into i from public.invoices where id = p_id and deleted_at is null for update;
  if not found or i.status <> 'draft' then raise exception 'Only a draft invoice can be issued'; end if;
  select * into t from public.invoice_totals where invoice_id = p_id;
  if t.total <= 0 then raise exception 'Add at least one line with an amount before issuing'; end if;
  update public.invoices set status = 'issued', issued_by = auth.uid(), issued_at = now(),
         issue_date = coalesce(issue_date, current_date),
         due_date = coalesce(due_date, coalesce(issue_date, current_date) + 30)
   where id = p_id;
end;
$$;

create or replace function public.void_invoice(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare i public.invoices%rowtype;
begin
  if not public.can('finance.invoices', 'finance') then raise exception 'Not permitted'; end if;
  select * into i from public.invoices where id = p_id for update;
  if not found or i.status not in ('draft', 'issued') then raise exception 'Only a draft or an unpaid issued invoice can be voided'; end if;
  if exists (select 1 from public.invoice_payments where invoice_id = p_id) then raise exception 'This invoice has payments recorded and cannot be voided'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'Give a reason for voiding'; end if;
  update public.invoices set status = 'void', void_reason = left(btrim(p_reason), 300) where id = p_id;
end;
$$;

create or replace function public.record_invoice_payment(p_invoice uuid, p_amount numeric, p_paid_on date, p_method text, p_reference text)
returns uuid language plpgsql security definer set search_path = public as $$
declare i public.invoices%rowtype; t public.invoice_totals%rowtype; pid uuid; cust text; newbal numeric;
begin
  if not public.can('finance.invoices', 'finance') then raise exception 'Not permitted'; end if;
  select * into i from public.invoices where id = p_invoice for update;
  if not found or i.status not in ('issued', 'partially_paid') then raise exception 'Payments can only be recorded on an issued, unpaid invoice'; end if;
  select * into t from public.invoice_totals where invoice_id = p_invoice;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter the amount received'; end if;
  if p_amount > t.balance then raise exception 'That is more than the balance of %', t.balance; end if;
  insert into public.invoice_payments (invoice_id, paid_on, amount, method, reference, recorded_by)
  values (p_invoice, coalesce(p_paid_on, current_date), p_amount, coalesce(nullif(p_method, ''), 'bank'), nullif(left(btrim(coalesce(p_reference, '')), 120), ''), auth.uid())
  returning id into pid;
  newbal := t.balance - p_amount;
  update public.invoices set status = case when newbal <= 0 then 'paid' else 'partially_paid' end where id = p_invoice;
  select coalesce(c.company_name, c.contact_name) into cust from public.customers c where c.id = i.customer_id;
  perform public.fin_post('invoice_payment', pid, 'income', 'sales', p_amount, i.currency, 'Payment received for ' || i.number, cust, p_reference, p_paid_on);
  return pid;
end;
$$;

-- Creates a DRAFT invoice from a delivered sales order. A person must still review and issue it.
create or replace function public.auto_draft_invoice_from_order(p_order uuid, p_days integer default 30)
returns uuid language plpgsql security definer set search_path = public as $$
declare o public.sales_orders%rowtype; iid uuid;
begin
  select * into o from public.sales_orders where id = p_order and deleted_at is null;
  if not found or o.status not in ('delivered', 'invoiced') then return null; end if;
  if exists (select 1 from public.invoices where sales_order_id = p_order and status <> 'void') then return null; end if;
  if not exists (select 1 from public.sales_order_items where order_id = p_order) then return null; end if;
  insert into public.invoices (customer_id, sales_order_id, currency, due_date, notes)
  values (o.customer_id, o.id, o.currency, current_date + greatest(p_days, 0), 'Created from sales order ' || o.number || '. Review before issuing.')
  returning id into iid;
  insert into public.invoice_items (invoice_id, line_no, description, quantity, unit_price)
  select iid, line_no, left(description, 300), quantity, unit_price from public.sales_order_items where order_id = p_order;
  return iid;
end;
$$;

create or replace function public.create_invoice_from_order(p_order uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare iid uuid;
begin
  if not public.can('finance.invoices', 'finance') then raise exception 'Not permitted'; end if;
  iid := public.auto_draft_invoice_from_order(p_order, public.auto_param('finance_invoice_drafts', 'payment_terms_days', 30)::integer);
  if iid is null then raise exception 'No invoice created: the order must be delivered, have lines, and not already have an invoice'; end if;
  return iid;
end;
$$;

-- ---------------------------------------------------------------------
-- Supplier bills (accounts payable). Payment needs approval first.
-- ---------------------------------------------------------------------
create table public.supplier_bills (
  id                uuid primary key default gen_random_uuid(),
  number            text not null unique default ('BILL-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.bill_no_seq')::text, 5, '0')),
  supplier_id       uuid not null references public.suppliers(id) on delete restrict,
  purchase_order_id uuid references public.purchase_orders(id) on delete set null,
  supplier_reference text check (supplier_reference is null or length(supplier_reference) <= 80),   -- the supplier's own invoice number
  status            text not null default 'draft' check (status in ('draft', 'pending_approval', 'approved', 'partially_paid', 'paid', 'void')),
  currency          text not null default 'KES' check (currency ~ '^[A-Z]{3}$'),
  bill_date         date,
  due_date          date,
  amount            numeric(16,2) not null default 0 check (amount >= 0),
  description       text check (description is null or length(description) <= 500),
  void_reason       text,
  created_by        uuid references public.profiles(id) on delete set null,
  deleted_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index supplier_bills_po_idx on public.supplier_bills(purchase_order_id) where purchase_order_id is not null and status <> 'void';
create index supplier_bills_due_idx on public.supplier_bills(due_date) where status in ('approved', 'partially_paid');

create table public.bill_payments (
  id          uuid primary key default gen_random_uuid(),
  bill_id     uuid not null references public.supplier_bills(id) on delete restrict,
  paid_on     date not null default current_date,
  amount      numeric(16,2) not null check (amount > 0),
  method      text not null default 'bank' check (method in ('bank', 'mpesa', 'cash', 'cheque', 'other')),
  reference   text not null check (length(reference) between 3 and 120),
  recorded_by uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create or replace view public.bill_totals with (security_invoker = true) as
select b.id as bill_id, b.amount as total, coalesce(p.paid, 0)::numeric(16,2) as paid, (b.amount - coalesce(p.paid, 0))::numeric(16,2) as balance
from public.supplier_bills b left join lateral (select sum(amount) as paid from public.bill_payments where bill_id = b.id) p on true;

create or replace function public.guard_bill()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if current_user in ('authenticated', 'anon') then new.status := 'draft'; new.created_by := auth.uid(); new.void_reason := null; end if;
    return new;
  end if;
  if current_user in ('authenticated', 'anon') then
    if new.status is distinct from old.status then raise exception 'Bill status changes only through Submit, approval, Void or recorded payments'; end if;
    if old.status <> 'draft' then raise exception 'A bill can only be edited while it is a draft'; end if;
    new.void_reason := old.void_reason; new.created_by := old.created_by;
  end if;
  return new;
end;
$$;
create trigger supplier_bills_guard before insert or update on public.supplier_bills for each row execute function public.guard_bill();

create or replace function public.submit_bill(p_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare b public.supplier_bills%rowtype; sname text; rid uuid;
begin
  if not public.can('finance.bills', 'finance') then raise exception 'Not permitted'; end if;
  select * into b from public.supplier_bills where id = p_id and deleted_at is null for update;
  if not found or b.status <> 'draft' then raise exception 'Only a draft bill can be submitted'; end if;
  if b.amount <= 0 then raise exception 'Enter the bill amount first'; end if;
  select name into sname from public.suppliers where id = b.supplier_id;
  rid := public.approval_submit('bill', b.id, b.amount, null, auth.uid(), 'Bill ' || b.number || ' from ' || sname,
    b.currency || ' ' || b.amount || coalesce(', their ref ' || b.supplier_reference, '') || coalesce(', due ' || to_char(b.due_date, 'DD Mon YYYY'), ''), '/admin/finance/bills');
  update public.supplier_bills set status = 'pending_approval' where id = p_id;
  return rid;
end;
$$;

create or replace function public.approval_apply_bill(p_record uuid, p_outcome text, p_request uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_outcome = 'approved' then
    update public.supplier_bills set status = 'approved' where id = p_record and status = 'pending_approval';
  else
    update public.supplier_bills set status = 'draft' where id = p_record and status = 'pending_approval';
  end if;
end;
$$;

create or replace function public.record_bill_payment(p_bill uuid, p_amount numeric, p_paid_on date, p_method text, p_reference text)
returns uuid language plpgsql security definer set search_path = public as $$
declare b public.supplier_bills%rowtype; t public.bill_totals%rowtype; pid uuid; sname text; newbal numeric;
begin
  if not public.can('finance.bills', 'finance') then raise exception 'Not permitted'; end if;
  select * into b from public.supplier_bills where id = p_bill for update;
  if not found or b.status not in ('approved', 'partially_paid') then raise exception 'A bill must be approved before a payment can be recorded'; end if;
  if b.created_by = auth.uid() or exists (select 1 from public.approval_requests r where r.subject = 'bill' and r.record_id = b.id and r.requested_by = auth.uid()) then
    raise exception 'The person who prepared or submitted the bill cannot record its payment';
  end if;
  if length(btrim(coalesce(p_reference, ''))) < 3 then raise exception 'Enter the payment reference from your bank or payment provider'; end if;
  select * into t from public.bill_totals where bill_id = p_bill;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter the amount paid'; end if;
  if p_amount > t.balance then raise exception 'That is more than the balance of %', t.balance; end if;
  insert into public.bill_payments (bill_id, paid_on, amount, method, reference, recorded_by)
  values (p_bill, coalesce(p_paid_on, current_date), p_amount, coalesce(nullif(p_method, ''), 'bank'), left(btrim(p_reference), 120), auth.uid()) returning id into pid;
  newbal := t.balance - p_amount;
  update public.supplier_bills set status = case when newbal <= 0 then 'paid' else 'partially_paid' end where id = p_bill;
  select name into sname from public.suppliers where id = b.supplier_id;
  perform public.fin_post('bill_payment', pid, 'expense', 'purchases', p_amount, b.currency, 'Payment of ' || b.number, sname, p_reference, p_paid_on);
  return pid;
end;
$$;

create or replace function public.void_bill(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare b public.supplier_bills%rowtype;
begin
  if not public.can('finance.bills', 'finance') then raise exception 'Not permitted'; end if;
  select * into b from public.supplier_bills where id = p_id for update;
  if not found or b.status not in ('draft', 'approved') then raise exception 'Only a draft or an approved, unpaid bill can be voided'; end if;
  if exists (select 1 from public.bill_payments where bill_id = p_id) then raise exception 'This bill has payments recorded and cannot be voided'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'Give a reason for voiding'; end if;
  update public.supplier_bills set status = 'void', void_reason = left(btrim(p_reason), 300) where id = p_id;
end;
$$;

-- DRAFT bill for goods received against a purchase order (value of what was actually received).
create or replace function public.auto_draft_bill_from_po(p_po uuid, p_days integer default 30)
returns uuid language plpgsql security definer set search_path = public as $$
declare po public.purchase_orders%rowtype; val numeric; bid uuid;
begin
  select * into po from public.purchase_orders where id = p_po and deleted_at is null;
  if not found or po.status not in ('received', 'partially_received') then return null; end if;
  if exists (select 1 from public.supplier_bills where purchase_order_id = p_po and status <> 'void') then return null; end if;
  select coalesce(sum(round(received_quantity * unit_price, 2)), 0) into val from public.purchase_order_items where po_id = p_po;
  if val <= 0 then return null; end if;
  insert into public.supplier_bills (supplier_id, purchase_order_id, currency, bill_date, due_date, amount, description)
  values (po.supplier_id, po.id, po.currency, current_date, current_date + greatest(p_days, 0), val,
          'Draft from purchase order ' || po.number || ' (value received). Check against the supplier''s invoice before submitting.')
  returning id into bid;
  return bid;
end;
$$;

create or replace function public.create_bill_from_po(p_po uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare bid uuid;
begin
  if not public.can('finance.bills', 'finance') then raise exception 'Not permitted'; end if;
  bid := public.auto_draft_bill_from_po(p_po, public.auto_param('finance_bill_drafts', 'payment_terms_days', 30)::integer);
  if bid is null then raise exception 'No bill created: goods must be received, and the order must not already have a bill'; end if;
  return bid;
end;
$$;

-- ---------------------------------------------------------------------
-- Expense claims (staff reimbursement). Approval then payment record.
-- ---------------------------------------------------------------------
create table public.expense_claims (
  id           uuid primary key default gen_random_uuid(),
  number       text not null unique default ('EXP-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.expense_no_seq')::text, 5, '0')),
  employee_id  uuid not null references public.employees(id) on delete restrict,
  category_id  uuid not null references public.finance_categories(id) on delete restrict,
  expense_date date not null default current_date,
  amount       numeric(16,2) not null check (amount > 0),
  currency     text not null default 'KES' check (currency ~ '^[A-Z]{3}$'),
  description  text not null check (length(description) between 1 and 500),
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled', 'paid_recorded')),
  paid_on      date,
  payment_reference text check (payment_reference is null or length(payment_reference) <= 120),
  paid_recorded_by uuid references public.profiles(id) on delete set null,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index expense_claims_employee_idx on public.expense_claims(employee_id);

create or replace function public.guard_expense_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare k text;
begin
  new.status := 'pending'; new.created_by := auth.uid(); new.paid_on := null; new.payment_reference := null; new.paid_recorded_by := null;
  select kind into k from public.finance_categories where id = new.category_id;
  if k is distinct from 'expense' then raise exception 'Choose an expense category'; end if;
  if new.expense_date > current_date + 1 then raise exception 'The expense date cannot be in the future'; end if;
  if exists (select 1 from public.employees e where e.id = new.employee_id and (e.deleted_at is not null or e.status = 'left')) then raise exception 'This employee is no longer active'; end if;
  return new;
end;
$$;
create trigger expense_claims_guard before insert on public.expense_claims for each row execute function public.guard_expense_insert();

create or replace function public.trg_expense_submit()
returns trigger language plpgsql security definer set search_path = public as $$
declare emp public.employees%rowtype;
begin
  select * into emp from public.employees where id = new.employee_id;
  perform public.approval_submit('expense', new.id, new.amount, new.employee_id, coalesce(auth.uid(), emp.profile_id),
    'Expense claim ' || new.number || ': ' || emp.full_name, new.currency || ' ' || new.amount || '. ' || new.description, '/admin/finance/claims');
  return new;
end;
$$;
create trigger expense_claims_submit after insert on public.expense_claims for each row execute function public.trg_expense_submit();

create or replace function public.approval_apply_expense(p_record uuid, p_outcome text, p_request uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.expense_claims set status = case p_outcome when 'approved' then 'approved' when 'cancelled' then 'cancelled' else 'rejected' end
   where id = p_record and status = 'pending';
end;
$$;

create or replace function public.cancel_expense_claim(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c public.expense_claims%rowtype; rid uuid;
begin
  select * into c from public.expense_claims where id = p_id for update;
  if not found then raise exception 'Not found'; end if;
  if not (c.employee_id = public.my_employee_id() or public.can('finance.manage', 'finance')) then raise exception 'Not permitted'; end if;
  if c.status <> 'pending' then raise exception 'Only a claim that is still waiting for approval can be cancelled'; end if;
  select id into rid from public.approval_requests where subject = 'expense' and record_id = p_id and status = 'pending';
  if rid is not null then update public.approval_requests set status = 'cancelled', decided_at = now() where id = rid; end if;
  update public.expense_claims set status = 'cancelled' where id = p_id;
end;
$$;

create or replace function public.record_expense_paid(p_id uuid, p_reference text, p_paid_on date)
returns void language plpgsql security definer set search_path = public as $$
declare c public.expense_claims%rowtype; emp public.employees%rowtype;
begin
  if not public.can('finance.bills', 'finance') then raise exception 'Not permitted'; end if;
  select * into c from public.expense_claims where id = p_id for update;
  if not found or c.status <> 'approved' then raise exception 'Only an approved claim can be recorded as reimbursed'; end if;
  select * into emp from public.employees where id = c.employee_id;
  if emp.profile_id is not null and emp.profile_id = auth.uid() then raise exception 'You cannot record the reimbursement of your own claim'; end if;
  if length(btrim(coalesce(p_reference, ''))) < 3 then raise exception 'Enter the payment reference'; end if;
  update public.expense_claims set status = 'paid_recorded', paid_on = coalesce(p_paid_on, current_date), payment_reference = left(btrim(p_reference), 120), paid_recorded_by = auth.uid() where id = p_id;
  perform public.fin_post('expense_claim', p_id, 'expense', 'claims', c.amount, c.currency, 'Expense claim ' || c.number || ' reimbursed', emp.full_name, p_reference, p_paid_on);
end;
$$;

-- Payroll payments appear in the ledger too (net pay), once a person records that payroll was paid.
create or replace function public.record_payroll_paid(p_run uuid, p_reference text, p_paid_on date)
returns void language plpgsql security definer set search_path = public as $$
declare r public.payroll_runs%rowtype; net numeric;
begin
  if not public.can('finance.payroll_approve', 'finance') then raise exception 'Not permitted'; end if;
  select * into r from public.payroll_runs where id = p_run for update;
  if not found or r.status <> 'approved' then raise exception 'Only an approved payroll run can be recorded as paid'; end if;
  if r.prepared_by = auth.uid() then raise exception 'The person who prepared the payroll cannot record it as paid'; end if;
  if length(btrim(coalesce(p_reference, ''))) < 3 then raise exception 'Enter the payment reference from your bank or payment provider'; end if;
  update public.payroll_runs set status = 'paid_recorded', paid_on = coalesce(p_paid_on, current_date),
         payment_reference = left(btrim(p_reference), 120), paid_recorded_by = auth.uid() where id = p_run;
  select coalesce(sum(net_pay), 0) into net from public.payroll_lines where run_id = p_run;
  if net > 0 then
    perform public.fin_post('payroll', p_run, 'expense', 'payroll', net, r.currency, 'Payroll ' || r.reference || ' (net pay)', null, p_reference, p_paid_on);
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Cash flow, ageing and report snapshots
-- ---------------------------------------------------------------------
create or replace view public.cash_flow_monthly with (security_invoker = true) as
select date_trunc('month', txn_date)::date as month, currency,
       coalesce(sum(amount) filter (where kind = 'income'), 0)::numeric(16,2) as income,
       coalesce(sum(amount) filter (where kind = 'expense'), 0)::numeric(16,2) as expense,
       (coalesce(sum(amount) filter (where kind = 'income'), 0) - coalesce(sum(amount) filter (where kind = 'expense'), 0))::numeric(16,2) as net
from public.finance_transactions group by 1, 2;

create or replace view public.ar_ageing with (security_invoker = true) as
select i.id as invoice_id, i.number, i.customer_id, i.currency, i.issue_date, i.due_date, t.total, t.paid, t.balance,
       greatest(0, current_date - coalesce(i.due_date, i.issue_date))::integer as days_overdue,
       case when coalesce(i.due_date, i.issue_date) >= current_date then 'current'
            when current_date - i.due_date <= 30 then '1-30'
            when current_date - i.due_date <= 60 then '31-60'
            when current_date - i.due_date <= 90 then '61-90' else '90+' end as bucket
from public.invoices i join public.invoice_totals t on t.invoice_id = i.id
where i.status in ('issued', 'partially_paid') and i.deleted_at is null and t.balance > 0;

create or replace view public.ap_ageing with (security_invoker = true) as
select b.id as bill_id, b.number, b.supplier_id, b.currency, b.bill_date, b.due_date, t.total, t.paid, t.balance,
       greatest(0, current_date - coalesce(b.due_date, b.bill_date))::integer as days_overdue,
       case when coalesce(b.due_date, b.bill_date) is null or coalesce(b.due_date, b.bill_date) >= current_date then 'current'
            when current_date - b.due_date <= 30 then '1-30'
            when current_date - b.due_date <= 60 then '31-60'
            when current_date - b.due_date <= 90 then '61-90' else '90+' end as bucket
from public.supplier_bills b join public.bill_totals t on t.bill_id = b.id
where b.status in ('approved', 'partially_paid') and b.deleted_at is null and t.balance > 0;

create table public.finance_report_snapshots (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null default 'monthly' check (kind in ('monthly')),
  period_start date not null,
  period_end   date not null,
  data         jsonb not null,
  created_by   uuid references public.profiles(id) on delete set null,   -- null: built by the automation
  created_at   timestamptz not null default now(),
  unique (kind, period_start)
);

-- Builds the month's figures from the books as they stand now. Pure read: it posts nothing.
create or replace function public.finance_report_data(p_month date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s date := date_trunc('month', p_month)::date; e date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
begin
  return jsonb_build_object(
    'period_start', s, 'period_end', e,
    'by_currency', coalesce((select jsonb_agg(jsonb_build_object('currency', currency, 'income', income, 'expense', expense, 'net', net)) from public.cash_flow_monthly where month = s), '[]'::jsonb),
    'top_expenses', coalesce((select jsonb_agg(x) from (
        select jsonb_build_object('category', c.name, 'currency', t.currency, 'amount', sum(t.amount)) as x
        from public.finance_transactions t join public.finance_categories c on c.id = t.category_id
        where t.kind = 'expense' and t.txn_date between s and e group by c.name, t.currency order by sum(t.amount) desc limit 5) q), '[]'::jsonb),
    'receivables', coalesce((select jsonb_agg(jsonb_build_object('currency', q.currency, 'outstanding', q.o, 'overdue', q.od, 'invoices', q.n))
        from (select currency, sum(balance) as o, coalesce(sum(balance) filter (where days_overdue > 0), 0) as od, count(*) as n from public.ar_ageing group by currency) q), '[]'::jsonb),
    'payables', coalesce((select jsonb_agg(jsonb_build_object('currency', q.currency, 'outstanding', q.o, 'overdue', q.od, 'bills', q.n))
        from (select currency, sum(balance) as o, coalesce(sum(balance) filter (where days_overdue > 0), 0) as od, count(*) as n from public.ap_ageing group by currency) q), '[]'::jsonb),
    'budgets', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'category', category, 'currency', currency, 'budget', budget, 'actual', actual))
        from public.budget_vs_actual where period_start <= e and period_end >= s), '[]'::jsonb),
    'pending_claims', (select count(*) from public.expense_claims where status = 'pending'),
    'unapproved_bills', (select count(*) from public.supplier_bills where status = 'pending_approval')
  );
end;
$$;

create or replace function public.build_finance_report(p_month date)
returns uuid language plpgsql security definer set search_path = public as $$
declare s date := date_trunc('month', p_month)::date; sid uuid;
begin
  if not public.can('finance.reports', 'finance') then raise exception 'Not permitted'; end if;
  insert into public.finance_report_snapshots (kind, period_start, period_end, data, created_by)
  values ('monthly', s, (s + interval '1 month - 1 day')::date, public.finance_report_data(s), auth.uid())
  on conflict (kind, period_start) do update set data = excluded.data, created_by = excluded.created_by, created_at = now()
  returning id into sid;
  return sid;
end;
$$;

-- ---------------------------------------------------------------------
-- Triggers: updated_at and activity log
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['finance_categories', 'finance_transactions', 'budgets', 'invoices', 'supplier_bills', 'expense_claims'] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_updated', t);
  end loop;
  foreach t in array array['finance_categories', 'finance_transactions', 'budgets', 'invoices', 'invoice_items', 'invoice_payments', 'supplier_bills', 'bill_payments', 'expense_claims', 'finance_report_snapshots'] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_row(%L)', t || '_audit', t, 'full');
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['finance_categories', 'finance_transactions', 'budgets', 'invoices', 'invoice_items', 'invoice_payments', 'supplier_bills', 'bill_payments', 'expense_claims', 'finance_report_snapshots'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
revoke all on sequence public.invoice_no_seq, public.bill_no_seq, public.expense_no_seq from anon, authenticated;
grant usage on sequence public.invoice_no_seq, public.bill_no_seq, public.expense_no_seq to authenticated;

grant select, insert, update on public.finance_categories, public.budgets to authenticated;
create policy fcat_read on public.finance_categories for select to authenticated using (public.can('finance.view', 'finance') or public.can('finance.claims', 'finance'));
create policy fcat_ins  on public.finance_categories for insert to authenticated with check (public.can('finance.manage', 'finance'));
create policy fcat_upd  on public.finance_categories for update to authenticated using (public.can('finance.manage', 'finance')) with check (public.can('finance.manage', 'finance'));
create policy budgets_read on public.budgets for select to authenticated using (public.can('finance.view', 'finance'));
create policy budgets_ins  on public.budgets for insert to authenticated with check (public.can('finance.manage', 'finance'));
create policy budgets_upd  on public.budgets for update to authenticated using (public.can('finance.manage', 'finance')) with check (public.can('finance.manage', 'finance'));

grant select, insert, update, delete on public.finance_transactions to authenticated;
create policy ledger_read on public.finance_transactions for select to authenticated using (public.can('finance.view', 'finance'));
create policy ledger_ins  on public.finance_transactions for insert to authenticated with check (public.can('finance.manage', 'finance'));
create policy ledger_upd  on public.finance_transactions for update to authenticated using (public.can('finance.manage', 'finance') and source = 'manual') with check (public.can('finance.manage', 'finance'));
create policy ledger_del  on public.finance_transactions for delete to authenticated using (public.can('finance.manage', 'finance') and source = 'manual');

grant select, insert, update on public.invoices to authenticated;
grant select, insert, update, delete on public.invoice_items to authenticated;
grant select on public.invoice_payments, public.bill_payments to authenticated;
create policy inv_read on public.invoices for select to authenticated using (public.can('finance.view', 'finance') or public.can('finance.invoices', 'finance'));
create policy inv_ins  on public.invoices for insert to authenticated with check (public.can('finance.invoices', 'finance'));
create policy inv_upd  on public.invoices for update to authenticated using (public.can('finance.invoices', 'finance') and status = 'draft') with check (public.can('finance.invoices', 'finance'));
create policy invitems_read on public.invoice_items for select to authenticated using (public.can('finance.view', 'finance') or public.can('finance.invoices', 'finance'));
create policy invitems_ins  on public.invoice_items for insert to authenticated with check (public.can('finance.invoices', 'finance'));
create policy invitems_upd  on public.invoice_items for update to authenticated using (public.can('finance.invoices', 'finance')) with check (public.can('finance.invoices', 'finance'));
create policy invitems_del  on public.invoice_items for delete to authenticated using (public.can('finance.invoices', 'finance'));
create policy invpay_read on public.invoice_payments for select to authenticated using (public.can('finance.view', 'finance') or public.can('finance.invoices', 'finance'));

grant select, insert, update on public.supplier_bills to authenticated;
create policy bill_read on public.supplier_bills for select to authenticated using (public.can('finance.view', 'finance') or public.can('finance.bills', 'finance') or public.can('finance.bill_approve', 'finance'));
create policy bill_ins  on public.supplier_bills for insert to authenticated with check (public.can('finance.bills', 'finance'));
create policy bill_upd  on public.supplier_bills for update to authenticated using (public.can('finance.bills', 'finance') and status = 'draft') with check (public.can('finance.bills', 'finance'));
create policy billpay_read on public.bill_payments for select to authenticated using (public.can('finance.view', 'finance') or public.can('finance.bills', 'finance'));

grant select on public.expense_claims to authenticated;
grant insert (employee_id, category_id, expense_date, amount, currency, description) on public.expense_claims to authenticated;
create policy claim_read on public.expense_claims for select to authenticated
  using (public.can('finance.view', 'finance') or public.is_manager_of(employee_id) or (employee_id = public.my_employee_id() and public.can('finance.claims', 'finance')));
create policy claim_ins on public.expense_claims for insert to authenticated
  with check (public.can('finance.manage', 'finance') or (employee_id = public.my_employee_id() and public.can('finance.claims', 'finance')));

grant select on public.finance_report_snapshots to authenticated;
create policy snap_read on public.finance_report_snapshots for select to authenticated using (public.can('finance.reports', 'finance'));

grant select on public.budget_vs_actual, public.invoice_totals, public.bill_totals, public.cash_flow_monthly, public.ar_ageing, public.ap_ageing to authenticated;

-- ---------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------
revoke all on function
  public.guard_ledger(), public.fin_post(text, uuid, text, text, numeric, text, text, text, text, date),
  public.guard_invoice(), public.guard_invoice_items(), public.guard_bill(), public.guard_expense_insert(), public.trg_expense_submit(),
  public.approval_apply_bill(uuid, text, uuid), public.approval_apply_expense(uuid, text, uuid),
  public.auto_draft_invoice_from_order(uuid, integer), public.auto_draft_bill_from_po(uuid, integer), public.finance_report_data(date)
from public, anon, authenticated;

revoke all on function
  public.issue_invoice(uuid), public.void_invoice(uuid, text), public.record_invoice_payment(uuid, numeric, date, text, text),
  public.create_invoice_from_order(uuid), public.submit_bill(uuid), public.record_bill_payment(uuid, numeric, date, text, text),
  public.void_bill(uuid, text), public.create_bill_from_po(uuid), public.cancel_expense_claim(uuid), public.record_expense_paid(uuid, text, date),
  public.record_payroll_paid(uuid, text, date), public.build_finance_report(date)
from public, anon;
grant execute on function
  public.issue_invoice(uuid), public.void_invoice(uuid, text), public.record_invoice_payment(uuid, numeric, date, text, text),
  public.create_invoice_from_order(uuid), public.submit_bill(uuid), public.record_bill_payment(uuid, numeric, date, text, text),
  public.void_bill(uuid, text), public.create_bill_from_po(uuid), public.cancel_expense_claim(uuid), public.record_expense_paid(uuid, text, date),
  public.record_payroll_paid(uuid, text, date), public.build_finance_report(date)
to authenticated;

-- Finance staff need customer and supplier names to raise invoices and bills (read only; the finance module must be on).
create policy customers_finance_read on public.customers for select to authenticated
  using (public.can('finance.view', 'finance') or public.can('finance.invoices', 'finance'));
create policy suppliers_finance_read on public.suppliers for select to authenticated
  using (public.can('finance.view', 'finance') or public.can('finance.bills', 'finance'));
