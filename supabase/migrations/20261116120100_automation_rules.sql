-- =====================================================================
-- 0013 AUTOMATIONS: the rules themselves
-- Works on real records only. Rules that belong to a module that is switched off simply do not run.
-- Event automations are triggers that can never block or roll back the business action that
-- caused them. Scheduled automations are run by public.run_automations() (see the scheduler migration).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Rule catalogue
-- ---------------------------------------------------------------------
insert into public.automation_rules
  (key, name, description, category, kind, module, schedule_minutes, params, params_help, email_capable, sort_order) values
  -- Enquiries
  ('enquiry_assign',   'Assign new enquiries to staff', 'Gives every new enquiry to the member of staff with the fewest open enquiries (staff who hold the "manage enquiries" permission).', 'enquiries', 'event', 'crm', null, '{}', '{}', false, 10),
  ('enquiry_notify_staff', 'Alert staff to new enquiries', 'Tells the assigned person (and other enquiry managers) as soon as a new enquiry arrives.', 'enquiries', 'event', 'crm', null, '{}', '{}', false, 11),
  ('enquiry_ack',      'Acknowledge enquiries by email', 'Emails the customer a confirmation with their enquiry reference. Needs email to be switched on (requires a verified sending domain).', 'enquiries', 'event', 'crm', null, '{}', '{}', true, 12),
  ('enquiry_unanswered', 'Remind about unanswered enquiries', 'Reminds the assigned person when an enquiry is still "new" after the set number of hours.', 'enquiries', 'scheduled', 'crm', 60, '{"hours_unanswered": 24, "repeat_days": 1}', '{"hours_unanswered": "Remind after this many hours without a response", "repeat_days": "Repeat the reminder every this many days"}', false, 20),
  ('enquiry_followup', 'Remind about follow-up dates', 'Reminds the assigned person when an enquiry''s follow-up date arrives and the enquiry is still open.', 'enquiries', 'scheduled', 'crm', 120, '{}', '{}', false, 21),
  -- Quotations
  ('quotation_pending', 'Chase quotations with no decision', 'Reminds the preparer when a quotation has been sent and the customer has not decided. Also warns before a quotation expires and when it has expired.', 'quotations', 'scheduled', 'quotations', 360, '{"days_pending": 3, "repeat_days": 3, "days_expiring": 2}', '{"days_pending": "Start reminding this many days after issue", "repeat_days": "Repeat the reminder every this many days", "days_expiring": "Warn this many days before the quotation expires"}', false, 30),
  -- Procurement
  ('quote_comparison', 'Compare supplier quotes', 'When an enquiry has two or more valid supplier quotes for the same item, tells procurement which is the best value (lowest landed cost per unit, including extra costs).', 'procurement', 'scheduled', 'procurement', 60, '{}', '{}', false, 40),
  ('po_approval',      'Purchase order approval notices', 'Tells approvers when a purchase order is waiting for approval, and tells procurement when it has been approved.', 'procurement', 'event', 'procurement', null, '{}', '{}', false, 41),
  ('po_supplier_notice', 'Notify supplier after approval', 'When a purchase order is approved, prompts procurement to send it and, if email is on, queues the order email to the supplier.', 'procurement', 'event', 'procurement', null, '{}', '{}', true, 42),
  -- Tenders
  ('tender_checklist', 'Generate tender document checklists', 'Creates a document checklist when a tender is added or moves to "preparing", from the editable checklist template plus the tender''s eligibility notes.', 'tenders', 'event', 'tenders', null, '{}', '{}', false, 50),
  ('tender_deadlines', 'Tender deadline reminders', 'Reminds the tender owner and tender managers at set points before the submission deadline, and once if the deadline passes without submission.', 'tenders', 'scheduled', 'tenders', 360, '{"days_1": 7, "days_2": 3, "days_3": 1}', '{"days_1": "First reminder, days before deadline", "days_2": "Second reminder, days before deadline", "days_3": "Final reminder, days before deadline"}', false, 51),
  -- Inventory and orders (only active once those modules are switched on)
  ('stock_update',     'Alert on stock movements that hit reorder level', 'Checks the balance after every stock movement and alerts inventory managers if it is at or below the item''s reorder level.', 'inventory', 'event', 'inventory', null, '{}', '{}', false, 60),
  ('low_stock_scan',   'Low-stock scan', 'Periodically checks every stock balance against its reorder level and alerts inventory managers (once a week per item).', 'inventory', 'scheduled', 'inventory', 360, '{}', '{}', false, 61),
  ('delivery_notice',  'Delivery notifications', 'Tells order staff when a delivery is scheduled, on its way, delivered or failed, and (if email is on) tells the customer when it is on its way or delivered.', 'orders', 'event', 'orders', null, '{}', '{}', true, 70),
  -- Reports and system
  ('daily_summary',    'Daily operational summary', 'A morning summary for administrators: new and unanswered enquiries, quotations, approvals, tenders, stock, deliveries and automation problems.', 'reports', 'scheduled', 'automation', 1440, '{"run_hour": 7}', '{"run_hour": "Hour of the day (Nairobi time, 0-23) to send the summary"}', true, 80),
  ('housekeeping',     'Clean up old notifications and logs', 'Removes read notifications, delivered emails and old run logs after the set number of days. The activity log is never touched.', 'system', 'scheduled', 'automation', 1440, '{"run_hour": 3, "keep_notification_days": 90, "keep_outbox_days": 30, "keep_run_days": 180}', '{"run_hour": "Hour of the day (Nairobi time, 0-23)", "keep_notification_days": "Keep read notifications for this many days", "keep_outbox_days": "Keep sent emails for this many days", "keep_run_days": "Keep run logs for this many days"}', false, 90)
on conflict (key) do nothing;

-- Daily rules start at their next scheduled hour, not immediately.
update public.automation_rules set next_run_at = public.auto_next_run(schedule_minutes, params)
 where key in ('daily_summary', 'housekeeping') and next_run_at is null;

-- ---------------------------------------------------------------------
-- Small shared helpers
-- ---------------------------------------------------------------------
create or replace function public.auto_bucket(p_days numeric)
returns text language sql stable set search_path = public as $$
  select (((now() at time zone 'Africa/Nairobi')::date - date '2000-01-01') / greatest(coalesce(p_days, 1), 1)::integer)::text;
$$;

create or replace function public.auto_today()
returns date language sql stable set search_path = public as $$
  select (now() at time zone 'Africa/Nairobi')::date;
$$;

-- ---------------------------------------------------------------------
-- ENQUIRIES: assignment, staff alert, customer acknowledgement
-- ---------------------------------------------------------------------
create or replace function public.trg_enquiry_assign()
returns trigger language plpgsql security definer set search_path = public as $$
declare pick uuid;
begin
  if new.assigned_to is null and public.auto_rule_active('enquiry_assign') then
    select p.id into pick
    from public.profiles p
    join public.roles r on r.id = p.role_id
    where p.id in (select public.auto_recipients('enquiries.manage'))
    order by r.is_super,   -- prefer staff with the explicit permission; fall back to a Super Administrator
             (select count(*) from public.enquiries e
               where e.assigned_to = p.id and e.deleted_at is null
                 and e.status in ('new', 'under_review', 'sourcing', 'quotation_prepared', 'sent')),
             p.created_at
    limit 1;
    if pick is not null then
      new.assigned_to := pick;
      perform public.auto_record_event('enquiry_assign', 1);
    end if;
  end if;
  return new;
exception when others then
  perform public.auto_record_failure('enquiry_assign', sqlerrm);
  return new;
end;
$$;
create trigger enquiries_auto_assign before insert on public.enquiries
  for each row execute function public.trg_enquiry_assign();

create or replace function public.trg_enquiry_created()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  c public.customers%rowtype;
  who text;
  link text := '/admin/crm/enquiries?edit=' || new.id;
  n integer;
begin
  select * into c from public.customers where id = new.customer_id;
  who := coalesce(c.company_name, c.contact_name, 'a customer');

  if public.auto_rule_active('enquiry_notify_staff') then
    n := 0;
    -- The assignee goes first so they get the "assigned to you" wording; the shared dedupe key stops a duplicate.
    n := n + public.auto_notify('enquiry_notify_staff', new.assigned_to, 'New enquiry ' || new.reference || ' assigned to you',
           left(new.product_text, 200) || ' · from ' || who || ' · via ' || new.source, link, 'info', 'enq-new:' || new.id);
    n := n + public.auto_notify_perm('enquiry_notify_staff', 'enquiries.manage', null, 'New enquiry ' || new.reference,
           left(new.product_text, 200) || ' · from ' || who || ' · via ' || new.source, link, 'info', 'enq-new:' || new.id);
    perform public.auto_record_event('enquiry_notify_staff', n);
  end if;

  if public.auto_rule_active('enquiry_ack') and c.email is not null then
    n := public.auto_enqueue_email('enquiry_ack', 'customer', c.email,
      'We have received your enquiry ' || new.reference,
      'Dear ' || c.contact_name || E',\n\nThank you for contacting SAMSAL Supply & Distribution Limited. We have received your enquiry and a member of our team will respond.\n\nYour reference: ' || new.reference
        || E'\nRequest: ' || left(new.product_text, 300)
        || E'\n\nPlease quote this reference in any correspondence with us.\n\nKind regards,\nSAMSAL Supply & Distribution Limited',
      'enq-ack:' || new.id);
    perform public.auto_record_event('enquiry_ack', n);
  end if;
  return new;
exception when others then
  perform public.auto_record_failure('enquiry_notify_staff', sqlerrm);
  return new;
end;
$$;
create trigger enquiries_auto_created after insert on public.enquiries
  for each row execute function public.trg_enquiry_created();

-- ---------------------------------------------------------------------
-- ENQUIRIES: unanswered and follow-up reminders (scheduled)
-- ---------------------------------------------------------------------
create or replace function public.auto_enquiry_unanswered(p jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare
  e record; total integer := 0; bucket text := public.auto_bucket((p ->> 'repeat_days')::numeric);
  hrs numeric := coalesce((p ->> 'hours_unanswered')::numeric, 24);
  title text;
begin
  for e in
    select q.id, q.reference, q.assigned_to, q.product_text, q.created_at, coalesce(c.company_name, c.contact_name, 'a customer') as who
    from public.enquiries q left join public.customers c on c.id = q.customer_id
    where q.deleted_at is null and q.status = 'new' and q.created_at <= now() - make_interval(secs => hrs * 3600)
  loop
    title := 'Unanswered enquiry ' || e.reference || ' (' || floor(extract(epoch from now() - e.created_at) / 3600)::integer || 'h)';
    if e.assigned_to is not null then
      total := total + public.auto_notify('enquiry_unanswered', e.assigned_to, title, left(e.product_text, 200) || ' · from ' || e.who,
                 '/admin/crm/enquiries?edit=' || e.id, 'warning', 'enq-unans:' || e.id || ':' || bucket);
    else
      total := total + public.auto_notify_perm('enquiry_unanswered', 'enquiries.manage', null, title, left(e.product_text, 200) || ' · from ' || e.who,
                 '/admin/crm/enquiries?edit=' || e.id, 'warning', 'enq-unans:' || e.id || ':' || bucket);
    end if;
  end loop;
  return total;
end;
$$;

create or replace function public.auto_enquiry_followup(p jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare e record; total integer := 0; today date := public.auto_today();
begin
  for e in
    select q.id, q.reference, q.assigned_to, q.follow_up_date, q.product_text, coalesce(c.company_name, c.contact_name, 'a customer') as who
    from public.enquiries q left join public.customers c on c.id = q.customer_id
    where q.deleted_at is null and q.follow_up_date is not null and q.follow_up_date <= today
      and q.status not in ('accepted', 'declined', 'completed')
  loop
    if e.assigned_to is not null then
      total := total + public.auto_notify('enquiry_followup', e.assigned_to, 'Follow-up due: ' || e.reference,
                 left(e.product_text, 200) || ' · ' || e.who || ' · due ' || to_char(e.follow_up_date, 'DD Mon YYYY'),
                 '/admin/crm/enquiries?edit=' || e.id, 'warning', 'enq-fup:' || e.id || ':' || today);
    else
      total := total + public.auto_notify_perm('enquiry_followup', 'enquiries.manage', null, 'Follow-up due: ' || e.reference,
                 left(e.product_text, 200) || ' · ' || e.who, '/admin/crm/enquiries?edit=' || e.id, 'warning', 'enq-fup:' || e.id || ':' || today);
    end if;
  end loop;
  return total;
end;
$$;

-- ---------------------------------------------------------------------
-- QUOTATIONS: pending, expiring, expired
-- ---------------------------------------------------------------------
create or replace function public.auto_quotation_pending(p jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare
  q record; total integer := 0; today date := public.auto_today();
  pend numeric := coalesce((p ->> 'days_pending')::numeric, 3);
  warn numeric := coalesce((p ->> 'days_expiring')::numeric, 2);
  bucket text := public.auto_bucket((p ->> 'repeat_days')::numeric);
  link text;
begin
  for q in
    select x.id, x.number, x.prepared_by, x.issue_date, x.valid_until, coalesce(c.company_name, c.contact_name, 'a customer') as who
    from public.quotations x left join public.customers c on c.id = x.customer_id
    where x.status = 'sent' and x.decision is null
  loop
    link := '/admin/quotations/' || q.id;
    if q.valid_until is not null and q.valid_until < today then
      total := total + public.auto_notify_perm('quotation_pending', 'quotations.manage', q.prepared_by,
        'Quotation ' || q.number || ' has expired', q.who || ' · valid until ' || to_char(q.valid_until, 'DD Mon YYYY') || '. Follow up or mark it expired.',
        link, 'warning', 'quo-expired:' || q.id);
    else
      if q.valid_until is not null and q.valid_until <= today + warn::integer then
        total := total + public.auto_notify_perm('quotation_pending', 'quotations.manage', q.prepared_by,
          'Quotation ' || q.number || ' expires soon', q.who || ' · valid until ' || to_char(q.valid_until, 'DD Mon YYYY'),
          link, 'warning', 'quo-expiring:' || q.id);
      end if;
      if q.issue_date <= today - pend::integer then
        total := total + public.auto_notify('quotation_pending', coalesce(q.prepared_by, (select public.auto_recipients('quotations.manage') limit 1)),
          'No decision yet on quotation ' || q.number, q.who || ' · issued ' || to_char(q.issue_date, 'DD Mon YYYY') || ' (' || (today - q.issue_date) || ' days ago)',
          link, 'info', 'quo-pending:' || q.id || ':' || bucket);
      end if;
    end if;
  end loop;
  return total;
end;
$$;

-- ---------------------------------------------------------------------
-- SUPPLIER QUOTE COMPARISON
-- Quotes are grouped by enquiry, currency and item. Within a group, valid (unexpired) quotes are
-- ranked by landed cost per unit: unit price plus the extra costs spread over the quoted quantity.
-- Quotes in different currencies are never compared with each other.
-- ---------------------------------------------------------------------
create or replace view public.supplier_quote_comparison with (security_invoker = true) as
with base as (
  select sq.id as supplier_quote_id, sq.enquiry_id, sq.supplier_id, s.name as supplier_name,
         sq.product_text, coalesce(sq.product_id::text, lower(btrim(sq.product_text))) as item_key,
         sq.currency, sq.unit_price, sq.quantity, sq.additional_costs, sq.valid_until,
         (sq.valid_until is not null and sq.valid_until < (now() at time zone 'Africa/Nairobi')::date) as expired,
         (sq.unit_price + case when sq.quantity is not null then round(sq.additional_costs / sq.quantity, 4) else 0 end)::numeric(16,4) as landed_unit_cost,
         (sq.quantity is null and sq.additional_costs > 0) as extras_not_spread
  from public.supplier_quotes sq
  left join public.suppliers s on s.id = sq.supplier_id
  where sq.deleted_at is null and sq.enquiry_id is not null
)
select b.*,
       case when not b.expired then rank() over (partition by b.enquiry_id, b.currency, b.item_key, b.expired order by b.landed_unit_cost) end as value_rank,
       case when not b.expired then count(*) over (partition by b.enquiry_id, b.currency, b.item_key, b.expired) end as quotes_compared,
       case when not b.expired then min(b.landed_unit_cost) over (partition by b.enquiry_id, b.currency, b.item_key, b.expired) end as best_landed_unit_cost
from base b;
grant select on public.supplier_quote_comparison to authenticated;

create or replace function public.auto_quote_comparison(p jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare g record; total integer := 0;
begin
  for g in
    select v.enquiry_id, v.currency, v.item_key, max(v.product_text) as product_text, max(v.quotes_compared) as n,
           (array_agg(v.supplier_name order by v.landed_unit_cost))[1] as best_supplier,
           min(v.landed_unit_cost) as best_cost,
           e.reference, e.assigned_to
    from public.supplier_quote_comparison v
    join public.enquiries e on e.id = v.enquiry_id and e.deleted_at is null
    where not v.expired
    group by v.enquiry_id, v.currency, v.item_key, e.reference, e.assigned_to
    having count(*) >= 2
  loop
    total := total + public.auto_notify_perm('quote_comparison', 'purchasing.manage', g.assigned_to,
      'Supplier quotes compared for ' || g.reference,
      g.n || ' quotes for "' || left(g.product_text, 120) || '". Best value: ' || coalesce(g.best_supplier, 'a supplier') || ' at ' || g.currency || ' ' || g.best_cost || ' per unit (landed).',
      '/admin/procurement/supplier-quotes', 'info', 'qcmp:' || g.enquiry_id || ':' || md5(g.currency || g.item_key) || ':' || g.n);
  end loop;
  return total;
end;
$$;

-- ---------------------------------------------------------------------
-- PURCHASE ORDERS: approval notice, supplier notice
-- ---------------------------------------------------------------------
create or replace function public.trg_po_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  s public.suppliers%rowtype;
  lines text;
  n integer;
  link text := '/admin/procurement/purchase-orders?edit=' || new.id;
begin
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then return new; end if;
  select * into s from public.suppliers where id = new.supplier_id;

  if new.status = 'pending_approval' and public.auto_rule_active('po_approval') then
    n := public.auto_notify_perm('po_approval', 'purchasing.approve', null, 'Purchase order ' || new.number || ' needs approval',
           'Supplier: ' || coalesce(s.name, 'unknown'), link, 'warning', 'po-pending:' || new.id || ':' || extract(epoch from new.updated_at)::bigint);
    perform public.auto_record_event('po_approval', n);
  end if;

  if new.status = 'approved' and (tg_op = 'INSERT' or old.status in ('draft', 'pending_approval', 'cancelled')) then
    if public.auto_rule_active('po_approval') then
      n := public.auto_notify_perm('po_approval', 'purchasing.manage', new.created_by, 'Purchase order ' || new.number || ' approved',
             'Supplier: ' || coalesce(s.name, 'unknown'), link, 'info', 'po-approved:' || new.id);
      perform public.auto_record_event('po_approval', n);
    end if;
    if public.auto_rule_active('po_supplier_notice') then
      n := public.auto_notify_perm('po_supplier_notice', 'purchasing.manage', new.created_by, 'Send order ' || new.number || ' to ' || coalesce(s.name, 'the supplier'),
             'Approved. ' || case when s.email is not null then 'Supplier email on file.' else 'No supplier email on file: add one or contact them directly.' end,
             link, 'info', 'po-supplier:' || new.id);
      select string_agg('- ' || i.description || ': ' || i.quantity || ' @ ' || new.currency || ' ' || i.unit_price, E'\n' order by i.line_no)
        into lines from public.purchase_order_items i where i.po_id = new.id;
      n := n + public.auto_enqueue_email('po_supplier_notice', 'supplier', s.email,
             'Purchase order ' || new.number || ' from SAMSAL Supply & Distribution Limited',
             'Dear ' || coalesce(s.contact_name, s.name) || E',\n\nPlease find the details of our approved purchase order ' || new.number || E':\n\n'
               || coalesce(lines, '(see order)') || coalesce(E'\n\nExpected date: ' || to_char(new.expected_date, 'DD Mon YYYY'), '')
               || E'\n\nPlease confirm receipt and your delivery date.\n\nKind regards,\nSAMSAL Supply & Distribution Limited',
             'po-supplier-mail:' || new.id);
      perform public.auto_record_event('po_supplier_notice', n);
    end if;
  end if;
  return new;
exception when others then
  perform public.auto_record_failure('po_approval', sqlerrm);
  return new;
end;
$$;
create trigger purchase_orders_auto_status after insert or update of status on public.purchase_orders
  for each row execute function public.trg_po_status();

-- ---------------------------------------------------------------------
-- TENDERS: checklist templates, generated checklists, deadline reminders
-- The default template items are generic, editable starting points. They are NOT a statement of what
-- any particular tender requires: always check the tender document itself.
-- ---------------------------------------------------------------------
create table public.tender_checklist_templates (
  id         uuid primary key default gen_random_uuid(),
  label      text not null unique check (length(label) between 1 and 300),
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.tender_checklist_items (
  id         uuid primary key default gen_random_uuid(),
  tender_id  uuid not null references public.tenders(id) on delete cascade,
  label      text not null check (length(label) between 1 and 400),
  source     text not null default 'template' check (source in ('template', 'eligibility', 'deadline', 'manual')),
  is_done    boolean not null default false,
  done_at    timestamptz,
  done_by    uuid references public.profiles(id) on delete set null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (tender_id, label)
);
create index tender_checklist_items_tender_idx on public.tender_checklist_items(tender_id, sort_order);

create trigger tender_checklist_templates_updated before update on public.tender_checklist_templates
  for each row execute function public.set_updated_at();
create trigger tender_checklist_templates_audit after insert or update or delete on public.tender_checklist_templates
  for each row execute function public.audit_row('full');
create trigger tender_checklist_items_audit after insert or update or delete on public.tender_checklist_items
  for each row execute function public.audit_row('full');

create or replace function public.guard_checklist_done()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.is_done and (tg_op = 'INSERT' or not old.is_done) then
    new.done_at := now(); new.done_by := auth.uid();
  elsif not new.is_done then
    new.done_at := null; new.done_by := null;
  end if;
  return new;
end;
$$;
create trigger tender_checklist_items_done before insert or update on public.tender_checklist_items
  for each row execute function public.guard_checklist_done();

alter table public.tender_checklist_templates enable row level security;
alter table public.tender_checklist_items enable row level security;
revoke all on public.tender_checklist_templates, public.tender_checklist_items from anon, authenticated;
grant select, insert, update, delete on public.tender_checklist_templates, public.tender_checklist_items to authenticated;

create policy tct_read on public.tender_checklist_templates for select to authenticated using (public.can('tenders.view', 'tenders'));
create policy tct_ins  on public.tender_checklist_templates for insert to authenticated with check (public.can('tenders.manage', 'tenders'));
create policy tct_upd  on public.tender_checklist_templates for update to authenticated using (public.can('tenders.manage', 'tenders')) with check (public.can('tenders.manage', 'tenders'));
create policy tct_del  on public.tender_checklist_templates for delete to authenticated using (public.can('tenders.manage', 'tenders'));
create policy tci_read on public.tender_checklist_items for select to authenticated using (public.can('tenders.view', 'tenders'));
create policy tci_ins  on public.tender_checklist_items for insert to authenticated with check (public.can('tenders.manage', 'tenders'));
create policy tci_upd  on public.tender_checklist_items for update to authenticated using (public.can('tenders.manage', 'tenders')) with check (public.can('tenders.manage', 'tenders'));
create policy tci_del  on public.tender_checklist_items for delete to authenticated using (public.can('tenders.manage', 'tenders'));

insert into public.tender_checklist_templates (label, sort_order) values
  ('Read the full tender document and note every mandatory requirement', 10),
  ('Tender submission form / cover letter, signed', 20),
  ('Company registration documents', 30),
  ('Tax compliance documentation', 40),
  ('Eligibility and mandatory declarations required by the tender', 50),
  ('Technical proposal / product specifications', 60),
  ('Financial proposal / price schedule', 70),
  ('Bid security or guarantee, if the tender requires one', 80),
  ('Clarifications raised with the procuring entity, if any', 90),
  ('Final review, copies and sealed submission', 100)
on conflict (label) do nothing;

-- Idempotent: safe to run again, never duplicates or removes items.
create or replace function public.auto_generate_tender_checklist(p_tender uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare t public.tenders%rowtype; n integer := 0; k integer;
begin
  select * into t from public.tenders where id = p_tender and deleted_at is null;
  if not found then return 0; end if;

  insert into public.tender_checklist_items (tender_id, label, source, sort_order)
  select t.id, tpl.label, 'template', tpl.sort_order from public.tender_checklist_templates tpl where tpl.is_active
  on conflict (tender_id, label) do nothing;
  get diagnostics k = row_count; n := n + k;

  if nullif(btrim(t.eligibility_requirements), '') is not null then
    insert into public.tender_checklist_items (tender_id, label, source, sort_order)
    values (t.id, 'Meet the eligibility requirements noted: ' || left(btrim(t.eligibility_requirements), 300), 'eligibility', 55)
    on conflict (tender_id, label) do nothing;
    get diagnostics k = row_count; n := n + k;
  end if;

  if t.submission_deadline is not null then
    insert into public.tender_checklist_items (tender_id, label, source, sort_order)
    values (t.id, 'Submit before ' || to_char(t.submission_deadline at time zone 'Africa/Nairobi', 'DD Mon YYYY HH24:MI') || ' (Nairobi time)', 'deadline', 5)
    on conflict (tender_id, label) do nothing;
    get diagnostics k = row_count; n := n + k;
  end if;
  return n;
end;
$$;

create or replace function public.generate_tender_checklist(p_tender uuid)
returns integer language plpgsql security definer set search_path = public as $$
begin
  if not public.can('tenders.manage', 'tenders') then raise exception 'Not permitted'; end if;
  return public.auto_generate_tender_checklist(p_tender);
end;
$$;

create or replace function public.trg_tender_checklist()
returns trigger language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not public.auto_rule_active('tender_checklist') then return new; end if;
  if tg_op = 'INSERT' or (new.bid_status = 'preparing' and old.bid_status is distinct from 'preparing') then
    n := public.auto_generate_tender_checklist(new.id);
    if n > 0 then
      perform public.auto_notify_perm('tender_checklist', 'tenders.manage', new.owner_id, 'Document checklist ready: ' || new.reference,
        n || ' items added for "' || left(new.title, 120) || '" (' || new.procuring_entity || ').', '/admin/tenders?edit=' || new.id, 'info', 'tender-checklist:' || new.id);
      perform public.auto_record_event('tender_checklist', n);
    end if;
  end if;
  return new;
exception when others then
  perform public.auto_record_failure('tender_checklist', sqlerrm);
  return new;
end;
$$;
create trigger tenders_auto_checklist after insert or update of bid_status on public.tenders
  for each row execute function public.trg_tender_checklist();

create or replace function public.auto_tender_deadlines(p jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare
  t record; total integer := 0; dl numeric; th integer; sev text; progress text;
  d1 integer := coalesce((p ->> 'days_1')::integer, 7);
  d2 integer := coalesce((p ->> 'days_2')::integer, 3);
  d3 integer := coalesce((p ->> 'days_3')::integer, 1);
begin
  for t in
    select x.id, x.reference, x.title, x.procuring_entity, x.owner_id, x.submission_deadline,
           (select count(*) from public.tender_checklist_items i where i.tender_id = x.id) as items,
           (select count(*) from public.tender_checklist_items i where i.tender_id = x.id and i.is_done) as done
    from public.tenders x
    where x.deleted_at is null and x.submission_deadline is not null
      and x.bid_status in ('monitoring', 'preparing', 'ready') and x.submission_status = 'not_submitted'
  loop
    progress := case when t.items > 0 then ' Checklist: ' || t.done || ' of ' || t.items || ' done.' else '' end;
    if t.submission_deadline < now() then
      if t.bid_status in ('preparing', 'ready') then
        total := total + public.auto_notify_perm('tender_deadlines', 'tenders.manage', t.owner_id, 'Tender deadline passed: ' || t.reference,
          t.title || ' (' || t.procuring_entity || ') closed ' || to_char(t.submission_deadline at time zone 'Africa/Nairobi', 'DD Mon YYYY HH24:MI') || ' and is not marked submitted.',
          '/admin/tenders?edit=' || t.id, 'critical', 'tender-missed:' || t.id || ':' || extract(epoch from t.submission_deadline)::bigint);
      end if;
    else
      dl := ceil(extract(epoch from t.submission_deadline - now()) / 86400);
      if dl <= greatest(d1, d2, d3) then
        th := case when dl <= d3 then d3 when dl <= d2 then d2 else d1 end;
        sev := case when dl <= d3 then 'critical' else 'warning' end;
        total := total + public.auto_notify_perm('tender_deadlines', 'tenders.manage', t.owner_id,
          'Tender closes in ' || dl::integer || ' day' || case when dl::integer = 1 then '' else 's' end || ': ' || t.reference,
          t.title || ' (' || t.procuring_entity || '), deadline ' || to_char(t.submission_deadline at time zone 'Africa/Nairobi', 'DD Mon YYYY HH24:MI') || '.' || progress,
          '/admin/tenders?edit=' || t.id, sev, 'tender-dl:' || t.id || ':' || th || ':' || extract(epoch from t.submission_deadline)::bigint);
      end if;
    end if;
  end loop;
  return total;
end;
$$;

-- ---------------------------------------------------------------------
-- INVENTORY: low stock (event on every movement, plus a periodic scan)
-- Stock is not changed automatically: balances are always derived from recorded movements, and
-- recording them is a deliberate action by inventory staff.
-- ---------------------------------------------------------------------
create or replace function public.auto_low_stock_alert(p_variant uuid, p_warehouse uuid, p_rule text)
returns integer language plpgsql security definer set search_path = public as $$
declare v record; bal numeric;
begin
  select pv.name, pv.sku, pv.reorder_level, pr.name as product_name into v
  from public.product_variants pv left join public.products pr on pr.id = pv.product_id where pv.id = p_variant;
  if v.reorder_level is null then return 0; end if;
  select coalesce(sum(quantity), 0) into bal from public.stock_movements where variant_id = p_variant and warehouse_id = p_warehouse;
  if bal > v.reorder_level then return 0; end if;
  return public.auto_notify_perm(p_rule, 'inventory.manage', null,
    'Low stock: ' || coalesce(v.product_name || ' - ', '') || v.name,
    'On hand ' || bal || ' (reorder level ' || v.reorder_level || ')' || coalesce(' · SKU ' || v.sku, '') ||
      coalesce(' · ' || (select w.name from public.warehouses w where w.id = p_warehouse), ''),
    '/admin/inventory/balances', case when bal <= 0 then 'critical' else 'warning' end,
    'low-stock:' || p_variant || ':' || p_warehouse || ':' || to_char(now() at time zone 'Africa/Nairobi', 'IYYY-IW'));
end;
$$;

create or replace function public.trg_stock_movement()
returns trigger language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if public.auto_rule_active('stock_update') then
    n := public.auto_low_stock_alert(new.variant_id, new.warehouse_id, 'stock_update');
    perform public.auto_record_event('stock_update', n);
  end if;
  return new;
exception when others then
  perform public.auto_record_failure('stock_update', sqlerrm);
  return new;
end;
$$;
create trigger stock_movements_auto_alert after insert on public.stock_movements
  for each row execute function public.trg_stock_movement();

create or replace function public.auto_low_stock_scan(p jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare b record; total integer := 0;
begin
  for b in select variant_id, warehouse_id from public.inventory_balances where needs_reorder loop
    total := total + public.auto_low_stock_alert(b.variant_id, b.warehouse_id, 'low_stock_scan');
  end loop;
  return total;
end;
$$;

-- ---------------------------------------------------------------------
-- DELIVERIES
-- ---------------------------------------------------------------------
create or replace function public.trg_delivery_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare so public.sales_orders%rowtype; c public.customers%rowtype; n integer; label text; sev text;
begin
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then return new; end if;
  if new.status = 'cancelled' then return new; end if;
  select * into so from public.sales_orders where id = new.sales_order_id;
  select * into c from public.customers where id = so.customer_id;
  label := case new.status when 'scheduled' then 'scheduled' when 'in_transit' then 'on its way' when 'delivered' then 'delivered' when 'failed' then 'FAILED' else new.status end;
  sev := case when new.status = 'failed' then 'critical' else 'info' end;

  if public.auto_rule_active('delivery_notice') then
    n := public.auto_notify_perm('delivery_notice', 'orders.manage', so.created_by, 'Delivery ' || new.number || ' ' || label,
           'Order ' || so.number || ' · ' || coalesce(c.company_name, c.contact_name, 'customer')
             || coalesce(' · driver ' || new.driver_name, '') || coalesce(' · scheduled ' || to_char(new.scheduled_date, 'DD Mon YYYY'), ''),
           '/admin/orders/deliveries', sev, 'delivery:' || new.id || ':' || new.status);
    if new.status in ('in_transit', 'delivered') then
      n := n + public.auto_enqueue_email('delivery_notice', 'customer', c.email,
             'Your order ' || so.number || ' is ' || label,
             'Dear ' || c.contact_name || E',\n\nYour order ' || so.number || ' is ' || label || E' (delivery note ' || new.number || E').\n\nKind regards,\nSAMSAL Supply & Distribution Limited',
             'delivery-mail:' || new.id || ':' || new.status);
    end if;
    perform public.auto_record_event('delivery_notice', n);
  end if;
  return new;
exception when others then
  perform public.auto_record_failure('delivery_notice', sqlerrm);
  return new;
end;
$$;
create trigger deliveries_auto_status after insert or update of status on public.deliveries
  for each row execute function public.trg_delivery_status();

-- ---------------------------------------------------------------------
-- DAILY SUMMARY: counts of real records, only for modules that are switched on
-- ---------------------------------------------------------------------
create or replace function public.auto_daily_summary(p jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare
  lines text[] := '{}'; body text; today date := public.auto_today(); uid uuid; em text; total integer := 0; k integer; c1 integer; c2 integer;
begin
  if public.module_enabled('crm') then
    select count(*) into c1 from public.enquiries where deleted_at is null and created_at >= now() - interval '24 hours';
    select count(*) into c2 from public.enquiries where deleted_at is null and status = 'new';
    select count(*) into k from public.enquiries where deleted_at is null and follow_up_date <= today and status not in ('accepted', 'declined', 'completed');
    lines := lines || format('Enquiries: %s new in the last 24 hours, %s still unanswered, %s follow-ups due.', c1, c2, k);
  end if;
  if public.module_enabled('quotations') then
    select count(*) into c1 from public.quotations where status = 'sent' and decision is null;
    select count(*) into c2 from public.quotations where status = 'sent' and decision is null and valid_until between today and today + 7;
    lines := lines || format('Quotations: %s awaiting a customer decision, %s expiring within 7 days.', c1, c2);
  end if;
  if public.module_enabled('procurement') then
    select count(*) into c1 from public.purchase_orders where deleted_at is null and status = 'pending_approval';
    lines := lines || format('Purchase orders: %s waiting for approval.', c1);
  end if;
  if public.module_enabled('tenders') then
    select count(*) into c1 from public.tenders where deleted_at is null and submission_status = 'not_submitted' and bid_status in ('monitoring', 'preparing', 'ready')
      and submission_deadline between now() and now() + interval '7 days';
    lines := lines || format('Tenders: %s closing within 7 days.', c1);
  end if;
  if public.module_enabled('inventory') then
    select count(*) into c1 from public.inventory_balances where needs_reorder;
    lines := lines || format('Stock: %s items at or below reorder level.', c1);
  end if;
  if public.module_enabled('orders') then
    select count(*) into c1 from public.deliveries where status in ('scheduled', 'in_transit');
    lines := lines || format('Deliveries: %s scheduled or in transit.', c1);
  end if;
  select count(*) into c1 from public.automation_runs where status = 'error' and started_at >= now() - interval '24 hours';
  select count(*) into c2 from public.notification_outbox where status = 'failed';
  lines := lines || format('Automation: %s failed runs in the last 24 hours, %s emails could not be delivered.', c1, c2);

  body := array_to_string(lines, E'\n');
  for uid in select public.auto_recipients('automation.view') loop
    total := total + public.auto_notify('daily_summary', uid, 'Daily summary, ' || to_char(today, 'DD Mon YYYY'), body, '/admin', 'info', 'daily:' || today);
    select email into em from public.profiles where id = uid;
    perform public.auto_enqueue_email('daily_summary', 'staff', em, 'SAMSAL daily summary, ' || to_char(today, 'DD Mon YYYY'), body, 'daily-mail:' || uid || ':' || today);
  end loop;
  return total;
end;
$$;

create or replace function public.auto_housekeeping(p jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare total integer := 0; k integer;
begin
  delete from public.notifications where read_at is not null
    and created_at < now() - make_interval(days => coalesce((p ->> 'keep_notification_days')::integer, 90));
  get diagnostics k = row_count; total := total + k;
  delete from public.notification_outbox where status = 'sent'
    and sent_at < now() - make_interval(days => coalesce((p ->> 'keep_outbox_days')::integer, 30));
  get diagnostics k = row_count; total := total + k;
  delete from public.automation_runs
    where started_at < now() - make_interval(days => coalesce((p ->> 'keep_run_days')::integer, 180));
  get diagnostics k = row_count; total := total + k;
  return total;
end;
$$;

-- ---------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------
revoke all on function
  public.auto_bucket(numeric), public.auto_today(),
  public.trg_enquiry_assign(), public.trg_enquiry_created(), public.trg_po_status(), public.trg_tender_checklist(),
  public.trg_stock_movement(), public.trg_delivery_status(), public.guard_checklist_done(),
  public.auto_enquiry_unanswered(jsonb), public.auto_enquiry_followup(jsonb), public.auto_quotation_pending(jsonb),
  public.auto_quote_comparison(jsonb), public.auto_generate_tender_checklist(uuid), public.auto_tender_deadlines(jsonb),
  public.auto_low_stock_alert(uuid, uuid, text), public.auto_low_stock_scan(jsonb),
  public.auto_daily_summary(jsonb), public.auto_housekeeping(jsonb)
from public, anon, authenticated;
revoke all on function public.generate_tender_checklist(uuid) from public, anon;
grant execute on function public.generate_tender_checklist(uuid) to authenticated;
