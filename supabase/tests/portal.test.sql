-- =====================================================================
-- Customer portal test suite. Run AFTER all migrations on a scratch database:
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

create function tst.admin() returns void language plpgsql as $$ begin reset role; perform set_config('request.jwt.claim.sub', '', false); perform set_config('request.jwt.claims', '', false); end $$;
create function tst.anon() returns void language plpgsql as $$ begin reset role; perform set_config('request.jwt.claim.sub', '', false); perform set_config('request.jwt.claims', '', false); set role anon; end $$;
-- as_user = a signed-in user whose session passed MFA just now (aal2); as_user_aal1 = password only.
create function tst.as_user(u uuid) returns void language plpgsql as $$ begin reset role; perform set_config('request.jwt.claim.sub', u::text, false);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', u, 'role', 'authenticated', 'aal', 'aal2', 'amr', jsonb_build_array(jsonb_build_object('method', 'totp', 'timestamp', extract(epoch from now())::bigint)))::text, false); set role authenticated; end $$;
create function tst.as_user_aal1(u uuid) returns void language plpgsql as $$ begin reset role; perform set_config('request.jwt.claim.sub', u::text, false);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', u, 'role', 'authenticated', 'aal', 'aal1', 'amr', jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', extract(epoch from now())::bigint)))::text, false); set role authenticated; end $$;
create function tst.as_user_stale_mfa(u uuid) returns void language plpgsql as $$ begin reset role; perform set_config('request.jwt.claim.sub', u::text, false);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', u, 'role', 'authenticated', 'aal', 'aal2', 'amr', jsonb_build_array(jsonb_build_object('method', 'totp', 'timestamp', extract(epoch from now())::bigint - 7200)))::text, false); set role authenticated; end $$;
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
create function tst.fails_like(q text, pattern text, lbl text) returns void language plpgsql as $$
begin
  begin execute q; insert into tst.results(passed,label,detail) values (false, lbl, 'statement unexpectedly succeeded');
  exception when others then insert into tst.results(passed,label,detail) values (sqlerrm ilike pattern, lbl, sqlerrm); end;
end $$;

-- ---------------- fixtures ----------------
select tst.admin();
insert into auth.users(id,email) values
 ('c0000000-0000-0000-0000-000000000001','super@t.test'),
 ('c0000000-0000-0000-0000-000000000002','sales@t.test'),
 ('c0000000-0000-0000-0000-000000000003','plain@t.test'),
 ('c0000000-0000-0000-0000-00000000000a','ua@cust.test'),
 ('c0000000-0000-0000-0000-00000000000b','ub@cust.test'),
 ('c0000000-0000-0000-0000-00000000000c','uc@cust.test'),
 ('c0000000-0000-0000-0000-00000000000d','ud@cust.test'),
 ('c0000000-0000-0000-0000-00000000000e','ue@cust.test'),
 ('c0000000-0000-0000-0000-00000000000f','ua2@cust.test');
select public.bootstrap_super_admin('super@t.test');
insert into public.roles(key,name) values ('plain_staff','Plain staff');
update public.profiles p set is_active = true, role_id = r.id from public.roles r
  where (p.email, r.key) in (('sales@t.test','sales_manager'),('plain@t.test','plain_staff'));

insert into public.customers(id, company_name, contact_name, email) values
 ('d0000000-0000-0000-0000-00000000000a','Alpha Traders','Ann A','ann@alpha.test'),
 ('d0000000-0000-0000-0000-00000000000b','Bravo Stores','Ben B','ben@bravo.test'),
 ('d0000000-0000-0000-0000-00000000000d','Delta Ltd','Dee D','dee@delta.test');
insert into public.customer_accounts(user_id, customer_id, status, company_name, contact_name) values
 ('c0000000-0000-0000-0000-00000000000a','d0000000-0000-0000-0000-00000000000a','active','Alpha Traders','Ann A'),
 ('c0000000-0000-0000-0000-00000000000f','d0000000-0000-0000-0000-00000000000a','active','Alpha Traders','Ann Two'),
 ('c0000000-0000-0000-0000-00000000000b','d0000000-0000-0000-0000-00000000000b','active','Bravo Stores','Ben B'),
 ('c0000000-0000-0000-0000-00000000000c',null,'pending','Charlie Co','Cy C'),
 ('c0000000-0000-0000-0000-00000000000d','d0000000-0000-0000-0000-00000000000d','suspended','Delta Ltd','Dee D');

insert into public.product_categories(id, slug, name) values ('e0000000-0000-0000-0000-000000000001','grains','Grains');
insert into public.units(code,name,abbreviation) values ('bag50','Bag 50kg','bag') on conflict do nothing;
insert into public.products(id, slug, name, status, category_id, packaging, unit_id) values
 ('f0000000-0000-0000-0000-000000000001','rice-50','Rice','published','e0000000-0000-0000-0000-000000000001','50 kg bag',(select id from public.units where code='bag50')),
 ('f0000000-0000-0000-0000-000000000002','sugar','Sugar','published','e0000000-0000-0000-0000-000000000001',null,null),
 ('f0000000-0000-0000-0000-000000000003','quote-only','Quote only item','published',null,null,null),
 ('f0000000-0000-0000-0000-000000000004','draft-item','Draft item','draft',null,null,null),
 ('f0000000-0000-0000-0000-000000000005','flour','Flour','published','e0000000-0000-0000-0000-000000000001',null,null);
insert into public.warehouses(id,name) values ('a1000000-0000-0000-0000-000000000001','Main');
insert into public.product_variants(id, product_id, sku, name, reorder_level) values
 ('a2000000-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000001','RICE50','Rice 50kg', 20),
 ('a2000000-0000-0000-0000-000000000005','f0000000-0000-0000-0000-000000000005','FLOUR','Flour', 5);
insert into public.stock_movements(variant_id, warehouse_id, movement_type, quantity) values
 ('a2000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','receipt',100),
 ('a2000000-0000-0000-0000-000000000005','a1000000-0000-0000-0000-000000000001','receipt',10),
 ('a2000000-0000-0000-0000-000000000005','a1000000-0000-0000-0000-000000000001','issue',-10);
insert into public.product_prices(product_id, unit_price, min_order_qty, qty_step) values
 ('f0000000-0000-0000-0000-000000000001', 100, 5, 5),
 ('f0000000-0000-0000-0000-000000000002', 50, 1, 1),
 ('f0000000-0000-0000-0000-000000000004', 10, 1, 1),
 ('f0000000-0000-0000-0000-000000000005', 30, 1, 1);
insert into public.customer_prices(customer_id, product_id, discount_percent) values ('d0000000-0000-0000-0000-00000000000a','f0000000-0000-0000-0000-000000000001', 10);
insert into public.customer_prices(customer_id, product_id, unit_price)       values ('d0000000-0000-0000-0000-00000000000b','f0000000-0000-0000-0000-000000000001', 80);

-- ---------------- module switch ----------------
select tst.as_user('c0000000-0000-0000-0000-00000000000a');
select tst.count_is($$select count(*) from public.portal_catalog()$$, 0, 'module off: an approved customer sees no catalogue');
select tst.fails_like($$select public.portal_cart_set('f0000000-0000-0000-0000-000000000002', 1)$$, '%not active%', 'module off: cart refuses');
select tst.admin();
update public.modules set enabled = true where key in ('portal', 'orders');

-- ---------------- sign-up creates only a pending application ----------------
select tst.admin();
insert into auth.users(id,email,raw_user_meta_data) values ('c0000000-0000-0000-0000-000000000010','new@cust.test','{"portal_signup":"true","company_name":"  New Co  ","contact_name":"Nia","kra_pin":"a123456789z","phone":"0712345678"}');
select tst.ok((select status='pending' and customer_id is null and company_name='New Co' and kra_pin='A123456789Z' from public.customer_accounts where user_id='c0000000-0000-0000-0000-000000000010'), 'signup: metadata becomes a pending application with no customer attached');
insert into auth.users(id,email,raw_user_meta_data) values ('c0000000-0000-0000-0000-000000000011','bad@cust.test','{"portal_signup":"true","company_name":"X","contact_name":"","kra_pin":"nonsense"}');
select tst.ok(exists(select 1 from auth.users where id='c0000000-0000-0000-0000-000000000011') and not exists(select 1 from public.customer_accounts where user_id='c0000000-0000-0000-0000-000000000011'), 'signup: invalid application data never blocks the sign-up, and creates no application');
insert into auth.users(id,email,raw_user_meta_data) values ('c0000000-0000-0000-0000-000000000012','staffish@cust.test','{"company_name":"Sneaky","status":"active","customer_id":"d0000000-0000-0000-0000-00000000000a"}');
select tst.count_is($$select count(*) from public.customer_accounts where user_id='c0000000-0000-0000-0000-000000000012'$$, 0, 'signup: without the portal flag nothing is created');
insert into auth.users(id,email,raw_user_meta_data) values ('c0000000-0000-0000-0000-000000000013','inject@cust.test','{"portal_signup":"true","company_name":"Inject Co","contact_name":"I","status":"active","customer_id":"d0000000-0000-0000-0000-00000000000a"}');
select tst.ok((select status='pending' and customer_id is null from public.customer_accounts where user_id='c0000000-0000-0000-0000-000000000013'), 'signup: extra metadata cannot activate an account or attach a customer');

-- ---------------- accounts: who can see and change them ----------------
select tst.as_user('c0000000-0000-0000-0000-00000000000a');
select tst.count_is($$select count(*) from public.customer_accounts$$, 1, 'accounts: a customer sees only their own application');
select tst.fails($$update public.customer_accounts set status='active', customer_id='d0000000-0000-0000-0000-00000000000b' where user_id=auth.uid()$$, 'accounts: a customer cannot re-link their account (no update right)');
select tst.fails($$insert into public.customer_accounts(user_id,company_name,contact_name,status,customer_id) values (auth.uid(),'x','y','active','d0000000-0000-0000-0000-00000000000b')$$, 'accounts: a customer cannot insert accounts directly');
select tst.fails_like($$select public.portal_review_account('c0000000-0000-0000-0000-00000000000c','approve')$$, '%not permitted%', 'accounts: a customer cannot approve anyone');
select tst.as_user('c0000000-0000-0000-0000-000000000003');
select tst.count_is($$select count(*) from public.customer_accounts$$, 0, 'accounts: staff without the permission see none');
select tst.fails_like($$select public.portal_review_account('c0000000-0000-0000-0000-00000000000c','approve')$$, '%not permitted%', 'accounts: staff without the permission cannot approve');
select tst.as_user('c0000000-0000-0000-0000-000000000002');
select tst.ok((select count(*) from public.customer_accounts) >= 7, 'accounts: sales manager sees all applications');
select tst.as_user_aal1('c0000000-0000-0000-0000-000000000002');
select tst.fails_like($$select public.portal_review_account('c0000000-0000-0000-0000-00000000000c','approve')$$, '%[mfa]%', 'accounts: a password-only session cannot approve, even for a role that does not require MFA to sign in');
select tst.as_user_stale_mfa('c0000000-0000-0000-0000-000000000002');
select tst.fails_like($$select public.portal_review_account('c0000000-0000-0000-0000-00000000000c','approve')$$, '%[mfa]%', 'accounts: approval needs a fresh authenticator code');
select tst.as_user('c0000000-0000-0000-0000-000000000002');
select tst.fails_like($$select public.portal_review_account('c0000000-0000-0000-0000-00000000000c','delete')$$, '%unknown decision%', 'accounts: unknown decision refused');
select tst.fails_like($$select public.portal_review_account('c0000000-0000-0000-0000-00000000000c','approve','d0000000-0000-0000-0000-0000000000ff')$$, '%not found%', 'accounts: cannot link to a customer that does not exist');
select tst.works($$select public.portal_review_account('c0000000-0000-0000-0000-00000000000c','approve',null,'checked KRA')$$, 'accounts: sales manager approves, creating a customer record from the application');
select tst.admin();
select tst.ok((select a.status='active' and c.company_name='Charlie Co' from public.customer_accounts a join public.customers c on c.id=a.customer_id where a.user_id='c0000000-0000-0000-0000-00000000000c'), 'accounts: approved application is active and linked to the new customer');
select tst.as_user('c0000000-0000-0000-0000-000000000002');
select tst.fails_like($$select public.portal_review_account('c0000000-0000-0000-0000-00000000000c','approve')$$, '%pending or rejected%', 'accounts: an active account cannot be approved again');
select tst.works($$select public.portal_review_account('c0000000-0000-0000-0000-000000000010','reject',null,'unknown company')$$, 'accounts: a pending application can be rejected');
select tst.works($$select public.portal_review_account('c0000000-0000-0000-0000-00000000000a','suspend')$$, 'accounts: an active account can be suspended');
select tst.as_user('c0000000-0000-0000-0000-00000000000a');
select tst.count_is($$select count(*) from public.portal_catalog()$$, 0, 'accounts: a suspended customer sees nothing');
select tst.as_user('c0000000-0000-0000-0000-000000000002');
select tst.works($$select public.portal_review_account('c0000000-0000-0000-0000-00000000000a','reactivate')$$, 'accounts: a suspended account can be reactivated');

-- ---------------- no direct table access for customers ----------------
select tst.as_user('c0000000-0000-0000-0000-00000000000a');
select tst.count_is($$select count(*) from public.customers$$, 0, 'isolation: a customer cannot read the customer list');
select tst.count_is($$select count(*) from public.sales_orders$$, 0, 'isolation: ... nor sales orders directly');
select tst.count_is($$select count(*) from public.sales_order_items$$, 0, 'isolation: ... nor order lines');
select tst.count_is($$select count(*) from public.invoices$$, 0, 'isolation: ... nor invoices');
select tst.count_is($$select count(*) from public.product_prices$$, 0, 'isolation: ... nor the price list');
select tst.count_is($$select count(*) from public.customer_prices$$, 0, 'isolation: ... nor anybody''s special prices');
select tst.count_is($$select count(*) from public.order_events$$, 0, 'isolation: ... nor tracking rows directly');
select tst.count_is($$select count(*) from public.stock_movements$$, 0, 'isolation: ... nor stock movements');
select tst.fails($$select count(*) from public.portal_cart_items$$, 'isolation: the cart table is not directly readable');
select tst.fails($$insert into public.portal_cart_items(user_id,product_id,quantity) values (auth.uid(),'f0000000-0000-0000-0000-000000000002',1)$$, 'isolation: ... nor writable (validation lives in the function)');
select tst.fails($$insert into public.sales_orders(customer_id,status) values ('d0000000-0000-0000-0000-00000000000a','confirmed')$$, 'isolation: a customer cannot insert an order directly');
select tst.affects($$update public.sales_orders set status='delivered'$$, 0, 'isolation: ... nor update orders');
select tst.fails($$insert into public.product_prices(product_id,unit_price) values ('f0000000-0000-0000-0000-000000000003', 1)$$, 'isolation: a customer cannot set prices');
select tst.fails($$insert into public.order_events(order_id,title,created_by) values (gen_random_uuid(),'x',auth.uid())$$, 'isolation: a customer cannot write tracking updates');
select tst.fails($$select public.portal_price_info('d0000000-0000-0000-0000-00000000000a','f0000000-0000-0000-0000-000000000001')$$, 'isolation: internal price helper is not callable');
select tst.fails($$select public.portal_create_order(auth.uid(),'d0000000-0000-0000-0000-00000000000b','[]','addr12345',null,null,null,null,'portal')$$, 'isolation: the internal order creator is not callable (cannot name another customer)');
select tst.as_user('c0000000-0000-0000-0000-00000000000e');
select tst.count_is($$select count(*) from public.portal_catalog()$$, 0, 'isolation: a user with no application sees no catalogue');
select tst.fails_like($$select public.portal_checkout('Nairobi industrial area',null,null,null,null)$$, '%not active%', 'isolation: ... and cannot check out');
select tst.anon();
select tst.fails($$select count(*) from public.portal_catalog()$$, 'isolation: anonymous visitors cannot call the portal');
select tst.fails($$select public.portal_cart()$$, 'isolation: ... including the cart');

-- ---------------- catalogue, prices, availability ----------------
select tst.as_user('c0000000-0000-0000-0000-00000000000a');
select tst.count_is($$select count(*) from public.portal_catalog()$$, 4, 'catalogue: published products only (draft hidden)');
select tst.ok((select unit_price=90 and list_price=100 and special and orderable from public.portal_catalog(p_slug=>'rice-50')), 'catalogue: customer A gets the 10% discount');
select tst.ok((select availability='in_stock' from public.portal_catalog(p_slug=>'rice-50')), 'catalogue: rice is in stock');
select tst.ok((select availability='out_of_stock' from public.portal_catalog(p_slug=>'flour')), 'catalogue: flour is out of stock');
select tst.ok((select availability='on_request' from public.portal_catalog(p_slug=>'sugar')), 'catalogue: an untracked product is "on request", not out of stock');
select tst.ok((select unit_price is null and not orderable from public.portal_catalog(p_slug=>'quote-only')), 'catalogue: a product without a price is visible but not orderable');
select tst.count_is($$select count(*) from public.portal_catalog(p_search=>'rice')$$, 1, 'catalogue: search by name');
select tst.count_is($$select count(*) from public.portal_catalog(p_search=>'%')$$, 0, 'catalogue: a % in the search is literal, not a wildcard');
select tst.count_is($$select count(*) from public.portal_catalog(p_category=>'e0000000-0000-0000-0000-000000000001')$$, 3, 'catalogue: filter by category');
select tst.ok((select count(*) from public.portal_catalog(p_limit=>100000)) <= 200, 'catalogue: page size is capped');
select tst.as_user('c0000000-0000-0000-0000-00000000000b');
select tst.ok((select unit_price=80 and special from public.portal_catalog(p_slug=>'rice-50')), 'catalogue: customer B gets their own fixed price, not A''s');
select tst.as_user('c0000000-0000-0000-0000-00000000000c');
select tst.ok((select unit_price=100 and not special from public.portal_catalog(p_slug=>'rice-50')), 'catalogue: a customer with no special price pays list');
select tst.admin();
update public.customer_prices set valid_to = current_date - 1 where customer_id='d0000000-0000-0000-0000-00000000000b';
select tst.as_user('c0000000-0000-0000-0000-00000000000b');
select tst.ok((select unit_price=100 and not special from public.portal_catalog(p_slug=>'rice-50')), 'catalogue: an expired special price no longer applies');
select tst.admin();
update public.customer_prices set valid_to = null where customer_id='d0000000-0000-0000-0000-00000000000b';

-- ---------------- staff price management ----------------
select tst.as_user('c0000000-0000-0000-0000-000000000003');
select tst.count_is($$select count(*) from public.product_prices$$, 0, 'prices: staff without the permission cannot read them');
select tst.fails($$insert into public.product_prices(product_id,unit_price) values ('f0000000-0000-0000-0000-000000000003', 5)$$, 'prices: ... nor set them');
select tst.as_user('c0000000-0000-0000-0000-000000000002');
select tst.works($$insert into public.product_prices(product_id,unit_price) values ('f0000000-0000-0000-0000-000000000003', 5)$$, 'prices: sales manager sets a list price');
select tst.works($$delete from public.product_prices where product_id='f0000000-0000-0000-0000-000000000003'$$, 'prices: ... and removes it');
select tst.fails($$insert into public.customer_prices(customer_id,product_id,unit_price,discount_percent) values ('d0000000-0000-0000-0000-00000000000d','f0000000-0000-0000-0000-000000000002',1,5)$$, 'prices: a special price is either fixed or a discount, not both');
select tst.fails($$insert into public.product_prices(product_id,unit_price) values ('f0000000-0000-0000-0000-000000000003', -1)$$, 'prices: negative price refused');
select tst.fails($$insert into public.customer_prices(customer_id,product_id,discount_percent) values ('d0000000-0000-0000-0000-00000000000d','f0000000-0000-0000-0000-000000000002',150)$$, 'prices: discount over 100% refused');

-- ---------------- cart ----------------
select tst.as_user('c0000000-0000-0000-0000-00000000000a');
select tst.works($$select public.portal_cart_set('f0000000-0000-0000-0000-000000000001', 10)$$, 'cart: add rice x10');
select tst.fails_like($$select public.portal_cart_set('f0000000-0000-0000-0000-000000000004', 1)$$, '%not available%', 'cart: a draft product cannot be added');
select tst.fails_like($$select public.portal_cart_set('f0000000-0000-0000-0000-000000000003', 1)$$, '%not available%', 'cart: a product without a price cannot be added');
select tst.fails_like($$select public.portal_cart_set('f0000000-0000-0000-0000-000000000002', -1)$$, '%valid quantity%', 'cart: negative quantity refused');
select tst.fails_like($$select public.portal_cart_set('f0000000-0000-0000-0000-000000000002', 99999999)$$, '%valid quantity%', 'cart: absurd quantity refused');
select tst.fails_like($$select public.portal_cart_set(gen_random_uuid(), 1)$$, '%not available%', 'cart: an unknown product cannot be added');
select tst.works($$select public.portal_cart_set('f0000000-0000-0000-0000-000000000002', 3)$$, 'cart: add sugar x3');
select tst.ok((select unit_price=90 and line_total=900 and issue is null from public.portal_cart() where slug='rice-50'), 'cart: prices come from the database (90 x 10 = 900)');
select tst.works($$select public.portal_cart_set('f0000000-0000-0000-0000-000000000001', 7)$$, 'cart: quantity 7 is stored');
select tst.ok((select issue='step' from public.portal_cart() where slug='rice-50'), 'cart: 7 is flagged (steps of 5 from a minimum of 5)');
select tst.works($$select public.portal_cart_set('f0000000-0000-0000-0000-000000000001', 3)$$, 'cart: quantity 3 is stored');
select tst.ok((select issue='below_minimum' from public.portal_cart() where slug='rice-50'), 'cart: 3 is flagged as below the minimum');
select tst.works($$select public.portal_cart_set('f0000000-0000-0000-0000-000000000001', 500)$$, 'cart: 500 is stored');
select tst.ok((select issue='exceeds_stock' from public.portal_cart() where slug='rice-50'), 'cart: 500 is flagged as more than the stock');
select tst.works($$select public.portal_cart_set('f0000000-0000-0000-0000-000000000001', 0)$$, 'cart: quantity 0 removes the line');
select tst.count_is($$select count(*) from public.portal_cart()$$, 1, 'cart: one line left');
select tst.as_user('c0000000-0000-0000-0000-00000000000b');
select tst.count_is($$select count(*) from public.portal_cart()$$, 0, 'cart: another customer''s cart is separate');
select tst.as_user('c0000000-0000-0000-0000-00000000000f');
select tst.count_is($$select count(*) from public.portal_cart()$$, 0, 'cart: a colleague at the same company has their own cart');

-- ---------------- checkout ----------------
select tst.as_user('c0000000-0000-0000-0000-00000000000a');
select tst.works($$select public.portal_cart_set('f0000000-0000-0000-0000-000000000001', 10)$$, 'checkout: cart holds rice x10 and sugar x3');
select tst.fails_like($$select public.portal_checkout('x',null,null,null,null)$$, '%delivery address%', 'checkout: short address refused');
select tst.fails_like($$select public.portal_checkout('Industrial Area, Nairobi',repeat('r',61),null,null,null)$$, '%reference%', 'checkout: long reference refused');
select tst.fails_like($$select public.portal_checkout('Industrial Area, Nairobi',null,null,current_date-1,null)$$, '%delivery date%', 'checkout: past delivery date refused');
select tst.fails_like($$select public.portal_checkout('Industrial Area, Nairobi',null,null,current_date+400,null)$$, '%delivery date%', 'checkout: far-future delivery date refused');
select tst.count_is($$select count(*) from public.portal_cart()$$, 2, 'checkout: failed attempts leave the cart untouched');
select tst.works($$select public.portal_cart_set('f0000000-0000-0000-0000-000000000001', 500)$$, 'checkout: set an impossible quantity');
select tst.fails_like($$select public.portal_checkout('Industrial Area, Nairobi',null,null,null,null)$$, '%not have enough%', 'checkout: more than the stock is refused');
select tst.works($$select public.portal_cart_set('f0000000-0000-0000-0000-000000000001', 7)$$, 'checkout: set a quantity off the step');
select tst.fails_like($$select public.portal_checkout('Industrial Area, Nairobi',null,null,null,null)$$, '%steps of%', 'checkout: off-step quantity refused');
select tst.works($$select public.portal_cart_set('f0000000-0000-0000-0000-000000000001', 10)$$, 'checkout: back to a valid quantity');
select tst.count_is($$select count(*) from public.sales_orders$$, 0, 'checkout: nothing was created by the failed attempts');
create temp table _o(id uuid);
create temp table _o2(id uuid);
grant all on _o, _o2 to public;
select tst.works($$insert into _o select public.portal_checkout('Industrial Area, Nairobi', 'PO-123', 'Deliver in the morning', current_date+3, '99999999-9999-9999-9999-999999999999')$$, 'checkout: a valid order is placed');
select tst.ok((select count(*)=1 from _o), 'checkout: one order id returned');
select tst.count_is($$select count(*) from public.portal_cart()$$, 0, 'checkout: the cart is emptied');

select tst.admin();
delete from _o where id is null;
select tst.ok((select o.status='submitted' and o.source='portal' and o.customer_id='d0000000-0000-0000-0000-00000000000a' and o.customer_reference='PO-123' and o.placed_by='c0000000-0000-0000-0000-00000000000a' from public.sales_orders o where o.idempotency_key='99999999-9999-9999-9999-999999999999'), 'checkout: order is submitted, tied to the caller''s own customer');
select tst.ok((select count(*)=2 and sum(quantity*unit_price)=1050 from public.sales_order_items i join public.sales_orders o on o.id=i.order_id where o.idempotency_key='99999999-9999-9999-9999-999999999999'), 'checkout: lines priced by the database (10x90 + 3x50 = 1050)');
select tst.ok((select count(*)=1 from public.order_events e join public.sales_orders o on o.id=e.order_id where o.idempotency_key='99999999-9999-9999-9999-999999999999' and e.title='Order received'), 'checkout: tracking starts with "Order received"');
select tst.as_user('c0000000-0000-0000-0000-00000000000a');
select tst.ok((select public.portal_checkout('Industrial Area, Nairobi', 'PO-123', null, null, '99999999-9999-9999-9999-999999999999') is not null), 'checkout: a retry with the same key returns the first order');
select tst.admin();
select tst.count_is($$select count(*) from public.sales_orders where idempotency_key='99999999-9999-9999-9999-999999999999'$$, 1, 'checkout: ... and does not create a second one');

-- ---------------- reading orders: isolation ----------------
select tst.as_user('c0000000-0000-0000-0000-00000000000a');
select tst.count_is($$select count(*) from public.portal_orders()$$, 1, 'orders: customer A sees their order');
select tst.ok((select total=1050 and item_count=2 and status='submitted' from public.portal_orders()), 'orders: list shows total and status');
select tst.as_user('c0000000-0000-0000-0000-00000000000f');
select tst.count_is($$select count(*) from public.portal_orders()$$, 1, 'orders: a colleague at the same company sees the company''s orders');
select tst.as_user('c0000000-0000-0000-0000-00000000000b');
select tst.count_is($$select count(*) from public.portal_orders()$$, 0, 'orders: customer B sees none of A''s orders');
select tst.ok((select public.portal_order((select id from _o limit 1)) is null), 'orders: customer B asking for A''s order id gets nothing');
select tst.fails_like($$select public.portal_cancel_order((select id from _o limit 1))$$, '%not yet been confirmed%', 'orders: customer B cannot cancel A''s order');
select tst.fails_like($$select public.portal_repeat_order((select id from _o limit 1))$$, '%not found%', 'orders: customer B cannot repeat A''s order');
select tst.as_user('c0000000-0000-0000-0000-00000000000a');
select tst.ok((select public.portal_order((select id from _o limit 1)) ->> 'number' is not null and jsonb_array_length(public.portal_order((select id from _o limit 1)) -> 'items') = 2), 'orders: A sees header and lines');
select tst.ok((select jsonb_array_length(public.portal_order((select id from _o limit 1)) -> 'events') = 1), 'orders: A sees the timeline');

-- ---------------- tracking updates ----------------
select tst.as_user('c0000000-0000-0000-0000-000000000002');
select tst.works($$insert into public.sales_orders(customer_id,status) select customer_id,'draft' from public.sales_orders limit 0$$, 'tracking: setup');
select tst.works($$update public.sales_orders set status='confirmed' where idempotency_key='99999999-9999-9999-9999-999999999999'$$, 'tracking: staff confirm the order');
select tst.works($$insert into public.order_events(order_id,title,detail,customer_visible,created_by) select id,'Packed','12 pallets ready',true,auth.uid() from public.sales_orders where idempotency_key='99999999-9999-9999-9999-999999999999'$$, 'tracking: staff post a visible update');
select tst.works($$insert into public.order_events(order_id,title,detail,customer_visible,created_by) select id,'Internal','credit limit concern',false,auth.uid() from public.sales_orders where idempotency_key='99999999-9999-9999-9999-999999999999'$$, 'tracking: staff post an internal note');
select tst.fails($$insert into public.order_events(order_id,title,created_by) select id,'Forged',null from public.sales_orders limit 1$$, 'tracking: an update must be attributed to the poster');
select tst.works($$insert into public.deliveries(sales_order_id,status,scheduled_date,driver_name,vehicle_reg) select id,'in_transit',current_date,'Driver Dan','KDA 123X' from public.sales_orders where idempotency_key='99999999-9999-9999-9999-999999999999'$$, 'tracking: staff create a delivery');
select tst.as_user('c0000000-0000-0000-0000-00000000000a');
select tst.ok((select (public.portal_order((select id from _o limit 1)) -> 'events')::text like '%Order confirmed%' and (public.portal_order((select id from _o limit 1)) -> 'events')::text like '%12 pallets ready%' and (public.portal_order((select id from _o limit 1)) -> 'events')::text like '%Out for delivery%'), 'tracking: status changes and posted updates appear on the customer timeline');
select tst.ok((select (public.portal_order((select id from _o limit 1)) -> 'events')::text not like '%credit limit%'), 'tracking: internal notes are never shown to the customer');
select tst.ok((select public.portal_order((select id from _o limit 1))::text not like '%Driver Dan%' and public.portal_order((select id from _o limit 1))::text not like '%KDA 123X%'), 'tracking: driver and vehicle details are not exposed');
select tst.fails_like($$select public.portal_cancel_order((select id from _o limit 1))$$, '%not yet been confirmed%', 'orders: a confirmed order can no longer be cancelled online');

-- ---------------- repeat order and price changes ----------------
select tst.admin();
update public.product_prices set unit_price = 120 where product_id='f0000000-0000-0000-0000-000000000001';
select tst.ok((select unit_price=90 from public.sales_order_items i join public.sales_orders o on o.id=i.order_id where o.idempotency_key='99999999-9999-9999-9999-999999999999' and i.description like 'Rice%'), 'repeat: a later price change does not alter an existing order');
update public.product_prices set is_orderable = false where product_id='f0000000-0000-0000-0000-000000000002';
select tst.as_user('c0000000-0000-0000-0000-00000000000a');
select tst.ok((select public.portal_repeat_order((select id from _o limit 1))) = 1, 'repeat: one line (sugar, no longer orderable) is skipped');
select tst.ok((select unit_price=108 and quantity=10 from public.portal_cart() where slug='rice-50'), 'repeat: rice is back in the cart at today''s price (120 less 10% = 108)');
select tst.admin();
update public.product_prices set is_orderable = true where product_id='f0000000-0000-0000-0000-000000000002';

-- ---------------- cancelling a submitted order ----------------
select tst.as_user('c0000000-0000-0000-0000-00000000000a');
select tst.works($$select public.portal_cart_set('f0000000-0000-0000-0000-000000000002', 4)$$, 'cancel: cart for a second order');
select tst.works($$insert into _o2 select public.portal_checkout('Mombasa Road, Nairobi', null, null, null, null)$$, 'cancel: second order placed');
select tst.works($$select public.portal_cancel_order((select id from _o2 limit 1), 'ordered by mistake')$$, 'cancel: the customer cancels an unconfirmed order');
select tst.admin();
select tst.ok((select status='cancelled' and cancelled_reason='ordered by mistake' from public.sales_orders where customer_reference is null and source='portal'), 'cancel: status and reason recorded');

-- ---------------- dashboard ----------------
select tst.as_user('c0000000-0000-0000-0000-00000000000a');
select tst.ok((select (public.portal_dashboard() ->> 'open_orders')::int = 1 and (public.portal_dashboard() ->> 'awaiting_delivery')::int = 1), 'dashboard: counts open orders and deliveries on the way');
select tst.as_user('c0000000-0000-0000-0000-00000000000b');
select tst.ok((select (public.portal_dashboard() ->> 'open_orders')::int = 0), 'dashboard: another customer''s numbers are separate');

-- ---------------- abuse limits ----------------
select tst.admin();
insert into public.sales_orders(customer_id,status,source) select 'd0000000-0000-0000-0000-00000000000b','submitted','portal' from generate_series(1,20);
select tst.as_user('c0000000-0000-0000-0000-00000000000b');
select tst.works($$select public.portal_cart_set('f0000000-0000-0000-0000-000000000002', 1)$$, 'limits: B adds an item');
select tst.fails_like($$select public.portal_checkout('Industrial Area, Nairobi',null,null,null,null)$$, '%too many orders%', 'limits: no more than 20 online orders an hour per customer');

-- ---------------- audit and structure ----------------
select tst.admin();
select tst.ok(not exists(select 1 from public.audit_log where table_name='customer_accounts' and (old_data is not null or new_data is not null)), 'audit: customer account changes log field names only, never the values');
select tst.count_is($$select count(*) from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='r' and c.relname in ('customer_accounts','product_prices','customer_prices','portal_cart_items','order_events') and not c.relrowsecurity$$, 0, 'structure: every portal table has row level security');
select tst.count_is($$select count(*) from pg_proc p where p.pronamespace='public'::regnamespace and p.proname like 'portal\_%' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute')$$, 0, 'structure: no portal function can be executed by anonymous visitors');
select tst.count_is($$select count(*) from pg_proc p where p.pronamespace='public'::regnamespace and p.proname like 'portal\_%' and p.prosecdef and not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')$$, 0, 'structure: every portal function pins its search_path');
select tst.count_is($$select count(*) from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in ('portal_price_info','portal_stock_info','portal_create_order','portal_require') and has_function_privilege('authenticated', p.oid, 'execute')$$, 0, 'structure: internal portal helpers are not callable by customers');

-- ---------------- report ----------------
select tst.admin();
select case when passed then 'PASS' else 'FAIL' end as result, label, coalesce(detail,'') as detail from tst.results where not passed order by n;
select count(*) filter (where passed) as passed, count(*) filter (where not passed) as failed from tst.results;
do $$ begin
  if exists (select 1 from tst.results where not passed) then raise exception 'PORTAL TESTS FAILED'; end if;
end $$;
