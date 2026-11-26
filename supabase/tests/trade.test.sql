-- =====================================================================
-- Trade documents test suite. Run AFTER all migrations on a scratch database:
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

-- ---------------- fixtures ----------------
select tst.admin();
insert into auth.users(id,email) values
 ('b0000000-0000-0000-0000-000000000001','super@t.test'),
 ('b0000000-0000-0000-0000-000000000002','proc@t.test'),
 ('b0000000-0000-0000-0000-000000000003','dir@t.test'),
 ('b0000000-0000-0000-0000-000000000004','inv@t.test'),
 ('b0000000-0000-0000-0000-000000000005','fin@t.test'),
 ('b0000000-0000-0000-0000-000000000006','acct@t.test'),
 ('b0000000-0000-0000-0000-000000000007','edit@t.test'),
 ('b0000000-0000-0000-0000-000000000008','dir2@t.test');
select public.bootstrap_super_admin('super@t.test');
update public.profiles p set is_active = true, role_id = r.id from public.roles r
  where (p.email, r.key) in (('proc@t.test','procurement_manager'),('dir@t.test','director'),('inv@t.test','inventory_manager'),
    ('fin@t.test','finance_manager'),('acct@t.test','accountant'),('edit@t.test','content_editor'),('dir2@t.test','director'));
update public.modules set enabled = true where key in ('trade','finance','procurement','inventory');

insert into public.suppliers(id, name) values ('c1000000-0000-0000-0000-000000000001', 'Test Supplier Ltd');
insert into public.units(code,name,abbreviation) values ('bagx','Bag','bag') on conflict do nothing;
insert into public.products(id, slug, name, status) values ('d1000000-0000-0000-0000-000000000001', 'trade-p', 'Trade product', 'published');
insert into public.product_variants(id, product_id, sku, name) values ('e1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'TR-1', 'Trade 1');
insert into public.warehouses(id,name) values ('a1000000-0000-0000-0000-000000000001','Main');
create temp table _t (k text primary key, v uuid);
grant all on _t to public;

-- catalogue
select tst.count_is($$select count(*) from public.doc_types where chain = 'purchasing'$$, 13, 'catalogue: thirteen purchasing documents');
select tst.count_is($$select count(*) from public.doc_flow where from_type in (select key from public.doc_types where chain='purchasing')$$, 12, 'catalogue: twelve links in the chain');

-- access
select tst.as_user('b0000000-0000-0000-0000-000000000007');
select tst.count_is($$select count(*) from public.doc_types$$, 0, 'access: an editor cannot read the catalogue');
select tst.fails($$select public.trade_create_doc('purchase_requisition')$$, 'access: an editor cannot raise a document');
select tst.as_user('b0000000-0000-0000-0000-000000000006');
select tst.fails($$select public.trade_create_doc('purchase_requisition')$$, 'access: an accountant cannot raise a procurement document');
select tst.anon();
select tst.fails($$select public.trade_create_doc('purchase_requisition')$$, 'access: anonymous cannot raise a document');

-- requisition: numbering, lines, approval
select tst.as_user('b0000000-0000-0000-0000-000000000002');
insert into _t select 'pr', public.trade_create_doc('purchase_requisition', null, null, null, 'Cooking oil', null, null, null, null, 'Urgent', null,
  '[{"description":"Cooking oil 20L","quantity":10,"unit_price":0,"product_id":"d1000000-0000-0000-0000-000000000001","variant_id":"e1000000-0000-0000-0000-000000000001"}]'::jsonb, null);
select tst.ok((select number from public.trade_docs where id = (select v from _t where k='pr')) ~ '^PR-[0-9]{4}-00001$', 'numbering: first requisition is PR-year-00001');
select tst.ok((select root_id from public.trade_docs where id = (select v from _t where k='pr')) = (select v from _t where k='pr'), 'chain: first document is its own root');
select tst.fails($$select public.trade_create_doc('purchase_order', (select v from _t where k='pr'), 'c1000000-0000-0000-0000-000000000001')$$, 'rule: a PO cannot follow a requisition directly');
select tst.ok(public.trade_submit((select v from _t where k='pr')) = 'pending_approval', 'approval: requisition goes to approval');
select tst.fails($$select public.trade_submit((select v from _t where k='pr'))$$, 'approval: cannot submit twice');
select tst.fails($$update public.trade_docs set title = 'x'$$, 'writes: no direct update of documents');
select tst.fails($$select public.trade_update_doc((select v from _t where k='pr'), null, null, 'x', null, null, null, null, null, null, null, null)$$, 'rule: a submitted document cannot be edited');

-- the preparer cannot approve; a director can
select tst.fails($$select public.decide_approval((select approval_id from public.trade_docs where id=(select v from _t where k='pr')), 'approved', null)$$, 'approval: the preparer cannot approve their own requisition');
select tst.as_user('b0000000-0000-0000-0000-000000000003');
select tst.works($$select public.decide_approval((select approval_id from public.trade_docs where id=(select v from _t where k='pr')), 'approved', null)$$, 'approval: a director approves');
select tst.admin();
select tst.ok((select status from public.trade_docs where id=(select v from _t where k='pr')) = 'issued', 'approval: approved requisition is issued');
select tst.count_is($$select count(*) from public.trade_docs where parent_id=(select v from _t where k='pr') and doc_type='rfq'$$, 0, 'auto-next: no RFQ without a supplier');
select tst.ok(exists(select 1 from public.trade_doc_events where doc_id=(select v from _t where k='pr') and action='approved'), 'trail: approval is recorded');

-- RFQ -> quotation -> comparison -> approval -> PO (created by hand, supplier chosen)
select tst.as_user('b0000000-0000-0000-0000-000000000002');
insert into _t select 'rfq', public.trade_next_doc((select v from _t where k='pr'), 'rfq');
select tst.admin();
select tst.ok((select supplier_id from public.trade_docs where id=(select v from _t where k='rfq')) is null, 'rfq: supplier not yet chosen (requisition has none)');
select tst.as_user('b0000000-0000-0000-0000-000000000002');
select tst.works($$select public.trade_update_doc((select v from _t where k='rfq'), 'c1000000-0000-0000-0000-000000000001', null, 'Cooking oil', 'RFQ-REF', null, null, null, null, null, null, null)$$, 'rfq: supplier can be set on the draft');
select tst.ok(public.trade_submit((select v from _t where k='rfq')) = 'issued', 'rfq: needs no approval and is issued');
select tst.admin();
select tst.ok((select count(*) from public.trade_docs where parent_id=(select v from _t where k='rfq') and doc_type='supplier_quotation') = 1, 'auto-next: quotation draft created after the RFQ is issued');
select tst.ok((select count(*) from public.trade_doc_lines l join public.trade_docs d on d.id = l.doc_id where d.parent_id=(select v from _t where k='rfq')) = 1, 'auto-next: lines carried over');

-- walk the chain to a PO
select tst.as_user('b0000000-0000-0000-0000-000000000002');
insert into _t select 'sq', id from public.trade_docs where parent_id=(select v from _t where k='rfq') and doc_type='supplier_quotation';
select tst.works($$select public.trade_update_doc((select v from _t where k='sq'), 'c1000000-0000-0000-0000-000000000001', null, 'Cooking oil', null, null, null, null, null, null,
  '[{"description":"Cooking oil 20L","quantity":10,"unit_price":4500,"product_id":"d1000000-0000-0000-0000-000000000001","variant_id":"e1000000-0000-0000-0000-000000000001"}]'::jsonb, null)$$, 'quotation: priced');
select tst.ok(public.trade_submit((select v from _t where k='sq')) = 'issued', 'quotation: issued');
select tst.ok((select total from public.trade_docs where id=(select v from _t where k='sq')) = 45000, 'quotation: total is 45,000');
insert into _t select 'cmp', public.trade_next_doc((select v from _t where k='sq'));
select tst.ok(public.trade_submit((select v from _t where k='cmp')) = 'issued', 'comparison: issued');
insert into _t select 'pap', public.trade_next_doc((select v from _t where k='cmp'));
select tst.ok(public.trade_submit((select v from _t where k='pap')) = 'pending_approval', 'purchase approval: needs approval');
select tst.as_user('b0000000-0000-0000-0000-000000000008');
select tst.works($$select public.decide_approval((select approval_id from public.trade_docs where id=(select v from _t where k='pap')), 'approved', null)$$, 'purchase approval: approved by a director');
select tst.admin();
select tst.ok((select count(*) from public.trade_docs where parent_id=(select v from _t where k='pap') and doc_type='purchase_order') = 1, 'auto-next: purchase order draft after approval');
insert into _t select 'lpo', id from public.trade_docs where parent_id=(select v from _t where k='pap') and doc_type='purchase_order';

select tst.as_user('b0000000-0000-0000-0000-000000000002');
select tst.ok(public.trade_submit((select v from _t where k='lpo')) = 'issued', 'PO: issued');
select tst.admin();
select tst.count_is($$select count(*) from public.purchase_orders where id = (select po_id from public.trade_docs where id=(select v from _t where k='lpo'))$$, 1, 'PO: purchase order record created');
select tst.ok((select status from public.purchase_orders where id = (select po_id from public.trade_docs where id=(select v from _t where k='lpo'))) = 'sent', 'PO: record is "sent"');
select tst.ok((select count(*) from public.trade_docs where root_id=(select v from _t where k='pr') and po_id is not null) >= 5, 'links: PO id propagated across the chain');
select tst.count_is($$select count(*) from public.purchase_order_items where po_id = (select po_id from public.trade_docs where id=(select v from _t where k='lpo'))$$, 1, 'PO: item copied');

-- payment voucher: finance approval, confirmation needs a reference
insert into _t select 'pfi', id from public.trade_docs where parent_id=(select v from _t where k='lpo') and doc_type='proforma_invoice';
select tst.as_user('b0000000-0000-0000-0000-000000000006');
select tst.ok(public.trade_submit((select v from _t where k='pfi')) = 'issued', 'proforma: issued by finance');
select tst.admin();
insert into _t select 'pv', id from public.trade_docs where parent_id=(select v from _t where k='pfi') and doc_type='payment_voucher';
select tst.ok((select total from public.trade_docs where id=(select v from _t where k='pv')) = 45000, 'voucher: amount carried over from the proforma');
select tst.admin();
update public.trade_docs set total = 0 where id = (select v from _t where k='pv');
select tst.as_user('b0000000-0000-0000-0000-000000000006');
select tst.fails($$select public.trade_submit((select v from _t where k='pv'))$$, 'voucher: amount required');
select tst.admin();
update public.trade_docs set total = 45000 where id = (select v from _t where k='pv');
select tst.as_user('b0000000-0000-0000-0000-000000000006');
select tst.ok(public.trade_submit((select v from _t where k='pv')) = 'pending_approval', 'voucher: goes to approval');
select tst.fails($$select public.decide_approval((select approval_id from public.trade_docs where id=(select v from _t where k='pv')), 'approved', null)$$, 'voucher: preparer cannot approve it');
select tst.as_user('b0000000-0000-0000-0000-000000000005');
select tst.works($$select public.decide_approval((select approval_id from public.trade_docs where id=(select v from _t where k='pv')), 'approved', null)$$, 'voucher: finance manager approves');
select tst.admin();
insert into _t select 'pcf', id from public.trade_docs where parent_id=(select v from _t where k='pv') and doc_type='payment_confirmation';
select tst.as_user('b0000000-0000-0000-0000-000000000006');
select tst.fails($$select public.trade_submit((select v from _t where k='pcf'))$$, 'confirmation: payment reference required');
select tst.works($$select public.trade_update_doc((select v from _t where k='pcf'), 'c1000000-0000-0000-0000-000000000001', null, null, null, null, null, null, null, '{"payment_reference":"MPESA-QWE123"}'::jsonb, null, null)$$, 'confirmation: reference entered');
select tst.ok(public.trade_submit((select v from _t where k='pcf')) = 'issued', 'confirmation: issued');
select tst.admin();
select tst.ok((select status from public.trade_docs where id=(select v from _t where k='pv')) = 'completed', 'voucher: completed by its confirmation');

-- delivery, GRN: stock and PO
insert into _t select 'sdn', id from public.trade_docs where parent_id=(select v from _t where k='pcf') and doc_type='supplier_delivery_note';
select tst.as_user('b0000000-0000-0000-0000-000000000004');
select tst.ok(public.trade_submit((select v from _t where k='sdn')) = 'issued', 'delivery note: issued by logistics');
select tst.admin();
insert into _t select 'grn', id from public.trade_docs where parent_id=(select v from _t where k='sdn') and doc_type='grn';
select tst.as_user('b0000000-0000-0000-0000-000000000004');
select tst.fails($$select public.trade_submit((select v from _t where k='grn'))$$, 'GRN: warehouse is required for stock lines');
select tst.works($$select public.trade_update_doc((select v from _t where k='grn'), 'c1000000-0000-0000-0000-000000000001', null, null, null, null, null, null, null, null,
  (select jsonb_agg(jsonb_build_object('description', description, 'quantity', 15, 'variant_id', variant_id, 'po_item_id', po_item_id, 'product_id', product_id)) from public.trade_doc_lines where doc_id=(select v from _t where k='grn')), 'a1000000-0000-0000-0000-000000000001')$$, 'GRN: edited to over-receive');
select tst.fails($$select public.trade_submit((select v from _t where k='grn'))$$, 'GRN: cannot receive more than the PO expects');
select tst.works($$select public.trade_update_doc((select v from _t where k='grn'), 'c1000000-0000-0000-0000-000000000001', null, null, null, null, null, null, null, null,
  (select jsonb_agg(jsonb_build_object('description', description, 'quantity', 6, 'variant_id', variant_id, 'po_item_id', po_item_id, 'product_id', product_id)) from public.trade_doc_lines where doc_id=(select v from _t where k='grn')), 'a1000000-0000-0000-0000-000000000001')$$, 'GRN: edited to a part delivery');
select tst.ok(public.trade_submit((select v from _t where k='grn')) = 'issued', 'GRN: issued');
select tst.admin();
select tst.ok((select sum(quantity) from public.stock_movements where reference_id = (select po_id from public.trade_docs where id=(select v from _t where k='grn'))) = 6, 'GRN: 6 units added to stock');
select tst.ok((select status from public.purchase_orders where id=(select po_id from public.trade_docs where id=(select v from _t where k='grn'))) = 'partially_received', 'GRN: PO is partially received');
select tst.ok((select sum(received_quantity) from public.purchase_order_items where po_id=(select po_id from public.trade_docs where id=(select v from _t where k='grn'))) = 6, 'GRN: PO received quantity updated');
select tst.as_user('b0000000-0000-0000-0000-000000000004');
select tst.fails($$select public.trade_cancel((select v from _t where k='grn'), 'mistake')$$, 'GRN: a received GRN cannot be cancelled');

-- inspection, supplier tax invoice -> bill
select tst.admin();
insert into _t select 'ins', id from public.trade_docs where parent_id=(select v from _t where k='grn') and doc_type='inspection_report';
select tst.as_user('b0000000-0000-0000-0000-000000000004');
select tst.fails($$select public.trade_submit((select v from _t where k='ins'))$$, 'inspection: accepted quantities required');
select tst.works($$select public.trade_update_doc((select v from _t where k='ins'), 'c1000000-0000-0000-0000-000000000001', null, null, null, null, null, null, null, '{"result":"partial"}'::jsonb,
  (select jsonb_agg(jsonb_build_object('description', description, 'quantity', quantity, 'accepted_qty', 5, 'variant_id', variant_id, 'po_item_id', po_item_id)) from public.trade_doc_lines where doc_id=(select v from _t where k='ins')), null)$$, 'inspection: quantities entered');
select tst.ok(public.trade_submit((select v from _t where k='ins')) = 'issued', 'inspection: issued');
select tst.works($$select public.trade_sign((select v from _t where k='ins'), 'Inspector', 'Ian Inspector')$$, 'signature: recorded');
select tst.count_is($$select count(*) from public.trade_doc_signatures where doc_id=(select v from _t where k='ins')$$, 1, 'signature: one stored');
select tst.admin();
insert into _t select 'sti', id from public.trade_docs where parent_id=(select v from _t where k='ins') and doc_type='supplier_tax_invoice';
select tst.as_user('b0000000-0000-0000-0000-000000000006');
select tst.ok(public.trade_submit((select v from _t where k='sti')) = 'issued', 'supplier tax invoice: issued');
select tst.admin();
select tst.count_is($$select count(*) from public.supplier_bills where purchase_order_id = (select po_id from public.trade_docs where id=(select v from _t where k='sti'))$$, 1, 'supplier tax invoice: bill created');
select tst.ok((select bill_id from public.trade_docs where id=(select v from _t where k='sti')) is not null, 'supplier tax invoice: linked to the bill');
select tst.count_is($$select count(*) from public.trade_docs where parent_id=(select v from _t where k='sti')$$, 0, 'chain: nothing follows the last document');

-- dashboard, search, cancel, switch-off
select tst.as_user('b0000000-0000-0000-0000-000000000003');
select tst.ok((public.trade_dashboard() ->> 'pending_approvals')::int = 0, 'dashboard: nothing pending now');
select tst.ok((select count(*) from public.trade_doc_events where doc_id=(select v from _t where k='lpo')) >= 3, 'trail: purchase order has events');
select tst.as_user('b0000000-0000-0000-0000-000000000007');
select tst.fails($$select public.trade_dashboard()$$, 'dashboard: an editor cannot read it');
select tst.admin();
update public.automation_rules set enabled = false where key = 'trade_auto_next';
select tst.as_user('b0000000-0000-0000-0000-000000000002');
insert into _t select 'pr2', public.trade_create_doc('purchase_requisition', null, 'c1000000-0000-0000-0000-000000000001', null, 'Second', null, null, null, null, null, null,
  '[{"description":"Sugar","quantity":5}]'::jsonb, null);
select tst.ok(public.trade_submit((select v from _t where k='pr2')) = 'pending_approval', 'second requisition submitted');
select tst.as_user('b0000000-0000-0000-0000-000000000003');
select public.decide_approval((select approval_id from public.trade_docs where id=(select v from _t where k='pr2')), 'rejected', 'Not needed');
select tst.admin();
select tst.ok((select status from public.trade_docs where id=(select v from _t where k='pr2')) = 'rejected', 'approval: rejection sets the document to rejected');
select tst.as_user('b0000000-0000-0000-0000-000000000002');
select tst.works($$select public.trade_cancel((select v from _t where k='pr2'), 'No longer needed')$$, 'cancel: rejected draft cancelled with a reason');
select tst.fails($$select public.trade_cancel((select v from _t where k='pr'), 'x')$$, 'cancel: reason must be meaningful and issued docs need a manager');
select tst.admin();
select tst.count_is($$select count(*) from public.trade_docs where parent_id=(select v from _t where k='pr2')$$, 0, 'auto-next: nothing created when the rule is off');
update public.automation_rules set enabled = true where key = 'trade_auto_next';

-- ---------------- report ----------------
select tst.admin();
select case when passed then 'PASS' else 'FAIL' end as result, label, coalesce(detail,'') as detail from tst.results where not passed order by n;
select count(*) filter (where passed) as passed, count(*) filter (where not passed) as failed from tst.results;
do $$ begin
  if exists (select 1 from tst.results where not passed) then raise exception 'TRADE TESTS FAILED'; end if;
end $$;
