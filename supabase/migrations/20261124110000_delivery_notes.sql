-- Delivery notes: available as soon as a delivery is marked in transit.
-- 1) Customer-facing functions (scoped to the caller's own orders by portal_customer_id()).
-- 2) The "on its way" email now tells the customer to sign the delivery note.
-- The PDF itself is rendered by the app from these functions (portal) or from the staff session (admin).

create or replace function public.portal_delivery_notes(p_order uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare cid uuid := public.portal_customer_id();
begin
  if cid is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', d.id, 'number', d.number, 'status', d.status, 'scheduled_date', d.scheduled_date, 'delivered_at', d.delivered_at) order by d.created_at)
    from public.deliveries d join public.sales_orders o on o.id = d.sales_order_id
    where d.sales_order_id = p_order and o.customer_id = cid and o.deleted_at is null and d.status in ('in_transit', 'delivered')
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.portal_delivery_notes(uuid) from public, anon;
grant execute on function public.portal_delivery_notes(uuid) to authenticated;

create or replace function public.portal_delivery_note(p_delivery uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare cid uuid := public.portal_customer_id(); d public.deliveries%rowtype; o public.sales_orders%rowtype; c public.customers%rowtype;
begin
  if cid is null then return null; end if;
  select * into d from public.deliveries where id = p_delivery and status in ('in_transit', 'delivered');
  if not found then return null; end if;
  select * into o from public.sales_orders where id = d.sales_order_id and customer_id = cid and deleted_at is null;
  if not found then return null; end if;
  select * into c from public.customers where id = cid;
  return jsonb_build_object(
    'id', d.id, 'number', d.number, 'status', d.status, 'scheduled_date', d.scheduled_date, 'delivered_at', d.delivered_at,
    'driver_name', d.driver_name, 'vehicle_reg', d.vehicle_reg, 'recipient_name', d.recipient_name, 'notes', d.notes,
    'order_number', o.number, 'delivery_address', o.delivery_address, 'customer_reference', o.customer_reference,
    'customer', jsonb_build_object('company', c.company_name, 'contact', c.contact_name, 'email', c.email, 'phone', c.phone, 'location', c.location),
    'items', coalesce((select jsonb_agg(jsonb_build_object('line_no', i.line_no, 'description', i.description, 'quantity', i.quantity, 'unit', u.abbreviation) order by i.line_no)
                       from public.sales_order_items i left join public.units u on u.id = i.unit_id where i.order_id = o.id), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.portal_delivery_note(uuid) from public, anon;
grant execute on function public.portal_delivery_note(uuid) to authenticated;

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
             'Dear ' || c.contact_name || E',\n\nYour order ' || so.number || ' is ' || label || E' (delivery note ' || new.number || E').\n\nPlease sign the delivery note when the goods arrive and note any shortage or damage on it. Customers with a portal account can also download it from their order page.\n\nKind regards,\nSAMSAL Supply & Distribution Limited',
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
