-- =====================================================================
-- 0015 ORGANISATION AND APPROVAL HIERARCHIES
-- Foundation shared by the Human Resources (`people`) and `finance` modules:
--   * departments and the employee directory (reporting lines),
--   * configurable approval policies: who must approve what, in how many steps,
--   * approval requests and decisions, with segregation of duties enforced in the database:
--       - nobody can approve their own request, or a request about themselves,
--       - every step of one request must be decided by a different person,
--       - if no policy exists for something, it cannot be approved (fail closed).
--
-- Both new modules ship SWITCHED OFF. Nothing in the system ever moves money: payroll and bills are
-- records, and "paid" can only be recorded after the approvals above have been completed.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Modules, permissions, roles
-- ---------------------------------------------------------------------
insert into public.modules (key, name, description, is_core, enabled, sort_order) values
  ('people',    'Human Resources', 'Employee records, recruitment, onboarding, attendance, leave, payroll records, contracts and performance reviews. Off until the business is ready to use it.', false, false, 86),
  ('finance',   'Finance',         'Income, expenses, budgets, invoices, bills, cash flow and monthly reports. Off until the business is ready to use it.', false, false, 87),
  ('approvals', 'Approvals',       'Configurable approval hierarchies and the approval inbox used by HR and Finance.', true, true, 15)
on conflict (key) do nothing;

insert into public.permissions (key, module, description) values
  ('approvals.manage',        'approvals', 'Configure approval policies and steps; cancel pending approval requests'),
  ('approvals.view_all',      'approvals', 'See every approval request (oversight)'),
  ('people.view',             'people',    'View the employee directory, contracts, attendance, leave, onboarding and recruitment'),
  ('people.manage',           'people',    'Create and edit employees, contracts, attendance, leave, onboarding and recruitment'),
  ('people.compensation',     'people',    'View and edit salary and compensation (sensitive)'),
  ('people.payroll_prepare',  'people',    'Prepare payroll runs and lines (sensitive)'),
  ('people.payroll_approve',  'people',    'Approve payroll as the HR approver (sensitive)'),
  ('people.reviews',          'people',    'View and write performance reviews for all staff (sensitive)'),
  ('people.leave_approve',    'people',    'Approve leave applications when a policy step asks for this permission'),
  ('people.docs',             'people',    'View and upload HR documents such as contracts (sensitive)'),
  ('finance.view',            'finance',   'View income, expenses, budgets, invoices, bills and cash flow'),
  ('finance.manage',          'finance',   'Record income and expenses, manage categories and budgets'),
  ('finance.invoices',        'finance',   'Create and edit invoices and record payments received'),
  ('finance.bills',           'finance',   'Create and edit supplier bills and record payments made'),
  ('finance.expense_approve', 'finance',   'Approve expense claims when a policy step asks for this permission'),
  ('finance.bill_approve',    'finance',   'Approve supplier bills when a policy step asks for this permission'),
  ('finance.payroll_approve', 'finance',   'Approve payroll as the Finance approver (sensitive)'),
  ('finance.reports',         'finance',   'View financial reports and monthly snapshots'),
  ('finance.docs',            'finance',   'View and upload finance documents such as receipts and invoices')
on conflict (key) do nothing;

insert into public.roles (key, name, description, is_system, is_super) values
  ('hr_officer',      'HR Officer',      'Maintains employee records, contracts, attendance, leave, recruitment and onboarding. No access to salaries or payroll.', false, false),
  ('payroll_officer', 'Payroll Officer', 'Prepares payroll records. Cannot approve them.', false, false),
  ('finance_manager', 'Finance Manager', 'Runs finance and approves expenses, bills and payroll (as the Finance approver).', false, false),
  ('accountant',      'Accountant',      'Records income, expenses, invoices, bills and payments; reads reports. Cannot approve.', false, false)
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_key)
select r.id, p.perm
from public.roles r
join (values
  ('hr_officer', 'people.view'), ('hr_officer', 'people.manage'), ('hr_officer', 'people.docs'),
  ('payroll_officer', 'people.view'), ('payroll_officer', 'people.payroll_prepare'), ('payroll_officer', 'people.compensation'),
  ('finance_manager', 'finance.view'), ('finance_manager', 'finance.manage'), ('finance_manager', 'finance.invoices'),
  ('finance_manager', 'finance.bills'), ('finance_manager', 'finance.expense_approve'), ('finance_manager', 'finance.bill_approve'),
  ('finance_manager', 'finance.payroll_approve'), ('finance_manager', 'finance.reports'), ('finance_manager', 'finance.docs'),
  ('accountant', 'finance.view'), ('accountant', 'finance.manage'), ('accountant', 'finance.invoices'),
  ('accountant', 'finance.bills'), ('accountant', 'finance.reports'), ('accountant', 'finance.docs'),
  ('director', 'finance.view'), ('director', 'finance.reports'), ('director', 'people.view'), ('director', 'approvals.view_all')
) as p(role_key, perm) on p.role_key = r.key
on conflict do nothing;

-- ---------------------------------------------------------------------
-- Departments and the employee directory (reporting lines)
-- Deliberately holds no national ID, tax PIN, bank or health data.
-- ---------------------------------------------------------------------
create table public.departments (
  id               uuid primary key default gen_random_uuid(),
  name             text not null unique check (length(name) between 1 and 120),
  code             text unique check (code is null or code ~ '^[A-Z0-9-]{1,12}$'),
  head_employee_id uuid,        -- foreign key added below
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create sequence public.employee_no_seq start 1;

create table public.employees (
  id              uuid primary key default gen_random_uuid(),
  employee_no     text not null unique default ('EMP-' || lpad(nextval('public.employee_no_seq')::text, 4, '0')),
  profile_id      uuid unique references public.profiles(id) on delete set null,   -- their sign-in account, if they have one
  full_name       text not null check (length(full_name) between 1 and 160),
  work_email      text check (work_email is null or work_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone           text check (phone is null or length(phone) <= 40),
  department_id   uuid references public.departments(id) on delete set null,
  job_title       text check (job_title is null or length(job_title) <= 120),
  manager_id      uuid references public.employees(id) on delete set null,
  employment_type text not null default 'permanent' check (employment_type in ('permanent', 'fixed_term', 'casual', 'intern', 'consultant')),
  status          text not null default 'active' check (status in ('active', 'on_notice', 'left')),
  hire_date       date,
  end_date        date,
  location        text check (location is null or length(location) <= 120),
  notes           text check (notes is null or length(notes) <= 2000),
  created_by      uuid references public.profiles(id) on delete set null,
  deleted_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (manager_id is null or manager_id <> id),
  check (end_date is null or hire_date is null or end_date >= hire_date)
);
create index employees_department_idx on public.employees(department_id);
create index employees_manager_idx on public.employees(manager_id);
create index employees_status_idx on public.employees(status) where deleted_at is null;
alter table public.departments add constraint departments_head_fk foreign key (head_employee_id) references public.employees(id) on delete set null;

-- A reporting line must never loop (A manages B manages A).
create or replace function public.guard_employee_manager()
returns trigger language plpgsql security definer set search_path = public as $$
declare cur uuid := new.manager_id; hops integer := 0;
begin
  while cur is not null loop
    if cur = new.id then raise exception 'That reporting line would make someone their own manager'; end if;
    hops := hops + 1;
    if hops > 50 then raise exception 'Reporting line is too deep'; end if;
    select manager_id into cur from public.employees where id = cur;
  end loop;
  return new;
end;
$$;
create trigger employees_manager_guard before insert or update of manager_id on public.employees
  for each row execute function public.guard_employee_manager();

create trigger departments_updated before update on public.departments for each row execute function public.set_updated_at();
create trigger employees_updated before update on public.employees for each row execute function public.set_updated_at();
create trigger departments_audit after insert or update or delete on public.departments for each row execute function public.audit_row('full');
-- Employee changes are logged by field name only, not value.
create trigger employees_audit after insert or update or delete on public.employees for each row execute function public.audit_row('pii');

create or replace function public.my_employee_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.employees where profile_id = auth.uid() and deleted_at is null limit 1;
$$;

-- ---------------------------------------------------------------------
-- Approval policies (configurable) and steps
-- ---------------------------------------------------------------------
create table public.approval_policies (
  id          uuid primary key default gen_random_uuid(),
  subject     text not null check (subject in ('leave', 'expense', 'bill', 'payroll')),
  name        text not null check (length(name) between 1 and 160),
  min_amount  numeric(16,2) not null default 0 check (min_amount >= 0),
  max_amount  numeric(16,2) check (max_amount is null or max_amount >= min_amount),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index approval_policies_subject_idx on public.approval_policies(subject) where is_active;

create table public.approval_policy_steps (
  id             uuid primary key default gen_random_uuid(),
  policy_id      uuid not null references public.approval_policies(id) on delete cascade,
  step_no        integer not null check (step_no between 1 and 5),
  label          text not null check (length(label) between 1 and 120),
  approver_type  text not null check (approver_type in ('manager', 'department_head', 'permission')),
  permission_key text references public.permissions(key) on update cascade,
  unique (policy_id, step_no),
  check ((approver_type = 'permission') = (permission_key is not null))
);

create trigger approval_policies_updated before update on public.approval_policies for each row execute function public.set_updated_at();
create trigger approval_policies_audit after insert or update or delete on public.approval_policies for each row execute function public.audit_row('full');
create trigger approval_policy_steps_audit after insert or update or delete on public.approval_policy_steps for each row execute function public.audit_row('full');

-- Default policies (editable in Settings > Approval policies). One approver per step; payroll needs two
-- different people, one from HR and one from Finance.
do $$
declare pid uuid;
begin
  insert into public.approval_policies (subject, name) values ('leave', 'Leave: line manager') returning id into pid;
  insert into public.approval_policy_steps (policy_id, step_no, label, approver_type) values (pid, 1, 'Line manager', 'manager');

  insert into public.approval_policies (subject, name) values ('expense', 'Expenses: finance approval') returning id into pid;
  insert into public.approval_policy_steps (policy_id, step_no, label, approver_type, permission_key) values (pid, 1, 'Finance approver', 'permission', 'finance.expense_approve');

  insert into public.approval_policies (subject, name) values ('bill', 'Supplier bills: finance approval') returning id into pid;
  insert into public.approval_policy_steps (policy_id, step_no, label, approver_type, permission_key) values (pid, 1, 'Finance approver', 'permission', 'finance.bill_approve');

  insert into public.approval_policies (subject, name) values ('payroll', 'Payroll: HR then Finance') returning id into pid;
  insert into public.approval_policy_steps (policy_id, step_no, label, approver_type, permission_key) values
    (pid, 1, 'HR approval', 'permission', 'people.payroll_approve'),
    (pid, 2, 'Finance approval', 'permission', 'finance.payroll_approve');
end $$;

-- ---------------------------------------------------------------------
-- Requests and decisions
-- ---------------------------------------------------------------------
create table public.approval_requests (
  id                  uuid primary key default gen_random_uuid(),
  subject             text not null check (subject in ('leave', 'expense', 'bill', 'payroll')),
  record_id           uuid not null,
  policy_id           uuid references public.approval_policies(id) on delete set null,
  steps               jsonb not null,           -- snapshot of the policy steps when the request was made
  current_step        integer not null default 1,
  status              text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  title               text not null check (length(title) <= 200),
  summary             text check (summary is null or length(summary) <= 1000),
  link                text check (link is null or link ~ '^/admin(/|$)'),
  amount              numeric(16,2) not null default 0,
  requested_by        uuid references public.profiles(id) on delete set null,
  subject_employee_id uuid references public.employees(id) on delete set null,   -- whose manager / department head decides
  created_at          timestamptz not null default now(),
  decided_at          timestamptz
);
create unique index approval_requests_open_idx on public.approval_requests(subject, record_id) where status = 'pending';
create index approval_requests_status_idx on public.approval_requests(status, created_at desc);

create table public.approval_decisions (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references public.approval_requests(id) on delete cascade,
  step_no     integer not null,
  decided_by  uuid not null references public.profiles(id) on delete restrict,
  decision    text not null check (decision in ('approved', 'rejected')),
  comment     text check (comment is null or length(comment) <= 1000),
  decided_at  timestamptz not null default now(),
  unique (request_id, step_no)
);

create trigger approval_requests_audit after insert or update or delete on public.approval_requests for each row execute function public.audit_row('full');
create trigger approval_decisions_audit after insert or update or delete on public.approval_decisions for each row execute function public.audit_row('full');

-- ---------------------------------------------------------------------
-- Engine functions (internal ones are not callable through the API)
-- ---------------------------------------------------------------------
-- Who may decide the current step. Excludes the requester, the person the request is about, and
-- anyone who already decided an earlier step. If a manager / department head cannot be found
-- (no reporting line recorded), the step falls back to holders of approvals.manage.
create or replace function public.approval_candidates(p_request uuid)
returns setof uuid language plpgsql stable security definer set search_path = public as $$
declare
  r public.approval_requests%rowtype;
  st jsonb;
  subj_profile uuid;
  cands uuid[] := '{}';
begin
  select * into r from public.approval_requests where id = p_request;
  if not found or r.status <> 'pending' then return; end if;
  select e into st from jsonb_array_elements(r.steps) e where (e ->> 'step_no')::integer = r.current_step;
  if st is null then return; end if;
  select profile_id into subj_profile from public.employees where id = r.subject_employee_id;

  if st ->> 'approver_type' = 'manager' then
    select coalesce(array_agg(m.profile_id), '{}') into cands
    from public.employees e join public.employees m on m.id = e.manager_id
    where e.id = r.subject_employee_id and m.profile_id is not null and m.deleted_at is null;
  elsif st ->> 'approver_type' = 'department_head' then
    select coalesce(array_agg(coalesce(case when d.head_employee_id = e.id then mgr.profile_id else hd.profile_id end, null)), '{}') into cands
    from public.employees e
    join public.departments d on d.id = e.department_id
    left join public.employees hd on hd.id = d.head_employee_id and hd.deleted_at is null
    left join public.employees mgr on mgr.id = e.manager_id and mgr.deleted_at is null
    where e.id = r.subject_employee_id;
    cands := array_remove(cands, null);
  else
    select coalesce(array_agg(x), '{}') into cands from public.auto_recipients(st ->> 'permission_key') x;
  end if;

  if st ->> 'approver_type' <> 'permission' and cardinality(cands) = 0 then
    select coalesce(array_agg(x), '{}') into cands from public.auto_recipients('approvals.manage') x;
  end if;

  return query
    select p from unnest(cands) p
    where p is distinct from r.requested_by and p is distinct from subj_profile
      and not exists (select 1 from public.approval_decisions d where d.request_id = r.id and d.decided_by = p)
      and exists (select 1 from public.profiles pr where pr.id = p and pr.is_active);
end;
$$;

create or replace function public.approval_can_decide(p_request uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.approval_candidates(p_request) c where c = p_user);
$$;

-- (security definer so the read policy on approval_requests does not recurse through approval_decisions)
create or replace function public.approval_user_decided(p_request uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.approval_decisions d where d.request_id = p_request and d.decided_by = p_user);
$$;

-- Starts an approval. Fails closed when no active policy covers the subject and amount.
create or replace function public.approval_submit(
  p_subject text, p_record uuid, p_amount numeric, p_employee uuid, p_requester uuid,
  p_title text, p_summary text, p_link text
) returns uuid language plpgsql security definer set search_path = public as $$
declare pol uuid; stp jsonb; rid uuid; uid uuid;
begin
  select id into pol from public.approval_policies
   where subject = p_subject and is_active and min_amount <= coalesce(p_amount, 0) and (max_amount is null or coalesce(p_amount, 0) <= max_amount)
   order by min_amount desc, created_at limit 1;
  if pol is null then
    raise exception 'No approval policy is set up for this request. Ask an administrator to add one in Settings > Approval policies.';
  end if;
  select jsonb_agg(jsonb_build_object('step_no', s.step_no, 'label', s.label, 'approver_type', s.approver_type, 'permission_key', s.permission_key) order by s.step_no)
    into stp from public.approval_policy_steps s where s.policy_id = pol;
  if stp is null then
    raise exception 'The approval policy has no steps. Ask an administrator to complete it.';
  end if;
  insert into public.approval_requests (subject, record_id, policy_id, steps, title, summary, link, amount, requested_by, subject_employee_id)
  values (p_subject, p_record, pol, stp, left(p_title, 200), left(p_summary, 1000), p_link, coalesce(p_amount, 0), p_requester, p_employee)
  returning id into rid;
  for uid in select public.approval_candidates(rid) loop
    perform public.auto_notify('approval_requests', uid, 'Approval needed: ' || left(p_title, 150), p_summary, '/admin/approvals', 'warning', 'appr:' || rid || ':1');
  end loop;
  return rid;
end;
$$;

-- Applies the outcome to the underlying record. Each subject has its own function, added with its module.
create or replace function public.approval_finish(p_request uuid, p_outcome text)
returns void language plpgsql security definer set search_path = public as $$
declare r public.approval_requests%rowtype; fn text;
begin
  select * into r from public.approval_requests where id = p_request;
  fn := 'approval_apply_' || r.subject;
  if exists (select 1 from pg_proc where proname = fn and pronamespace = 'public'::regnamespace) then
    execute format('select public.%I($1, $2, $3)', fn) using r.record_id, p_outcome, p_request;
  end if;
  if r.requested_by is not null then
    perform public.auto_notify('approval_requests', r.requested_by,
      case p_outcome when 'approved' then 'Approved: ' else 'Not approved: ' end || left(r.title, 150),
      (select string_agg(coalesce(d.comment, ''), ' ') from public.approval_decisions d where d.request_id = r.id and d.decision = 'rejected'),
      coalesce(r.link, '/admin/approvals'), case p_outcome when 'approved' then 'info' else 'warning' end, 'appr-out:' || r.id);
  end if;
end;
$$;

create or replace function public.decide_approval(p_request uuid, p_decision text, p_comment text default null)
returns text language plpgsql security definer set search_path = public as $$
declare r public.approval_requests%rowtype; last_step integer; uid uuid;
begin
  if auth.uid() is null or not public.is_staff() then raise exception 'Not permitted'; end if;
  if p_decision not in ('approved', 'rejected') then raise exception 'Choose approve or reject'; end if;
  select * into r from public.approval_requests where id = p_request for update;
  if not found then raise exception 'Request not found'; end if;
  if r.status <> 'pending' then raise exception 'This request has already been decided'; end if;
  if not public.approval_can_decide(p_request, auth.uid()) then
    raise exception 'You are not an approver for this step, or you are not allowed to approve your own request';
  end if;
  if p_decision = 'rejected' and length(btrim(coalesce(p_comment, ''))) < 3 then
    raise exception 'Please give a reason when rejecting';
  end if;

  insert into public.approval_decisions (request_id, step_no, decided_by, decision, comment)
  values (r.id, r.current_step, auth.uid(), p_decision, nullif(btrim(p_comment), ''));

  if p_decision = 'rejected' then
    update public.approval_requests set status = 'rejected', decided_at = now() where id = r.id;
    perform public.approval_finish(r.id, 'rejected');
    return 'rejected';
  end if;

  select max((e ->> 'step_no')::integer) into last_step from jsonb_array_elements(r.steps) e;
  if r.current_step >= last_step then
    update public.approval_requests set status = 'approved', decided_at = now() where id = r.id;
    perform public.approval_finish(r.id, 'approved');
    return 'approved';
  end if;

  update public.approval_requests set current_step = (
    select min((e ->> 'step_no')::integer) from jsonb_array_elements(r.steps) e where (e ->> 'step_no')::integer > r.current_step
  ) where id = r.id;
  for uid in select public.approval_candidates(r.id) loop
    perform public.auto_notify('approval_requests', uid, 'Approval needed: ' || left(r.title, 150), r.summary, '/admin/approvals', 'warning',
      'appr:' || r.id || ':' || (select current_step from public.approval_requests where id = r.id));
  end loop;
  return 'next_step';
end;
$$;

create or replace function public.cancel_approval(p_request uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r public.approval_requests%rowtype;
begin
  select * into r from public.approval_requests where id = p_request for update;
  if not found or r.status <> 'pending' then raise exception 'Nothing to cancel'; end if;
  if not (r.requested_by = auth.uid() or public.can('approvals.manage', 'approvals')) then raise exception 'Not permitted'; end if;
  update public.approval_requests set status = 'cancelled', decided_at = now() where id = r.id;
  perform public.approval_finish(r.id, 'cancelled');
end;
$$;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.departments            enable row level security;
alter table public.employees              enable row level security;
alter table public.approval_policies      enable row level security;
alter table public.approval_policy_steps  enable row level security;
alter table public.approval_requests     enable row level security;
alter table public.approval_decisions     enable row level security;

revoke all on public.departments, public.employees, public.approval_policies, public.approval_policy_steps,
              public.approval_requests, public.approval_decisions from anon, authenticated;
revoke all on sequence public.employee_no_seq from anon, authenticated;
grant usage on sequence public.employee_no_seq to authenticated;

grant select, insert, update, delete on public.departments, public.employees, public.approval_policies, public.approval_policy_steps to authenticated;
grant select on public.approval_requests, public.approval_decisions to authenticated;

create policy departments_read on public.departments for select to authenticated
  using (public.can('people.view', 'people') or public.can('finance.view', 'finance'));
create policy departments_ins on public.departments for insert to authenticated with check (public.can('people.manage', 'people'));
create policy departments_upd on public.departments for update to authenticated
  using (public.can('people.manage', 'people')) with check (public.can('people.manage', 'people'));
create policy departments_del on public.departments for delete to authenticated using (public.is_super_admin());

create policy employees_read on public.employees for select to authenticated
  using (public.can('people.view', 'people') or (profile_id = auth.uid() and public.module_enabled('people')));
create policy employees_ins on public.employees for insert to authenticated with check (public.can('people.manage', 'people'));
create policy employees_upd on public.employees for update to authenticated
  using (public.can('people.manage', 'people')) with check (public.can('people.manage', 'people'));
create policy employees_del on public.employees for delete to authenticated using (public.is_super_admin());

-- Policies are configuration: every staff member may read them (so they can see who approves what).
create policy approval_policies_read on public.approval_policies for select to authenticated using (public.is_staff());
create policy approval_policies_ins on public.approval_policies for insert to authenticated with check (public.can('approvals.manage', 'approvals'));
create policy approval_policies_upd on public.approval_policies for update to authenticated
  using (public.can('approvals.manage', 'approvals')) with check (public.can('approvals.manage', 'approvals'));
create policy approval_policies_del on public.approval_policies for delete to authenticated using (public.can('approvals.manage', 'approvals'));
create policy approval_steps_read on public.approval_policy_steps for select to authenticated using (public.is_staff());
create policy approval_steps_ins on public.approval_policy_steps for insert to authenticated with check (public.can('approvals.manage', 'approvals'));
create policy approval_steps_upd on public.approval_policy_steps for update to authenticated
  using (public.can('approvals.manage', 'approvals')) with check (public.can('approvals.manage', 'approvals'));
create policy approval_steps_del on public.approval_policy_steps for delete to authenticated using (public.can('approvals.manage', 'approvals'));

-- Requests are visible to: who asked, who it is about, anyone who can decide it now or decided a step,
-- and oversight roles. Nobody writes them directly; only the engine functions do.
create policy approval_requests_read on public.approval_requests for select to authenticated
  using (
    public.is_staff() and (
      requested_by = auth.uid()
      or subject_employee_id = public.my_employee_id()
      or public.approval_can_decide(id, auth.uid())
      or public.approval_user_decided(id, auth.uid())
      or public.can('approvals.view_all', 'approvals') or public.can('approvals.manage', 'approvals')
    )
  );
create policy approval_decisions_read on public.approval_decisions for select to authenticated
  using (exists (select 1 from public.approval_requests r where r.id = request_id));

-- ---------------------------------------------------------------------
-- Automation rule for approval notices, and function privileges
-- ---------------------------------------------------------------------
insert into public.automation_rules (key, name, description, category, kind, module, sort_order) values
  ('approval_requests', 'Approval notices', 'Tells approvers when something is waiting for their decision, and tells the requester the outcome.', 'system', 'event', 'approvals', 95)
on conflict (key) do nothing;

revoke all on function
  public.guard_employee_manager(), public.approval_candidates(uuid), public.approval_can_decide(uuid, uuid),
  public.approval_submit(text, uuid, numeric, uuid, uuid, text, text, text), public.approval_finish(uuid, text)
from public, anon, authenticated;
revoke all on function public.my_employee_id(), public.decide_approval(uuid, text, text), public.cancel_approval(uuid) from public, anon;
-- approval_can_decide is used inside the read policy on approval_requests, so signed-in users need execute on it.
revoke all on function public.approval_can_decide(uuid, uuid), public.approval_user_decided(uuid, uuid) from public, anon;
grant execute on function public.my_employee_id(), public.decide_approval(uuid, text, text), public.cancel_approval(uuid), public.approval_can_decide(uuid, uuid), public.approval_user_decided(uuid, uuid) to authenticated;
