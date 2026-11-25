-- Enquiry -> quotation -> order -> delivery -> invoice: each step now moves the next one along.
-- A person still decides the steps that commit money or promises (pricing and sending a quotation, confirming
-- an order, issuing an invoice). Everything else follows automatically, and every link can be switched off on the
-- Automations page. Failures are logged and never block the save that caused them.
--
--   quotation drafted/sent/accepted/declined  -> enquiry status follows
--   quotation accepted                        -> sales order created (awaiting staff confirmation)
--   sales order confirmed                     -> delivery scheduled (requested date if the customer gave one)
--   sales order cancelled                     -> its scheduled deliveries are cancelled
--   delivery in transit / delivered           -> order status follows (processing / partially delivered / delivered)
--   sales order delivered                     -> enquiry completed, draft invoice (existing rule)
--   invoice issued                            -> order marked invoiced

insert into public.automation_rules
  (key, name, description, category, kind, module, schedule_minutes, params, params_help, email_capable, sort_order) values
  ('pipeline_enquiry_sync', 'Keep enquiries in step with quotations and orders',
   'Moves an enquiry to "quotation prepared", "sent", "accepted" or "declined" as its quotation changes, and to "completed" once the order is delivered. Never moves an enquiry backwards.',
   'enquiries', 'event', 'crm', null, '{}', '{}', false, 13),
  ('pipeline_quote_to_order', 'Create an order when a quotation is accepted',
   'When a quotation is accepted (by the customer in the portal or by staff), creates the sales order with the same lines and prices, waiting for staff to confirm it, and tells the orders team.',
   'quotations', 'event', 'orders', null, '{}', '{}', false, 32),
  ('pipeline_order_to_delivery', 'Schedule a delivery when an order is confirmed',
   'When a sales order is confirmed, creates a scheduled delivery (and so the delivery note) using the customer''s preferred date if given. If the order is cancelled, its scheduled deliveries are cancelled too.',
   'orders', 'event', 'orders', null, '{}', '{}', false, 71),
  ('pipeline_delivery_to_order', 'Update the order from its deliveries',
   'When a delivery goes in transit or is delivered, moves the order to "processing", "partially delivered" or "delivered" (which then creates the draft invoice). Also stamps the delivered time.',
   'orders', 'event', 'orders', null, '{}', '{}', false, 72),
  ('pipeline_invoice_to_order', 'Mark the order invoiced when the invoice is issued',
   'When a draft invoice for a delivered order is issued, marks that order "invoiced".',
   'orders', 'event', 'orders', null, '{}', '{}', false, 73)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- Quotation -> enquiry status, accepted quotation -> order
-- ---------------------------------------------------------------------
create or replace function public.trg_quotation_pipeline()
returns trigger language plpgsql security definer set search_path = public as $$
declare oid uuid; onum text; addr text; cust public.customers%rowtype; enq public.enquiries%rowtype; target text;
begin
  -- 1) enquiry follows the quotation (forward only)
  if new.enquiry_id is not null and public.auto_rule_active('pipeline_enquiry_sync') then
    target := case
      when tg_op = 'INSERT' then 'quotation_prepared'
      when new.status = 'sent' then 'sent'
      when new.status = 'accepted' then 'accepted'
      when new.status = 'declined' then 'declined'
      else null end;
    if target is not null and (tg_op = 'INSERT' or old.status is distinct from new.status) then
      update public.enquiries e set status = target
       where e.id = new.enquiry_id and e.deleted_at is null
         and array_position(array['new','under_review','sourcing','quotation_prepared','sent','accepted','declined','completed'], e.status)
           < array_position(array['new','under_review','sourcing','quotation_prepared','sent','accepted','declined','completed'], target)
         and e.status not in ('accepted','declined','completed');
      if found then perform public.auto_record_event('pipeline_enquiry_sync', 1); end if;
    end if;
  end if;

  -- 2) accepted quotation -> sales order (once)
  if new.status = 'accepted' and (tg_op = 'INSERT' or old.status is distinct from 'accepted')
     and new.customer_id is not null and public.auto_rule_active('pipeline_quote_to_order')
     and not exists (select 1 from public.sales_orders o where o.quotation_id = new.id and o.status <> 'cancelled' and o.deleted_at is null)
     and exists (select 1 from public.quotation_items qi where qi.quotation_id = new.id) then
    select * into cust from public.customers where id = new.customer_id;
    if new.enquiry_id is not null then select * into enq from public.enquiries where id = new.enquiry_id; end if;
    addr := coalesce(nullif(btrim(enq.delivery_location), ''), cust.location);
    insert into public.sales_orders (customer_id, quotation_id, status, currency, order_date, delivery_address, customer_reference, notes, source, created_by, submitted_at, requested_delivery_date)
    values (new.customer_id, new.id, 'submitted', new.currency, current_date, addr, left(new.number, 60),
            'Created automatically from accepted quotation ' || new.number || '.', 'staff', new.prepared_by, now(), enq.required_by)
    returning id, number into oid, onum;
    insert into public.sales_order_items (order_id, line_no, product_id, description, quantity, unit_id, unit_price)
    select oid, qi.line_no, qi.product_id, qi.description, qi.quantity, qi.unit_id, qi.unit_price from public.quotation_items qi where qi.quotation_id = new.id;
    perform public.auto_notify_perm('pipeline_quote_to_order', 'orders.manage', new.prepared_by, 'Order ready to confirm: ' || onum,
      'Quotation ' || new.number || ' was accepted by ' || coalesce(cust.company_name, cust.contact_name, 'the customer') || '. Check stock and confirm the order, and a delivery will be scheduled automatically.',
      '/admin/orders/sales-orders', 'info', 'q2o:' || oid);
    perform public.auto_record_event('pipeline_quote_to_order', 1);
  end if;
  return new;
exception when others then
  perform public.auto_record_failure('pipeline_quote_to_order', sqlerrm);
  return new;
end;
$$;
revoke all on function public.trg_quotation_pipeline() from public, anon, authenticated;
drop trigger if exists quotations_pipeline on public.quotations;
create trigger quotations_pipeline after insert or update of status on public.quotations for each row execute function public.trg_quotation_pipeline();

-- ---------------------------------------------------------------------
-- Order confirmed -> delivery; order cancelled -> cancel scheduled deliveries; order delivered -> enquiry completed
-- ---------------------------------------------------------------------
create or replace function public.trg_order_pipeline()
returns trigger language plpgsql security definer set search_path = public as $$
declare d_id uuid;
begin
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then return new; end if;

  if new.status = 'confirmed' and public.auto_rule_active('pipeline_order_to_delivery')
     and not exists (select 1 from public.deliveries d where d.sales_order_id = new.id and d.status in ('scheduled', 'in_transit', 'delivered')) then
    insert into public.deliveries (sales_order_id, status, scheduled_date, notes)
    values (new.id, 'scheduled', new.requested_delivery_date, case when new.requested_delivery_date is null then 'Created automatically. Set the delivery date, driver and vehicle.' else 'Created automatically from the confirmed order.' end)
    returning id into d_id;
    perform public.auto_record_event('pipeline_order_to_delivery', 1);
  end if;

  if new.status = 'cancelled' and public.auto_rule_active('pipeline_order_to_delivery') then
    update public.deliveries set status = 'cancelled' where sales_order_id = new.id and status = 'scheduled';
  end if;

  if new.status = 'delivered' and new.quotation_id is not null and public.auto_rule_active('pipeline_enquiry_sync') then
    update public.enquiries e set status = 'completed'
     where e.id = (select q.enquiry_id from public.quotations q where q.id = new.quotation_id) and e.deleted_at is null and e.status <> 'completed';
    if found then perform public.auto_record_event('pipeline_enquiry_sync', 1); end if;
  end if;
  return new;
exception when others then
  perform public.auto_record_failure('pipeline_order_to_delivery', sqlerrm);
  return new;
end;
$$;
revoke all on function public.trg_order_pipeline() from public, anon, authenticated;
drop trigger if exists sales_orders_pipeline on public.sales_orders;
create trigger sales_orders_pipeline after insert or update of status on public.sales_orders for each row execute function public.trg_order_pipeline();

-- ---------------------------------------------------------------------
-- Delivery -> order status. delivered_at is stamped when a delivery is delivered without a time.
-- ---------------------------------------------------------------------
create or replace function public.trg_delivery_stamp()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = 'delivered' and new.delivered_at is null then new.delivered_at := now(); end if;
  return new;
end;
$$;
drop trigger if exists deliveries_stamp on public.deliveries;
create trigger deliveries_stamp before insert or update of status on public.deliveries for each row execute function public.trg_delivery_stamp();

create or replace function public.trg_delivery_pipeline()
returns trigger language plpgsql security definer set search_path = public as $$
declare so public.sales_orders%rowtype; others integer;
begin
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then return new; end if;
  if new.status not in ('in_transit', 'delivered') or not public.auto_rule_active('pipeline_delivery_to_order') then return new; end if;
  select * into so from public.sales_orders where id = new.sales_order_id and deleted_at is null for update;
  if not found then return new; end if;

  if new.status = 'in_transit' then
    if so.status in ('submitted', 'confirmed') then update public.sales_orders set status = 'processing' where id = so.id; end if;
  else
    select count(*) into others from public.deliveries d where d.sales_order_id = so.id and d.id <> new.id and d.status in ('scheduled', 'in_transit');
    if so.status in ('submitted', 'confirmed', 'processing', 'partially_delivered') then
      update public.sales_orders set status = case when others > 0 then 'partially_delivered' else 'delivered' end where id = so.id;
    end if;
  end if;
  perform public.auto_record_event('pipeline_delivery_to_order', 1);
  return new;
exception when others then
  perform public.auto_record_failure('pipeline_delivery_to_order', sqlerrm);
  return new;
end;
$$;
revoke all on function public.trg_delivery_pipeline() from public, anon, authenticated;
drop trigger if exists deliveries_pipeline on public.deliveries;
create trigger deliveries_pipeline after insert or update of status on public.deliveries for each row execute function public.trg_delivery_pipeline();

-- ---------------------------------------------------------------------
-- Invoice issued -> order invoiced
-- ---------------------------------------------------------------------
create or replace function public.trg_invoice_pipeline()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status <> 'issued' or (tg_op = 'UPDATE' and old.status is not distinct from new.status) or new.sales_order_id is null then return new; end if;
  if not public.auto_rule_active('pipeline_invoice_to_order') then return new; end if;
  update public.sales_orders set status = 'invoiced' where id = new.sales_order_id and status = 'delivered' and deleted_at is null;
  if found then perform public.auto_record_event('pipeline_invoice_to_order', 1); end if;
  return new;
exception when others then
  perform public.auto_record_failure('pipeline_invoice_to_order', sqlerrm);
  return new;
end;
$$;
revoke all on function public.trg_invoice_pipeline() from public, anon, authenticated;
revoke all on function public.trg_delivery_stamp() from public, anon, authenticated;
drop trigger if exists invoices_pipeline on public.invoices;
create trigger invoices_pipeline after insert or update of status on public.invoices for each row execute function public.trg_invoice_pipeline();
