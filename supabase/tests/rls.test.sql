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

-- ---------------- report ----------------
select tst.admin();
select case when passed then 'PASS' else 'FAIL' end as result, label, coalesce(detail,'') as detail from tst.results where not passed order by n;
select count(*) filter (where passed) as passed, count(*) filter (where not passed) as failed from tst.results;
do $$ begin
  if exists (select 1 from tst.results where not passed) then raise exception 'RLS TESTS FAILED'; end if;
end $$;
