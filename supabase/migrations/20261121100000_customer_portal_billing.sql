-- =====================================================================
-- CUSTOMER PORTAL, PHASE 2: invoices, payments, M-Pesa, quotations.
--
-- Same protection model as phase 1: customers hold no table rights; every read goes through a portal_*
-- function that starts from portal_customer_id(). Nothing here changes existing data.
--
-- M-PESA (Safaricom Daraja STK Push)
--   * A customer asks to pay an invoice they own. portal_mpesa_prepare() validates it in the database
--     (ownership, payable status, amount <= balance, phone format, no duplicate in flight).
--   * Only the server (service role) talks to Safaricom and records the outcome. Those functions are
--     NOT executable by customers, so a customer can never mark anything paid.
--   * A payment is applied exactly once (row lock + unique receipt) through the same ledger posting used by
--     staff receipts. Anything unusual (amount differs, invoice already settled) goes to "needs_review" for
--     staff instead of being applied.
--   * Ships OFF: needs portal_payment_settings.mpesa_enabled AND the Daraja environment variables.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Payment instructions shown to customers (not secrets: public paybill/till and bank wording)
-- ---------------------------------------------------------------------
create table public.portal_payment_settings (
  id                int primary key default 1 check (id = 1),
  mpesa_enabled     boolean not null default false,
  mpesa_kind        text not null default 'paybill' check (mpesa_kind in ('paybill', 'till')),
  mpesa_number      text check (mpesa_number is null or mpesa_number ~ '^[0-9]{5,10}$'),
  bank_instructions text check (bank_instructions is null or length(bank_instructions) <= 1000),
  payment_note      text check (payment_note is null or length(payment_note) <= 500),
  updated_by        uuid references public.profiles(id) on delete set null,
  updated_at        timestamptz not null default now()
);
insert into public.portal_payment_settings (id) values (1) on conflict do nothing;
create trigger portal_payment_settings_updated before update on public.portal_payment_settings for each row execute function public.set_updated_at();
create trigger portal_payment_settings_audit after update on public.portal_payment_settings for each row execute function public.audit_row('full');
-- Changing where customers are told to send money is fraud-sensitive: it needs a fresh authenticator code.
create trigger portal_payment_settings_mfa before update on public.portal_payment_settings for each row execute function public.guard_mfa();
alter table public.portal_payment_settings enable row level security;
revoke all on public.portal_payment_settings from anon, authenticated;
grant select, update on public.portal_payment_settings to authenticated;
create policy portal_pay_settings_read on public.portal_payment_settings for select to authenticated using (public.can('portal.view', 'portal'));
create policy portal_pay_settings_upd  on public.portal_payment_settings for update to authenticated using (public.can('portal.manage', 'portal')) with check (public.can('portal.manage', 'portal'));

-- ---------------------------------------------------------------------
-- M-Pesa requests
-- ---------------------------------------------------------------------
create table public.mpesa_payments (
  id                  uuid primary key default gen_random_uuid(),
  invoice_id          uuid not null references public.invoices(id) on delete restrict,
  customer_id         uuid not null references public.customers(id) on delete restrict,
  requested_by        uuid references auth.users(id) on delete set null,
  phone               text not null check (phone ~ '^254[17][0-9]{8}$'),
  amount              numeric(16,2) not null check (amount >= 1 and amount <= 250000),
  status              text not null default 'created' check (status in ('created', 'pending', 'succeeded', 'failed', 'cancelled', 'needs_review')),
  merchant_request_id text,
  checkout_request_id text unique,
  mpesa_receipt       text,
  result_code         integer,
  result_desc         text check (result_desc is null or length(result_desc) <= 300),
  payment_id          uuid references public.invoice_payments(id) on delete set null,
  created_at          timestamptz not null default now(),
  completed_at        timestamptz
);
create unique index mpesa_payments_receipt_idx on public.mpesa_payments (mpesa_receipt) where mpesa_receipt is not null;
create index mpesa_payments_invoice_idx on public.mpesa_payments (invoice_id, created_at desc);
alter table public.mpesa_payments enable row level security;
revoke all on public.mpesa_payments from anon, authenticated;
grant select on public.mpesa_payments to authenticated;
create policy mpesa_payments_read on public.mpesa_payments for select to authenticated using (public.can('portal.view', 'portal') or public.can('finance.view', 'finance'));

-- ---------------------------------------------------------------------
-- Invoices (customer side)
-- ---------------------------------------------------------------------
create or replace function public.portal_invoices(p_status text default null, p_limit integer default 25, p_offset integer default 0)
returns table (id uuid, number text, status text, issue_date date, due_date date, currency text, subtotal numeric, tax numeric, total numeric, paid numeric, balance numeric, overdue boolean, order_number text, total_count bigint)
language plpgsql stable security definer set search_path = public as $$
declare cid uuid := public.portal_customer_id();
begin
  if cid is null then return; end if;
  return query
  select i.id, i.number,
         i.status, i.issue_date, i.due_date, i.currency, t.subtotal, t.tax, t.total, t.paid, t.balance,
         (i.status in ('issued', 'partially_paid') and i.due_date is not null and i.due_date < current_date),
         o.number, count(*) over ()
  from public.invoices i
  join public.invoice_totals t on t.invoice_id = i.id
  left join public.sales_orders o on o.id = i.sales_order_id
  where i.customer_id = cid and i.deleted_at is null and i.status in ('issued', 'partially_paid', 'paid')
    and (p_status is null
         or (p_status = 'open' and i.status in ('issued', 'partially_paid'))
         or (p_status = 'overdue' and i.status in ('issued', 'partially_paid') and i.due_date < current_date)
         or i.status = p_status)
  order by coalesce(i.issue_date, i.created_at::date) desc, i.number desc
  limit least(greatest(coalesce(p_limit, 25), 1), 100) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;
revoke all on function public.portal_invoices(text, integer, integer) from public, anon;
grant execute on function public.portal_invoices(text, integer, integer) to authenticated;

create or replace function public.portal_invoice(p_invoice uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare cid uuid := public.portal_customer_id(); i public.invoices%rowtype; t public.invoice_totals%rowtype;
begin
  if cid is null then return null; end if;
  select * into i from public.invoices where id = p_invoice and customer_id = cid and deleted_at is null and status in ('issued', 'partially_paid', 'paid');
  if not found then return null; end if;
  select * into t from public.invoice_totals where invoice_id = i.id;
  return jsonb_build_object(
    'id', i.id, 'number', i.number, 'status', i.status, 'currency', i.currency, 'issue_date', i.issue_date, 'due_date', i.due_date, 'tax_rate', i.tax_rate,
    'notes', i.notes,
    'customer', (select jsonb_build_object('company', c.company_name, 'contact', c.contact_name, 'email', c.email, 'phone', c.phone, 'location', c.location) from public.customers c where c.id = cid),
    'overdue', (i.status in ('issued', 'partially_paid') and i.due_date is not null and i.due_date < current_date),
    'order_id', (select o.id from public.sales_orders o where o.id = i.sales_order_id and o.customer_id = cid),
    'order_number', (select o.number from public.sales_orders o where o.id = i.sales_order_id and o.customer_id = cid),
    'subtotal', t.subtotal, 'tax', t.tax, 'total', t.total, 'paid', t.paid, 'balance', t.balance,
    'items', coalesce((select jsonb_agg(jsonb_build_object('line_no', x.line_no, 'description', x.description, 'quantity', x.quantity, 'unit_price', x.unit_price,
                'line_total', round(x.quantity * x.unit_price, 2)) order by x.line_no) from public.invoice_items x where x.invoice_id = i.id), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(jsonb_build_object('paid_on', y.paid_on, 'amount', y.amount, 'method', y.method, 'reference', y.reference) order by y.paid_on, y.created_at)
                from public.invoice_payments y where y.invoice_id = i.id), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.portal_invoice(uuid) from public, anon;
grant execute on function public.portal_invoice(uuid) to authenticated;

-- Every payment received against this customer's invoices, newest first.
create or replace function public.portal_payments(p_limit integer default 25, p_offset integer default 0)
returns table (paid_on date, amount numeric, method text, reference text, invoice_id uuid, invoice_number text, currency text, total_count bigint)
language plpgsql stable security definer set search_path = public as $$
declare cid uuid := public.portal_customer_id();
begin
  if cid is null then return; end if;
  return query
  select y.paid_on, y.amount, y.method, y.reference, i.id, i.number, i.currency, count(*) over ()
  from public.invoice_payments y join public.invoices i on i.id = y.invoice_id
  where i.customer_id = cid and i.deleted_at is null
  order by y.paid_on desc, y.created_at desc
  limit least(greatest(coalesce(p_limit, 25), 1), 100) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;
revoke all on function public.portal_payments(integer, integer) from public, anon;
grant execute on function public.portal_payments(integer, integer) to authenticated;

-- How to pay (public details only) and whether online M-Pesa is switched on in the settings.
create or replace function public.portal_pay_info()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s public.portal_payment_settings%rowtype;
begin
  if public.portal_customer_id() is null then return null; end if;
  select * into s from public.portal_payment_settings where id = 1;
  return jsonb_build_object('mpesa_online', s.mpesa_enabled, 'mpesa_kind', s.mpesa_kind, 'mpesa_number', s.mpesa_number,
                            'bank_instructions', s.bank_instructions, 'payment_note', s.payment_note);
end;
$$;
revoke all on function public.portal_pay_info() from public, anon;
grant execute on function public.portal_pay_info() to authenticated;

-- Letterhead details for the customer's PDFs (public company information only).
create or replace function public.portal_company()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if public.portal_customer_id() is null then return null; end if;
  return (select jsonb_build_object('legal_name', c.registered_name, 'address', c.address_line, 'city', c.city, 'country', c.country,
            'registration_details', c.registration_details, 'tax_pin', c.tax_pin, 'quotation_terms', c.quotation_terms,
            'phone', (select value from public.contact_channels where kind = 'phone' and is_public and is_active order by is_primary desc limit 1),
            'email', (select value from public.contact_channels where kind = 'email' and is_public and is_active order by is_primary desc limit 1))
          from public.company_settings c where c.id = 1);
end;
$$;
revoke all on function public.portal_company() from public, anon;
grant execute on function public.portal_company() to authenticated;

-- Dashboard, now with money owed.
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
    'cart_lines', (select count(*) from public.portal_cart_items where user_id = auth.uid()),
    'outstanding', (select coalesce(sum(t.balance), 0) from public.invoices i join public.invoice_totals t on t.invoice_id = i.id
                    where i.customer_id = cid and i.deleted_at is null and i.status in ('issued', 'partially_paid')),
    'overdue_count', (select count(*) from public.invoices i where i.customer_id = cid and i.deleted_at is null and i.status in ('issued', 'partially_paid') and i.due_date < current_date),
    'open_invoices', (select count(*) from public.invoices i where i.customer_id = cid and i.deleted_at is null and i.status in ('issued', 'partially_paid')),
    'open_quotes', (select count(*) from public.quotations q where q.customer_id = cid and q.status = 'sent' and (q.valid_until is null or q.valid_until >= current_date))
  );
end;
$$;

-- ---------------------------------------------------------------------
-- M-Pesa: customer side
-- ---------------------------------------------------------------------
create or replace function public.portal_normalise_phone(p text)
returns text language sql immutable set search_path = public as $$
  select case
    when d ~ '^0[17][0-9]{8}$'    then '254' || substr(d, 2)
    when d ~ '^254[17][0-9]{8}$'  then d
    when d ~ '^\+?254[17][0-9]{8}$' then regexp_replace(d, '^\+', '')
    when d ~ '^[17][0-9]{8}$'     then '254' || d
    else null end
  from (select regexp_replace(coalesce(p, ''), '[\s-]', '', 'g') as d) s
$$;
revoke all on function public.portal_normalise_phone(text) from public, anon;
grant execute on function public.portal_normalise_phone(text) to authenticated;

create or replace function public.portal_mpesa_prepare(p_invoice uuid, p_phone text, p_amount numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare cid uuid := public.portal_require(); i public.invoices%rowtype; t public.invoice_totals%rowtype; ph text := public.portal_normalise_phone(p_phone); mid uuid; s public.portal_payment_settings%rowtype;
begin
  select * into s from public.portal_payment_settings where id = 1;
  if not s.mpesa_enabled then raise exception 'Online M-Pesa payment is not available yet.' using errcode = 'P0001'; end if;
  if ph is null then raise exception 'Enter a Safaricom number such as 0712 345 678.' using errcode = 'P0001'; end if;
  select * into i from public.invoices where id = p_invoice and customer_id = cid and deleted_at is null for update;
  if not found or i.status not in ('issued', 'partially_paid') then raise exception 'That invoice cannot be paid online.' using errcode = 'P0001'; end if;
  if i.currency <> 'KES' then raise exception 'M-Pesa pays in Kenya shillings only.' using errcode = 'P0001'; end if;
  select * into t from public.invoice_totals where invoice_id = i.id;
  p_amount := round(p_amount, 0);                                   -- STK Push takes whole shillings
  if p_amount is null or p_amount < 1 then raise exception 'Enter the amount to pay.' using errcode = 'P0001'; end if;
  if p_amount > floor(t.balance) then raise exception 'That is more than the balance of KES %.', floor(t.balance) using errcode = 'P0001'; end if;
  if p_amount > 250000 then raise exception 'M-Pesa allows up to KES 250,000 per payment. Please pay in parts or use the bank details.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.mpesa_payments where invoice_id = i.id and status in ('created', 'pending') and created_at > now() - interval '3 minutes') then
    raise exception 'A payment request for this invoice is already in progress. Check your phone, or wait a few minutes.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.mpesa_payments where customer_id = cid and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Too many payment requests. Please try again later.' using errcode = 'P0001';
  end if;
  insert into public.mpesa_payments (invoice_id, customer_id, requested_by, phone, amount) values (i.id, cid, auth.uid(), ph, p_amount) returning id into mid;
  return jsonb_build_object('id', mid, 'amount', p_amount, 'phone', ph, 'account_ref', left(i.number, 12), 'description', left('Invoice ' || i.number, 13));
end;
$$;
revoke all on function public.portal_mpesa_prepare(uuid, text, numeric) from public, anon;
grant execute on function public.portal_mpesa_prepare(uuid, text, numeric) to authenticated;

-- Status of one of the caller's own requests (a pending request older than 10 minutes is shown as expired).
create or replace function public.portal_mpesa_status(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare cid uuid := public.portal_customer_id(); m public.mpesa_payments%rowtype; st text;
begin
  if cid is null then return null; end if;
  select * into m from public.mpesa_payments where id = p_id and customer_id = cid;
  if not found then return null; end if;
  st := case when m.status in ('created', 'pending') and m.created_at < now() - interval '10 minutes' then 'expired' else m.status end;
  return jsonb_build_object('id', m.id, 'status', st, 'amount', m.amount, 'receipt', m.mpesa_receipt, 'invoice_id', m.invoice_id, 'age', floor(extract(epoch from now() - m.created_at)),
                            'message', case when st in ('failed', 'cancelled') then m.result_desc end);
end;
$$;
revoke all on function public.portal_mpesa_status(uuid) from public, anon;
grant execute on function public.portal_mpesa_status(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- M-Pesa: server side only (service role). Customers cannot call these.
-- ---------------------------------------------------------------------
create or replace function public.mpesa_attach_request(p_id uuid, p_merchant text, p_checkout text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.mpesa_payments set status = 'pending', merchant_request_id = left(p_merchant, 80), checkout_request_id = left(p_checkout, 80)
  where id = p_id and status = 'created';
  if not found then raise exception 'Request not found or already sent'; end if;
end;
$$;

create or replace function public.mpesa_fail_request(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.mpesa_payments set status = 'failed', result_desc = left(p_reason, 300), completed_at = now() where id = p_id and status in ('created', 'pending');
end;
$$;

-- Applies a Safaricom result exactly once. Returns the final status.
create or replace function public.mpesa_complete(p_checkout text, p_result_code integer, p_desc text, p_receipt text, p_amount numeric, p_phone text)
returns text language plpgsql security definer set search_path = public as $$
declare m public.mpesa_payments%rowtype; i public.invoices%rowtype; t public.invoice_totals%rowtype; pid uuid; newbal numeric; cust text;
begin
  select * into m from public.mpesa_payments where checkout_request_id = p_checkout for update;
  if not found then return 'unknown'; end if;
  if m.status not in ('pending', 'created') then return m.status; end if;      -- already settled: a repeated callback changes nothing

  if p_result_code is distinct from 0 then
    update public.mpesa_payments set status = case when p_result_code = 1032 then 'cancelled' else 'failed' end, result_code = p_result_code,
           result_desc = left(coalesce(p_desc, 'The payment was not completed.'), 300), completed_at = now() where id = m.id;
    return case when p_result_code = 1032 then 'cancelled' else 'failed' end;
  end if;

  -- Success from Safaricom. Anything that does not add up is held for a person instead of being applied.
  if p_receipt is null or p_receipt !~ '^[A-Z0-9]{8,14}$' or exists (select 1 from public.mpesa_payments where mpesa_receipt = p_receipt and id <> m.id) then
    update public.mpesa_payments set status = 'needs_review', result_code = 0, result_desc = 'Missing or repeated receipt number', completed_at = now() where id = m.id;
    return 'needs_review';
  end if;
  select * into i from public.invoices where id = m.invoice_id for update;
  select * into t from public.invoice_totals where invoice_id = m.invoice_id;
  if p_amount is distinct from m.amount or i.status not in ('issued', 'partially_paid') or m.amount > t.balance then
    update public.mpesa_payments set status = 'needs_review', result_code = 0, mpesa_receipt = p_receipt, result_desc = 'Amount or invoice state did not match; check before applying', completed_at = now() where id = m.id;
    return 'needs_review';
  end if;

  insert into public.invoice_payments (invoice_id, paid_on, amount, method, reference, recorded_by)
  values (m.invoice_id, current_date, m.amount, 'mpesa', p_receipt, null) returning id into pid;
  newbal := t.balance - m.amount;
  update public.invoices set status = case when newbal <= 0 then 'paid' else 'partially_paid' end where id = m.invoice_id;
  select coalesce(c.company_name, c.contact_name) into cust from public.customers c where c.id = i.customer_id;
  perform public.fin_post('invoice_payment', pid, 'income', 'sales', m.amount, i.currency, 'M-Pesa payment for ' || i.number, cust, p_receipt, current_date);
  update public.mpesa_payments set status = 'succeeded', result_code = 0, mpesa_receipt = p_receipt, payment_id = pid, result_desc = null, completed_at = now() where id = m.id;
  return 'succeeded';
end;
$$;

revoke all on function public.mpesa_attach_request(uuid, text, text), public.mpesa_fail_request(uuid, text), public.mpesa_complete(text, integer, text, text, numeric, text) from public, anon, authenticated;
grant execute on function public.mpesa_attach_request(uuid, text, text), public.mpesa_fail_request(uuid, text), public.mpesa_complete(text, integer, text, text, numeric, text) to service_role;

-- ---------------------------------------------------------------------
-- Quotation requests and quotations
-- ---------------------------------------------------------------------
alter table public.enquiries drop constraint if exists enquiries_source_check;
alter table public.enquiries add constraint enquiries_source_check check (source in ('website', 'phone', 'email', 'walk_in', 'tender', 'other', 'portal'));

-- items: [{"product_id": uuid|null, "description": text, "quantity": text}]  (free text lines are allowed)
create or replace function public.portal_request_quote(p_items jsonb, p_notes text, p_needed_by date, p_location text)
returns text language plpgsql security definer set search_path = public as $$
declare
  cid uuid := public.portal_require(); e record; n integer := 0; lines text[] := '{}'; qtys text[] := '{}'; first_product uuid; ref text;
  notes text := nullif(btrim(coalesce(p_notes, '')), ''); loc text := nullif(btrim(coalesce(p_location, '')), '');
  pname text; d text; q text; pid uuid;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Add at least one product to your request.' using errcode = 'P0001'; end if;
  if jsonb_array_length(p_items) > 30 then raise exception 'A request can have up to 30 lines.' using errcode = 'P0001'; end if;
  if notes is not null and length(notes) > 3000 then raise exception 'Notes can be up to 3000 characters.' using errcode = 'P0001'; end if;
  if loc is not null and length(loc) > 300 then raise exception 'The delivery location is too long.' using errcode = 'P0001'; end if;
  if p_needed_by is not null and (p_needed_by < current_date or p_needed_by > current_date + 365) then raise exception 'Choose a date within the next year.' using errcode = 'P0001'; end if;
  if (select count(*) from public.enquiries where customer_id = cid and source = 'portal' and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Too many requests were sent in the last hour. Please contact us.' using errcode = 'P0001';
  end if;
  for e in select value from jsonb_array_elements(p_items) loop
    d := left(btrim(coalesce(e.value ->> 'description', '')), 200);
    q := left(btrim(coalesce(e.value ->> 'quantity', '')), 40);
    pid := null; pname := null;
    begin pid := nullif(e.value ->> 'product_id', '')::uuid; exception when others then pid := null; end;
    if pid is not null then select name into pname from public.products where id = pid and status = 'published' and deleted_at is null; end if;
    if pname is null and d = '' then raise exception 'Each line needs a product or a description.' using errcode = 'P0001'; end if;
    n := n + 1;
    if pname is not null and first_product is null then first_product := pid; end if;
    lines := lines || (coalesce(pname, d) || case when q <> '' then ' x ' || q else '' end);
    qtys := qtys || q;
  end loop;
  insert into public.enquiries (customer_id, product_id, product_text, quantity_text, delivery_location, required_by, message, source, consent_recorded)
  values (cid, case when n = 1 then first_product end, left(array_to_string(lines, E'\n'), 2000), left(nullif(array_to_string(qtys, ', '), ''), 200), loc, p_needed_by, notes, 'portal', true)
  returning reference into ref;
  return ref;
end;
$$;
revoke all on function public.portal_request_quote(jsonb, text, date, text) from public, anon;
grant execute on function public.portal_request_quote(jsonb, text, date, text) to authenticated;

create or replace function public.portal_quotes(p_limit integer default 25, p_offset integer default 0)
returns table (id uuid, number text, status text, issue_date date, valid_until date, currency text, total numeric, total_count bigint)
language plpgsql stable security definer set search_path = public as $$
declare cid uuid := public.portal_customer_id();
begin
  if cid is null then return; end if;
  return query
  select q.id, q.number,
         case when q.status = 'sent' and q.valid_until is not null and q.valid_until < current_date then 'expired' else q.status end,
         q.issue_date, q.valid_until, q.currency,
         (select round(coalesce(sum(round(x.quantity * x.unit_price, 2)), 0) * (1 + q.tax_rate_percent / 100), 2) from public.quotation_items x where x.quotation_id = q.id),
         count(*) over ()
  from public.quotations q
  where q.customer_id = cid and q.status in ('sent', 'accepted', 'declined', 'expired')
  order by q.issue_date desc, q.number desc
  limit least(greatest(coalesce(p_limit, 25), 1), 100) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;
revoke all on function public.portal_quotes(integer, integer) from public, anon;
grant execute on function public.portal_quotes(integer, integer) to authenticated;

create or replace function public.portal_quote(p_quote uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare cid uuid := public.portal_customer_id(); q public.quotations%rowtype; sub numeric; eff text;
begin
  if cid is null then return null; end if;
  select * into q from public.quotations where id = p_quote and customer_id = cid and status in ('sent', 'accepted', 'declined', 'expired');
  if not found then return null; end if;
  select coalesce(sum(round(x.quantity * x.unit_price, 2)), 0) into sub from public.quotation_items x where x.quotation_id = q.id;
  eff := case when q.status = 'sent' and q.valid_until is not null and q.valid_until < current_date then 'expired' else q.status end;
  return jsonb_build_object(
    'id', q.id, 'number', q.number, 'status', eff, 'currency', q.currency, 'issue_date', q.issue_date, 'valid_until', q.valid_until,
    'delivery_terms', q.delivery_terms, 'payment_terms', q.payment_terms, 'notes', q.notes, 'tax_rate', q.tax_rate_percent,
    'subtotal', sub, 'tax', round(sub * q.tax_rate_percent / 100, 2), 'total', sub + round(sub * q.tax_rate_percent / 100, 2),
    'customer', (select jsonb_build_object('company', c.company_name, 'contact', c.contact_name, 'email', c.email, 'phone', c.phone, 'location', c.location) from public.customers c where c.id = cid),
    'can_decide', eff = 'sent', 'decision', q.decision, 'decision_at', q.decision_at, 'decision_note', q.decision_note,
    'items', coalesce((select jsonb_agg(jsonb_build_object('line_no', x.line_no, 'description', x.description, 'quantity', x.quantity, 'unit', u.abbreviation,
                'unit_price', x.unit_price, 'line_total', round(x.quantity * x.unit_price, 2)) order by x.line_no)
              from public.quotation_items x left join public.units u on u.id = x.unit_id where x.quotation_id = q.id), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.portal_quote(uuid) from public, anon;
grant execute on function public.portal_quote(uuid) to authenticated;

create or replace function public.portal_quote_decide(p_quote uuid, p_decision text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare cid uuid := public.portal_require();
begin
  if p_decision not in ('accepted', 'declined') then raise exception 'Choose accept or decline.' using errcode = 'P0001'; end if;
  update public.quotations
     set status = p_decision, decision_note = left(nullif(btrim(coalesce(p_note, '')), ''), 500)
   where id = p_quote and customer_id = cid and status = 'sent' and (valid_until is null or valid_until >= current_date);
  if not found then raise exception 'This quotation can no longer be answered online. Please contact us.' using errcode = 'P0001'; end if;
end;
$$;
revoke all on function public.portal_quote_decide(uuid, text, text) from public, anon;
grant execute on function public.portal_quote_decide(uuid, text, text) to authenticated;

-- Staff alerts (same rule as phase 1, still OFF by default)
create or replace function public.trg_portal_enquiry_alert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.source <> 'portal' or not public.auto_rule_active('portal_staff_alerts') then return new; end if;
  perform public.auto_notify_perm('portal_staff_alerts', 'crm.manage', null, 'Quotation request ' || new.reference,
    'A portal customer asked for a quotation.', '/admin/crm/enquiries', 'info', 'portal-enquiry:' || new.id);
  return new;
exception when others then
  raise warning 'portal alert failed: %', sqlerrm;
  return new;
end;
$$;
revoke all on function public.trg_portal_enquiry_alert() from public, anon, authenticated;
create trigger enquiries_portal_alert after insert on public.enquiries for each row execute function public.trg_portal_enquiry_alert();
