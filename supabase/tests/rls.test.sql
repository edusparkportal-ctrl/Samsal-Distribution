-- =====================================================================
-- RLS / permission test suite. Run AFTER all migrations on a scratch database:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls.test.sql
-- Needs a Postgres where roles anon/authenticated exist and auth.uid() reads
-- request.jwt.claim.sub (true on Supabase). Creates and removes test rows
-- inside the schema "tst"; do NOT run against production data.
-- =====================================================================
drop schema if exists tst cascade;
create schema tst;
create table tst.results (n serial, passed boolean, label text, detail text);
grant usage on schema tst to public;
grant all on tst.results to public;
grant usage on sequence tst.results_n_seq to public;

create function tst.admin() returns void language plpgsql as $$ begin reset role; perform set_config('request.jwt.claim.sub', '', false); end $$;
create function tst.anon() returns void language plpgsql as $$ begin reset role; perform set_config('request.jwt.claim.sub', '', false); set role anon; end $$;
create function tst.as_user(u uuid) returns void language plpgsql as $$ begin reset role; perform set_config('request.jwt.claim.sub', u::text, false); set role authenticated; end $$;
create function tst.ok(cond boolean, lbl text) returns void language plpgsql as $$ begin insert into tst.results(passed,label) values (coalesce(cond,false), lbl); end $$;
create function tst.count_is(q text, expected bigint, lbl text) returns void language plpgsql as $$
declare c bigint; begin execute q into c; insert into tst.results(passed,label,detail) values (c = expected, lbl, 'got '||c||' expected '||expected); end $$;
create function tst.fails(q text, lbl text) returns void language plpgsql as $$
begin
  begin execute q; insert into tst.results(passed,label,detail) values (false, lbl, 'statement unexpectedly succeeded');
  exception when others then insert into tst.results(passed,label,detail) values (true, lbl, sqlerrm); end;
end $$;
create function tst.works(q text, lbl text) returns void language plpgsql as $$
begin
  begin execute q; insert into tst.results(passed,label) values (true, lbl);
  exception when others then insert into tst.results(passed,label,detail) values (false, lbl, sqlerrm); end;
end $$;
create function tst.affects(q text, expected int, lbl text) returns void language plpgsql as $$
declare n int; begin execute q; get diagnostics n = row_count; insert into tst.results(passed,label,detail) values (n = expected, lbl, 'affected '||n||' expected '||expected); end $$;
grant execute on all functions in schema tst to public;

-- ---------------- fixtures (as superuser) ----------------
select tst.admin();
insert into auth.users(id,email) values
 ('a0000000-0000-0000-0000-000000000001','super@t.test'),
 ('a0000000-0000-0000-0000-000000000002','director@t.test'),
 ('a0000000-0000-0000-0000-000000000003','procure@t.test'),
 ('a0000000-0000-0000-0000-000000000004','sales@t.test'),
 ('a0000000-0000-0000-0000-000000000005','stock@t.test'),
 ('a0000000-0000-0000-0000-000000000006','editor@t.test'),
 ('a0000000-0000-0000-0000-000000000007','pending@t.test'),
 ('a0000000-0000-0000-0000-000000000008','both@t.test');
select public.bootstrap_super_admin('super@t.test');
update public.profiles p set is_active = true, role_id = r.id from public.roles r
  where (p.email, r.key) in (('director@t.test','director'),('procure@t.test','procurement_manager'),('sales@t.test','sales_manager'),('stock@t.test','inventory_manager'),('editor@t.test','content_editor'));
insert into public.roles(key,name) values ('po_both','PO both');
insert into public.role_permissions select r.id, p from public.roles r, unnest(array['purchasing.view','purchasing.manage','purchasing.approve','suppliers.view']) p where r.key='po_both';
update public.profiles set is_active = true, role_id = (select id from public.roles where key='po_both') where email='both@t.test';

insert into public.company_settings(registered_name, brand_name) values ('Test Co Ltd','TestCo');
insert into public.homepage_settings(headline) values ('Test headline');
insert into public.product_categories(slug,name) values ('cat-a','Cat A');
insert into public.products(slug,name,status,category_id) values
 ('pub-product','Published','published',(select id from public.product_categories limit 1)),
 ('draft-product','Draft','draft',(select id from public.product_categories limit 1)),
 ('arch-product','Archived','archived',null);
insert into public.contact_channels(kind,label,value,is_public) values ('email','Sales','x@test.example',true), ('phone','Internal','000',false);
insert into public.customers(contact_name,email) values ('Jane Buyer','jane@buyer.test');
insert into public.enquiries(customer_id, product_text) values ((select id from public.customers limit 1), '100 reams A4 paper');
insert into public.suppliers(name) values ('Test Supplier Ltd');
insert into public.social_links(platform,url,enabled) values ('LinkedIn','https://linkedin.com/company/test',true),('X','https://x.com/test',false);

-- ---------------- anonymous visitor ----------------
select tst.anon();
select tst.count_is('select count(*) from public.products', 1, 'anon sees only published products');
select tst.count_is('select count(*) from public.contact_channels', 1, 'anon sees only public contact channels');
select tst.count_is('select count(*) from public.social_links', 1, 'anon sees only enabled social links');
select tst.count_is('select count(*) from public.company_settings', 1, 'anon can read company settings');
select tst.fails('select count(*) from public.enquiries', 'anon cannot read enquiries');
select tst.fails('select count(*) from public.customers', 'anon cannot read customers');
select tst.fails('select count(*) from public.profiles', 'anon cannot read profiles');
select tst.fails('select count(*) from public.audit_log', 'anon cannot read audit log');
select tst.fails('select count(*) from public.suppliers', 'anon cannot read suppliers');
select tst.fails($$insert into public.enquiries(product_text) values ('spam')$$, 'anon cannot insert enquiries directly');
select tst.fails($$update public.company_settings set brand_name='Hacked'$$, 'anon cannot update company settings');
select tst.fails($$insert into public.products(slug,name) values ('x-prod','x')$$, 'anon cannot insert products');
select tst.fails($$select public.next_quotation_number()$$, 'anon cannot draw quotation numbers');
select tst.fails($$select public.bootstrap_super_admin('pending@t.test')$$, 'anon cannot call bootstrap_super_admin');
select tst.count_is($$select count(*) from storage.objects where bucket_id='private-docs'$$, 0, 'anon sees no private docs');

-- ---------------- pending (inactive, no role) user ----------------
select tst.as_user('a0000000-0000-0000-0000-000000000007');
select tst.count_is('select count(*) from public.products', 1, 'inactive user = same as anon for products');
select tst.ok(not public.is_staff(), 'inactive user is not staff');
select tst.ok(public.my_permissions() = '{}', 'inactive user holds no permissions');
select tst.count_is('select count(*) from public.profiles', 1, 'inactive user sees only own profile');
select tst.count_is('select count(*) from public.enquiries', 0, 'inactive user sees no enquiries');
select tst.fails($$update public.profiles set is_active = true, role_id = (select id from public.roles where key='super_admin') where id = auth.uid()$$, 'inactive user cannot self-activate / self-promote');

-- ---------------- content editor ----------------
select tst.as_user('a0000000-0000-0000-0000-000000000006');
select tst.affects($$update public.company_settings set mission='Mission text'$$, 1, 'editor can update company settings');
select tst.works($$insert into public.products(slug,name,status) values ('new-prod','New product','draft')$$, 'editor can create product');
select tst.count_is('select count(*) from public.products', 4, 'editor (staff) sees drafts and archived too');
select tst.works($$insert into public.staff_members(full_name,position) values ('Test Person','Manager')$$, 'editor can add staff profile');
select tst.fails($$insert into public.social_links(platform,url) values ('Bad','http://insecure.test')$$, 'social link must be https');
select tst.fails($$insert into public.staff_members(full_name,position,linkedin_url) values ('Bad Link','x','https://evil.test/linkedin.com/')$$, 'linkedin url must be linkedin.com');
select tst.count_is('select count(*) from public.enquiries', 0, 'editor cannot see enquiries');
select tst.count_is('select count(*) from public.suppliers', 0, 'editor cannot see suppliers');
select tst.fails($$insert into public.suppliers(name) values ('Sneaky')$$, 'editor cannot create suppliers');
select tst.fails($$delete from public.company_settings$$, 'editor cannot delete company settings (singleton)');
select tst.affects($$update public.modules set enabled = false where key = 'crm'$$, 0, 'editor module update affects nothing') ;
select tst.fails($$update public.profiles set role_id = (select id from public.roles where key='super_admin') where id = auth.uid()$$, 'editor cannot self-promote');
select tst.fails($$insert into public.role_permissions select r.id,'users.manage' from public.roles r where key='content_editor'$$, 'editor cannot grant permissions to roles');
select tst.count_is('select count(*) from public.audit_log', 0, 'editor cannot read audit log');
select tst.works($$update public.profiles set full_name = 'Editor Renamed', phone = '0700' where id = auth.uid()$$, 'user can edit own name/phone');
select tst.fails($$update public.profiles set email = 'other@x.test' where id = auth.uid()$$, 'user cannot change own email (no column grant)');
-- storage
select tst.works($$insert into storage.objects(bucket_id,name) values ('public-media','products/a.png')$$, 'editor can upload to public-media');
select tst.works($$insert into storage.objects(bucket_id,name) values ('private-docs','editor.pdf')$$, 'editor can upload documents (holds media.manage)');

-- ---------------- sales manager ----------------
select tst.as_user('a0000000-0000-0000-0000-000000000004');
select tst.count_is('select count(*) from public.enquiries', 1, 'sales sees enquiries');
select tst.count_is('select count(*) from public.customers', 1, 'sales sees customers');
select tst.works($$insert into public.enquiry_notes(enquiry_id, author_id, body) select id, auth.uid(), 'Called customer' from public.enquiries$$, 'sales can add note as self');
select tst.fails($$insert into public.enquiry_notes(enquiry_id, author_id, body) select id, 'a0000000-0000-0000-0000-000000000001', 'forged' from public.enquiries$$, 'sales cannot forge note author');
select tst.affects($$update public.enquiries set status='under_review', follow_up_date = current_date + 3$$, 1, 'sales can update enquiry status');
select tst.count_is($$select count(*) from public.enquiry_status_history where to_status='under_review'$$, 1, 'status change history recorded');
select tst.fails($$update public.enquiries set status='bogus'$$, 'invalid status rejected by constraint');
select tst.affects($$delete from public.enquiries$$, 0, 'sales cannot delete enquiries (super admin only)');
select tst.count_is('select count(*) from public.suppliers', 0, 'sales cannot see suppliers');
select tst.affects($$update public.company_settings set brand_name='Hacked'$$, 0, 'sales cannot edit company settings');
select tst.works($$insert into public.quotations(number, enquiry_id, prepared_by) select public.next_quotation_number(), id, auth.uid() from public.enquiries$$, 'sales can create quotation with generated number');
select tst.works($$insert into public.quotation_items(quotation_id,line_no,description,quantity,unit_price) select id,1,'A4 paper ream',100,650.50 from public.quotations$$, 'sales can add quotation line');
select tst.works($$insert into public.quotation_items(quotation_id,line_no,description,quantity,unit_price) select id,2,'Stapler',10,300 from public.quotations$$, 'sales can add second line');
select tst.fails($$insert into public.quotation_items(quotation_id,line_no,description,quantity,unit_price) select id,3,'Neg',-1,5 from public.quotations$$, 'negative quantity rejected');
select tst.count_is($$select count(*) from public.quotation_totals where subtotal = 68050.00 and total = 68050.00$$, 1, 'quotation totals computed server-side (100*650.50 + 10*300)');
select tst.fails($$insert into public.sales_orders(customer_id) select id from public.customers$$, 'sales cannot use orders while module disabled');
select tst.count_is($$select count(*) from public.quotations$$, 1, 'sales sees quotation');
select tst.works($$delete from public.quotations where status='draft'$$, 'draft quotation can be deleted');
select tst.works($$insert into public.quotations(number,status) values ('SAM-Q-TEST-1','sent')$$, 'sent quotation inserted');
select tst.affects($$delete from public.quotations where status='sent'$$, 0, 'sent quotation cannot be deleted');
-- quotation guards (migration 0008)
select tst.fails($$insert into public.quotation_items(quotation_id,line_no,description,quantity,unit_price) select id,1,'late line',1,1 from public.quotations where number='SAM-Q-TEST-1'$$, 'cannot add lines to an issued quotation');
select tst.fails($$update public.quotations set payment_terms='Free' where number='SAM-Q-TEST-1'$$, 'cannot change terms of an issued quotation');
select tst.works($$update public.quotations set decision_note='noted' where number='SAM-Q-TEST-1'$$, 'decision note stays editable after issue');
select tst.works($$insert into public.quotations(number,status) values ('SAM-Q-TEST-2','draft')$$, 'second draft created');
select tst.works($$insert into public.quotation_items(quotation_id,line_no,description,quantity,unit_price) select id,1,'draft line',1,5 from public.quotations where number='SAM-Q-TEST-2'$$, 'draft accepts lines');
select tst.works($$update public.quotation_items set unit_price=6 where quotation_id=(select id from public.quotations where number='SAM-Q-TEST-2')$$, 'draft lines editable');
select tst.works($$update public.quotations set status='sent' where number='SAM-Q-TEST-2'$$, 'draft -> sent');
select tst.fails($$update public.quotations set status='draft' where number='SAM-Q-TEST-2'$$, 'sent cannot return to draft');
select tst.fails($$update public.quotation_items set unit_price=7 where quotation_id=(select id from public.quotations where number='SAM-Q-TEST-2')$$, 'sent quotation lines frozen');
select tst.fails($$delete from public.quotation_items where quotation_id=(select id from public.quotations where number='SAM-Q-TEST-2')$$, 'sent quotation lines cannot be deleted');
select tst.works($$update public.quotations set status='accepted' where number='SAM-Q-TEST-2'$$, 'sent -> accepted');
select tst.ok((select decision='accepted' and decision_at is not null and decision_by = auth.uid() from public.quotations where number='SAM-Q-TEST-2'), 'acceptance records decision, time and user');
select tst.fails($$update public.quotations set status='declined' where number='SAM-Q-TEST-2'$$, 'accepted quotation cannot change status');
select tst.fails($$insert into storage.objects(bucket_id,name) values ('public-media','x.png')$$, 'sales cannot upload website media');
select tst.works($$insert into storage.objects(bucket_id,name) values ('private-docs','quote.pdf')$$, 'sales can upload quotation documents');

-- ---------------- procurement manager + PO approval ----------------
select tst.as_user('a0000000-0000-0000-0000-000000000003');
select tst.count_is('select count(*) from public.suppliers', 1, 'procurement sees suppliers');
select tst.works($$insert into public.supplier_quotes(supplier_id, product_text, unit_price) select id,'A4 paper',600 from public.suppliers$$, 'procurement can record supplier quote');
select tst.works($$insert into public.purchase_orders(supplier_id, created_by) select id, auth.uid() from public.suppliers$$, 'procurement can draft PO');
select tst.fails($$update public.purchase_orders set status='approved'$$, 'procurement cannot approve PO');
select tst.fails($$insert into public.purchase_orders(supplier_id, status) select id,'approved' from public.suppliers$$, 'procurement cannot insert an already-approved PO');
select tst.affects($$delete from public.suppliers$$, 0, 'procurement cannot delete suppliers');
select tst.count_is('select count(*) from public.enquiries', 1, 'procurement can view enquiries (read-only)');
select tst.affects($$update public.enquiries set status='sourcing'$$, 0, 'procurement cannot edit enquiries');

select tst.as_user('a0000000-0000-0000-0000-000000000002');  -- director
select tst.works($$update public.purchase_orders set status='approved'$$, 'director can approve PO');
select tst.count_is($$select count(*) from public.purchase_orders where status='approved' and approved_by = 'a0000000-0000-0000-0000-000000000002'$$, 1, 'approver recorded by trigger, not by client');
select tst.ok((select count(*) from public.audit_log) > 0, 'director can read audit log');
select tst.affects($$update public.company_settings set brand_name='Director edit'$$, 0, 'director cannot edit website content');
select tst.affects($$update public.suppliers set name='x'$$, 0, 'director cannot edit suppliers (view only)');
select tst.ok(exists(select 1 from storage.objects where bucket_id='private-docs'), 'director can read private documents');

select tst.as_user('a0000000-0000-0000-0000-000000000008');  -- manage + approve
select tst.works($$insert into public.purchase_orders(supplier_id, created_by) select id, auth.uid() from public.suppliers$$, 'dual-role user creates PO');
select tst.fails($$update public.purchase_orders set status='approved' where created_by = auth.uid()$$, 'creator cannot approve their own PO');

-- ---------------- inventory: module switch ----------------
select tst.as_user('a0000000-0000-0000-0000-000000000005');
select tst.fails($$insert into public.warehouses(name) values ('Main store')$$, 'inventory disabled: warehouse insert blocked even with permission');
select tst.fails($$insert into storage.objects(bucket_id,name) values ('private-docs','stock.pdf')$$, 'user without any document-writing permission cannot upload private docs');
select tst.count_is('select count(*) from public.warehouses', 0, 'inventory disabled: nothing visible');
select tst.as_user('a0000000-0000-0000-0000-000000000001');  -- super
select tst.works($$update public.modules set enabled = true where key in ('inventory')$$, 'super admin can enable inventory');
select tst.fails($$update public.modules set enabled = false where key = 'website'$$, 'core module cannot be disabled');
select tst.fails($$insert into public.modules(key,name) values ('evil','Evil')$$, 'modules cannot be created via the API');
select tst.as_user('a0000000-0000-0000-0000-000000000005');
select tst.works($$insert into public.warehouses(name) values ('Main store')$$, 'inventory enabled: warehouse can be created');
select tst.as_user('a0000000-0000-0000-0000-000000000006');
select tst.works($$insert into public.product_variants(product_id, name, sku, reorder_level) select id,'Default','SKU-1',10 from public.products where slug='pub-product'$$, 'editor creates variant (products.manage)');
select tst.as_user('a0000000-0000-0000-0000-000000000005');
select tst.works($$insert into public.stock_movements(variant_id,warehouse_id,movement_type,quantity,created_by) select v.id,w.id,'receipt',50,auth.uid() from public.product_variants v, public.warehouses w$$, 'stock receipt recorded');
select tst.works($$insert into public.stock_movements(variant_id,warehouse_id,movement_type,quantity,created_by) select v.id,w.id,'issue',-45,auth.uid() from public.product_variants v, public.warehouses w$$, 'stock issue recorded');
select tst.fails($$insert into public.stock_movements(variant_id,warehouse_id,movement_type,quantity,created_by) select v.id,w.id,'issue',5,auth.uid() from public.product_variants v, public.warehouses w$$, 'issue must be negative');
select tst.count_is($$select count(*) from public.inventory_balances where quantity_on_hand = 5 and needs_reorder$$, 1, 'balance derived from movements; reorder flag raised');
select tst.fails($$update public.stock_movements set quantity = 999$$, 'stock movements are immutable');
select tst.fails($$delete from public.stock_movements$$, 'stock movements cannot be deleted');

-- ---------------- super admin protections ----------------
select tst.as_user('a0000000-0000-0000-0000-000000000001');
select tst.fails($$update public.profiles set is_active = false where id = auth.uid()$$, 'super admin cannot deactivate self');
select tst.works($$update public.profiles set is_active = true, role_id = (select id from public.roles where key='sales_manager') where email='pending@t.test'$$, 'super admin can activate and assign a role');
select tst.fails($$update public.roles set is_super = false where key='super_admin'$$, 'super role identity is protected');
select tst.fails($$delete from public.roles where key='super_admin'$$, 'system roles cannot be deleted');
select tst.works($$insert into public.roles(key,name) values ('custom_role','Custom Role')$$, 'super admin can create a role');
select tst.works($$insert into public.role_permissions select id,'reports.view' from public.roles where key='custom_role'$$, 'super admin can grant permissions');
select tst.as_user('a0000000-0000-0000-0000-000000000007');  -- now sales_manager
select tst.ok(public.is_staff(), 'newly activated user is staff');
select tst.ok('enquiries.manage' = any(public.my_permissions()), 'my_permissions reflects role');
select tst.fails($$update public.profiles set role_id=(select id from public.roles where key='super_admin') where id=auth.uid()$$, 'sales manager cannot self-promote');
select tst.admin();
select tst.fails($$update public.profiles set is_active=false where email='super@t.test'$$, 'last active super admin cannot be deactivated (even by superuser)');
select tst.fails($$delete from public.profiles where email='super@t.test'$$, 'last active super admin cannot be deleted');

-- ---------------- audit trail ----------------
select tst.admin();
select tst.ok(exists(select 1 from public.audit_log where table_name='company_settings' and actor_email='editor@t.test' and 'mission' = any(changed_fields)), 'company change audited with actor and changed field');
select tst.ok(exists(select 1 from public.audit_log where table_name='enquiries' and old_data is null and new_data is null), 'enquiry audit rows hold no customer data');
select tst.ok(exists(select 1 from public.audit_log where table_name='profiles' and new_data ? 'role_id' and not (new_data ? 'email')), 'profile audit stores role/active only');
select tst.ok(exists(select 1 from public.audit_log where table_name='modules' and record_id='inventory'), 'module toggle audited');
select tst.ok(exists(select 1 from public.audit_log where table_name='purchase_orders' and actor_email='director@t.test'), 'PO approval audited');
select tst.fails($$update public.audit_log set action='delete'$$, 'audit log cannot be modified');
select tst.fails($$delete from public.audit_log$$, 'audit log cannot be deleted');

-- private document index (migration 0009)
select tst.as_user('a0000000-0000-0000-0000-000000000004');
select tst.works($$insert into public.media_assets(bucket,storage_path,file_name,folder,mime_type,size_bytes,uploaded_by) values ('private-docs','quotation/202611/x-q.pdf','q.pdf','quotation','application/pdf',1000,auth.uid())$$, 'sales can index a private quotation document');
select tst.fails($$insert into public.media_assets(bucket,storage_path,file_name,folder,mime_type,size_bytes,uploaded_by) values ('public-media','general/202611/x-p.pdf','p.pdf','general','application/pdf',1000,auth.uid())$$, 'sales cannot add to the PUBLIC library');
select tst.fails($$insert into public.media_assets(bucket,storage_path,file_name,folder,mime_type,size_bytes,uploaded_by) values ('private-docs','quotation/202611/y.pdf','y.pdf','quotation','application/pdf',1000,'a0000000-0000-0000-0000-000000000001')$$, 'cannot index a document as someone else');
select tst.count_is($$select count(*) from public.media_assets where bucket='private-docs'$$, 1, 'sales reads the private index');
select tst.as_user('a0000000-0000-0000-0000-000000000005');
select tst.count_is($$select count(*) from public.media_assets where bucket='private-docs'$$, 1, 'read-only staff (orders/purchasing view) can read the private index');
select tst.fails($$insert into public.media_assets(bucket,storage_path,file_name,folder,mime_type,size_bytes,uploaded_by) values ('private-docs','quotation/202611/z.pdf','z.pdf','quotation','application/pdf',1000,auth.uid())$$, 'read-only inventory manager cannot index private documents');
select tst.anon();
select tst.count_is($$select count(*) from public.media_assets where bucket='private-docs'$$, 0, 'anonymous visitors cannot see the private index');


-- ---------------- HR outsourcing module (migration 0011): off by default, off means OFF ----------------
select tst.admin();
insert into auth.users(id,email) values ('a0000000-0000-0000-0000-000000000009','hr@t.test');
update public.profiles set is_active = true, role_id = (select id from public.roles where key='hr_manager') where email='hr@t.test';
select tst.ok(not (select enabled from public.modules where key='hr'), 'HR module ships disabled');
select tst.ok(exists(select 1 from public.permissions where key in ('hr.view','hr.manage') having count(*) = 2), 'HR permissions exist');
-- module off: nobody can read or write, not even the Super Administrator
select tst.as_user('a0000000-0000-0000-0000-000000000009');
select tst.fails($$insert into public.hr_requisitions(client_name,title) values ('Client A','Cleaner')$$, 'HR manager cannot write while the module is off');
select tst.as_user('a0000000-0000-0000-0000-000000000001');
select tst.fails($$insert into public.hr_requisitions(client_name,title) values ('Client A','Cleaner')$$, 'Super Administrator cannot write while the HR module is off');
select tst.count_is($$select count(*) from public.hr_requisitions$$, 0, 'nothing readable while the HR module is off');
-- switch the module on (as a Super Administrator would in Settings > Modules)
select tst.admin();
update public.modules set enabled = true where key = 'hr';
select tst.as_user('a0000000-0000-0000-0000-000000000009');
select tst.works($$insert into public.hr_requisitions(client_name,title,headcount,created_by) values ('Client A','Cleaner',3,auth.uid())$$, 'HR manager can create a staffing request once enabled');
select tst.ok((select reference from public.hr_requisitions limit 1) like 'HRQ-%', 'staffing request gets an HRQ- reference');
select tst.fails($$insert into public.hr_requisitions(client_name,title,headcount) values ('Client A','Cleaner',0)$$, 'headcount must be at least 1');
select tst.fails($$insert into public.hr_requisitions(client_name,title,status) values ('Client A','Cleaner','bogus')$$, 'invalid request status rejected');
select tst.fails($$insert into public.hr_candidates(full_name,consent_recorded) values ('Jane Doe', true)$$, 'consent needs a date');
select tst.works($$insert into public.hr_candidates(full_name,phone,consent_recorded,consent_date,created_by) values ('Jane Doe','0700000000', true, current_date, auth.uid())$$, 'candidate with recorded consent saved');
select tst.works($$insert into public.hr_candidates(full_name) values ('John Roe')$$, 'candidate without consent can be recorded as not yet consented');
select tst.fails($$insert into public.hr_candidates(full_name,email) values ('Bad Email','not-an-email')$$, 'candidate email validated');
select tst.works($$insert into public.hr_placements(requisition_id,candidate_id,start_date,end_date) select r.id, c.id, date '2027-01-01', date '2027-06-30' from public.hr_requisitions r, public.hr_candidates c where c.full_name='Jane Doe'$$, 'placement created');
select tst.fails($$insert into public.hr_placements(requisition_id,candidate_id) select r.id, c.id from public.hr_requisitions r, public.hr_candidates c where c.full_name='Jane Doe'$$, 'same candidate cannot be placed twice on one request');
select tst.fails($$insert into public.hr_placements(requisition_id,candidate_id,start_date,end_date) select r.id, c.id, date '2027-03-01', date '2027-02-01' from public.hr_requisitions r, public.hr_candidates c where c.full_name='John Roe'$$, 'placement end date cannot precede start date');
select tst.affects($$delete from public.hr_candidates$$, 0, 'HR manager cannot permanently delete candidates');
select tst.works($$update public.hr_candidates set deleted_at = now() where full_name='John Roe'$$, 'HR manager can archive a candidate');
-- other roles
select tst.as_user('a0000000-0000-0000-0000-000000000004');
select tst.count_is($$select count(*) from public.hr_requisitions$$, 0, 'sales manager cannot see HR requests');
select tst.fails($$insert into public.hr_requisitions(client_name,title) values ('X','Y')$$, 'sales manager cannot create HR requests');
select tst.as_user('a0000000-0000-0000-0000-000000000006');
select tst.count_is($$select count(*) from public.hr_candidates$$, 0, 'content editor cannot see candidates');
select tst.as_user('a0000000-0000-0000-0000-000000000002');
select tst.count_is($$select count(*) from public.hr_requisitions$$, 1, 'director can view HR requests');
select tst.fails($$insert into public.hr_requisitions(client_name,title) values ('X','Y')$$, 'director is read-only on HR');
select tst.anon();
select tst.fails($$select count(*) from public.hr_candidates$$, 'anonymous visitors have no access to candidates at all');
select tst.fails($$insert into public.hr_candidates(full_name) values ('Anon')$$, 'anonymous visitors cannot write candidates');
-- audit: candidate personal data never copied into the log
select tst.admin();
select tst.ok(exists(select 1 from public.audit_log where table_name='hr_candidates' and old_data is null and new_data is null and changed_fields is not null), 'candidate activity logged without values (field names only)');
select tst.ok(exists(select 1 from public.audit_log where table_name='hr_requisitions' and new_data is not null), 'staffing request changes logged');
-- switching off again stops access immediately
update public.modules set enabled = false where key = 'hr';
select tst.as_user('a0000000-0000-0000-0000-000000000009');
select tst.count_is($$select count(*) from public.hr_candidates$$, 0, 'switching the module off stops access immediately');
select tst.admin();

-- ---------------- Automation engine (migrations 0012-0014) ----------------
select tst.admin();
select tst.ok(exists(select 1 from public.modules where key='automation' and enabled), 'automation module exists and is on');
select tst.count_is($$select (count(*) >= 17)::int from public.automation_rules$$, 1, 'the automation rules exist');
select tst.ok(not (select email_enabled from public.automation_settings), 'email automation ships OFF');
select tst.count_is($$select count(*) from public.notification_outbox$$, 0, 'nothing queued for email while email is off');
select tst.count_is($$select count(*) from public.automation_rules where kind='scheduled' and not exists (select 1 from pg_proc where proname = 'auto_' || key)$$, 0, 'every scheduled rule has an implementation');

-- enquiry: assignment, staff alert, reference
insert into public.enquiries(customer_id, product_text) values ((select id from public.customers limit 1), '50 boxes of pens');
select tst.ok((select assigned_to is not null from public.enquiries where product_text='50 boxes of pens'), 'new enquiry is auto-assigned');
select tst.ok((select reference like 'ENQ-%' from public.enquiries where product_text='50 boxes of pens'), 'new enquiry has a reference');
select tst.ok((select r.key = 'sales_manager' from public.enquiries e join public.profiles p on p.id=e.assigned_to join public.roles r on r.id=p.role_id where e.product_text='50 boxes of pens'), 'assigned to a sales manager, not the super admin');
select tst.ok((select p.email = 'pending@t.test' from public.enquiries e join public.profiles p on p.id=e.assigned_to where e.product_text='50 boxes of pens'), 'work is spread: the sales manager with fewer open enquiries gets it');
select tst.ok(exists(select 1 from public.notifications n join public.enquiries e on n.dedupe_key = 'enq-new:'||e.id where e.product_text='50 boxes of pens' and n.recipient_id = e.assigned_to and n.title like '%assigned to you'), 'assignee gets an "assigned to you" alert');
select tst.count_is($$select count(*) from public.notifications n join public.enquiries e on n.dedupe_key = 'enq-new:'||e.id where e.product_text='50 boxes of pens' and n.recipient_id = e.assigned_to$$, 1, 'assignee is alerted exactly once');
select tst.ok(exists(select 1 from public.automation_runs where rule_key='enquiry_assign' and status='success'), 'assignment is logged');

-- duplicate prevention
select tst.count_is($$select public.auto_notify('enquiry_notify_staff','a0000000-0000-0000-0000-000000000004','x',null,'/admin','info','dupe-test') + public.auto_notify('enquiry_notify_staff','a0000000-0000-0000-0000-000000000004','x',null,'/admin','info','dupe-test')$$, 1, 'same dedupe key never notifies twice');
select tst.fails($$select public.auto_notify('enquiry_notify_staff','a0000000-0000-0000-0000-000000000004','x',null,'https://evil.example','info','bad-link')$$, 'notification links must stay inside /admin');

-- email gating
select tst.count_is($$select public.auto_enqueue_email('enquiry_ack','customer','jane@buyer.test','s','b','mail-1')$$, 0, 'no email queued while email is off');
update public.automation_settings set email_enabled = true;
select tst.count_is($$select public.auto_enqueue_email('enquiry_ack','customer','jane@buyer.test','s','b','mail-1')$$, 0, 'no email queued while the rule channel is off');
update public.automation_rules set notify_email = true where key = 'enquiry_ack';
select tst.count_is($$select public.auto_enqueue_email('enquiry_ack','customer','jane@buyer.test','s','b','mail-1') + public.auto_enqueue_email('enquiry_ack','customer','jane@buyer.test','s','b','mail-1')$$, 1, 'email queued once when both switches are on');
insert into public.enquiries(customer_id, product_text) values ((select id from public.customers limit 1), 'ack test item');
select tst.ok(exists(select 1 from public.notification_outbox where dedupe_key like 'enq-ack:%' and subject like 'We have received your enquiry ENQ-%'), 'acknowledgement email queued with the reference');
select tst.fails($$update public.automation_rules set notify_email = true where key = 'enquiry_assign'$$, 'email cannot be enabled on a rule that does not send email');

-- outbox retries with back-off, then failure
select tst.ok((select count(*) from public.outbox_claim(10)) >= 1, 'outbox claim returns due emails');
select tst.ok((select status from public.notification_outbox where dedupe_key='mail-1') = 'sending', 'claimed email is marked sending');
select public.outbox_complete((select id from public.notification_outbox where dedupe_key='mail-1'), false, 'smtp down');
select tst.ok((select status='pending' and attempts=1 and next_attempt_at > now() from public.notification_outbox where dedupe_key='mail-1'), 'failed send is retried later with back-off');
update public.notification_outbox set attempts = max_attempts where dedupe_key='mail-1';
select public.outbox_complete((select id from public.notification_outbox where dedupe_key='mail-1'), false, 'smtp down');
select tst.ok((select status from public.notification_outbox where dedupe_key='mail-1') = 'failed', 'email fails permanently after max attempts');
select tst.ok(exists(select 1 from public.notifications where title = 'Email could not be delivered'), 'administrators are told about a failed email');
update public.automation_settings set email_enabled = false;

-- scheduled reminders
update public.enquiries set created_at = now() - interval '30 hours' where product_text='50 boxes of pens';
update public.enquiries set follow_up_date = current_date - 1 where product_text='100 reams A4 paper';
select tst.ok(public.run_automations() >= 2, 'engine run creates reminders');
select tst.ok(exists(select 1 from public.notifications where title like 'Unanswered enquiry ENQ-%'), 'unanswered-enquiry reminder created');
select tst.ok(exists(select 1 from public.notifications where title like 'Follow-up due: ENQ-%'), 'follow-up reminder created');
select tst.count_is($$select public.run_automations()$$, 0, 'an immediate second run creates nothing (not due, no duplicates)');
update public.automation_rules set next_run_at = now() - interval '1 minute' where key = 'enquiry_unanswered';
select tst.count_is($$select public.run_automations()$$, 0, 'a forced re-run in the same period creates no duplicate reminders');

-- failure isolation, retry and error reporting
alter function public.auto_quotation_pending(jsonb) rename to auto_quotation_pending_real;
create function public.auto_quotation_pending(p jsonb) returns integer language plpgsql as $f$ begin raise exception 'boom'; end $f$;
update public.automation_rules set next_run_at = now() - interval '1 minute' where key in ('quotation_pending','enquiry_followup');
select public.run_automations();
select tst.ok((select status = 'error' from public.automation_runs where rule_key='quotation_pending' order by started_at desc limit 1), 'a failing rule is logged as an error');
select tst.ok((select consecutive_failures = 1 and next_run_at > now() and next_run_at <= now() + interval '6 minutes' from public.automation_rules where key='quotation_pending'), 'a failing rule is retried in about 5 minutes');
select tst.ok((select status = 'success' from public.automation_runs where rule_key='enquiry_followup' order by started_at desc limit 1), 'other rules still run when one fails');
select tst.ok(exists(select 1 from public.notifications where title = 'Automation failed: Chase quotations with no decision'), 'administrators are notified of a failing rule');
-- restore the real function
drop function public.auto_quotation_pending(jsonb);
alter function public.auto_quotation_pending_real(jsonb) rename to auto_quotation_pending;
update public.automation_rules set consecutive_failures = 0, last_error = null where key = 'quotation_pending';

-- quotations
insert into public.quotations(number, customer_id, status, issue_date, valid_until, prepared_by)
  values ('T-Q-1', (select id from public.customers limit 1), 'sent', current_date - 5, current_date - 1, (select id from public.profiles where email='sales@t.test'));
insert into public.quotations(number, customer_id, status, issue_date, valid_until, prepared_by)
  values ('T-Q-2', (select id from public.customers limit 1), 'sent', current_date - 4, current_date + 1, (select id from public.profiles where email='sales@t.test')),
         ('T-Q-3', (select id from public.customers limit 1), 'draft', current_date - 9, null, null);
select public.auto_quotation_pending('{"days_pending":3,"repeat_days":3,"days_expiring":2}');
select tst.ok(exists(select 1 from public.notifications where title = 'Quotation T-Q-1 has expired'), 'expired quotation flagged');
select tst.ok(exists(select 1 from public.notifications where title = 'Quotation T-Q-2 expires soon'), 'quotation nearing expiry flagged');
select tst.ok(exists(select 1 from public.notifications where title = 'No decision yet on quotation T-Q-2'), 'pending quotation chased');
select tst.ok(not exists(select 1 from public.notifications where title like '%T-Q-3%'), 'draft quotations are never chased');
select tst.count_is($$select public.auto_quotation_pending('{"days_pending":3,"repeat_days":3,"days_expiring":2}')$$, 0, 'quotation reminders are not duplicated');

-- supplier quote comparison
select tst.admin();
insert into public.suppliers(name) values ('Cheap Co'), ('Dear Co');
insert into public.supplier_quotes(supplier_id, enquiry_id, product_text, unit_price, quantity, additional_costs, currency) values
 ((select id from public.suppliers where name='Cheap Co'), (select id from public.enquiries where product_text='50 boxes of pens'), 'Pens', 100, 10, 500, 'KES'),
 ((select id from public.suppliers where name='Dear Co'),  (select id from public.enquiries where product_text='50 boxes of pens'), 'pens ', 110, 10, 0, 'KES'),
 ((select id from public.suppliers where name='Dear Co'),  (select id from public.enquiries where product_text='50 boxes of pens'), 'Pens', 1, 10, 0, 'USD');
select tst.ok((select supplier_name from public.supplier_quote_comparison where value_rank = 1 and currency='KES') = 'Dear Co', 'best value includes extra costs (110 beats 100+50)');
select tst.count_is($$select count(*) from public.supplier_quote_comparison where currency='USD' and quotes_compared = 1$$, 1, 'quotes in different currencies are not compared');
select tst.count_is($$select count(*) from public.supplier_quote_comparison where currency='KES' and quotes_compared = 2$$, 2, 'item names are matched ignoring case and spaces');
select public.auto_quote_comparison('{}');
select tst.ok(exists(select 1 from public.notifications where title like 'Supplier quotes compared for ENQ-%' and body like '%Best value: Dear Co%'), 'comparison alert names the best-value supplier');
select tst.count_is($$select public.auto_quote_comparison('{}')$$, 0, 'comparison alert is not repeated');

-- purchase order notices
insert into public.purchase_orders(supplier_id, status, created_by) values ((select id from public.suppliers where name='Dear Co'), 'draft', 'a0000000-0000-0000-0000-000000000003');
update public.purchase_orders set status = 'pending_approval';
select tst.ok(exists(select 1 from public.notifications n join public.profiles p on p.id=n.recipient_id where p.email='director@t.test' and n.title like 'Purchase order PO-%needs approval'), 'approver notified when a PO needs approval');
select tst.as_user('a0000000-0000-0000-0000-000000000002');
update public.purchase_orders set status = 'approved';
select tst.admin();
select tst.ok(exists(select 1 from public.notifications n join public.profiles p on p.id=n.recipient_id where p.email='procure@t.test' and n.title like 'Send order PO-%'), 'procurement prompted to send the order after approval');
select tst.ok(exists(select 1 from public.notifications where title like 'Purchase order PO-%approved'), 'approval notice created');

-- tenders: checklist and deadlines (module is off by default, so the rule must not act until it is on)
insert into public.tenders(reference, procuring_entity, title) values ('T-OFF','Test Entity','Off test');
select tst.count_is($$select count(*) from public.tender_checklist_items$$, 0, 'no checklist is generated while the tenders module is off');
delete from public.tenders;
update public.modules set enabled = true where key = 'tenders';
insert into public.tenders(reference, procuring_entity, title, submission_deadline, eligibility_requirements) values ('T-1','Test Entity','Stationery supply', now() + interval '2 days', 'Local suppliers only');
select tst.ok((select count(*) from public.tender_checklist_items) >= 11, 'checklist generated for a new tender (template + eligibility + deadline)');
select tst.ok(exists(select 1 from public.tender_checklist_items where source='eligibility' and label like '%Local suppliers only%'), 'checklist includes the tender''s own eligibility notes');
select tst.count_is($$select public.auto_generate_tender_checklist((select id from public.tenders limit 1))$$, 0, 'regenerating a checklist never duplicates items');
select tst.count_is($$select public.auto_tender_deadlines('{"days_1":7,"days_2":3,"days_3":1}')$$, 2, 'deadline reminder sent (director + super admin hold tenders.manage? counted per recipient)');
select tst.count_is($$select public.auto_tender_deadlines('{"days_1":7,"days_2":3,"days_3":1}')$$, 0, 'deadline reminder is not repeated');
select tst.ok(exists(select 1 from public.notifications where title like 'Tender closes in 2 days%'), 'reminder states days remaining');

-- inventory and deliveries only act when the module is on
select tst.count_is($$select public.auto_low_stock_scan('{}')$$, 0, 'low-stock scan finds nothing with no stock');
update public.modules set enabled = true where key in ('inventory','orders');
insert into public.warehouses(name) values ('Main');
insert into public.product_variants(product_id, name, reorder_level) values ((select id from public.products where slug='pub-product'), 'Std', 10);
insert into public.stock_movements(variant_id, warehouse_id, movement_type, quantity) values ((select id from public.product_variants limit 1), (select id from public.warehouses limit 1), 'receipt', 8);
select tst.ok(exists(select 1 from public.notifications where title like 'Low stock:%'), 'a movement leaving stock at/below reorder level raises an alert');
insert into public.stock_movements(variant_id, warehouse_id, movement_type, quantity) values ((select id from public.product_variants limit 1), (select id from public.warehouses limit 1), 'receipt', 1);
select tst.count_is($$select count(*) from public.notifications where title like 'Low stock:%' and recipient_id='a0000000-0000-0000-0000-000000000005'$$, 1, 'low-stock alert is not repeated within the week');
insert into public.sales_orders(customer_id, status) values ((select id from public.customers limit 1), 'confirmed');
insert into public.deliveries(sales_order_id) values ((select id from public.sales_orders limit 1));
update public.deliveries set status = 'delivered';
select tst.ok(exists(select 1 from public.notifications where title like 'Delivery DN-% delivered'), 'delivery status change notifies order staff');
update public.modules set enabled = false where key in ('inventory','orders');

-- daily summary
select tst.count_is($$select (public.auto_daily_summary('{}') > 0)::int$$, 1, 'daily summary created');
select tst.ok(exists(select 1 from public.notifications where title like 'Daily summary%' and body like 'Enquiries:%'), 'summary reports real enquiry counts');
select tst.ok(not exists(select 1 from public.notifications where title like 'Daily summary%' and body like 'Stock:%'), 'summary omits modules that are switched off');
select tst.count_is($$select public.auto_daily_summary('{}')$$, 0, 'only one daily summary per day');

-- permissions and privacy
select tst.as_user('a0000000-0000-0000-0000-000000000004');
select tst.count_is($$select count(*) from public.automation_rules$$, 0, 'sales manager cannot see automation rules');
select tst.fails($$select public.run_automation_now('daily_summary')$$, 'sales manager cannot run automations');
select tst.ok((select count(*) from public.notifications) >= 1, 'staff can read their own notifications');
select tst.ok((select count(*) = 0 from public.notifications where recipient_id <> auth.uid()), 'staff never see anyone else''s notifications');
select tst.affects($$update public.notifications set read_at = now()$$, (select count(*)::int from public.notifications), 'staff can mark their own notifications read');
select tst.fails($$update public.notifications set title = 'changed'$$, 'staff cannot edit notification text');
select tst.fails($$insert into public.notifications(recipient_id,title,dedupe_key) values (auth.uid(),'forged','f1')$$, 'staff cannot forge notifications');
select tst.fails($$select public.auto_notify('x', auth.uid(), 't', null, null, null, 'k')$$, 'internal engine functions are not callable by staff');
select tst.count_is($$select count(*) from public.notification_outbox$$, 0, 'outbox hidden from staff without permission');
select tst.as_user('a0000000-0000-0000-0000-000000000002');
select tst.count_is($$select count(*) from public.automation_rules where key='daily_summary'$$, 1, 'director can view automation rules');
select tst.affects($$update public.automation_rules set enabled = false where key='daily_summary'$$, 0, 'director (view only) cannot change rules');
select tst.count_is($$select count(*) from public.notification_outbox$$, 0, 'director cannot read the outbox');
select tst.as_user('a0000000-0000-0000-0000-000000000001');
select tst.works($$update public.automation_rules set schedule_minutes = 120, params = '{"run_hour": 6}' where key='daily_summary'$$, 'super admin can change schedule and settings');
select tst.fails($$update public.automation_rules set params = '{"run_hour": "x"}' where key='daily_summary'$$, 'settings must be numbers');
select tst.fails($$update public.automation_rules set params = '{"run_hour": 6, "extra": 1}' where key='daily_summary'$$, 'settings cannot be added');
select tst.fails($$update public.automation_rules set kind = 'event' where key='daily_summary'$$, 'what a rule does cannot be changed');
select tst.fails($$insert into public.automation_rules(key,name,description,category,kind) values ('evil_rule','x','x','system','event')$$, 'admins cannot add rules');
select tst.works($$select public.run_automation_now('housekeeping')$$, 'super admin can run an automation now');
select tst.fails($$select public.run_automation_now('enquiry_ack')$$, 'event automations cannot be "run now"');
select tst.admin();
select tst.ok(exists(select 1 from public.audit_log where table_name='automation_rules'), 'rule changes are in the activity log');
update public.automation_rules set enabled = false where key = 'enquiry_assign';
insert into public.enquiries(customer_id, product_text) values ((select id from public.customers limit 1), 'unassigned item');
select tst.ok((select assigned_to is null from public.enquiries where product_text='unassigned item'), 'switching a rule off stops it');
update public.automation_rules set enabled = true where key = 'enquiry_assign';

-- ---------------- report ----------------
select tst.admin();
select case when passed then 'PASS' else 'FAIL' end as result, label, coalesce(detail,'') as detail from tst.results where not passed order by n;
select count(*) filter (where passed) as passed, count(*) filter (where not passed) as failed from tst.results;
do $$ begin
  if exists (select 1 from tst.results where not passed) then raise exception 'RLS TESTS FAILED'; end if;
end $$;
