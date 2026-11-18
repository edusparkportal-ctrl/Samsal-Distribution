-- =====================================================================
-- 0018 FINANCE AUTOMATIONS and links to procurement and sales (uses the existing automation engine)
--
-- Automations here only PREPARE and REMIND:
--   * a delivered sales order produces a DRAFT invoice; a person reviews and issues it
--   * a fully received purchase order produces a DRAFT bill; a person checks it and submits it for approval
--   * overdue invoices produce reminders to your own finance team; customer emails are queued only when the
--     global email switch and this rule's email option are both on (both OFF by default)
--   * the monthly financial report is prepared automatically after the month ends
-- Nothing here issues an invoice, approves anything, or records or makes a payment.
-- =====================================================================

insert into public.automation_rules (key, name, description, category, kind, module, schedule_minutes, params, params_help, sort_order, email_capable) values
  ('finance_invoice_drafts', 'Draft invoice for delivered orders', 'When a sales order is marked delivered, creates a DRAFT invoice from it and tells the finance team. A person reviews and issues it.', 'orders', 'event', 'finance', null,
     '{"payment_terms_days": 30}', '{"payment_terms_days": "Days from today until the invoice is due"}', 110, false),
  ('finance_bill_drafts', 'Draft bill for received purchase orders', 'When a purchase order is fully received, creates a DRAFT supplier bill for the value received and tells the finance team. It still needs checking and approval before any payment can be recorded.', 'procurement', 'event', 'finance', null,
     '{"payment_terms_days": 30}', '{"payment_terms_days": "Days from today until the bill is due"}', 111, false),
  ('finance_payment_reminders', 'Overdue invoice reminders', 'Reminds your finance team about invoices past their due date. Can also queue a polite reminder email to the customer, but only when the global email switch and this rule''s email option are both on.', 'reports', 'scheduled', 'finance', 1440,
     '{"first_after_days": 1, "repeat_every_days": 7, "max_reminders": 3}', '{"first_after_days": "First reminder this many days after the due date", "repeat_every_days": "Days between reminders", "max_reminders": "Stop after this many reminders per invoice"}', 112, true),
  ('finance_due_alerts', 'Bills falling due', 'Tells the finance team about approved supplier bills due soon or overdue, so payments can be arranged by the people who authorise them.', 'reports', 'scheduled', 'finance', 1440,
     '{"days_ahead": 3}', '{"days_ahead": "Warn this many days before the due date"}', 113, false),
  ('finance_budget_alerts', 'Budget alerts', 'Tells the finance team when spending reaches 80% and 100% of an expense budget.', 'reports', 'scheduled', 'finance', 1440, '{}', '{}', 114, false),
  ('finance_monthly_report', 'Monthly financial report', 'After each month ends, prepares the report for that month (income, expenses, receivables, payables, budgets) and tells the people who can view reports.', 'reports', 'scheduled', 'finance', 1440, '{}', '{}', 115, false),
  ('finance_expense_flow', 'Approved items ready for payment records', 'When an expense claim or supplier bill is approved, tells the finance team so the payment can be arranged and then recorded. (Approvers are notified by the approval process.)', 'system', 'event', 'finance', null, '{}', '{}', 116, false),
  ('approval_reminders', 'Approval reminders', 'Reminds approvers about requests that have been waiting for their decision, once a week for each request.', 'system', 'scheduled', 'approvals', 1440, '{"stale_days": 2}', '{"stale_days": "Remind after a request has waited this many days"}', 117, false)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- Sales: delivered order -> draft invoice
-- ---------------------------------------------------------------------
create or replace function public.trg_order_invoice_draft()
returns trigger language plpgsql security definer set search_path = public as $$
declare iid uuid; num text;
begin
  if new.status <> 'delivered' or (tg_op = 'UPDATE' and old.status = 'delivered') then return new; end if;
  if not public.auto_rule_active('finance_invoice_drafts') then return new; end if;
  iid := public.auto_draft_invoice_from_order(new.id, public.auto_param('finance_invoice_drafts', 'payment_terms_days', 30)::integer);
  if iid is not null then
    select number into num from public.invoices where id = iid;
    perform public.auto_notify_perm('finance_invoice_drafts', 'finance.invoices', null, 'Draft invoice ready: ' || num,
      'Created from delivered order ' || new.number || '. Review the lines and issue it.', '/admin/finance/invoices/' || iid, 'info', 'inv-draft:' || iid);
    perform public.auto_record_event('finance_invoice_drafts', 1);
  end if;
  return new;
exception when others then
  perform public.auto_record_failure('finance_invoice_drafts', sqlerrm);
  return new;
end;
$$;
create trigger sales_orders_invoice_draft after insert or update of status on public.sales_orders for each row execute function public.trg_order_invoice_draft();

-- ---------------------------------------------------------------------
-- Procurement: fully received PO -> draft bill
-- ---------------------------------------------------------------------
create or replace function public.trg_po_bill_draft()
returns trigger language plpgsql security definer set search_path = public as $$
declare bid uuid; num text;
begin
  if new.status <> 'received' or (tg_op = 'UPDATE' and old.status = 'received') then return new; end if;
  if not public.auto_rule_active('finance_bill_drafts') then return new; end if;
  bid := public.auto_draft_bill_from_po(new.id, public.auto_param('finance_bill_drafts', 'payment_terms_days', 30)::integer);
  if bid is not null then
    select number into num from public.supplier_bills where id = bid;
    perform public.auto_notify_perm('finance_bill_drafts', 'finance.bills', null, 'Draft bill ready: ' || num,
      'Created from received purchase order ' || new.number || '. Check it against the supplier''s invoice, then submit it for approval.', '/admin/finance/bills', 'info', 'bill-draft:' || bid);
    perform public.auto_record_event('finance_bill_drafts', 1);
  end if;
  return new;
exception when others then
  perform public.auto_record_failure('finance_bill_drafts', sqlerrm);
  return new;
end;
$$;
create trigger purchase_orders_bill_draft after insert or update of status on public.purchase_orders for each row execute function public.trg_po_bill_draft();

-- ---------------------------------------------------------------------
-- Approved claims and bills: tell the people who record payments
-- ---------------------------------------------------------------------
create or replace function public.approval_apply_bill(p_record uuid, p_outcome text, p_request uuid)
returns void language plpgsql security definer set search_path = public as $$
declare b public.supplier_bills%rowtype;
begin
  if p_outcome = 'approved' then
    update public.supplier_bills set status = 'approved' where id = p_record and status = 'pending_approval' returning * into b;
    if b.id is not null then
      perform public.auto_notify_perm('finance_expense_flow', 'finance.bills', null, 'Bill approved: ' || b.number,
        b.currency || ' ' || b.amount || ' is approved. Arrange the payment, then record it (not by the person who prepared the bill).', '/admin/finance/bills', 'info', 'bill-ok:' || b.id);
    end if;
  else
    update public.supplier_bills set status = 'draft' where id = p_record and status = 'pending_approval';
  end if;
end;
$$;

create or replace function public.approval_apply_expense(p_record uuid, p_outcome text, p_request uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c public.expense_claims%rowtype;
begin
  update public.expense_claims set status = case p_outcome when 'approved' then 'approved' when 'cancelled' then 'cancelled' else 'rejected' end
   where id = p_record and status = 'pending' returning * into c;
  if c.id is not null and c.status = 'approved' then
    perform public.auto_notify_perm('finance_expense_flow', 'finance.bills', null, 'Expense claim approved: ' || c.number,
      c.currency || ' ' || c.amount || '. Arrange the reimbursement, then record it.', '/admin/finance/claims', 'info', 'claim-ok:' || c.id);
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Overdue invoice reminders
-- ---------------------------------------------------------------------
create table public.invoice_reminders (
  id         uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  sent_at    timestamptz not null default now(),
  emailed    boolean not null default false
);
create index invoice_reminders_invoice_idx on public.invoice_reminders(invoice_id);
alter table public.invoice_reminders enable row level security;
revoke all on public.invoice_reminders from anon, authenticated;
grant select on public.invoice_reminders to authenticated;
create policy invrem_read on public.invoice_reminders for select to authenticated using (public.can('finance.view', 'finance'));

create or replace function public.auto_finance_payment_reminders(p jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare a record; first_d integer := coalesce((p ->> 'first_after_days')::integer, 1); every_d integer := greatest(coalesce((p ->> 'repeat_every_days')::integer, 7), 1);
        max_n integer := coalesce((p ->> 'max_reminders')::integer, 3); sent integer; last_at timestamptz; total integer := 0;
        cust record; co text; mailed integer;
begin
  select registered_name into co from public.company_settings where id = 1;
  for a in select * from public.ar_ageing where days_overdue >= first_d order by days_overdue desc loop
    select count(*), max(sent_at) into sent, last_at from public.invoice_reminders where invoice_id = a.invoice_id;
    if sent >= max_n then continue; end if;
    if sent > 0 and last_at > now() - make_interval(days => every_d) then continue; end if;
    total := total + public.auto_notify_perm('finance_payment_reminders', 'finance.invoices', null,
      'Payment overdue: ' || a.number || ' (' || a.days_overdue || ' days)', a.currency || ' ' || a.balance || ' outstanding. Follow up with the customer.',
      '/admin/finance/invoices/' || a.invoice_id, case when a.days_overdue > 30 then 'critical' else 'warning' end, 'inv-overdue:' || a.invoice_id || ':' || (sent + 1));
    select coalesce(c.company_name, c.contact_name) as nm, c.contact_name, c.email into cust from public.customers c where c.id = a.customer_id;
    mailed := public.auto_enqueue_email('finance_payment_reminders', 'customer', cust.email,
      'Payment reminder: invoice ' || a.number,
      'Dear ' || cust.contact_name || E',\n\nThis is a friendly reminder that invoice ' || a.number || ' for ' || a.currency || ' ' || a.balance
        || ' was due on ' || to_char(a.due_date, 'DD Mon YYYY') || E' and is still outstanding.\n\nIf you have already paid, please disregard this message and let us know the payment reference so we can match it. If anything about the invoice is unclear, just reply to this email.\n\nKind regards,\n' || coalesce(co, 'Accounts'),
      'inv-rem:' || a.invoice_id || ':' || (sent + 1));
    insert into public.invoice_reminders (invoice_id, emailed) values (a.invoice_id, mailed > 0);
  end loop;
  return total;
end;
$$;

create or replace function public.auto_finance_due_alerts(p jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare ahead integer := coalesce((p ->> 'days_ahead')::integer, 3); due_n integer; over_n integer; total integer := 0; today date := public.auto_today();
begin
  select count(*) filter (where days_overdue = 0 and due_date is not null and due_date <= today + ahead), count(*) filter (where days_overdue > 0) into due_n, over_n from public.ap_ageing;
  if coalesce(due_n, 0) + coalesce(over_n, 0) > 0 then
    total := public.auto_notify_perm('finance_due_alerts', 'finance.bills', null, coalesce(due_n, 0) + coalesce(over_n, 0) || ' supplier bill(s) due or overdue',
      due_n || ' due within ' || ahead || ' days, ' || over_n || ' overdue. Payments must be authorised and recorded by the right people.', '/admin/finance/bills?status=approved', case when over_n > 0 then 'warning' else 'info' end, 'bills-due:' || today);
  end if;
  return total;
end;
$$;

create or replace function public.auto_finance_budget_alerts(p jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare b record; total integer := 0; pct numeric; th integer;
begin
  for b in select * from public.budget_vs_actual where kind = 'expense' and budget > 0 and period_start <= current_date and period_end >= current_date loop
    pct := b.actual / b.budget * 100;
    th := case when pct >= 100 then 100 when pct >= 80 then 80 else null end;
    if th is not null then
      total := total + public.auto_notify_perm('finance_budget_alerts', 'finance.manage', null, 'Budget at ' || round(pct) || '%: ' || b.name,
        b.category || ': ' || b.currency || ' ' || b.actual || ' spent of ' || b.budget || '.', '/admin/finance', case when th = 100 then 'critical' else 'warning' end, 'budget:' || b.budget_id || ':' || th);
    end if;
  end loop;
  return total;
end;
$$;

create or replace function public.auto_finance_monthly_report(p jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare s date := (date_trunc('month', public.auto_today()) - interval '1 month')::date;
begin
  if exists (select 1 from public.finance_report_snapshots where kind = 'monthly' and period_start = s) then return 0; end if;
  insert into public.finance_report_snapshots (kind, period_start, period_end, data, created_by)
  values ('monthly', s, (s + interval '1 month - 1 day')::date, public.finance_report_data(s), null);
  return public.auto_notify_perm('finance_monthly_report', 'finance.reports', null, 'Monthly financial report ready: ' || to_char(s, 'FMMonth YYYY'),
    'Prepared from the books as they stand today. Refresh it if late entries were added.', '/admin/finance/reports?month=' || to_char(s, 'YYYY-MM'), 'info', 'fin-report:' || to_char(s, 'YYYY-MM'));
end;
$$;

create or replace function public.auto_approval_reminders(p jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare r record; u uuid; total integer := 0; stale integer := coalesce((p ->> 'stale_days')::integer, 2);
begin
  for r in select id, title, current_step, created_at from public.approval_requests where status = 'pending' and created_at < now() - make_interval(days => stale) loop
    for u in select public.approval_candidates(r.id) loop
      total := total + public.auto_notify('approval_reminders', u, 'Still waiting for your decision: ' || r.title,
        'Waiting since ' || to_char(r.created_at at time zone 'Africa/Nairobi', 'DD Mon YYYY') || '.', '/admin/approvals', 'warning',
        'appr-stale:' || r.id || ':' || r.current_step || ':' || to_char(now() at time zone 'Africa/Nairobi', 'IYYY-IW'));
    end loop;
  end loop;
  return total;
end;
$$;

revoke all on function
  public.trg_order_invoice_draft(), public.trg_po_bill_draft(), public.approval_apply_bill(uuid, text, uuid), public.approval_apply_expense(uuid, text, uuid),
  public.auto_finance_payment_reminders(jsonb), public.auto_finance_due_alerts(jsonb), public.auto_finance_budget_alerts(jsonb),
  public.auto_finance_monthly_report(jsonb), public.auto_approval_reminders(jsonb)
from public, anon, authenticated;
