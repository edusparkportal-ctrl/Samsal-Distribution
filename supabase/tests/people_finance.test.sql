-- =====================================================================
-- HR, Finance and approvals test suite. Run AFTER all migrations on a scratch database:
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
 ('b0000000-0000-0000-0000-000000000002','hr@t.test'),
 ('b0000000-0000-0000-0000-000000000003','payroll@t.test'),
 ('b0000000-0000-0000-0000-000000000004','fin1@t.test'),
 ('b0000000-0000-0000-0000-000000000005','acct@t.test'),
 ('b0000000-0000-0000-0000-000000000006','director@t.test'),
 ('b0000000-0000-0000-0000-000000000007','alice@t.test'),
 ('b0000000-0000-0000-0000-000000000008','bob@t.test'),
 ('b0000000-0000-0000-0000-000000000009','fin2@t.test'),
 ('b0000000-0000-0000-0000-00000000000a','hrhead@t.test'),
 ('b0000000-0000-0000-0000-00000000000b','both@t.test'),
 ('b0000000-0000-0000-0000-00000000000c','carol@t.test');
select public.bootstrap_super_admin('super@t.test');
insert into public.roles(key,name) values ('staff_basic','Staff'), ('hr_head','HR Head'), ('hr_fin_both','Both approvers');
insert into public.role_permissions select r.id, p from public.roles r, unnest(array['people.view','people.manage','people.payroll_approve']) p where r.key='hr_head';
insert into public.role_permissions select r.id, p from public.roles r, unnest(array['people.payroll_approve','finance.payroll_approve']) p where r.key='hr_fin_both';
update public.profiles p set is_active = true, role_id = r.id from public.roles r
  where (p.email, r.key) in (('hr@t.test','hr_officer'),('payroll@t.test','payroll_officer'),('fin1@t.test','finance_manager'),('fin2@t.test','finance_manager'),
    ('acct@t.test','accountant'),('director@t.test','director'),('alice@t.test','staff_basic'),('bob@t.test','staff_basic'),('carol@t.test','staff_basic'),
    ('hrhead@t.test','hr_head'),('both@t.test','hr_fin_both'));
update public.modules set enabled = true where key in ('people','finance');

insert into public.departments(name, code) values ('Operations', 'OPS');
insert into public.employees(full_name, profile_id, department_id, job_title) values
  ('Bob Manager',  (select id from public.profiles where email='bob@t.test'),   (select id from public.departments), 'Operations Manager'),
  ('Carol Peer',   (select id from public.profiles where email='carol@t.test'), (select id from public.departments), 'Clerk');
update public.departments set head_employee_id = (select id from public.employees where full_name='Bob Manager');
insert into public.employees(full_name, profile_id, department_id, job_title, manager_id) values
  ('Alice Staff', (select id from public.profiles where email='alice@t.test'), (select id from public.departments), 'Officer', (select id from public.employees where full_name='Bob Manager'));
insert into public.employees(full_name, department_id) values ('No Manager Nick', (select id from public.departments));

-- ---------------- organisation: directory access ----------------
select tst.ok((select count(*) from public.employees) = 4, 'fixture: four employees');
select tst.ok(exists(select 1 from public.modules where key in ('people','finance') group by () having count(*) = 2), 'people and finance modules exist');
select tst.ok((select count(*) from public.approval_policies where subject in ('leave','expense','bill','payroll')) = 4, 'default approval policies are seeded (leave, expense, bill, payroll)');
select tst.as_user('b0000000-0000-0000-0000-000000000002');
select tst.count_is($$select count(*) from public.employees$$, 4, 'HR officer sees the directory');
select tst.works($$insert into public.employees(full_name) values ('New Hire')$$, 'HR officer can add an employee');
select tst.affects($$delete from public.employees where full_name='New Hire'$$, 0, 'HR officer cannot permanently delete an employee');
select tst.fails($$insert into public.approval_policies(subject, name) values ('leave','x')$$, 'HR officer cannot change approval policies');
select tst.as_user('b0000000-0000-0000-0000-000000000007');
select tst.count_is($$select count(*) from public.employees$$, 1, 'an employee sees only their own record');
select tst.affects($$update public.employees set job_title = 'Boss'$$, 0, 'an employee cannot edit their own record');
select tst.as_user('b0000000-0000-0000-0000-000000000005');
select tst.count_is($$select count(*) from public.employees$$, 0, 'finance staff cannot read the employee directory');
select tst.anon();
select tst.fails($$select count(*) from public.employees$$, 'anonymous visitors cannot read employees');
select tst.admin();
update public.modules set enabled = false where key = 'people';
select tst.as_user('b0000000-0000-0000-0000-000000000002');
select tst.count_is($$select count(*) from public.employees$$, 0, 'switching the HR module off stops all access');
select tst.admin();
update public.modules set enabled = true where key = 'people';
select tst.fails($$update public.employees set manager_id = (select id from public.employees where full_name='Alice Staff') where full_name='Bob Manager'$$, 'a reporting-line loop is refused');

-- ---------------- approvals engine ----------------
select tst.admin();
create temp table tst_ids(k text primary key, v uuid);
grant all on tst_ids to public;
-- leave-type request: Alice's leave, filed by the HR officer
insert into tst_ids values ('leave', public.approval_submit('leave', gen_random_uuid(), 3,
  (select id from public.employees where full_name='Alice Staff'), 'b0000000-0000-0000-0000-000000000002', 'Leave: Alice, 3 days', 'Annual leave', '/admin/approvals'));
select tst.ok(exists(select 1 from public.notifications where recipient_id='b0000000-0000-0000-0000-000000000008' and title like 'Approval needed:%'), 'the line manager is told about the request');
select tst.ok((select count(*) from public.approval_candidates((select v from tst_ids where k='leave'))) = 1, 'exactly one candidate: the line manager');
select tst.as_user('b0000000-0000-0000-0000-000000000007');
select tst.count_is($$select count(*) from public.approval_requests$$, 1, 'the employee can see a request about themselves');
select tst.fails($$select public.decide_approval((select v from tst_ids where k='leave'), 'approved', null)$$, 'an employee cannot approve a request about themselves');
select tst.as_user('b0000000-0000-0000-0000-00000000000c');
select tst.count_is($$select count(*) from public.approval_requests$$, 0, 'an unrelated colleague cannot see the request');
select tst.fails($$select public.decide_approval((select v from tst_ids where k='leave'), 'approved', null)$$, 'an unrelated colleague cannot approve');
select tst.as_user('b0000000-0000-0000-0000-000000000002');
select tst.fails($$select public.decide_approval((select v from tst_ids where k='leave'), 'approved', null)$$, 'the requester cannot approve their own request');
select tst.as_user('b0000000-0000-0000-0000-000000000008');
select tst.count_is($$select count(*) from public.approval_requests$$, 1, 'the manager sees the request');
select tst.fails($$select public.decide_approval((select v from tst_ids where k='leave'), 'rejected', '')$$, 'rejecting needs a reason');
select tst.ok((select public.decide_approval((select v from tst_ids where k='leave'), 'approved', 'ok')) = 'approved', 'the manager approves');
select tst.fails($$select public.decide_approval((select v from tst_ids where k='leave'), 'approved', null)$$, 'a decided request cannot be decided again');
select tst.admin();
select tst.ok((select status from public.approval_requests where id=(select v from tst_ids where k='leave')) = 'approved', 'request is approved');
select tst.ok(exists(select 1 from public.notifications where recipient_id='b0000000-0000-0000-0000-000000000002' and title like 'Approved:%'), 'the requester is told the outcome');
select tst.ok(exists(select 1 from public.audit_log where table_name='approval_decisions'), 'decisions are in the activity log');
select tst.as_user('b0000000-0000-0000-0000-000000000008');
select tst.fails($$insert into public.approval_requests(subject, record_id, steps, title) values ('leave', gen_random_uuid(), '[]', 'forged')$$, 'requests cannot be forged directly');
select tst.fails($$insert into public.approval_decisions(request_id, step_no, decided_by, decision) values ((select v from tst_ids where k='leave'), 9, auth.uid(), 'approved')$$, 'decisions cannot be forged directly');
select tst.fails($$update public.approval_requests set status = 'approved'$$, 'request status cannot be edited directly');

-- fail closed, amounts, fallback
select tst.admin();
update public.approval_policies set is_active = false where subject = 'bill';
select tst.fails($$select public.approval_submit('bill', gen_random_uuid(), 100, null, 'b0000000-0000-0000-0000-000000000005', 'Bill', null, null)$$, 'with no active policy nothing can be submitted for approval');
update public.approval_policies set is_active = true where subject = 'bill';
insert into public.approval_policies(subject, name, min_amount) values ('expense', 'Expenses over 100,000', 100000) returning id \gset big_
insert into public.approval_policy_steps(policy_id, step_no, label, approver_type, permission_key) values
  (:'big_id', 1, 'Finance', 'permission', 'finance.expense_approve'), (:'big_id', 2, 'Director sign-off', 'permission', 'approvals.view_all');
insert into tst_ids values ('small', public.approval_submit('expense', gen_random_uuid(), 5000, null, 'b0000000-0000-0000-0000-000000000005', 'Expense 5,000', null, null));
insert into tst_ids values ('big',   public.approval_submit('expense', gen_random_uuid(), 150000, null, 'b0000000-0000-0000-0000-000000000005', 'Expense 150,000', null, null));
select tst.ok((select jsonb_array_length(steps) from public.approval_requests where id=(select v from tst_ids where k='small')) = 1, 'a small expense uses the one-step policy');
select tst.ok((select jsonb_array_length(steps) from public.approval_requests where id=(select v from tst_ids where k='big')) = 2, 'a large expense uses the two-step policy');
select tst.as_user('b0000000-0000-0000-0000-000000000005');
select tst.fails($$select public.decide_approval((select v from tst_ids where k='small'), 'approved', null)$$, 'an accountant (no approval permission) cannot approve an expense');
select tst.as_user('b0000000-0000-0000-0000-000000000004');
select tst.ok((select public.decide_approval((select v from tst_ids where k='small'), 'approved', null)) = 'approved', 'a finance manager approves the small expense');
select tst.ok((select public.decide_approval((select v from tst_ids where k='big'), 'approved', null)) = 'next_step', 'step one of the large expense moves it to step two');
select tst.fails($$select public.decide_approval((select v from tst_ids where k='big'), 'approved', null)$$, 'the same person cannot also approve step two');
select tst.as_user('b0000000-0000-0000-0000-000000000009');
select tst.fails($$select public.decide_approval((select v from tst_ids where k='big'), 'approved', null)$$, 'a finance manager is not the step-two approver (needs the director permission)');
select tst.as_user('b0000000-0000-0000-0000-000000000006');
select tst.ok((select public.decide_approval((select v from tst_ids where k='big'), 'approved', null)) = 'approved', 'the director completes the large expense');

-- no manager recorded: falls back to approvals.manage holders (super admin), never to the employee
select tst.admin();
insert into tst_ids values ('nomgr', public.approval_submit('leave', gen_random_uuid(), 1,
  (select id from public.employees where full_name='No Manager Nick'), 'b0000000-0000-0000-0000-000000000002', 'Leave: Nick', null, null));
select tst.ok(exists(select 1 from public.approval_candidates((select v from tst_ids where k='nomgr')) c where c = (select id from public.profiles where email='super@t.test')), 'with no manager recorded, an administrator decides');
select tst.as_user('b0000000-0000-0000-0000-000000000001');
select tst.ok((select public.decide_approval((select v from tst_ids where k='nomgr'), 'rejected', 'Not enough cover')) = 'rejected', 'administrator can reject with a reason');

-- payroll: two different people, HR then Finance
select tst.admin();
insert into tst_ids values ('pay', public.approval_submit('payroll', gen_random_uuid(), 500000, null, 'b0000000-0000-0000-0000-000000000003', 'Payroll: November', null, null));
select tst.as_user('b0000000-0000-0000-0000-000000000003');
select tst.fails($$select public.decide_approval((select v from tst_ids where k='pay'), 'approved', null)$$, 'the payroll preparer cannot approve payroll');
select tst.as_user('b0000000-0000-0000-0000-000000000004');
select tst.fails($$select public.decide_approval((select v from tst_ids where k='pay'), 'approved', null)$$, 'the Finance approver cannot jump ahead of the HR step');
select tst.as_user('b0000000-0000-0000-0000-00000000000b');
select tst.ok((select public.decide_approval((select v from tst_ids where k='pay'), 'approved', null)) = 'next_step', 'a person holding both permissions approves the HR step');
select tst.fails($$select public.decide_approval((select v from tst_ids where k='pay'), 'approved', null)$$, 'the same person cannot also approve the Finance step');
select tst.as_user('b0000000-0000-0000-0000-000000000004');
select tst.ok((select public.decide_approval((select v from tst_ids where k='pay'), 'approved', null)) = 'approved', 'a second person approves the Finance step');

-- cancelling
select tst.admin();
insert into tst_ids values ('cx', public.approval_submit('leave', gen_random_uuid(), 2, (select id from public.employees where full_name='Alice Staff'), 'b0000000-0000-0000-0000-000000000002', 'Leave to cancel', null, null));
select tst.as_user('b0000000-0000-0000-0000-00000000000c');
select tst.fails($$select public.cancel_approval((select v from tst_ids where k='cx'))$$, 'an outsider cannot cancel a request');
select tst.as_user('b0000000-0000-0000-0000-000000000002');
select tst.works($$select public.cancel_approval((select v from tst_ids where k='cx'))$$, 'the requester can cancel');
select tst.admin();
select tst.ok((select status from public.approval_requests where id=(select v from tst_ids where k='cx')) = 'cancelled', 'cancelled request is closed');

-- ================= HUMAN RESOURCES (stage 2) =================
select tst.admin();
create table tst_dates as select (current_date + 7 + ((8 - extract(isodow from current_date + 7)::int) % 7))::date as mon;
grant all on tst_dates to public;
insert into public.role_permissions select r.id, 'people.self' from public.roles r where r.key = 'staff_basic' on conflict do nothing;
insert into public.role_permissions select r.id, p from public.roles r, unnest(array['people.reviews']) p where r.key = 'hr_head' on conflict do nothing;
insert into public.leave_types (name, days_per_year) values ('Annual test leave', 10), ('Unpaid test leave', 0);

select tst.ok((select count(*) from public.onboarding_tasks where employee_id = (select id from public.employees where full_name='Alice Staff')) >= 6, 'onboarding tasks were created for a new employee');

select tst.as_user('b0000000-0000-0000-0000-000000000003');
select tst.works($$insert into public.employee_compensation(employee_id, basic_salary, allowances) select id, 50000, 5000 from public.employees where full_name='Alice Staff'$$, 'payroll officer can record compensation');
select tst.as_user('b0000000-0000-0000-0000-000000000002');
select tst.count_is($$select count(*) from public.employee_compensation$$, 0, 'HR officer cannot see pay');
select tst.fails($$insert into public.employee_compensation(employee_id, basic_salary) select id, 1 from public.employees where full_name='Carol Peer'$$, 'HR officer cannot record pay');
select tst.as_user('b0000000-0000-0000-0000-000000000007');
select tst.count_is($$select count(*) from public.employee_compensation$$, 0, 'an employee cannot read pay records, even their own');

select tst.as_user('b0000000-0000-0000-0000-000000000007');
select tst.works($$insert into public.leave_requests(employee_id, leave_type_id, start_date, end_date, reason) select e.id, t.id, (select mon from tst_dates), (select mon+2 from tst_dates), 'Family' from public.employees e, public.leave_types t where e.full_name='Alice Staff' and t.name='Annual test leave'$$, 'an employee can request leave for themselves');
select tst.fails($$insert into public.leave_requests(employee_id, leave_type_id, start_date, end_date) select e.id, t.id, (select mon+1 from tst_dates), (select mon+3 from tst_dates) from public.employees e, public.leave_types t where e.full_name='Alice Staff' and t.name='Annual test leave'$$, 'overlapping leave is refused');
select tst.fails($$insert into public.leave_requests(employee_id, leave_type_id, start_date, end_date) select e.id, t.id, (select mon+7 from tst_dates), (select mon+30 from tst_dates) from public.employees e, public.leave_types t where e.full_name='Alice Staff' and t.name='Annual test leave'$$, 'leave over the yearly allowance is refused');
select tst.fails($$insert into public.leave_requests(employee_id, leave_type_id, start_date, end_date) select e.id, t.id, (select mon+5 from tst_dates), (select mon+6 from tst_dates) from public.employees e, public.leave_types t where e.full_name='Alice Staff' and t.name='Annual test leave'$$, 'a weekend-only request is refused');
select tst.fails($$insert into public.leave_requests(employee_id, leave_type_id, start_date, end_date) select '00000000-0000-0000-0000-000000000000'::uuid, t.id, (select mon+14 from tst_dates), (select mon+15 from tst_dates) from public.leave_types t where t.name='Annual test leave'$$, 'an employee cannot request leave for someone else');
select tst.fails($$update public.leave_requests set status = 'approved'$$, 'an employee cannot approve their own leave (no update right)');
select tst.admin();
select tst.ok((select days from public.leave_requests limit 1) = 3, 'working days are counted (Mon to Wed = 3)');
select tst.ok((select status from public.leave_requests limit 1) = 'pending', 'leave starts as pending');
select tst.ok(exists(select 1 from public.approval_requests where subject='leave' and status='pending'), 'an approval request was opened for the leave');
select tst.as_user('b0000000-0000-0000-0000-000000000007');
select tst.fails($$select public.decide_approval((select id from public.approval_requests where subject='leave' and status='pending' limit 1), 'approved', null)$$, 'the employee cannot approve their own leave request');
select tst.as_user('b0000000-0000-0000-0000-00000000000c');
select tst.count_is($$select count(*) from public.leave_requests$$, 0, 'a peer cannot see someone else''s leave');
select tst.as_user('b0000000-0000-0000-0000-000000000008');
select tst.count_is($$select count(*) from public.leave_requests$$, 1, 'the line manager sees their report''s leave');
select tst.ok((select public.decide_approval((select id from public.approval_requests where subject='leave' and status='pending' limit 1), 'approved', null)) = 'approved', 'the line manager approves');
select tst.admin();
select tst.ok((select status from public.leave_requests limit 1) = 'approved', 'approval updates the leave request');
select tst.ok((select taken from public.leave_balances b join public.leave_types t on t.id=b.leave_type_id where t.name='Annual test leave' and b.employee_id=(select id from public.employees where full_name='Alice Staff')) = 3 or (select extract(year from mon) from tst_dates) <> extract(year from now()), 'leave balance shows days taken');
select tst.as_user('b0000000-0000-0000-0000-000000000007');
select tst.works($$select public.cancel_leave_request((select id from public.leave_requests limit 1))$$, 'a future approved leave can be cancelled by the employee');

select tst.as_user('b0000000-0000-0000-0000-000000000007');
select tst.works($$select public.clock_in()$$, 'an employee can check in');
select tst.fails($$select public.clock_in()$$, 'checking in twice is refused');
select tst.works($$select public.clock_out()$$, 'an employee can check out');
select tst.fails($$insert into public.attendance_records(employee_id, work_date) select id, current_date - 1 from public.employees where full_name='Alice Staff'$$, 'an employee cannot write attendance records directly');
select tst.as_user('b0000000-0000-0000-0000-00000000000b');
select tst.fails($$select public.clock_in()$$, 'a user with no employee record cannot check in');
select tst.as_user('b0000000-0000-0000-0000-00000000000c');
select tst.works($$select public.clock_in()$$, 'Carol (self-service) can check in too');
select tst.as_user('b0000000-0000-0000-0000-000000000002');
select tst.works($$insert into public.attendance_records(employee_id, work_date, status) select id, current_date - 3, 'absent' from public.employees where full_name='Carol Peer'$$, 'HR can record attendance for anyone');

select tst.as_user('b0000000-0000-0000-0000-000000000002');
select tst.works($$insert into public.employment_contracts(employee_id, contract_type, start_date, end_date) select id, 'fixed_term', current_date - 300, current_date + 20 from public.employees where full_name='Carol Peer'$$, 'HR can add a contract');
select tst.as_user('b0000000-0000-0000-0000-000000000007');
select tst.count_is($$select count(*) from public.employment_contracts$$, 0, 'staff cannot read contracts');
select tst.admin();
select tst.ok(public.auto_hr_contract_expiry('{"days_1":60,"days_2":30,"days_3":7,"probation_days":14}') >= 1, 'contract expiry reminder is sent');
select tst.ok(public.auto_hr_contract_expiry('{"days_1":60,"days_2":30,"days_3":7,"probation_days":14}') = 0, 'the same reminder is not sent twice');

select tst.as_user('b0000000-0000-0000-0000-000000000002');
select tst.works($$insert into public.job_openings(title, status) values ('Test Driver', 'open')$$, 'HR can open a vacancy');
select tst.works($$insert into public.job_applicants(opening_id, full_name, email) select id, 'Dan Applicant', 'dan@example.test' from public.job_openings$$, 'HR can log an applicant');
select tst.fails($$select public.hire_applicant((select id from public.job_applicants limit 1), current_date)$$, 'an applicant cannot be hired without recorded consent');
select tst.works($$update public.job_applicants set consent_recorded = true, consent_date = current_date$$, 'consent can be recorded');
select tst.works($$select public.hire_applicant((select id from public.job_applicants limit 1), current_date)$$, 'a consenting applicant becomes an employee');
select tst.fails($$select public.hire_applicant((select id from public.job_applicants limit 1), current_date)$$, 'the same applicant cannot be hired twice');
select tst.as_user('b0000000-0000-0000-0000-000000000007');
select tst.count_is($$select count(*) from public.job_applicants$$, 0, 'staff cannot see applicants');

select tst.as_user('b0000000-0000-0000-0000-000000000002');
select tst.fails($$insert into public.performance_reviews(employee_id, period_label) select id, '2027 H1' from public.employees where full_name='Alice Staff'$$, 'HR officer without reviews permission cannot write reviews');
select tst.as_user('b0000000-0000-0000-0000-000000000008');
select tst.works($$insert into public.performance_reviews(employee_id, period_label, rating) select id, '2027 H1', 4 from public.employees where full_name='Alice Staff'$$, 'a line manager can review their report');
select tst.as_user('b0000000-0000-0000-0000-000000000007');
select tst.count_is($$select count(*) from public.performance_reviews$$, 0, 'the employee cannot see a draft review');
select tst.as_user('b0000000-0000-0000-0000-000000000008');
select tst.works($$update public.performance_reviews set status = 'submitted'$$, 'the reviewer submits it');
select tst.fails($$update public.performance_reviews set rating = 1$$, 'a submitted review cannot be edited');
select tst.as_user('b0000000-0000-0000-0000-000000000007');
select tst.count_is($$select count(*) from public.performance_reviews$$, 1, 'the employee sees a submitted review');
select tst.works($$select public.acknowledge_review((select id from public.performance_reviews limit 1))$$, 'the employee acknowledges it');
select tst.as_user('b0000000-0000-0000-0000-000000000003');
select tst.count_is($$select count(*) from public.performance_reviews$$, 0, 'payroll officer cannot read reviews');

select tst.as_user('b0000000-0000-0000-0000-000000000003');
select tst.works($$insert into public.payroll_runs(reference, period_start, period_end) values ('', '2026-11-01', '2026-11-30')$$, 'payroll officer starts a run');
select tst.ok((select reference from public.payroll_runs) = 'PAY-2026-11', 'run reference is generated');
select tst.ok(public.payroll_generate_lines((select id from public.payroll_runs)) = 1, 'lines are filled from recorded compensation');
select tst.ok((select gross_pay from public.payroll_lines) = 55000, 'gross is basic plus allowances');
select tst.ok((select deductions from public.payroll_lines) = 0, 'no statutory deduction is calculated for you');
select tst.works($$update public.payroll_lines set deductions = 5000$$, 'a person enters deductions');
select tst.ok((select net_pay from public.payroll_lines) = 50000, 'net = gross - deductions');
select tst.fails($$update public.payroll_runs set status = 'approved'$$, 'a run cannot be marked approved directly');
select tst.fails($$update public.payroll_runs set status = 'paid_recorded'$$, 'a run cannot be marked paid directly');
select tst.fails($$select public.record_payroll_paid((select id from public.payroll_runs), 'REF123', current_date)$$, 'a draft run cannot be recorded as paid');
select tst.works($$select public.submit_payroll_run((select id from public.payroll_runs))$$, 'the run is submitted for approval');
select tst.fails($$update public.payroll_lines set gross_pay = 999999$$, 'lines are frozen once submitted');
select tst.fails($$select public.decide_approval((select id from public.approval_requests where subject='payroll' and status='pending'), 'approved', null)$$, 'the preparer cannot approve their own payroll');
select tst.as_user('b0000000-0000-0000-0000-00000000000a');
select tst.ok((select public.decide_approval((select id from public.approval_requests where subject='payroll' and status='pending'), 'approved', null)) = 'next_step', 'HR head approves step one');
select tst.as_user('b0000000-0000-0000-0000-000000000004');
select tst.fails($$select public.record_payroll_paid((select id from public.payroll_runs), 'REF123', current_date)$$, 'not yet approved: Finance cannot record it as paid');
select tst.ok((select public.decide_approval((select id from public.approval_requests where subject='payroll' and status='pending'), 'approved', null)) = 'approved', 'Finance approves step two');
select tst.admin();
select tst.ok((select status from public.payroll_runs) = 'approved', 'run becomes approved only after both approvals');
select tst.as_user('b0000000-0000-0000-0000-000000000003');
select tst.fails($$select public.record_payroll_paid((select id from public.payroll_runs), 'REF123', current_date)$$, 'the preparer cannot record the payment');
select tst.as_user('b0000000-0000-0000-0000-000000000004');
select tst.fails($$select public.record_payroll_paid((select id from public.payroll_runs), '', current_date)$$, 'a payment reference is required');
select tst.works($$select public.record_payroll_paid((select id from public.payroll_runs), 'BANK-REF-123', current_date)$$, 'an authorised person records the external payment');
select tst.admin();
select tst.ok((select status from public.payroll_runs) = 'paid_recorded', 'run is now paid_recorded');
select tst.as_user('b0000000-0000-0000-0000-000000000002');
select tst.count_is($$select count(*) from public.payroll_runs$$, 0, 'HR officer cannot see payroll');
select tst.as_user('b0000000-0000-0000-0000-000000000007');
select tst.count_is($$select count(*) from public.payroll_lines$$, 0, 'staff cannot see payroll lines');

select tst.as_user('b0000000-0000-0000-0000-000000000003');
select tst.works($$insert into public.payroll_runs(reference, period_start, period_end) values ('', '2026-12-01', '2026-12-31')$$, 'second run');
select tst.works($$select public.payroll_generate_lines((select id from public.payroll_runs where period_start='2026-12-01'))$$, 'fill second run');
select tst.works($$select public.submit_payroll_run((select id from public.payroll_runs where period_start='2026-12-01'))$$, 'submit second run');
select tst.as_user('b0000000-0000-0000-0000-00000000000a');
select tst.ok((select public.decide_approval((select id from public.approval_requests where subject='payroll' and status='pending'), 'rejected', 'Numbers look wrong')) = 'rejected', 'HR head rejects');
select tst.admin();
select tst.ok((select status from public.payroll_runs where period_start='2026-12-01') = 'draft', 'a rejected run returns to draft for correction');

update public.modules set enabled = false where key = 'people';
select tst.as_user('b0000000-0000-0000-0000-000000000003');
select tst.count_is($$select count(*) from public.payroll_runs$$, 0, 'with the module switched off, payroll cannot be read');
select tst.admin();
update public.modules set enabled = true where key = 'people';

-- ================= FINANCE (stage 3) =================
select tst.admin();
insert into public.role_permissions select r.id, 'finance.claims' from public.roles r where r.key = 'staff_basic' on conflict do nothing;
update public.automation_rules set enabled = false where key in ('finance_invoice_drafts', 'finance_bill_drafts');
insert into public.customers (company_name, contact_name, email) values ('Test Customer Ltd', 'Cathy Customer', 'cathy@example.test');
insert into public.suppliers (name) values ('Test Supplier Ltd');
insert into public.sales_orders (customer_id, status) select id, 'delivered' from public.customers where company_name = 'Test Customer Ltd';
insert into public.sales_order_items (order_id, line_no, description, quantity, unit_price) select id, 1, 'Test goods', 10, 1500 from public.sales_orders;
insert into public.purchase_orders (supplier_id, status) select id, 'received' from public.suppliers where name = 'Test Supplier Ltd';
insert into public.purchase_order_items (po_id, line_no, description, quantity, unit_price, received_quantity) select id, 1, 'Supplies', 20, 400, 20 from public.purchase_orders;

create table fin_ids as select (select id from public.sales_orders limit 1) as so, (select id from public.purchase_orders limit 1) as po;
grant all on fin_ids to public;
select tst.ok((select amount from public.finance_transactions where source = 'payroll') = 50000, 'recording payroll as paid posts its net pay to the ledger');

-- access
select tst.as_user('b0000000-0000-0000-0000-000000000002');
select tst.count_is($$select count(*) from public.finance_transactions$$, 0, 'HR officer cannot see the ledger');
select tst.count_is($$select count(*) from public.invoices$$, 0, 'HR officer cannot see invoices');
select tst.as_user('b0000000-0000-0000-0000-000000000007');
select tst.count_is($$select count(*) from public.finance_transactions$$, 0, 'ordinary staff cannot see the ledger');
select tst.as_user('b0000000-0000-0000-0000-000000000005');
select tst.count_is($$select count(*) from public.finance_transactions$$, 1, 'accountant sees the ledger');

-- manual ledger entries
select tst.works($$insert into public.finance_transactions(kind, category_id, amount, description) select 'income', id, 1000, 'Consulting income' from public.finance_categories where system_key='other_income'$$, 'accountant records manual income');
select tst.fails($$insert into public.finance_transactions(kind, category_id, amount, description) select 'income', id, 1000, 'Wrong kind' from public.finance_categories where system_key='payroll'$$, 'a category of the wrong kind is refused');
select tst.fails($$insert into public.finance_transactions(kind, category_id, amount, description) select 'expense', id, -5, 'Negative' from public.finance_categories where system_key='operating'$$, 'negative amounts are refused');
select tst.affects($$update public.finance_transactions set amount = 1 where source = 'payroll'$$, 0, 'system ledger entries cannot be edited');
select tst.affects($$delete from public.finance_transactions where source = 'payroll'$$, 0, 'system ledger entries cannot be deleted');
select tst.works($$update public.finance_transactions set description = 'Consulting income (corrected)' where source = 'manual'$$, 'a manual entry can be corrected');

-- budgets
select tst.works($$insert into public.budgets(name, category_id, period_start, period_end, amount) select 'Payroll budget', id, date_trunc('year', current_date)::date, (date_trunc('year', current_date) + interval '1 year - 1 day')::date, 600000 from public.finance_categories where system_key='payroll'$$, 'accountant sets a budget');
select tst.ok((select actual from public.budget_vs_actual where name='Payroll budget') = 50000, 'budget vs actual uses real ledger entries');
select tst.as_user('b0000000-0000-0000-0000-000000000002');
select tst.count_is($$select count(*) from public.budgets$$, 0, 'HR officer cannot see budgets');

-- invoices
select tst.as_user('b0000000-0000-0000-0000-000000000005');
select tst.works($$insert into public.invoices(customer_id, tax_rate, status) select id, 10, 'paid' from public.customers where company_name='Test Customer Ltd'$$, 'accountant drafts an invoice');
select tst.ok((select status from public.invoices) = 'draft', 'a new invoice is always a draft, whatever status was sent');
select tst.fails($$select public.issue_invoice((select id from public.invoices))$$, 'an invoice with no lines cannot be issued');
select tst.works($$insert into public.invoice_items(invoice_id, line_no, description, quantity, unit_price) select id, 1, 'Goods', 10, 1000 from public.invoices$$, 'lines are added to the draft');
select tst.ok((select total from public.invoice_totals) = 11000, 'total = lines plus the tax rate entered by a person (10% of 10,000)');
select tst.fails($$update public.invoices set status = 'issued'$$, 'status cannot be changed directly');
select tst.works($$select public.issue_invoice((select id from public.invoices))$$, 'a person issues the invoice');
select tst.ok((select issued_by from public.invoices) = 'b0000000-0000-0000-0000-000000000005', 'who issued it is recorded');
select tst.ok((select due_date from public.invoices) = current_date + 30, 'a due date is set (30 days) when none was given');
select tst.affects($$update public.invoices set notes = 'changed'$$, 0, 'an issued invoice cannot be edited');
select tst.fails($$update public.invoice_items set unit_price = 1$$, 'issued invoice lines are locked');
select tst.fails($$insert into public.invoice_payments(invoice_id, amount) select id, 100 from public.invoices$$, 'payments cannot be inserted directly');
select tst.fails($$select public.record_invoice_payment((select id from public.invoices), 99999, current_date, 'bank', 'X')$$, 'overpaying is refused');
select tst.works($$select public.record_invoice_payment((select id from public.invoices), 4000, current_date, 'mpesa', 'MP123')$$, 'a part payment is recorded');
select tst.ok((select status from public.invoices) = 'partially_paid', 'invoice becomes partially paid');
select tst.ok((select balance from public.invoice_totals) = 7000, 'balance is reduced');
select tst.fails($$select public.void_invoice((select id from public.invoices), 'mistake')$$, 'an invoice with payments cannot be voided');
select tst.works($$select public.record_invoice_payment((select id from public.invoices), 7000, current_date, 'bank', 'BK1')$$, 'the rest is paid');
select tst.ok((select status from public.invoices) = 'paid', 'invoice is paid');
select tst.ok((select count(*) from public.finance_transactions where source='invoice_payment') = 2, 'receipts are posted to the ledger');
select tst.as_user('b0000000-0000-0000-0000-000000000007');
select tst.count_is($$select count(*) from public.invoice_payments$$, 0, 'ordinary staff cannot see receipts');

-- invoice from a delivered sales order
select tst.as_user('b0000000-0000-0000-0000-000000000005');
select tst.works($$select public.create_invoice_from_order((select so from fin_ids))$$, 'a draft invoice can be created from a delivered order');
select tst.ok((select status from public.invoices where sales_order_id is not null) = 'draft', 'it is only a draft: a person must issue it');
select tst.ok((select total from public.invoice_totals where invoice_id = (select id from public.invoices where sales_order_id is not null)) = 15000, 'lines were copied from the order');
select tst.fails($$select public.create_invoice_from_order((select so from fin_ids))$$, 'the same order cannot be invoiced twice');
select tst.as_user('b0000000-0000-0000-0000-000000000002');
select tst.fails($$select public.create_invoice_from_order((select so from fin_ids))$$, 'HR officer cannot create invoices');

-- supplier bills: approval before payment, preparer cannot pay
select tst.as_user('b0000000-0000-0000-0000-000000000005');
select tst.works($$select public.create_bill_from_po((select po from fin_ids))$$, 'a draft bill can be created from a received purchase order');
select tst.ok((select amount from public.supplier_bills) = 8000, 'bill value is the value actually received');
select tst.fails($$select public.create_bill_from_po((select po from fin_ids))$$, 'the same order cannot be billed twice');
select tst.fails($$select public.record_bill_payment((select id from public.supplier_bills), 8000, current_date, 'bank', 'PAYREF1')$$, 'a draft bill cannot be paid');
select tst.fails($$update public.supplier_bills set status = 'approved'$$, 'bill status cannot be changed directly');
select tst.works($$select public.submit_bill((select id from public.supplier_bills))$$, 'the bill is submitted for approval');
select tst.fails($$select public.record_bill_payment((select id from public.supplier_bills), 8000, current_date, 'bank', 'PAYREF1')$$, 'a bill awaiting approval cannot be paid');
select tst.fails($$select public.decide_approval((select id from public.approval_requests where subject='bill' and status='pending'), 'approved', null)$$, 'the preparer cannot approve their own bill');
select tst.as_user('b0000000-0000-0000-0000-000000000004');
select tst.ok((select public.decide_approval((select id from public.approval_requests where subject='bill' and status='pending'), 'approved', null)) = 'approved', 'a finance approver approves the bill');
select tst.admin();
select tst.ok((select status from public.supplier_bills) = 'approved', 'bill is approved');
select tst.as_user('b0000000-0000-0000-0000-000000000005');
select tst.fails($$select public.record_bill_payment((select id from public.supplier_bills), 8000, current_date, 'bank', 'PAYREF1')$$, 'the person who prepared the bill cannot record its payment');
select tst.as_user('b0000000-0000-0000-0000-000000000004');
select tst.fails($$select public.record_bill_payment((select id from public.supplier_bills), 8000, current_date, 'bank', '')$$, 'a payment reference is required');
select tst.fails($$select public.record_bill_payment((select id from public.supplier_bills), 9000, current_date, 'bank', 'PAYREF1')$$, 'paying more than the bill is refused');
select tst.works($$select public.record_bill_payment((select id from public.supplier_bills), 3000, current_date, 'bank', 'PAYREF1')$$, 'an approved bill can be part-paid by someone else');
select tst.ok((select status from public.supplier_bills) = 'partially_paid', 'bill is partly paid');
select tst.works($$select public.record_bill_payment((select id from public.supplier_bills), 5000, current_date, 'bank', 'PAYREF2')$$, 'the rest is paid');
select tst.ok((select status from public.supplier_bills) = 'paid', 'bill is paid');
select tst.ok((select count(*) from public.finance_transactions where source='bill_payment') = 2, 'payments are posted to the ledger');
select tst.fails($$select public.void_bill((select id from public.supplier_bills), 'oops')$$, 'a paid bill cannot be voided');

-- a rejected bill returns to draft
select tst.as_user('b0000000-0000-0000-0000-000000000005');
select tst.works($$insert into public.supplier_bills(supplier_id, amount, bill_date) select id, 12345, current_date from public.suppliers$$, 'accountant captures a bill by hand');
select tst.works($$select public.submit_bill((select id from public.supplier_bills where amount = 12345))$$, 'and submits it');
select tst.as_user('b0000000-0000-0000-0000-000000000004');
select tst.ok((select public.decide_approval((select id from public.approval_requests where subject='bill' and status='pending'), 'rejected', 'Supplier invoice missing')) = 'rejected', 'finance rejects it with a reason');
select tst.admin();
select tst.ok((select status from public.supplier_bills where amount = 12345) = 'draft', 'a rejected bill goes back to draft');

-- expense claims
select tst.as_user('b0000000-0000-0000-0000-000000000007');
select tst.works($$insert into public.expense_claims(employee_id, category_id, amount, description) select e.id, c.id, 2000, 'Taxi to client' from public.employees e, public.finance_categories c where e.full_name = 'Alice Staff' and c.system_key = 'operating'$$, 'an employee submits an expense claim');
select tst.fails($$insert into public.expense_claims(employee_id, category_id, amount, description) select (select id from public.employees where full_name = 'Alice Staff'), c.id, 1, 'x' from public.finance_categories c where c.system_key = 'sales'$$, 'a claim must use an expense category');
select tst.count_is($$select count(*) from public.expense_claims$$, 1, 'the employee sees their own claim');
select tst.fails($$update public.expense_claims set status = 'approved'$$, 'a claim cannot be approved by editing it');
select tst.fails($$select public.decide_approval((select id from public.approval_requests where subject='expense' and status='pending' and title like 'Expense claim%'), 'approved', null)$$, 'the claimant cannot approve their own claim');
select tst.as_user('b0000000-0000-0000-0000-00000000000c');
select tst.count_is($$select count(*) from public.expense_claims$$, 0, 'a colleague cannot see the claim');
select tst.as_user('b0000000-0000-0000-0000-000000000004');
select tst.fails($$select public.record_expense_paid((select id from public.expense_claims), 'PAY999', current_date)$$, 'an unapproved claim cannot be reimbursed');
select tst.ok((select public.decide_approval((select id from public.approval_requests where subject='expense' and status='pending' and title like 'Expense claim%'), 'approved', null)) = 'approved', 'finance approves the claim');
select tst.fails($$select public.record_expense_paid((select id from public.expense_claims), '', current_date)$$, 'a payment reference is required');
select tst.works($$select public.record_expense_paid((select id from public.expense_claims), 'MPESA-77', current_date)$$, 'reimbursement is recorded');
select tst.admin();
select tst.ok((select status from public.expense_claims) = 'paid_recorded', 'claim is paid_recorded');
select tst.ok(exists(select 1 from public.finance_transactions where source = 'expense_claim' and amount = 2000), 'the reimbursement is posted to the ledger');

-- cancelling a claim
select tst.as_user('b0000000-0000-0000-0000-000000000007');
select tst.works($$insert into public.expense_claims(employee_id, category_id, amount, description) select e.id, c.id, 500, 'Parking' from public.employees e, public.finance_categories c where e.full_name = 'Alice Staff' and c.system_key = 'operating'$$, 'second claim');
select tst.works($$select public.cancel_expense_claim((select id from public.expense_claims where amount = 500))$$, 'the claimant cancels a pending claim');
select tst.admin();
select tst.ok((select status from public.expense_claims where amount = 500) = 'cancelled', 'it is cancelled');
select tst.ok(not exists(select 1 from public.approval_requests where subject = 'expense' and status = 'pending'), 'and its approval request is closed');

-- reports and cash flow
select tst.as_user('b0000000-0000-0000-0000-000000000005');
select tst.works($$select public.build_finance_report(current_date)$$, 'accountant builds the monthly report');
select tst.ok((select (data -> 'by_currency' -> 0 ->> 'income')::numeric from public.finance_report_snapshots) = 12000, 'report income = manual 1,000 + receipts 11,000');
select tst.ok((select count(*) from public.cash_flow_monthly) >= 1, 'cash flow view has data');
select tst.as_user('b0000000-0000-0000-0000-000000000002');
select tst.fails($$select public.build_finance_report(current_date)$$, 'HR officer cannot build financial reports');
select tst.count_is($$select count(*) from public.finance_report_snapshots$$, 0, 'HR officer cannot read financial reports');

-- module off
select tst.admin();
update public.modules set enabled = false where key = 'finance';
select tst.as_user('b0000000-0000-0000-0000-000000000005');
select tst.count_is($$select count(*) from public.finance_transactions$$, 0, 'with the module switched off, the ledger cannot be read');
select tst.admin();
update public.modules set enabled = true where key = 'finance';


-- ================= FINANCE AUTOMATIONS (stage 4) =================
select tst.admin();
select tst.ok((select count(*) from public.automation_rules where key like 'finance_%' or key = 'approval_reminders') = 8, 'the finance and approval automations are registered in the control centre');
select tst.ok(not exists(select 1 from public.automation_rules where key like 'finance_%' and notify_email and not email_capable), 'no finance rule can email unless it is email capable');

-- delivered order -> draft invoice (never an issued one)
update public.automation_rules set enabled = true where key in ('finance_invoice_drafts', 'finance_bill_drafts');
insert into public.sales_orders (customer_id, status) select id, 'confirmed' from public.customers where company_name = 'Test Customer Ltd';
insert into public.sales_order_items (order_id, line_no, description, quantity, unit_price) select id, 1, 'Auto goods', 2, 500 from public.sales_orders where status = 'confirmed';
update public.sales_orders set status = 'delivered' where status = 'confirmed';
select tst.ok((select count(*) from public.invoices where notes like 'Created from sales order%' and status = 'draft') >= 2, 'a delivered order produced a DRAFT invoice automatically');
select tst.ok(not exists(select 1 from public.invoices i join public.sales_orders o on o.id = i.sales_order_id where i.status = 'issued' and i.issued_by is null), 'automation never issues an invoice');
select tst.ok(exists(select 1 from public.notifications where dedupe_key like 'inv-draft:%'), 'the finance team is told about the draft invoice');
update public.sales_orders set status = 'invoiced' where status = 'delivered';
update public.sales_orders set status = 'delivered' where status = 'invoiced';
select tst.ok((select count(*) from public.invoices where sales_order_id is not null and status <> 'void') = (select count(distinct sales_order_id) from public.invoices where sales_order_id is not null and status <> 'void'), 'no duplicate invoice per order');

-- received PO -> draft bill
insert into public.purchase_orders (supplier_id, status) select id, 'sent' from public.suppliers where name = 'Test Supplier Ltd';
insert into public.purchase_order_items (po_id, line_no, description, quantity, unit_price, received_quantity) select id, 1, 'Auto supplies', 10, 100, 10 from public.purchase_orders where status = 'sent';
update public.purchase_orders set status = 'received' where status = 'sent';
select tst.ok(exists(select 1 from public.supplier_bills where description like 'Draft from purchase order%' and status = 'draft' and amount = 1000), 'a received order produced a DRAFT bill for the value received');
select tst.ok(not exists(select 1 from public.supplier_bills where purchase_order_id is not null and status in ('approved', 'paid', 'partially_paid') and description like 'Draft from%' and created_by is null and not exists (select 1 from public.approval_requests r where r.subject = 'bill' and r.record_id = supplier_bills.id and r.status = 'approved')), 'automation never approves or pays a bill');

-- overdue reminders: internal notice always; customer email only when both switches are on
update public.invoices set due_date = current_date - 10, issue_date = current_date - 40, status = 'issued', issued_by = 'b0000000-0000-0000-0000-000000000005', issued_at = now() where notes like 'Created from sales order%' and status = 'draft' and id = (select id from public.invoices where notes like 'Created from sales order%' and status = 'draft' limit 1);
select tst.ok(public.auto_finance_payment_reminders('{"first_after_days":1,"repeat_every_days":7,"max_reminders":3}') >= 1, 'an overdue invoice produces an internal reminder');
select tst.ok((select count(*) from public.notification_outbox where rule_key = 'finance_payment_reminders') = 0, 'no customer email is queued while the email switches are off');
select tst.ok(public.auto_finance_payment_reminders('{"first_after_days":1,"repeat_every_days":7,"max_reminders":3}') = 0, 'the same invoice is not reminded again the same day');
update public.automation_settings set email_enabled = true;
update public.automation_rules set notify_email = true where key = 'finance_payment_reminders';
delete from public.invoice_reminders;
select tst.ok(public.auto_finance_payment_reminders('{"first_after_days":1,"repeat_every_days":7,"max_reminders":3}') >= 0, 'reminders run again with email on');
select tst.ok((select count(*) from public.notification_outbox where rule_key = 'finance_payment_reminders' and to_email = 'cathy@example.test') = 1, 'one customer reminder is queued once both switches are on');
update public.automation_settings set email_enabled = false;
update public.automation_rules set notify_email = false where key = 'finance_payment_reminders';

-- bills due, budgets, monthly report, approval reminders
select tst.ok(public.auto_finance_budget_alerts('{}') >= 0, 'budget alert job runs');
select tst.ok(public.auto_finance_monthly_report('{}') >= 0, 'monthly report job runs');
select tst.ok(public.auto_finance_monthly_report('{}') = 0, 'and does not rebuild a month that already has a report');
update public.approval_requests set created_at = now() - interval '5 days' where status = 'pending';
select tst.ok(public.auto_approval_reminders('{"stale_days":2}') >= 0, 'approval reminders run');
select tst.ok(public.auto_approval_reminders('{"stale_days":2}') = 0, 'and are not repeated in the same week');


-- ================= RESTRICTED DOCUMENTS (stage 5) =================
select tst.admin();
create table doc_ids as select (select id from public.employees where full_name = 'Alice Staff') as emp, (select id from public.expense_claims where amount = 2000) as claim, (select id from public.invoices limit 1) as inv;
grant all on doc_ids to public;
select tst.as_user('b0000000-0000-0000-0000-000000000002');
select tst.works($$insert into storage.objects(bucket_id, name, owner) values ('restricted-docs', 'employee/202611/11111111-1111-1111-1111-111111111111-contract.pdf', 'b0000000-0000-0000-0000-000000000002')$$, 'HR officer can upload an employee document');
select tst.fails($$insert into storage.objects(bucket_id, name) values ('restricted-docs', 'invoice/202611/11111111-1111-1111-1111-111111111112-inv.pdf')$$, 'HR officer cannot upload a finance document');
select tst.works($$insert into public.restricted_documents(entity_type, entity_id, storage_path, file_name, mime_type, size_bytes, created_by) select 'employee', emp, 'employee/202611/11111111-1111-1111-1111-111111111111-contract.pdf', 'contract.pdf', 'application/pdf', 1000, 'b0000000-0000-0000-0000-000000000002' from doc_ids$$, 'HR officer indexes it');
select tst.count_is($$select count(*) from public.restricted_documents$$, 1, 'HR officer sees HR documents');
select tst.works($$select * from public.restricted_doc_open((select id from public.restricted_documents))$$, 'HR officer can open it (and it is logged)');
select tst.as_user('b0000000-0000-0000-0000-000000000005');
select tst.count_is($$select count(*) from public.restricted_documents$$, 0, 'finance staff cannot see HR documents');
select tst.count_is($$select count(*) from storage.objects where bucket_id = 'restricted-docs'$$, 0, 'finance staff cannot read HR files in storage');
select tst.fails($$select * from public.restricted_doc_open((select id from public.restricted_documents limit 1))$$, 'finance staff cannot open an HR document');
select tst.as_user('b0000000-0000-0000-0000-000000000008');
select tst.count_is($$select count(*) from public.restricted_documents$$, 0, 'a line manager cannot see HR documents');
select tst.as_user('b0000000-0000-0000-0000-000000000009');
select tst.count_is($$select count(*) from storage.objects where bucket_id = 'restricted-docs'$$, 0, 'unrelated staff cannot read restricted storage');
select tst.admin();
select tst.count_is($$select count(*) from public.document_access_log$$, 1, 'the open was logged');
select tst.count_is($$select count(*) from public.audit_log where table_name = 'restricted_documents'$$, 1, 'the upload is in the activity log');

-- finance documents and claim receipts
select tst.as_user('b0000000-0000-0000-0000-000000000005');
select tst.works($$insert into storage.objects(bucket_id, name, owner) values ('restricted-docs', 'invoice/202611/11111111-1111-1111-1111-111111111113-inv.pdf', 'b0000000-0000-0000-0000-000000000005')$$, 'accountant can upload an invoice document');
select tst.works($$insert into public.restricted_documents(entity_type, entity_id, storage_path, file_name, mime_type, size_bytes, created_by) select 'invoice', inv, 'invoice/202611/11111111-1111-1111-1111-111111111113-inv.pdf', 'inv.pdf', 'application/pdf', 500, 'b0000000-0000-0000-0000-000000000005' from doc_ids$$, 'and index it');
select tst.as_user('b0000000-0000-0000-0000-000000000007');
select tst.works($$insert into storage.objects(bucket_id, name, owner) values ('restricted-docs', 'expense_claim/202611/11111111-1111-1111-1111-111111111114-receipt.pdf', 'b0000000-0000-0000-0000-000000000007')$$, 'a claimant can upload a receipt');
select tst.works($$insert into public.restricted_documents(entity_type, entity_id, storage_path, file_name, mime_type, size_bytes, created_by) select 'expense_claim', claim, 'expense_claim/202611/11111111-1111-1111-1111-111111111114-receipt.pdf', 'receipt.pdf', 'application/pdf', 400, 'b0000000-0000-0000-0000-000000000007' from doc_ids$$, 'and attach it to their own claim');
select tst.count_is($$select count(*) from public.restricted_documents$$, 1, 'the claimant sees only their own receipt');
select tst.fails($$insert into public.restricted_documents(entity_type, entity_id, storage_path, file_name, mime_type, size_bytes, created_by) select 'invoice', inv, 'invoice/202611/11111111-1111-1111-1111-111111111115-x.pdf', 'x.pdf', 'application/pdf', 400, 'b0000000-0000-0000-0000-000000000007' from doc_ids$$, 'the claimant cannot attach files to invoices');
select tst.fails($$insert into storage.objects(bucket_id, name, owner) values ('restricted-docs', 'employee/202611/11111111-1111-1111-1111-111111111116-x.pdf', 'b0000000-0000-0000-0000-000000000007')$$, 'the claimant cannot upload HR files');
select tst.affects($$delete from public.restricted_documents$$, 0, 'the claimant cannot remove documents');
select tst.as_user('b0000000-0000-0000-0000-00000000000c');
select tst.count_is($$select count(*) from public.restricted_documents$$, 0, 'a colleague cannot see the receipt');
select tst.as_user('b0000000-0000-0000-0000-000000000004');
select tst.count_is($$select count(*) from public.restricted_documents$$, 2, 'finance manager sees invoice and receipt documents but no HR documents');
select tst.admin();
update public.modules set enabled = false where key = 'people';
select tst.as_user('b0000000-0000-0000-0000-000000000002');
select tst.count_is($$select count(*) from public.restricted_documents$$, 0, 'with the HR module off, HR documents are closed');
select tst.admin();
update public.modules set enabled = true where key = 'people';

-- ====================================================================================================
-- ---------------- security hardening: MFA, sensitive operations, storage, monitoring ----------------
-- ====================================================================================================
create function tst.fails_like(q text, pattern text, lbl text) returns void language plpgsql as $$
begin
  begin execute q; insert into tst.results(passed,label,detail) values (false, lbl, 'statement unexpectedly succeeded');
  exception when others then insert into tst.results(passed,label,detail) values (sqlerrm like pattern, lbl, sqlerrm); end;
end $$;

select tst.admin();
-- (the fixtures above gave super, hr_officer, finance_manager users and the non-MFA role staff_basic)
-- ---- A. session assurance --------------------------------------------------------------------------
select tst.ok(public.mfa_ok(900), 'internal contexts (no end user) are never blocked by MFA rules');
select tst.as_user('b0000000-0000-0000-0000-000000000001');
select tst.ok(public.is_staff() and public.is_super_admin(), 'MFA: a Super Administrator with an aal2 session is staff');
select tst.ok(coalesce(array_length(public.my_permissions(), 1), 0) > 10, 'MFA: ... and has permissions');
select tst.ok(public.my_mfa_required(), 'MFA: the Super Administrator role requires MFA');
select tst.as_user_aal1('b0000000-0000-0000-0000-000000000001');
select tst.ok(not public.is_staff(), 'MFA: a Super Administrator with a password-only session is NOT staff');
select tst.ok(not public.is_super_admin(), 'MFA: ... is not Super Administrator');
select tst.ok(not public.has_permission('users.manage'), 'MFA: ... holds no permission');
select tst.ok(coalesce(array_length(public.my_permissions(), 1), 0) = 0, 'MFA: ... my_permissions() is empty');
select tst.count_is($$select count(*) from public.employees$$, 0, 'MFA: ... cannot read employees through the API');
select tst.count_is($$select count(*) from public.approval_requests$$, 0, 'MFA: ... cannot read approval requests');
select tst.ok(public.my_mfa_required(), 'MFA: ... the app can still ask whether MFA is required');
select tst.as_user_aal1('b0000000-0000-0000-0000-000000000002');
select tst.ok(not public.has_permission('people.view'), 'MFA: an HR officer on a password-only session has no HR access');
select tst.count_is($$select count(*) from public.employees$$, 0, 'MFA: ... and sees no employees');
select tst.as_user('b0000000-0000-0000-0000-000000000002');
select tst.ok(public.has_permission('people.view'), 'MFA: after the second factor the HR officer has HR access');
select tst.ok((select count(*) from public.employees) > 0, 'MFA: ... and sees the directory');
select tst.as_user_aal1('b0000000-0000-0000-0000-000000000007');
select tst.ok(not public.my_mfa_required(), 'MFA: a basic staff role does not have to use MFA');
select tst.ok(public.is_staff(), 'MFA: ... and works on a password-only session (nothing sensitive is open to it)');
select tst.anon();
select tst.fails($$select public.mfa_ok(900)$$, 'MFA: anonymous visitors cannot call the MFA helpers');
select tst.fails($$select public.my_mfa_required()$$, 'MFA: ... nor my_mfa_required()');

-- ---- B. sensitive operations need a RECENT check ---------------------------------------------------
select tst.admin();
select tst.as_user_stale_mfa('b0000000-0000-0000-0000-000000000001');
select tst.ok(public.is_super_admin(), 'MFA: a session verified two hours ago is still aal2');
select tst.fails_like($$update public.profiles set role_id = (select id from public.roles where key='hr_head') where email='alice@t.test'$$, '%[mfa]%', 'MFA: changing someone''s role needs a fresh check');
select tst.fails_like($$update public.roles set description = 'changed' where key='staff_basic'$$, '%[mfa]%', 'MFA: editing a role needs a fresh check');
select tst.fails_like($$insert into public.role_permissions(role_id, permission_key) select id, 'people.view' from public.roles where key='staff_basic'$$, '%[mfa]%', 'MFA: granting a permission needs a fresh check');
select tst.fails_like($$update public.modules set enabled = not enabled where key = 'tenders'$$, '%[mfa]%', 'MFA: switching a module needs a fresh check');
select tst.as_user('b0000000-0000-0000-0000-000000000001');
select tst.works($$update public.profiles set role_id = (select id from public.roles where key='hr_head') where email='alice@t.test'$$, 'MFA: with a fresh check the role change works');
select tst.works($$update public.profiles set role_id = (select id from public.roles where key='staff_basic') where email='alice@t.test'$$, 'MFA: ... and can be put back');
select tst.works($$update public.roles set description = 'Staff (basic)' where key='staff_basic'$$, 'MFA: with a fresh check a role can be edited');
select tst.works($$update public.modules set enabled = not enabled where key = 'tenders'$$, 'MFA: with a fresh check a module can be switched');
select tst.works($$update public.modules set enabled = not enabled where key = 'tenders'$$, 'MFA: ... and back');
select tst.as_user_aal1('b0000000-0000-0000-0000-000000000001');
select tst.affects($$update public.profiles set role_id = (select id from public.roles where key='hr_head') where email='alice@t.test'$$, 0, 'MFA: a password-only Super Administrator cannot change roles at all');

-- approving money
select tst.admin();
insert into tst_ids values ('mfa_exp', public.approval_submit('expense', gen_random_uuid(), 5000, null, 'b0000000-0000-0000-0000-000000000005', 'MFA expense', null, null));
select tst.as_user_stale_mfa('b0000000-0000-0000-0000-000000000004');
select tst.fails_like($$select public.decide_approval((select v from tst_ids where k='mfa_exp'), 'approved', null)$$, '%[mfa]%', 'MFA: approving an expense needs a fresh check');
select tst.as_user('b0000000-0000-0000-0000-000000000004');
select tst.ok((select public.decide_approval((select v from tst_ids where k='mfa_exp'), 'approved', null)) = 'approved', 'MFA: with a fresh check the approval goes through');
-- low-risk approvals stay light: a basic-role manager decides leave on a password-only session
select tst.admin();
insert into tst_ids values ('mfa_leave', public.approval_submit('leave', gen_random_uuid(), 1,
  (select id from public.employees where full_name='Alice Staff'), 'b0000000-0000-0000-0000-000000000002', 'Leave: Alice, 1 day', null, null));
select tst.as_user_aal1('b0000000-0000-0000-0000-000000000008');
select tst.ok((select public.decide_approval((select v from tst_ids where k='mfa_leave'), 'approved', null)) = 'approved', 'MFA: leave approvals do not need MFA');

-- ---- C. the role flag ----------------------------------------------------------------------------------
select tst.admin();
select tst.ok((select require_mfa from public.roles where key='super_admin'), 'MFA: Super Administrator requires MFA');
select tst.ok((select bool_and(require_mfa) from public.roles where key in ('hr_officer','payroll_officer','finance_manager','accountant','director')), 'MFA: HR and Finance roles require MFA by default');
select tst.ok(not (select require_mfa from public.roles where key='staff_basic'), 'MFA: a new basic role does not');
select tst.as_user('b0000000-0000-0000-0000-000000000001');
select tst.works($$update public.roles set require_mfa = true where key='staff_basic'$$, 'MFA: a Super Administrator can require MFA for a role');
select tst.as_user_aal1('b0000000-0000-0000-0000-000000000007');
select tst.ok(not public.is_staff(), 'MFA: ... and then that role is locked until the second factor');
select tst.as_user('b0000000-0000-0000-0000-000000000001');
select tst.works($$update public.roles set require_mfa = false where key='staff_basic'$$, 'MFA: ... and can switch it off again');
select tst.works($$update public.roles set require_mfa = false where key='super_admin'$$, 'MFA: attempting to switch it off for Super Administrator is accepted but ignored');
select tst.ok((select require_mfa from public.roles where key='super_admin'), 'MFA: ... the flag is still on for Super Administrator');
select tst.as_user('b0000000-0000-0000-0000-000000000002');
select tst.affects($$update public.roles set require_mfa = false where key='hr_officer'$$, 0, 'MFA: an HR officer cannot change the flag');

-- ---- D. the module list is staff-only ----------------------------------------------------------------
select tst.anon();
select tst.count_is($$select count(*) from public.modules$$, 0, 'anonymous visitors cannot see which modules are switched on');
select tst.as_user('b0000000-0000-0000-0000-000000000007');
select tst.ok((select count(*) from public.modules) > 5, 'staff can see the module list');

-- ---- E. restricted files need MFA ---------------------------------------------------------------------------
select tst.admin();
insert into public.restricted_documents(entity_type, entity_id, storage_path, file_name, mime_type, size_bytes)
  values ('employee', (select id from public.employees where full_name='Bob Manager'), 'employee/202611/11111111-1111-1111-1111-111111111111-id.pdf', 'id.pdf', 'application/pdf', 100)
  returning id \gset secdoc_
select tst.as_user_aal1('b0000000-0000-0000-0000-000000000002');
select tst.fails(format('select * from public.restricted_doc_open(%L)', :'secdoc_id'), 'MFA: opening an HR file on a password-only session is refused');
select tst.as_user_stale_mfa('b0000000-0000-0000-0000-000000000002');
select tst.ok((select count(*) from public.restricted_doc_open(:'secdoc_id')) = 1, 'MFA: an HR file opens in any MFA-verified session');
select tst.as_user('b0000000-0000-0000-0000-000000000007');
select tst.fails(format('select * from public.restricted_doc_open(%L)', :'secdoc_id'), 'a basic employee cannot open HR files');

-- ---- F. monitoring ---------------------------------------------------------------------------------------
select tst.admin();
select tst.works($$select public.security_log('login_failed', 'warning', null, '41.89.12.x', '{"reason":"bad_password"}')$$, 'monitoring: the server can record a security event');
select tst.as_user('b0000000-0000-0000-0000-000000000007');
select tst.count_is($$select count(*) from public.security_events$$, 0, 'monitoring: ordinary staff cannot read security events');
select tst.fails($$insert into public.security_events(kind) values ('login_failed')$$, 'monitoring: browsers cannot write security events');
select tst.fails($$select public.security_log('login_failed')$$, 'monitoring: browsers cannot call security_log');
select tst.fails($$select public.security_posture()$$, 'monitoring: ordinary staff cannot run the posture check');
select tst.as_user('b0000000-0000-0000-0000-000000000001');
select tst.ok((select count(*) from public.security_events) >= 1, 'monitoring: the security team can read events');
select tst.ok((select public.security_posture() ? 'issues'), 'monitoring: the posture check returns its findings');
select tst.ok((select (public.security_posture() ->> 'mfa_missing_count')::int from (select 1) x) >= 1, 'monitoring: accounts without MFA are counted');
select tst.ok((select public.security_posture() -> 'issues' @> '[{"key":"single_super"}]'), 'monitoring: a single Super Administrator is flagged');
select tst.admin();
insert into auth.mfa_factors(user_id, status) select p.id, 'verified' from public.profiles p join public.roles r on r.id = p.role_id where r.is_super or r.require_mfa;
select tst.ok((select (public.security_posture_internal() ->> 'mfa_missing_count')::int) = 0, 'monitoring: once everyone has enrolled, none are missing');
select tst.ok((select public.auto_security_checks('{}')) >= 1, 'monitoring: the daily check notifies the security team');
select tst.ok((select public.auto_security_checks('{}')) = 0, 'monitoring: ... and does not repeat itself the same day');
select tst.ok(exists(select 1 from public.notifications where rule_key = 'security_checks'), 'monitoring: the notification exists');

-- ---- G. structural security properties (these catch regressions in future migrations) ----------------------------
select tst.admin();
select tst.count_is($$select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') and not c.relrowsecurity and c.relname !~ '^(tst_|fin_ids|doc_ids)'$$, 0, 'structure: every table in the public schema has Row Level Security on');
select tst.count_is($$select count(*) from information_schema.role_table_grants where grantee='anon' and table_schema='public' and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')$$, 0, 'structure: the anonymous role has no write grants');
select tst.count_is($$select count(*) from pg_proc p where p.pronamespace='public'::regnamespace and p.prosecdef and not exists (select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%')$$, 0, 'structure: every SECURITY DEFINER function pins its search_path');
select tst.count_is($$select count(*) from pg_proc p where p.pronamespace='public'::regnamespace and p.prosecdef and has_function_privilege('anon', p.oid, 'execute')
   and p.proname not in ('can','can_read_private_docs','can_write_private_docs','has_permission','is_staff','is_super_admin','module_enabled','my_permissions')$$, 0, 'structure: anonymous visitors can execute no SECURITY DEFINER function beyond the permission helpers');
select tst.count_is($$select count(*) from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='v' and not coalesce(c.reloptions::text,'') like '%security_invoker=true%'$$, 0, 'structure: every view runs with the caller''s permissions');
select tst.count_is($$select count(*) from storage.buckets where public and id <> 'public-media'$$, 0, 'structure: only public-media is a public bucket');
select tst.count_is($$select count(*) from storage.buckets where id in ('private-docs','restricted-docs') and not public$$, 2, 'structure: both document buckets exist and are private');
select tst.count_is($$select count(*) from pg_policies where schemaname in ('public','storage') and (qual = 'true' or with_check = 'true') and 'anon' = any(roles) and cmd <> 'SELECT'$$, 0, 'structure: no policy lets anonymous visitors write');
select tst.count_is($$select count(*) from pg_policies where schemaname='public' and 'anon' = any(roles)$$, 20, 'structure: exactly the known public-content tables are readable by anonymous visitors');

-- ---- H. storage policies ------------------------------------------------------------------------------------------
select tst.anon();
select tst.fails($$insert into storage.objects(bucket_id,name) values ('restricted-docs','employee/202611/x.pdf')$$, 'storage: anonymous visitors cannot upload to restricted-docs');
select tst.fails($$insert into storage.objects(bucket_id,name) values ('private-docs','a.pdf')$$, 'storage: ... nor to private-docs');
select tst.fails($$insert into storage.objects(bucket_id,name) values ('public-media','a.png')$$, 'storage: ... nor to public-media');
select tst.count_is($$select count(*) from storage.objects where bucket_id in ('restricted-docs','private-docs')$$, 0, 'storage: anonymous visitors cannot list private files');
select tst.as_user('b0000000-0000-0000-0000-000000000007');
select tst.fails($$insert into storage.objects(bucket_id,name,owner) values ('restricted-docs','employee/202611/a.pdf', auth.uid())$$, 'storage: a basic employee cannot upload HR files');
select tst.fails($$insert into storage.objects(bucket_id,name,owner) values ('public-media','a.png', auth.uid())$$, 'storage: ... nor change the public media library');
select tst.as_user_aal1('b0000000-0000-0000-0000-000000000002');
select tst.fails($$insert into storage.objects(bucket_id,name,owner) values ('restricted-docs','employee/202611/a.pdf', auth.uid())$$, 'storage: an HR officer on a password-only session cannot upload');
select tst.as_user('b0000000-0000-0000-0000-000000000002');
select tst.works($$insert into storage.objects(bucket_id,name,owner) values ('restricted-docs','employee/202611/22222222-2222-2222-2222-222222222222-a.pdf', auth.uid())$$, 'storage: an HR officer with MFA can upload an employee file');
select tst.fails($$insert into storage.objects(bucket_id,name,owner) values ('restricted-docs','invoice/202611/33333333-3333-3333-3333-333333333333-a.pdf', auth.uid())$$, 'storage: ... but not into the Finance folders');
select tst.fails($$insert into storage.objects(bucket_id,name,owner) values ('restricted-docs','unknown/202611/44444444-4444-4444-4444-444444444444-a.pdf', auth.uid())$$, 'storage: ... nor into an unknown folder');
select tst.ok((select count(*) from storage.objects where bucket_id='restricted-docs' and name like 'employee/202611/2222%') = 1, 'storage: ... and can read the file');
select tst.as_user('b0000000-0000-0000-0000-000000000004');
select tst.count_is($$select count(*) from storage.objects where bucket_id='restricted-docs' and name like 'employee/%'$$, 0, 'storage: a finance manager cannot read HR files');
select tst.as_user('b0000000-0000-0000-0000-000000000007');
select tst.count_is($$select count(*) from storage.objects where bucket_id='restricted-docs' and name like 'employee/%'$$, 0, 'storage: a basic employee cannot read HR files');
select tst.admin();
delete from storage.objects where bucket_id = 'restricted-docs' and name like 'employee/202611/2222%';

-- ---------------- report ----------------
select tst.admin();
select case when passed then 'PASS' else 'FAIL' end as result, label, coalesce(detail,'') as detail from tst.results where not passed order by n;
select count(*) filter (where passed) as passed, count(*) filter (where not passed) as failed from tst.results;
do $$ begin
  if exists (select 1 from tst.results where not passed) then raise exception 'PEOPLE/FINANCE TESTS FAILED'; end if;
end $$;
