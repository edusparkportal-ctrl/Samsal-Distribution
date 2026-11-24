-- Fix: placing an order failed with "The change could not be saved".
-- portal_create_order cleared its temporary table with a bare `DELETE FROM _portal_lines;`. The Supabase API
-- layer runs with the safeupdate guard, which rejects any DELETE without a WHERE clause (SQLSTATE 21000).
-- Behaviour is otherwise unchanged.

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
  delete from _portal_lines where true;  -- the API layer rejects a DELETE without WHERE (safeupdate)
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
