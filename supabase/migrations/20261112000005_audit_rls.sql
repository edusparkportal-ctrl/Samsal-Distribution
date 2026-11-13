-- =====================================================================
-- 0005 AUDIT LOG, ROW LEVEL SECURITY, GRANTS
-- Principle: every table has RLS on. Visitors (anon) can only read
-- published website content. Staff access is decided by permissions held
-- via their role, and by whether the owning module is enabled.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------
create or replace function public.module_enabled(module_key text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select enabled from public.modules where key = module_key), false);
$$;

-- permission AND (optionally) module switch
create or replace function public.can(perm text, module_key text default null)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_permission(perm) and (module_key is null or public.module_enabled(module_key));
$$;

-- Quotation numbers may only be drawn by staff allowed to prepare quotations.
create or replace function public.next_quotation_number()
returns text language plpgsql security definer set search_path = public as $$
declare prefix text;
begin
  if not public.can('quotations.manage', 'quotations') then
    raise exception 'Not permitted';
  end if;
  select quotation_prefix into prefix from public.company_settings where id = 1;
  return coalesce(prefix, 'SAM-Q') || '-' || to_char(now() at time zone 'Africa/Nairobi', 'YYYY') || '-' || lpad(nextval('public.quotation_no_seq')::text, 5, '0');
end;
$$;
revoke all on function public.next_quotation_number() from public, anon;
grant execute on function public.next_quotation_number() to authenticated;

-- ---------------------------------------------------------------------
-- Audit log
-- ---------------------------------------------------------------------
create table public.audit_log (
  id             bigint generated always as identity primary key,
  occurred_at    timestamptz not null default now(),
  actor_id       uuid,
  actor_email    text,
  action         text not null check (action in ('insert','update','delete')),
  table_name     text not null,
  record_id      text,
  changed_fields text[],
  old_data       jsonb,
  new_data       jsonb
);
create index audit_log_time_idx on public.audit_log(occurred_at desc);
create index audit_log_table_idx on public.audit_log(table_name, occurred_at desc);
create index audit_log_actor_idx on public.audit_log(actor_id);

-- mode arg: 'full' (default) stores old/new rows; 'pii' stores only the names of changed
-- fields (customer/enquiry data is not copied into the log); 'profile' stores role/active only.
create or replace function public.audit_row()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  mode text := coalesce(tg_argv[0], 'full');
  o jsonb := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end;
  n jsonb := case when tg_op in ('UPDATE','INSERT') then to_jsonb(new) end;
  src jsonb := coalesce(n, o);
  rid text;
  changed text[];
  k text;
  uid uuid := auth.uid();
  em text;
begin
  rid := case
    when src ? 'id' then src ->> 'id'
    when src ? 'path' then src ->> 'path'
    when src ? 'key' then src ->> 'key'
    else (src ->> 'role_id') || ':' || (src ->> 'permission_key')
  end;

  if tg_op = 'UPDATE' then
    select coalesce(array_agg(key order by key), '{}') into changed
    from jsonb_each(n) e
    where key not in ('updated_at','last_login_at') and (o -> key) is distinct from e.value;
    if array_length(changed, 1) is null then return new; end if;   -- nothing meaningful changed
  end if;

  if uid is not null then select email into em from public.profiles where id = uid; end if;

  if mode = 'pii' then
    o := null; n := null;
  elsif mode = 'profile' then
    o := case when o is null then null else jsonb_build_object('role_id', o -> 'role_id', 'is_active', o -> 'is_active') end;
    n := case when n is null then null else jsonb_build_object('role_id', n -> 'role_id', 'is_active', n -> 'is_active') end;
  end if;

  insert into public.audit_log(actor_id, actor_email, action, table_name, record_id, changed_fields, old_data, new_data)
  values (uid, em, lower(tg_op), tg_table_name, rid, changed, o, n);

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'company_settings','company_values','contact_channels','staff_members','social_links','homepage_settings',
    'announcements','product_categories','products','services','industries','process_steps','site_documents','seo_pages','media_assets','modules',
    'roles','role_permissions','quotations','quotation_items','suppliers','supplier_quotes','purchase_orders',
    'purchase_order_items','warehouses','sales_orders','deliveries','tenders'
  ] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_row(''full'')', t || '_audit', t);
  end loop;
  foreach t in array array['customers','enquiries'] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_row(''pii'')', t || '_audit', t);
  end loop;
end $$;
create trigger profiles_audit after update or delete on public.profiles
  for each row execute function public.audit_row('profile');

-- Audit log is append-only
create or replace function public.block_audit_changes()
returns trigger language plpgsql as $$
begin raise exception 'audit_log is append-only'; end;
$$;
create trigger audit_log_immutable before update or delete on public.audit_log
  for each row execute function public.block_audit_changes();

-- ---------------------------------------------------------------------
-- Privilege-escalation guards
-- ---------------------------------------------------------------------
-- Only users.manage can change a profile's role/active flag; only a Super Administrator can
-- grant or remove the super role. Users may edit their own name/phone/title.
create or replace function public.guard_profile_privileges()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;   -- service role / SQL editor (trusted)
  if new.role_id is distinct from old.role_id or new.is_active is distinct from old.is_active then
    if not public.has_permission('users.manage') then
      raise exception 'Not permitted to change role or status';
    end if;
    if not public.is_super_admin() and (
         exists (select 1 from public.roles r where r.is_super and r.id in (new.role_id, old.role_id))
       ) then
      raise exception 'Only a Super Administrator can grant or change the Super Administrator role';
    end if;
    if new.id = auth.uid() then
      raise exception 'You cannot change your own role or status';
    end if;
  end if;
  if new.id is distinct from old.id or new.email is distinct from old.email and not public.has_permission('users.manage') then
    raise exception 'Not permitted';
  end if;
  return new;
end;
$$;
create trigger profiles_guard_privileges before update on public.profiles
  for each row execute function public.guard_profile_privileges();

-- Only a Super Administrator can alter the permissions of roles.
create or replace function public.guard_role_permissions()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_super_admin() then
    raise exception 'Only a Super Administrator can change role permissions';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger role_permissions_guard before insert or update or delete on public.role_permissions
  for each row execute function public.guard_role_permissions();
create trigger roles_guard_super_only before insert or update or delete on public.roles
  for each row execute function public.guard_role_permissions();

-- Purchase orders: approval needs its own permission and cannot be self-approved by the creator.
create or replace function public.guard_po_approval()
returns trigger language plpgsql security definer set search_path = public as $$
declare was_unapproved boolean := true;
begin
  if auth.uid() is null then return new; end if;
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
create trigger purchase_orders_guard_approval before insert or update on public.purchase_orders
  for each row execute function public.guard_po_approval();

-- ---------------------------------------------------------------------
-- Enable RLS everywhere, then grant explicit access
-- ---------------------------------------------------------------------
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- ---- Public website content (read) + staff (read all, write by permission)
do $$
declare
  r record;
begin
  for r in select * from (values
    -- table,                  public condition,                                                                   manage permission
    ('company_settings',      'true',                                                                              'content.manage'),
    ('company_values',        'is_active',                                                                         'content.manage'),
    ('contact_channels',      'is_active and is_public',                                                           'content.manage'),
    ('staff_members',         'is_active and deleted_at is null',                                                  'content.manage'),
    ('social_links',          'enabled',                                                                           'content.manage'),
    ('homepage_settings',     'true',                                                                              'content.manage'),
    ('announcements',         'is_active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now())', 'content.manage'),
    ('product_categories',    'is_active',                                                                         'products.manage'),
    ('products',              $c$status = 'published' and deleted_at is null$c$,                                   'products.manage'),
    ('product_specifications',$c$exists (select 1 from public.products p where p.id = product_id and p.status = 'published' and p.deleted_at is null)$c$, 'products.manage'),
    ('services',              'is_active',                                                                         'content.manage'),
    ('service_points',        'exists (select 1 from public.services s where s.id = service_id and s.is_active)',  'content.manage'),
    ('industries',            'is_active',                                                                         'content.manage'),
    ('industry_needs',        'exists (select 1 from public.industries i where i.id = industry_id and i.is_active)', 'content.manage'),
    ('industry_categories',   'exists (select 1 from public.industries i where i.id = industry_id and i.is_active)', 'content.manage'),
    ('process_steps',         'is_active',                                                                         'content.manage'),
    ('site_documents',        'is_active',                                                                         'content.manage'),
    ('seo_pages',             'true',                                                                              'content.manage'),
    ('units',                 'true',                                                                              'products.manage'),
    ('modules',               'true',                                                                              'settings.manage')
  ) as v(tbl, cond, perm) loop
    execute format('grant select on public.%I to anon, authenticated', r.tbl);
    execute format('grant insert, update, delete on public.%I to authenticated', r.tbl);
    execute format('create policy %I on public.%I for select to anon, authenticated using (%s or public.is_staff())', r.tbl || '_read', r.tbl, r.cond);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.has_permission(%L))', r.tbl || '_ins', r.tbl, r.perm);
    execute format('create policy %I on public.%I for update to authenticated using (public.has_permission(%L)) with check (public.has_permission(%L))', r.tbl || '_upd', r.tbl, r.perm, r.perm);
    execute format('create policy %I on public.%I for delete to authenticated using (public.has_permission(%L))', r.tbl || '_del', r.tbl, r.perm);
  end loop;
end $$;

-- Singleton rows may never be inserted/deleted via the API once seeded
drop policy company_settings_ins on public.company_settings;
drop policy company_settings_del on public.company_settings;
drop policy homepage_settings_ins on public.homepage_settings;
drop policy homepage_settings_del on public.homepage_settings;
-- Modules are registered by migrations only; admins can only switch them on/off
drop policy modules_ins on public.modules;
drop policy modules_del on public.modules;
-- Revoke direct DML that has no policy anyway (defence in depth)
revoke insert, delete on public.company_settings, public.homepage_settings, public.modules from authenticated;

-- Product variants (staff only)
grant select, insert, update, delete on public.product_variants to authenticated;
create policy product_variants_read on public.product_variants for select to authenticated using (public.is_staff());
create policy product_variants_ins on public.product_variants for insert to authenticated with check (public.has_permission('products.manage'));
create policy product_variants_upd on public.product_variants for update to authenticated using (public.has_permission('products.manage')) with check (public.has_permission('products.manage'));
create policy product_variants_del on public.product_variants for delete to authenticated using (public.has_permission('products.manage'));

-- ---- Media library index
grant select on public.media_assets to anon;
grant select, insert, update on public.media_assets to authenticated;
create policy media_read on public.media_assets for select to anon, authenticated
  using ((bucket = 'public-media' and deleted_at is null) or public.can('media.view'));
create policy media_ins on public.media_assets for insert to authenticated
  with check (public.has_permission('media.manage') and uploaded_by = auth.uid());
create policy media_upd on public.media_assets for update to authenticated
  using (public.has_permission('media.manage')) with check (public.has_permission('media.manage'));

-- ---- Roles, permissions, profiles
grant select on public.roles, public.permissions, public.role_permissions to authenticated;
grant insert, update, delete on public.roles, public.role_permissions to authenticated;
create policy roles_read on public.roles for select to authenticated using (public.is_staff() or public.has_permission('roles.manage'));
create policy roles_ins on public.roles for insert to authenticated with check (public.has_permission('roles.manage'));
create policy roles_upd on public.roles for update to authenticated using (public.has_permission('roles.manage')) with check (public.has_permission('roles.manage'));
create policy roles_del on public.roles for delete to authenticated using (public.has_permission('roles.manage'));
create policy permissions_read on public.permissions for select to authenticated using (public.is_staff());
create policy role_permissions_read on public.role_permissions for select to authenticated using (public.is_staff());
create policy role_permissions_ins on public.role_permissions for insert to authenticated with check (public.has_permission('roles.manage'));
create policy role_permissions_del on public.role_permissions for delete to authenticated using (public.has_permission('roles.manage'));

grant select on public.profiles to authenticated;
grant update (full_name, phone, job_title, last_login_at, role_id, is_active) on public.profiles to authenticated;
create policy profiles_read on public.profiles for select to authenticated using (id = auth.uid() or public.is_staff());
create policy profiles_upd on public.profiles for update to authenticated
  using (id = auth.uid() or public.has_permission('users.manage'))
  with check (id = auth.uid() or public.has_permission('users.manage'));

-- ---- Business modules (permission AND module switch)
do $$
declare r record;
begin
  for r in select * from (values
    -- table, view permission, manage permission, module, delete is super-admin only
    ('customers',            'enquiries.view',  'enquiries.manage',  'crm',         true),
    ('enquiries',            'enquiries.view',  'enquiries.manage',  'crm',         true),
    ('quotations',           'quotations.view', 'quotations.manage', 'quotations',  false),
    ('quotation_items',      'quotations.view', 'quotations.manage', 'quotations',  false),
    ('suppliers',            'suppliers.view',  'suppliers.manage',  'suppliers',   true),
    ('supplier_categories',  'suppliers.view',  'suppliers.manage',  'suppliers',   false),
    ('supplier_quotes',      'purchasing.view', 'purchasing.manage', 'procurement', true),
    ('purchase_orders',      'purchasing.view', 'purchasing.manage', 'procurement', true),
    ('purchase_order_items', 'purchasing.view', 'purchasing.manage', 'procurement', false),
    ('warehouses',           'inventory.view',  'inventory.manage',  'inventory',   true),
    ('storage_locations',    'inventory.view',  'inventory.manage',  'inventory',   false),
    ('sales_orders',         'orders.view',     'orders.manage',     'orders',      true),
    ('sales_order_items',    'orders.view',     'orders.manage',     'orders',      false),
    ('deliveries',           'orders.view',     'orders.manage',     'orders',      true),
    ('tenders',              'tenders.view',    'tenders.manage',    'tenders',     true),
    ('tender_categories',    'tenders.view',    'tenders.manage',    'tenders',     false)
  ) as v(tbl, vp, mp, m, super_del) loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', r.tbl);
    execute format('create policy %I on public.%I for select to authenticated using (public.can(%L, %L))', r.tbl || '_read', r.tbl, r.vp, r.m);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.can(%L, %L))', r.tbl || '_ins', r.tbl, r.mp, r.m);
    execute format('create policy %I on public.%I for update to authenticated using (public.can(%L, %L)) with check (public.can(%L, %L))', r.tbl || '_upd', r.tbl, r.mp, r.m, r.mp, r.m);
    if r.super_del then
      execute format('create policy %I on public.%I for delete to authenticated using (public.is_super_admin())', r.tbl || '_del', r.tbl);
    else
      execute format('create policy %I on public.%I for delete to authenticated using (public.can(%L, %L))', r.tbl || '_del', r.tbl, r.mp, r.m);
    end if;
  end loop;
end $$;

-- Approvers (e.g. Director) may update a purchase order to approve it even without edit rights;
-- the guard trigger above enforces who may approve and blocks self-approval.
create policy purchase_orders_approve on public.purchase_orders for update to authenticated
  using (public.can('purchasing.approve', 'procurement'))
  with check (public.can('purchasing.approve', 'procurement'));

-- Quotations can only be deleted while still a draft
drop policy quotations_del on public.quotations;
create policy quotations_del on public.quotations for delete to authenticated
  using (status = 'draft' and public.can('quotations.manage', 'quotations'));

-- Notes: append-only, authored by the caller
grant select, insert on public.enquiry_notes to authenticated;
create policy enquiry_notes_read on public.enquiry_notes for select to authenticated using (public.can('enquiries.view', 'crm'));
create policy enquiry_notes_ins on public.enquiry_notes for insert to authenticated
  with check (public.can('enquiries.manage', 'crm') and author_id = auth.uid());

grant select on public.enquiry_status_history to authenticated;
create policy enquiry_history_read on public.enquiry_status_history for select to authenticated using (public.can('enquiries.view', 'crm'));

-- Stock movements: append-only
grant select, insert on public.stock_movements to authenticated;
create policy stock_movements_read on public.stock_movements for select to authenticated using (public.can('inventory.view', 'inventory'));
create policy stock_movements_ins on public.stock_movements for insert to authenticated
  with check (public.can('inventory.manage', 'inventory') and created_by = auth.uid());

-- Record documents (links to private files)
grant select, insert, delete on public.record_documents to authenticated;
create policy record_documents_read on public.record_documents for select to authenticated using (
  case entity_type
    when 'supplier' then public.can('suppliers.view', 'suppliers')
    when 'supplier_quote' then public.can('purchasing.view', 'procurement')
    when 'purchase_order' then public.can('purchasing.view', 'procurement')
    when 'tender' then public.can('tenders.view', 'tenders')
    when 'delivery' then public.can('orders.view', 'orders')
    when 'quotation' then public.can('quotations.view', 'quotations')
    else false end);
create policy record_documents_ins on public.record_documents for insert to authenticated with check (
  created_by = auth.uid() and case entity_type
    when 'supplier' then public.can('suppliers.manage', 'suppliers')
    when 'supplier_quote' then public.can('purchasing.manage', 'procurement')
    when 'purchase_order' then public.can('purchasing.manage', 'procurement')
    when 'tender' then public.can('tenders.manage', 'tenders')
    when 'delivery' then public.can('orders.manage', 'orders')
    when 'quotation' then public.can('quotations.manage', 'quotations')
    else false end);
create policy record_documents_del on public.record_documents for delete to authenticated using (
  case entity_type
    when 'supplier' then public.can('suppliers.manage', 'suppliers')
    when 'supplier_quote' then public.can('purchasing.manage', 'procurement')
    when 'purchase_order' then public.can('purchasing.manage', 'procurement')
    when 'tender' then public.can('tenders.manage', 'tenders')
    when 'delivery' then public.can('orders.manage', 'orders')
    when 'quotation' then public.can('quotations.manage', 'quotations')
    else false end);

-- Derived views run with the caller's rights (security_invoker) so the policies above still apply
grant select on public.quotation_totals, public.inventory_balances to authenticated;

-- Audit log: readable only with audit.view; never writable via the API
grant select on public.audit_log to authenticated;
create policy audit_read on public.audit_log for select to authenticated using (public.has_permission('audit.view'));

-- Staff insert rows whose reference numbers come from column defaults, so the role needs USAGE
-- on those sequences (quotation numbers are drawn inside a permission-checked function instead).
grant usage on sequence public.enquiry_ref_seq, public.po_no_seq, public.so_no_seq, public.delivery_no_seq to authenticated;

-- Functions callable by the API roles
grant execute on function public.is_staff(), public.is_super_admin(), public.has_permission(text),
  public.my_permissions(), public.module_enabled(text), public.can(text, text) to anon, authenticated;
