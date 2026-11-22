-- =====================================================================
-- CUSTOMER PORTAL, PHASE 3: bulk order upload and support tickets.
--
-- Same protection model as phases 1 and 2: customers hold no table rights; every read and write goes through
-- a portal_* function that starts from the caller's own customer.
--
-- BULK UPLOAD
--   The app turns the customer's CSV into rows (code or name + quantity). The DATABASE decides what each row
--   means: it finds the published product, applies this customer's price, minimum order, pack step and stock
--   rules, and says why a row is refused. Nothing in the file is trusted; adding to the cart re-checks everything,
--   and checkout checks it all again.
--
-- SUPPORT TICKETS
--   Customers open tickets (optionally about one of THEIR orders or invoices) and reply; staff reply, add
--   internal notes (never shown to customers) and change status. All messages are append-only.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Bulk order: row checking
-- ---------------------------------------------------------------------
-- rows: [{"line": 1, "ref": "RICE-50", "quantity": "20"}]
create or replace function public.portal_bulk_check(p_cid uuid, p_rows jsonb)
returns table (line integer, ref text, product_id uuid, name text, quantity numeric, unit_price numeric, currency text, status text, message text)
language plpgsql stable security definer set search_path = public as $$
declare
  e record; r text; qtxt text; q numeric; ids uuid[]; pid uuid; ln integer; n integer := 0;
  pi record; si record; pname text; seen jsonb := '{}'::jsonb;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'Nothing to check.' using errcode = 'P0001'; end if;
  if jsonb_array_length(p_rows) = 0 then raise exception 'The file has no rows.' using errcode = 'P0001'; end if;
  if jsonb_array_length(p_rows) > 300 then raise exception 'A file can have up to 300 rows.' using errcode = 'P0001'; end if;

  for e in select value from jsonb_array_elements(p_rows) loop
    n := n + 1;
    begin ln := (e.value ->> 'line')::integer; exception when others then ln := n; end;
    r := left(btrim(coalesce(e.value ->> 'ref', '')), 80);
    qtxt := btrim(coalesce(e.value ->> 'quantity', ''));
    line := ln; ref := r; product_id := null; name := null; quantity := null; unit_price := null; currency := null;

    if r = '' then status := 'not_found'; message := 'This row has no product code or name.'; return next; continue; end if;

    select array_agg(p.id) into ids from (
      select p.id from public.products p join public.product_variants v on v.product_id = p.id and v.is_active where p.status = 'published' and p.deleted_at is null and v.sku is not null and lower(v.sku) = lower(r)
      union
      select p.id from public.products p where p.status = 'published' and p.deleted_at is null and lower(p.slug) = lower(r)
    ) p;
    if ids is null then
      select array_agg(p.id) into ids from public.products p where p.status = 'published' and p.deleted_at is null and lower(p.name) = lower(r);
    end if;
    if ids is null then status := 'not_found'; message := 'No product matches this code or name.'; return next; continue; end if;
    if array_length(ids, 1) > 1 then status := 'ambiguous'; message := 'More than one product matches. Use the product code.'; return next; continue; end if;
    pid := ids[1];
    select p.name into pname from public.products p where p.id = pid;
    product_id := pid; name := pname;

    if qtxt !~ '^[0-9]{1,7}(\.[0-9]{1,3})?$' then status := 'invalid_qty'; message := 'The quantity must be a positive number.'; return next; continue; end if;
    q := qtxt::numeric;
    if q <= 0 or q > 1000000 then status := 'invalid_qty'; message := 'The quantity must be a positive number.'; return next; continue; end if;
    quantity := q;

    if seen ? pid::text then status := 'duplicate'; message := 'Already listed on line ' || (seen ->> pid::text) || '; this row is skipped.'; return next; continue; end if;
    seen := seen || jsonb_build_object(pid::text, ln);

    select * into pi from public.portal_price_info(p_cid, pid);
    if not found or pi.effective is null or not pi.orderable then
      status := 'no_price'; message := 'Not available to order online. Request a quotation for this item.'; return next; continue;
    end if;
    unit_price := pi.effective; currency := coalesce(pi.currency, 'KES');
    if q < pi.min_qty then status := 'below_minimum'; message := 'The minimum order is ' || trim(trailing '.' from trim(trailing '0' from pi.min_qty::text)) || '.'; return next; continue; end if;
    if pi.step > 0 and mod(q - pi.min_qty, pi.step) <> 0 then status := 'step'; message := 'Order in steps of ' || trim(trailing '.' from trim(trailing '0' from pi.step::text)) || '.'; return next; continue; end if;
    select * into si from public.portal_stock_info(pid);
    if si.tracked and q > si.available then status := 'exceeds_stock'; message := 'Only ' || trim(trailing '.' from trim(trailing '0' from si.available::text)) || ' available.'; return next; continue; end if;

    status := 'ok'; message := null; return next;
  end loop;
end;
$$;
revoke all on function public.portal_bulk_check(uuid, jsonb) from public, anon, authenticated;

create or replace function public.portal_bulk_preview(p_rows jsonb)
returns table (line integer, ref text, product_id uuid, name text, quantity numeric, unit_price numeric, currency text, status text, message text)
language plpgsql stable security definer set search_path = public as $$
declare cid uuid := public.portal_require();
begin
  return query select * from public.portal_bulk_check(cid, p_rows);
end;
$$;
revoke all on function public.portal_bulk_preview(jsonb) from public, anon;
grant execute on function public.portal_bulk_preview(jsonb) to authenticated;

-- Adds every row that passes to the caller's cart (replacing that product's quantity). Rechecks everything itself.
create or replace function public.portal_bulk_add(p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare cid uuid := public.portal_require(); c record; added integer := 0; skipped integer := 0;
begin
  for c in select * from public.portal_bulk_check(cid, p_rows) loop
    if c.status = 'ok' then
      perform public.portal_cart_set(c.product_id, c.quantity);
      added := added + 1;
    else
      skipped := skipped + 1;
    end if;
  end loop;
  return jsonb_build_object('added', added, 'skipped', skipped);
end;
$$;
revoke all on function public.portal_bulk_add(jsonb) from public, anon;
grant execute on function public.portal_bulk_add(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- Support tickets
-- ---------------------------------------------------------------------
create sequence public.support_ticket_seq start 1001;

create table public.support_tickets (
  id                uuid primary key default gen_random_uuid(),
  reference         text not null unique default ('TKT-' || nextval('public.support_ticket_seq')),
  customer_id       uuid not null references public.customers(id) on delete restrict,
  created_by        uuid references auth.users(id) on delete set null,
  subject           text not null check (length(btrim(subject)) between 3 and 150),
  category          text not null default 'other' check (category in ('order', 'delivery', 'invoice', 'payment', 'product', 'account', 'other')),
  status            text not null default 'open' check (status in ('open', 'in_progress', 'awaiting_customer', 'resolved', 'closed')),
  order_id          uuid references public.sales_orders(id) on delete set null,
  invoice_id        uuid references public.invoices(id) on delete set null,
  assigned_to       uuid references public.profiles(id) on delete set null,
  last_activity_at  timestamptz not null default now(),
  resolved_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index support_tickets_customer_idx on public.support_tickets (customer_id, last_activity_at desc);
create index support_tickets_status_idx on public.support_tickets (status, last_activity_at desc);

create table public.support_messages (
  id           uuid primary key default gen_random_uuid(),
  ticket_id    uuid not null references public.support_tickets(id) on delete cascade,
  author_type  text not null check (author_type in ('customer', 'staff')),
  author_id    uuid references auth.users(id) on delete set null,
  author_name  text,
  body         text not null check (length(btrim(body)) between 1 and 4000),
  internal     boolean not null default false check (not internal or author_type = 'staff'),
  created_at   timestamptz not null default now()
);
create index support_messages_ticket_idx on public.support_messages (ticket_id, created_at);

-- Tickets: staff may change status/assignee only. Who raised it, what about, and the wording never change.
create or replace function public.guard_support_ticket()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.reference is distinct from old.reference or new.customer_id is distinct from old.customer_id or new.created_by is distinct from old.created_by
     or new.subject is distinct from old.subject or new.category is distinct from old.category or new.order_id is distinct from old.order_id
     or new.invoice_id is distinct from old.invoice_id or new.created_at is distinct from old.created_at then
    raise exception 'Only the status and assignee of a ticket can be changed.' using errcode = 'P0001';
  end if;
  if new.status in ('resolved', 'closed') and old.status not in ('resolved', 'closed') then new.resolved_at := now();
  elsif new.status not in ('resolved', 'closed') then new.resolved_at := null; end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger support_tickets_guard before update on public.support_tickets for each row execute function public.guard_support_ticket();
create trigger support_tickets_audit after update on public.support_tickets for each row execute function public.audit_row('full');

-- Messages are append-only. Staff messages are always attributed to the signed-in staff member.
-- The author's display name. Returns the CALLER's own name only (or any name when there is no signed-in caller,
-- i.e. the server), so it cannot be used to look up other people.
create or replace function public.support_author_name(p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select case when auth.uid() is null or p_user = auth.uid() then
    left(coalesce((select p.full_name from public.profiles p where p.id = p_user),
                  (select coalesce(c.contact_name, c.company_name) from public.customer_accounts a join public.customers c on c.id = a.customer_id where a.user_id = p_user limit 1)), 100)
  end
$$;
revoke all on function public.support_author_name(uuid) from public, anon;
grant execute on function public.support_author_name(uuid) to authenticated;

create or replace function public.guard_support_message()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op <> 'INSERT' then raise exception 'Support messages cannot be changed or removed.' using errcode = 'P0001'; end if;
  if current_user in ('authenticated', 'anon') then new.author_type := 'staff'; new.author_id := auth.uid(); end if;
  new.author_name := public.support_author_name(new.author_id);   -- written once, here
  return new;
end;
$$;
create trigger support_messages_guard before insert or update or delete on public.support_messages for each row execute function public.guard_support_message();

-- A new message moves the ticket on: a customer message needs staff attention; a staff reply waits on the customer.
create or replace function public.trg_support_message_after()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.support_tickets t set last_activity_at = now(),
    status = case
      when new.author_type = 'customer' and t.status <> 'closed' then 'open'
      when new.author_type = 'staff' and not new.internal and t.status in ('open', 'in_progress') then 'awaiting_customer'
      else t.status end
  where t.id = new.ticket_id;
  return new;
end;
$$;
revoke all on function public.trg_support_message_after() from public, anon, authenticated;
create trigger support_messages_after after insert on public.support_messages for each row execute function public.trg_support_message_after();

alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;
revoke all on public.support_tickets, public.support_messages from anon, authenticated;
grant select, update on public.support_tickets to authenticated;
grant select, insert on public.support_messages to authenticated;
create policy support_tickets_read on public.support_tickets for select to authenticated using (public.can('portal.view', 'portal'));
create policy support_tickets_upd  on public.support_tickets for update to authenticated using (public.can('portal.manage', 'portal')) with check (public.can('portal.manage', 'portal'));
create policy support_messages_read on public.support_messages for select to authenticated using (public.can('portal.view', 'portal'));
create policy support_messages_ins  on public.support_messages for insert to authenticated with check (public.can('portal.manage', 'portal'));

-- ---------------------------------------------------------------------
-- Support tickets: customer side
-- ---------------------------------------------------------------------
create or replace function public.portal_tickets(p_status text default null, p_limit integer default 25, p_offset integer default 0)
returns table (id uuid, reference text, subject text, category text, status text, last_activity_at timestamptz, created_at timestamptz, total_count bigint)
language plpgsql stable security definer set search_path = public as $$
declare cid uuid := public.portal_customer_id();
begin
  if cid is null then return; end if;
  return query
  select t.id, t.reference, t.subject, t.category, t.status, t.last_activity_at, t.created_at, count(*) over ()
  from public.support_tickets t
  where t.customer_id = cid
    and (p_status is null or (p_status = 'open' and t.status in ('open', 'in_progress', 'awaiting_customer')) or t.status = p_status)
  order by t.last_activity_at desc
  limit least(greatest(coalesce(p_limit, 25), 1), 100) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;
revoke all on function public.portal_tickets(text, integer, integer) from public, anon;
grant execute on function public.portal_tickets(text, integer, integer) to authenticated;

-- The conversation. Internal staff notes are never included. Staff are shown by first name only.
create or replace function public.portal_ticket(p_ticket uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare cid uuid := public.portal_customer_id(); t public.support_tickets%rowtype;
begin
  if cid is null then return null; end if;
  select * into t from public.support_tickets where id = p_ticket and customer_id = cid;
  if not found then return null; end if;
  return jsonb_build_object(
    'id', t.id, 'reference', t.reference, 'subject', t.subject, 'category', t.category, 'status', t.status, 'created_at', t.created_at, 'resolved_at', t.resolved_at,
    'order_id', (select o.id from public.sales_orders o where o.id = t.order_id and o.customer_id = cid),
    'order_number', (select o.number from public.sales_orders o where o.id = t.order_id and o.customer_id = cid),
    'invoice_id', (select i.id from public.invoices i where i.id = t.invoice_id and i.customer_id = cid and i.status in ('issued', 'partially_paid', 'paid')),
    'invoice_number', (select i.number from public.invoices i where i.id = t.invoice_id and i.customer_id = cid and i.status in ('issued', 'partially_paid', 'paid')),
    'messages', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'from', m.author_type, 'body', m.body, 'created_at', m.created_at,
                  'author', case when m.author_type = 'staff' then coalesce(nullif(split_part(coalesce(m.author_name, ''), ' ', 1), ''), 'Samsal team') else 'You' end) order by m.created_at, m.id)
                from public.support_messages m
                where m.ticket_id = t.id and not m.internal), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.portal_ticket(uuid) from public, anon;
grant execute on function public.portal_ticket(uuid) to authenticated;

create or replace function public.portal_ticket_create(p_subject text, p_category text, p_body text, p_order uuid default null, p_invoice uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare cid uuid := public.portal_require(); tid uuid; subj text := btrim(coalesce(p_subject, '')); body text := btrim(coalesce(p_body, ''));
begin
  if length(subj) < 3 or length(subj) > 150 then raise exception 'Give your ticket a short subject (3 to 150 characters).' using errcode = 'P0001'; end if;
  if length(body) < 1 or length(body) > 4000 then raise exception 'Describe the problem (up to 4000 characters).' using errcode = 'P0001'; end if;
  if p_category not in ('order', 'delivery', 'invoice', 'payment', 'product', 'account', 'other') then raise exception 'Choose a category.' using errcode = 'P0001'; end if;
  if p_order is not null and not exists (select 1 from public.sales_orders where id = p_order and customer_id = cid and deleted_at is null) then raise exception 'That order could not be found.' using errcode = 'P0001'; end if;
  if p_invoice is not null and not exists (select 1 from public.invoices where id = p_invoice and customer_id = cid and deleted_at is null and status in ('issued', 'partially_paid', 'paid')) then raise exception 'That invoice could not be found.' using errcode = 'P0001'; end if;
  if (select count(*) from public.support_tickets where customer_id = cid and created_at > now() - interval '1 hour') >= 5
     or (select count(*) from public.support_tickets where customer_id = cid and created_at > now() - interval '1 day') >= 20 then
    raise exception 'Too many tickets were opened recently. Please reply to an existing ticket or call us.' using errcode = 'P0001';
  end if;
  insert into public.support_tickets (customer_id, created_by, subject, category, order_id, invoice_id) values (cid, auth.uid(), subj, p_category, p_order, p_invoice) returning id into tid;
  insert into public.support_messages (ticket_id, author_type, author_id, body) values (tid, 'customer', auth.uid(), body);
  return tid;
end;
$$;
revoke all on function public.portal_ticket_create(text, text, text, uuid, uuid) from public, anon;
grant execute on function public.portal_ticket_create(text, text, text, uuid, uuid) to authenticated;

create or replace function public.portal_ticket_reply(p_ticket uuid, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare cid uuid := public.portal_require(); t public.support_tickets%rowtype; body text := btrim(coalesce(p_body, ''));
begin
  if length(body) < 1 or length(body) > 4000 then raise exception 'Write your message (up to 4000 characters).' using errcode = 'P0001'; end if;
  select * into t from public.support_tickets where id = p_ticket and customer_id = cid for update;
  if not found then raise exception 'That ticket could not be found.' using errcode = 'P0001'; end if;
  if t.status = 'closed' then raise exception 'This ticket is closed. Please open a new one.' using errcode = 'P0001'; end if;
  if (select count(*) from public.support_messages where author_id = auth.uid() and author_type = 'customer' and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Too many messages. Please wait a little before sending more.' using errcode = 'P0001';
  end if;
  insert into public.support_messages (ticket_id, author_type, author_id, body) values (t.id, 'customer', auth.uid(), body);
end;
$$;
revoke all on function public.portal_ticket_reply(uuid, text) from public, anon;
grant execute on function public.portal_ticket_reply(uuid, text) to authenticated;

create or replace function public.portal_ticket_close(p_ticket uuid)
returns void language plpgsql security definer set search_path = public as $$
declare cid uuid := public.portal_require();
begin
  update public.support_tickets set status = 'closed' where id = p_ticket and customer_id = cid and status <> 'closed';
  if not found then raise exception 'That ticket could not be found.' using errcode = 'P0001'; end if;
end;
$$;
revoke all on function public.portal_ticket_close(uuid) from public, anon;
grant execute on function public.portal_ticket_close(uuid) to authenticated;

-- The dashboard now also counts tickets waiting for the customer's reply.
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
    'open_quotes', (select count(*) from public.quotations q where q.customer_id = cid and q.status = 'sent' and (q.valid_until is null or q.valid_until >= current_date)),
    'tickets_awaiting_you', (select count(*) from public.support_tickets t where t.customer_id = cid and t.status = 'awaiting_customer')
  );
end;
$$;

-- Staff alerts (same rule as before, still OFF by default): a new ticket, or a customer reply.
create or replace function public.trg_portal_support_alert()
returns trigger language plpgsql security definer set search_path = public as $$
declare t public.support_tickets%rowtype; first_msg boolean;
begin
  if new.author_type <> 'customer' or not public.auto_rule_active('portal_staff_alerts') then return new; end if;
  select * into t from public.support_tickets where id = new.ticket_id;
  first_msg := (select count(*) from public.support_messages where ticket_id = new.ticket_id) = 1;
  perform public.auto_notify_perm('portal_staff_alerts', 'portal.manage', null,
    case when first_msg then 'New support ticket ' || t.reference else 'Customer replied on ' || t.reference end,
    left(t.subject, 150), '/admin/portal/tickets/' || t.id, 'info', 'portal-ticket:' || new.id);
  return new;
exception when others then
  raise warning 'portal support alert failed: %', sqlerrm;
  return new;
end;
$$;
revoke all on function public.trg_portal_support_alert() from public, anon, authenticated;
create trigger support_messages_alert after insert on public.support_messages for each row execute function public.trg_portal_support_alert();
