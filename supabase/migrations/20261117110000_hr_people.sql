-- =====================================================================
-- 0016 HUMAN RESOURCES (module `people`, ships DISABLED)
-- Employee records live in 0015. This adds: compensation, contracts, leave, attendance, onboarding,
-- recruitment, payroll records and performance reviews.
--
-- Privacy and safety rules built into the database:
--  * No national ID, tax PIN, bank account or health data is stored anywhere.
--  * Salary data (people.compensation) and payroll (people.payroll_*) are separate permissions from
--    ordinary HR access. An HR officer cannot see pay.
--  * Changes to personal or pay data are written to the activity log by field name only, never value.
--  * Leave, payroll and their statuses can only be changed through the approval engine or the
--    functions below. Signed-in users have no direct UPDATE right on those statuses.
--  * Payroll is a RECORD. Nothing here pays anyone. "Paid" can only be recorded after both approvals,
--    and never by the person who prepared the run.
--  * Statutory deductions (PAYE, NSSF, SHIF, housing levy ...) are NOT calculated: rates change and
--    must be confirmed with your adviser, so deductions are entered by a person.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Extra permission and role wiring
-- ---------------------------------------------------------------------
insert into public.permissions (key, module, description) values
  ('people.self', 'people', 'Use "My HR": own leave, attendance, onboarding tasks and reviews')
on conflict (key) do nothing;

-- Every existing non-super role can use self-service. (New roles are not given it automatically.)
insert into public.role_permissions (role_id, permission_key)
select r.id, 'people.self' from public.roles r where not r.is_super
on conflict do nothing;

create or replace function public.count_weekdays(p_from date, p_to date)
returns integer language sql immutable set search_path = public as $$
  select count(*)::integer from generate_series(p_from, p_to, interval '1 day') d where extract(isodow from d) < 6;
$$;

create or replace function public.is_manager_of(p_employee uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.employees e where e.id = p_employee and e.manager_id is not null and e.manager_id = public.my_employee_id());
$$;

-- ---------------------------------------------------------------------
-- Compensation (sensitive)
-- ---------------------------------------------------------------------
create table public.employee_compensation (
  employee_id    uuid primary key references public.employees(id) on delete cascade,
  currency       text not null default 'KES' check (currency ~ '^[A-Z]{3}$'),
  basic_salary   numeric(14,2) not null check (basic_salary >= 0),
  allowances     numeric(14,2) not null default 0 check (allowances >= 0),
  pay_frequency  text not null default 'monthly' check (pay_frequency in ('monthly', 'weekly', 'daily')),
  effective_from date,
  notes          text check (notes is null or length(notes) <= 1000),
  updated_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Contracts (details only; the signed document goes in restricted document storage)
-- ---------------------------------------------------------------------
create table public.employment_contracts (
  id             uuid primary key default gen_random_uuid(),
  employee_id    uuid not null references public.employees(id) on delete restrict,
  contract_type  text not null default 'permanent' check (contract_type in ('permanent', 'fixed_term', 'casual', 'internship', 'consultancy')),
  title          text check (title is null or length(title) <= 160),
  start_date     date not null,
  end_date       date,
  probation_end_date date,
  status         text not null default 'active' check (status in ('draft', 'active', 'expired', 'terminated')),
  notes          text check (notes is null or length(notes) <= 2000),
  created_by     uuid references public.profiles(id) on delete set null,
  deleted_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (end_date is null or end_date >= start_date),
  check (probation_end_date is null or probation_end_date >= start_date)
);
create index employment_contracts_employee_idx on public.employment_contracts(employee_id);
create index employment_contracts_end_idx on public.employment_contracts(end_date) where deleted_at is null and status = 'active';

-- ---------------------------------------------------------------------
-- Leave
-- ---------------------------------------------------------------------
create table public.leave_types (
  id                uuid primary key default gen_random_uuid(),
  name              text not null unique check (length(name) between 1 and 80),
  days_per_year     numeric(5,1) not null default 0 check (days_per_year between 0 and 366),   -- 0 = no fixed limit
  is_paid           boolean not null default true,
  requires_approval boolean not null default true,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table public.leave_requests (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.employees(id) on delete restrict,
  leave_type_id uuid not null references public.leave_types(id) on delete restrict,
  start_date    date not null,
  end_date      date not null,
  days          numeric(5,1) not null default 0,     -- working days (Mon-Fri); public holidays are not subtracted
  reason        text check (reason is null or length(reason) <= 1000),
  status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (end_date >= start_date)
);
create index leave_requests_employee_idx on public.leave_requests(employee_id, start_date);
create index leave_requests_status_idx on public.leave_requests(status);

create or replace function public.guard_leave_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare lt public.leave_types%rowtype; used numeric;
begin
  new.status := 'pending';
  new.created_by := auth.uid();
  new.days := public.count_weekdays(new.start_date, new.end_date);
  if new.days < 1 then raise exception 'Those dates contain no working days'; end if;
  select * into lt from public.leave_types where id = new.leave_type_id;
  if not found or not lt.is_active then raise exception 'That leave type is not available'; end if;
  if exists (select 1 from public.employees e where e.id = new.employee_id and (e.deleted_at is not null or e.status = 'left')) then
    raise exception 'This employee is no longer active';
  end if;
  if exists (select 1 from public.leave_requests o where o.employee_id = new.employee_id and o.status in ('pending', 'approved')
             and o.start_date <= new.end_date and o.end_date >= new.start_date) then
    raise exception 'This overlaps leave that is already requested or approved';
  end if;
  if lt.days_per_year > 0 then
    select coalesce(sum(days), 0) into used from public.leave_requests o
     where o.employee_id = new.employee_id and o.leave_type_id = new.leave_type_id and o.status in ('pending', 'approved')
       and extract(year from o.start_date) = extract(year from new.start_date);
    if used + new.days > lt.days_per_year then
      raise exception 'This would exceed the % days a year allowed for % (already used or requested: %)', lt.days_per_year, lt.name, used;
    end if;
  end if;
  if not lt.requires_approval then new.status := 'approved'; end if;
  return new;
end;
$$;
create trigger leave_requests_guard before insert on public.leave_requests for each row execute function public.guard_leave_insert();

create or replace function public.trg_leave_submit()
returns trigger language plpgsql security definer set search_path = public as $$
declare emp public.employees%rowtype; lt text;
begin
  if new.status <> 'pending' then return new; end if;
  select * into emp from public.employees where id = new.employee_id;
  select name into lt from public.leave_types where id = new.leave_type_id;
  -- Not wrapped in an exception block on purpose: with no approval policy the request must fail, not slip through.
  perform public.approval_submit('leave', new.id, new.days, new.employee_id, coalesce(auth.uid(), emp.profile_id),
    'Leave: ' || emp.full_name || ', ' || new.days || ' day(s)',
    lt || ' from ' || to_char(new.start_date, 'DD Mon YYYY') || ' to ' || to_char(new.end_date, 'DD Mon YYYY') || coalesce('. ' || new.reason, ''),
    '/admin/people/leave');
  return new;
end;
$$;
create trigger leave_requests_submit after insert on public.leave_requests for each row execute function public.trg_leave_submit();

create or replace function public.approval_apply_leave(p_record uuid, p_outcome text, p_request uuid)
returns void language plpgsql security definer set search_path = public as $$
declare emp public.employees%rowtype; lr public.leave_requests%rowtype;
begin
  update public.leave_requests set status = p_outcome where id = p_record and status = 'pending'
    returning * into lr;
  if lr.id is null then return; end if;
  select * into emp from public.employees where id = lr.employee_id;
  if emp.profile_id is not null and p_outcome in ('approved', 'rejected') then
    perform public.auto_notify('hr_leave_notices', emp.profile_id,
      'Your leave was ' || p_outcome, to_char(lr.start_date, 'DD Mon YYYY') || ' to ' || to_char(lr.end_date, 'DD Mon YYYY'),
      '/admin/people/me', case when p_outcome = 'approved' then 'info' else 'warning' end, 'leave-out:' || lr.id);
  end if;
  if p_outcome = 'approved' then
    perform public.auto_notify_perm('hr_leave_notices', 'people.manage', null, 'Leave approved: ' || emp.full_name,
      to_char(lr.start_date, 'DD Mon YYYY') || ' to ' || to_char(lr.end_date, 'DD Mon YYYY') || ' (' || lr.days || ' days)', '/admin/people/leave', 'info', 'leave-hr:' || lr.id);
  end if;
end;
$$;

create or replace function public.cancel_leave_request(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare lr public.leave_requests%rowtype; rid uuid;
begin
  select * into lr from public.leave_requests where id = p_id for update;
  if not found then raise exception 'Not found'; end if;
  if not (lr.employee_id = public.my_employee_id() or public.can('people.manage', 'people')) then raise exception 'Not permitted'; end if;
  if lr.status not in ('pending', 'approved') then raise exception 'Only pending or approved leave can be cancelled'; end if;
  if lr.status = 'approved' and lr.start_date <= current_date and not public.can('people.manage', 'people') then
    raise exception 'Leave that has already started can only be cancelled by HR';
  end if;
  select id into rid from public.approval_requests where subject = 'leave' and record_id = p_id and status = 'pending';
  if rid is not null then
    update public.approval_requests set status = 'cancelled', decided_at = now() where id = rid;
  end if;
  update public.leave_requests set status = 'cancelled' where id = p_id;
end;
$$;

create or replace view public.leave_balances with (security_invoker = true) as
select e.id as employee_id, lt.id as leave_type_id, y.year,
       lt.days_per_year as entitlement,
       coalesce(sum(lr.days) filter (where lr.status = 'approved'), 0)::numeric(6,1) as taken,
       coalesce(sum(lr.days) filter (where lr.status = 'pending'), 0)::numeric(6,1) as pending,
       case when lt.days_per_year > 0 then (lt.days_per_year - coalesce(sum(lr.days) filter (where lr.status in ('approved', 'pending')), 0))::numeric(6,1) end as remaining
from public.employees e
cross join public.leave_types lt
cross join (select extract(year from now() at time zone 'Africa/Nairobi')::integer as year) y
left join public.leave_requests lr on lr.employee_id = e.id and lr.leave_type_id = lt.id and extract(year from lr.start_date) = y.year
where e.deleted_at is null and e.status <> 'left' and lt.is_active
group by e.id, lt.id, y.year, lt.days_per_year;

-- ---------------------------------------------------------------------
-- Attendance
-- ---------------------------------------------------------------------
create table public.attendance_records (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  work_date   date not null,
  check_in    timestamptz,
  check_out   timestamptz,
  status      text not null default 'present' check (status in ('present', 'late', 'absent', 'remote', 'half_day', 'on_leave')),
  source      text not null default 'manual' check (source in ('manual', 'self')),
  note        text check (note is null or length(note) <= 500),
  recorded_by uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (employee_id, work_date),
  check (check_out is null or check_in is null or check_out >= check_in)
);
create index attendance_date_idx on public.attendance_records(work_date);

-- Staff record their own arrival and departure. "Late" uses the work start time set in the Control Centre.
create or replace function public.clock_in()
returns text language plpgsql security definer set search_path = public as $$
declare emp uuid := public.my_employee_id(); today date := (now() at time zone 'Africa/Nairobi')::date;
        start_h numeric := public.auto_param('hr_attendance_alerts', 'work_start_hour', 8);
        grace numeric := public.auto_param('hr_attendance_alerts', 'grace_minutes', 15);
        local_now timestamp := now() at time zone 'Africa/Nairobi'; st text;
begin
  if emp is null or not public.can('people.self', 'people') then raise exception 'No employee record is linked to your account'; end if;
  st := case when local_now > date_trunc('day', local_now) + (start_h * interval '1 hour') + (grace * interval '1 minute') then 'late' else 'present' end;
  insert into public.attendance_records (employee_id, work_date, check_in, status, source, recorded_by)
  values (emp, today, now(), st, 'self', auth.uid())
  on conflict (employee_id, work_date) do nothing;
  if not found then raise exception 'You have already checked in today'; end if;
  return st;
end;
$$;

create or replace function public.clock_out()
returns void language plpgsql security definer set search_path = public as $$
declare emp uuid := public.my_employee_id(); today date := (now() at time zone 'Africa/Nairobi')::date;
begin
  if emp is null or not public.can('people.self', 'people') then raise exception 'No employee record is linked to your account'; end if;
  update public.attendance_records set check_out = now() where employee_id = emp and work_date = today and check_in is not null and check_out is null;
  if not found then raise exception 'Check in first, or you have already checked out'; end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Onboarding (generic, editable starting checklist)
-- ---------------------------------------------------------------------
create table public.onboarding_templates (
  id          uuid primary key default gen_random_uuid(),
  label       text not null unique check (length(label) between 1 and 200),
  due_days    integer not null default 7 check (due_days between 0 and 365),   -- days after hire date
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
create table public.onboarding_tasks (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  label       text not null check (length(label) between 1 and 300),
  due_date    date,
  is_done     boolean not null default false,
  done_at     timestamptz,
  done_by     uuid references public.profiles(id) on delete set null,
  source      text not null default 'template' check (source in ('template', 'manual')),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  unique (employee_id, label)
);
create index onboarding_tasks_employee_idx on public.onboarding_tasks(employee_id);

insert into public.onboarding_templates (label, due_days, sort_order) values
  ('Employment contract signed and filed', 0, 10),
  ('Work email and system access set up', 1, 20),
  ('Equipment and tools issued', 1, 30),
  ('Orientation and introduction to the team', 3, 40),
  ('Company policies shared and acknowledged', 7, 50),
  ('Probation or first review date agreed', 14, 60)
on conflict (label) do nothing;

create or replace function public.guard_onboarding_done()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.is_done and (tg_op = 'INSERT' or not old.is_done) then new.done_at := now(); new.done_by := auth.uid();
  elsif not new.is_done then new.done_at := null; new.done_by := null; end if;
  return new;
end;
$$;
create trigger onboarding_tasks_done before insert or update on public.onboarding_tasks for each row execute function public.guard_onboarding_done();

create or replace function public.auto_generate_onboarding(p_employee uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare e public.employees%rowtype; n integer;
begin
  select * into e from public.employees where id = p_employee and deleted_at is null;
  if not found then return 0; end if;
  insert into public.onboarding_tasks (employee_id, label, due_date, sort_order)
  select e.id, t.label, coalesce(e.hire_date, current_date) + t.due_days, t.sort_order from public.onboarding_templates t where t.is_active
  on conflict (employee_id, label) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.generate_onboarding(p_employee uuid)
returns integer language plpgsql security definer set search_path = public as $$
begin
  if not public.can('people.manage', 'people') then raise exception 'Not permitted'; end if;
  return public.auto_generate_onboarding(p_employee);
end;
$$;

create or replace function public.trg_employee_onboarding()
returns trigger language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not public.auto_rule_active('hr_onboarding') then return new; end if;
  n := public.auto_generate_onboarding(new.id);
  if n > 0 then
    perform public.auto_notify_perm('hr_onboarding', 'people.manage', null, 'Onboarding started: ' || new.full_name,
      n || ' tasks created.' || coalesce(' Starts ' || to_char(new.hire_date, 'DD Mon YYYY') || '.', ''), '/admin/people/onboarding', 'info', 'onb:' || new.id);
    if (select manager_id from public.employees where id = new.id) is not null then
      perform public.auto_notify('hr_onboarding', (select m.profile_id from public.employees m where m.id = new.manager_id),
        'New team member: ' || new.full_name, coalesce(new.job_title, ''), '/admin/people/me', 'info', 'onb-mgr:' || new.id);
    end if;
    perform public.auto_record_event('hr_onboarding', n);
  end if;
  return new;
exception when others then
  perform public.auto_record_failure('hr_onboarding', sqlerrm);
  return new;
end;
$$;
create trigger employees_auto_onboarding after insert on public.employees for each row execute function public.trg_employee_onboarding();

-- ---------------------------------------------------------------------
-- Recruitment (internal hiring; separate from the client-facing HR Outsourcing module)
-- ---------------------------------------------------------------------
create sequence public.job_opening_ref_seq start 1001;
create table public.job_openings (
  id            uuid primary key default gen_random_uuid(),
  reference     text not null unique default ('JOB-' || nextval('public.job_opening_ref_seq')),
  title         text not null check (length(title) between 1 and 160),
  department_id uuid references public.departments(id) on delete set null,
  headcount     integer not null default 1 check (headcount between 1 and 1000),
  status        text not null default 'draft' check (status in ('draft', 'open', 'on_hold', 'filled', 'closed')),
  closing_date  date,
  description   text check (description is null or length(description) <= 4000),
  created_by    uuid references public.profiles(id) on delete set null,
  deleted_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create table public.job_applicants (
  id            uuid primary key default gen_random_uuid(),
  opening_id    uuid not null references public.job_openings(id) on delete restrict,
  full_name     text not null check (length(full_name) between 1 and 160),
  email         text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone         text check (phone is null or length(phone) <= 40),
  stage         text not null default 'applied' check (stage in ('applied', 'screening', 'interview', 'offer', 'hired', 'rejected', 'withdrawn')),
  source        text check (source is null or length(source) <= 200),
  consent_recorded boolean not null default false,
  consent_date  date,
  retention_review_date date,
  notes         text check (notes is null or length(notes) <= 3000),
  created_by    uuid references public.profiles(id) on delete set null,
  deleted_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint job_applicants_consent check (not consent_recorded or consent_date is not null)
);
create index job_applicants_opening_idx on public.job_applicants(opening_id);

-- Turns a hired applicant into an employee record (no CV, ID or bank data is copied: there is none).
create or replace function public.hire_applicant(p_applicant uuid, p_hire_date date)
returns uuid language plpgsql security definer set search_path = public as $$
declare a public.job_applicants%rowtype; o public.job_openings%rowtype; emp uuid;
begin
  if not public.can('people.manage', 'people') then raise exception 'Not permitted'; end if;
  select * into a from public.job_applicants where id = p_applicant and deleted_at is null for update;
  if not found then raise exception 'Applicant not found'; end if;
  if a.stage = 'hired' then raise exception 'This applicant has already been hired'; end if;
  if not a.consent_recorded then raise exception 'Record the applicant''s consent before creating an employee record'; end if;
  select * into o from public.job_openings where id = a.opening_id;
  insert into public.employees (full_name, work_email, phone, department_id, job_title, hire_date, created_by)
  values (a.full_name, a.email, a.phone, o.department_id, o.title, p_hire_date, auth.uid()) returning id into emp;
  update public.job_applicants set stage = 'hired' where id = a.id;
  return emp;
end;
$$;

-- ---------------------------------------------------------------------
-- Payroll records (approval required; nothing is ever paid by this system)
-- ---------------------------------------------------------------------
create table public.payroll_runs (
  id            uuid primary key default gen_random_uuid(),
  reference     text not null unique,
  period_start  date not null,
  period_end    date not null,
  currency      text not null default 'KES' check (currency ~ '^[A-Z]{3}$'),
  status        text not null default 'draft' check (status in ('draft', 'pending_approval', 'approved', 'paid_recorded', 'cancelled')),
  notes         text check (notes is null or length(notes) <= 1000),
  prepared_by   uuid references public.profiles(id) on delete set null,
  approved_at   timestamptz,
  paid_on       date,
  payment_reference text check (payment_reference is null or length(payment_reference) <= 120),
  paid_recorded_by uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (period_end >= period_start)
);
create unique index payroll_runs_period_idx on public.payroll_runs(period_start, period_end) where status <> 'cancelled';

create table public.payroll_lines (
  id          uuid primary key default gen_random_uuid(),
  run_id      uuid not null references public.payroll_runs(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete restrict,
  gross_pay   numeric(14,2) not null check (gross_pay >= 0),
  deductions  numeric(14,2) not null default 0 check (deductions >= 0),
  net_pay     numeric(14,2) generated always as (gross_pay - deductions) stored,
  note        text check (note is null or length(note) <= 500),
  created_at  timestamptz not null default now(),
  unique (run_id, employee_id),
  check (deductions <= gross_pay)
);

create or replace view public.payroll_run_totals with (security_invoker = true) as
select r.id as run_id, count(l.id)::integer as lines,
       coalesce(sum(l.gross_pay), 0)::numeric(16,2) as gross, coalesce(sum(l.deductions), 0)::numeric(16,2) as deductions, coalesce(sum(l.net_pay), 0)::numeric(16,2) as net
from public.payroll_runs r left join public.payroll_lines l on l.run_id = r.id group by r.id;

create or replace function public.next_payroll_reference(p_start date)
returns text language sql immutable set search_path = public as $$ select 'PAY-' || to_char(p_start, 'YYYY-MM'); $$;

create or replace function public.guard_payroll_run()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.status := 'draft'; new.prepared_by := auth.uid();
    new.reference := coalesce(nullif(new.reference, ''), public.next_payroll_reference(new.period_start));
    return new;
  end if;
  -- (SECURITY INVOKER on purpose: current_user is then the real session role, so engine functions are allowed through)
  -- Signed-in users cannot move a run through its statuses directly; only the functions below can.
  if new.status is distinct from old.status and current_user in ('authenticated', 'anon') then
    raise exception 'Payroll status can only be changed through the approval process';
  end if;
  if old.status <> 'draft' and current_user in ('authenticated', 'anon') then
    raise exception 'This payroll run is no longer a draft and cannot be edited';
  end if;
  return new;
end;
$$;
create trigger payroll_runs_guard before insert or update on public.payroll_runs for each row execute function public.guard_payroll_run();

create or replace function public.guard_payroll_lines()
returns trigger language plpgsql security definer set search_path = public as $$
declare rid uuid := case when tg_op = 'DELETE' then old.run_id else new.run_id end; st text;
begin
  select status into st from public.payroll_runs where id = rid;
  if st <> 'draft' then raise exception 'Payroll lines can only be changed while the run is a draft'; end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
create trigger payroll_lines_guard before insert or update or delete on public.payroll_lines for each row execute function public.guard_payroll_lines();

-- One line per active employee that has compensation recorded. Deductions start at zero: a person must enter them.
create or replace function public.payroll_generate_lines(p_run uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer; r public.payroll_runs%rowtype;
begin
  if not public.can('people.payroll_prepare', 'people') then raise exception 'Not permitted'; end if;
  select * into r from public.payroll_runs where id = p_run;
  if not found or r.status <> 'draft' then raise exception 'Only a draft run can be filled in'; end if;
  insert into public.payroll_lines (run_id, employee_id, gross_pay, note)
  select r.id, c.employee_id, c.basic_salary + c.allowances, 'From recorded compensation. Enter deductions.'
  from public.employee_compensation c join public.employees e on e.id = c.employee_id
  where e.deleted_at is null and e.status <> 'left' and c.currency = r.currency
  on conflict (run_id, employee_id) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.submit_payroll_run(p_run uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare r public.payroll_runs%rowtype; t record; rid uuid;
begin
  if not public.can('people.payroll_prepare', 'people') then raise exception 'Not permitted'; end if;
  select * into r from public.payroll_runs where id = p_run for update;
  if not found or r.status <> 'draft' then raise exception 'Only a draft run can be submitted'; end if;
  select * into t from public.payroll_run_totals where run_id = p_run;
  if t.lines = 0 then raise exception 'Add at least one payroll line first'; end if;
  rid := public.approval_submit('payroll', r.id, t.gross, null, auth.uid(),
    'Payroll ' || r.reference, t.lines || ' employees, gross ' || r.currency || ' ' || t.gross || ', net ' || r.currency || ' ' || t.net, '/admin/people/payroll');
  update public.payroll_runs set status = 'pending_approval' where id = p_run;
  return rid;
end;
$$;

create or replace function public.approval_apply_payroll(p_record uuid, p_outcome text, p_request uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_outcome = 'approved' then
    update public.payroll_runs set status = 'approved', approved_at = now() where id = p_record and status = 'pending_approval';
  else   -- rejected or cancelled: back to draft so it can be corrected and resubmitted
    update public.payroll_runs set status = 'draft' where id = p_record and status = 'pending_approval';
  end if;
end;
$$;

-- Recording that the payment was made OUTSIDE this system (bank, M-Pesa ...). Needs the Finance approver
-- permission, and never the person who prepared the run.
create or replace function public.record_payroll_paid(p_run uuid, p_reference text, p_paid_on date)
returns void language plpgsql security definer set search_path = public as $$
declare r public.payroll_runs%rowtype;
begin
  if not public.can('finance.payroll_approve', 'finance') then raise exception 'Not permitted'; end if;
  select * into r from public.payroll_runs where id = p_run for update;
  if not found or r.status <> 'approved' then raise exception 'Only an approved payroll run can be recorded as paid'; end if;
  if r.prepared_by = auth.uid() then raise exception 'The person who prepared the payroll cannot record it as paid'; end if;
  if length(btrim(coalesce(p_reference, ''))) < 3 then raise exception 'Enter the payment reference from your bank or payment provider'; end if;
  update public.payroll_runs set status = 'paid_recorded', paid_on = coalesce(p_paid_on, current_date),
         payment_reference = left(btrim(p_reference), 120), paid_recorded_by = auth.uid() where id = p_run;
end;
$$;

-- ---------------------------------------------------------------------
-- Performance reviews (sensitive)
-- ---------------------------------------------------------------------
create table public.performance_reviews (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.employees(id) on delete restrict,
  reviewer_id   uuid references public.profiles(id) on delete set null,
  period_label  text not null check (length(period_label) between 1 and 60),
  review_date   date,
  rating        smallint check (rating is null or rating between 1 and 5),
  strengths     text check (strengths is null or length(strengths) <= 3000),
  improvements  text check (improvements is null or length(improvements) <= 3000),
  goals         text check (goals is null or length(goals) <= 3000),
  status        text not null default 'draft' check (status in ('draft', 'submitted', 'acknowledged')),
  acknowledged_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (employee_id, period_label)
);

create or replace function public.guard_review()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then new.reviewer_id := auth.uid(); new.status := 'draft'; return new; end if;
  if current_user in ('authenticated', 'anon') then
    if new.status is distinct from old.status and not (old.status = 'draft' and new.status = 'submitted') then
      raise exception 'Reviews move from draft to submitted here; the employee acknowledges it themselves';
    end if;
    if old.status <> 'draft' then raise exception 'A submitted review can no longer be edited'; end if;
    if new.employee_id is distinct from old.employee_id then raise exception 'The employee on a review cannot be changed'; end if;
  end if;
  return new;
end;
$$;
create trigger performance_reviews_guard before insert or update on public.performance_reviews for each row execute function public.guard_review();

create or replace function public.acknowledge_review(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.performance_reviews set status = 'acknowledged', acknowledged_at = now()
   where id = p_id and status = 'submitted' and employee_id = public.my_employee_id();
  if not found then raise exception 'Nothing to acknowledge'; end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Triggers: updated_at and activity log
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['employee_compensation', 'employment_contracts', 'leave_types', 'leave_requests', 'attendance_records',
                           'job_openings', 'job_applicants', 'payroll_runs', 'performance_reviews'] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_updated', t);
  end loop;
  foreach t in array array['employment_contracts', 'leave_types', 'leave_requests', 'attendance_records', 'onboarding_templates', 'onboarding_tasks', 'job_openings', 'payroll_runs'] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_row(%L)', t || '_audit', t, 'full');
  end loop;
  -- values never copied into the log
  foreach t in array array['employee_compensation', 'job_applicants', 'payroll_lines', 'performance_reviews'] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_row(%L)', t || '_audit', t, 'pii');
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['employee_compensation', 'employment_contracts', 'leave_types', 'leave_requests', 'attendance_records',
                           'onboarding_templates', 'onboarding_tasks', 'job_openings', 'job_applicants', 'payroll_runs', 'payroll_lines', 'performance_reviews'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
revoke all on sequence public.job_opening_ref_seq from anon, authenticated;
grant usage on sequence public.job_opening_ref_seq to authenticated;

-- compensation: only people.compensation
grant select, insert, update on public.employee_compensation to authenticated;
create policy comp_read on public.employee_compensation for select to authenticated using (public.can('people.compensation', 'people'));
create policy comp_ins  on public.employee_compensation for insert to authenticated with check (public.can('people.compensation', 'people'));
create policy comp_upd  on public.employee_compensation for update to authenticated using (public.can('people.compensation', 'people')) with check (public.can('people.compensation', 'people'));

-- contracts, openings, applicants, onboarding templates/tasks: HR
grant select, insert, update on public.employment_contracts, public.job_openings, public.job_applicants to authenticated;
grant select, insert, update, delete on public.onboarding_templates to authenticated;
grant select, insert, update on public.onboarding_tasks to authenticated;
create policy contracts_read on public.employment_contracts for select to authenticated using (public.can('people.view', 'people'));
create policy contracts_ins  on public.employment_contracts for insert to authenticated with check (public.can('people.manage', 'people'));
create policy contracts_upd  on public.employment_contracts for update to authenticated using (public.can('people.manage', 'people')) with check (public.can('people.manage', 'people'));
create policy openings_read on public.job_openings for select to authenticated using (public.can('people.view', 'people'));
create policy openings_ins  on public.job_openings for insert to authenticated with check (public.can('people.manage', 'people'));
create policy openings_upd  on public.job_openings for update to authenticated using (public.can('people.manage', 'people')) with check (public.can('people.manage', 'people'));
create policy applicants_read on public.job_applicants for select to authenticated using (public.can('people.view', 'people'));
create policy applicants_ins  on public.job_applicants for insert to authenticated with check (public.can('people.manage', 'people'));
create policy applicants_upd  on public.job_applicants for update to authenticated using (public.can('people.manage', 'people')) with check (public.can('people.manage', 'people'));
create policy onb_tpl_read on public.onboarding_templates for select to authenticated using (public.can('people.view', 'people'));
create policy onb_tpl_ins  on public.onboarding_templates for insert to authenticated with check (public.can('people.manage', 'people'));
create policy onb_tpl_upd  on public.onboarding_templates for update to authenticated using (public.can('people.manage', 'people')) with check (public.can('people.manage', 'people'));
create policy onb_tpl_del  on public.onboarding_templates for delete to authenticated using (public.can('people.manage', 'people'));
create policy onb_read on public.onboarding_tasks for select to authenticated
  using (public.can('people.view', 'people') or (employee_id = public.my_employee_id() and public.can('people.self', 'people')));
create policy onb_ins on public.onboarding_tasks for insert to authenticated with check (public.can('people.manage', 'people'));
create policy onb_upd on public.onboarding_tasks for update to authenticated
  using (public.can('people.manage', 'people')) with check (public.can('people.manage', 'people'));

-- leave: types by HR; requests are created (never edited) by the employee or HR
grant select, insert, update on public.leave_types to authenticated;
grant select on public.leave_requests to authenticated;
grant insert (employee_id, leave_type_id, start_date, end_date, reason) on public.leave_requests to authenticated;
create policy leave_types_read on public.leave_types for select to authenticated using (public.can('people.self', 'people') or public.can('people.view', 'people'));
create policy leave_types_ins  on public.leave_types for insert to authenticated with check (public.can('people.manage', 'people'));
create policy leave_types_upd  on public.leave_types for update to authenticated using (public.can('people.manage', 'people')) with check (public.can('people.manage', 'people'));
create policy leave_read on public.leave_requests for select to authenticated
  using (public.can('people.view', 'people') or public.is_manager_of(employee_id)
         or (employee_id = public.my_employee_id() and public.can('people.self', 'people')));
create policy leave_ins on public.leave_requests for insert to authenticated
  with check (public.can('people.manage', 'people') or (employee_id = public.my_employee_id() and public.can('people.self', 'people')));

-- attendance: HR enters/edits; employees read their own and use clock_in()/clock_out()
grant select, insert, update on public.attendance_records to authenticated;
create policy attendance_read on public.attendance_records for select to authenticated
  using (public.can('people.view', 'people') or (employee_id = public.my_employee_id() and public.can('people.self', 'people')));
create policy attendance_ins on public.attendance_records for insert to authenticated with check (public.can('people.manage', 'people'));
create policy attendance_upd on public.attendance_records for update to authenticated using (public.can('people.manage', 'people')) with check (public.can('people.manage', 'people'));

-- payroll: preparers and the two approvers
grant select, insert, update on public.payroll_runs to authenticated;
grant select, insert, update, delete on public.payroll_lines to authenticated;
create policy payroll_runs_read on public.payroll_runs for select to authenticated
  using (public.can('people.payroll_prepare', 'people') or public.can('people.payroll_approve', 'people') or public.can('finance.payroll_approve', 'finance'));
create policy payroll_runs_ins on public.payroll_runs for insert to authenticated with check (public.can('people.payroll_prepare', 'people'));
create policy payroll_runs_upd on public.payroll_runs for update to authenticated
  using (public.can('people.payroll_prepare', 'people')) with check (public.can('people.payroll_prepare', 'people'));
create policy payroll_lines_read on public.payroll_lines for select to authenticated
  using (public.can('people.payroll_prepare', 'people') or public.can('people.payroll_approve', 'people') or public.can('finance.payroll_approve', 'finance'));
create policy payroll_lines_ins on public.payroll_lines for insert to authenticated with check (public.can('people.payroll_prepare', 'people'));
create policy payroll_lines_upd on public.payroll_lines for update to authenticated
  using (public.can('people.payroll_prepare', 'people')) with check (public.can('people.payroll_prepare', 'people'));
create policy payroll_lines_del on public.payroll_lines for delete to authenticated using (public.can('people.payroll_prepare', 'people'));

-- reviews: reviewers (people.reviews, or the employee's manager) write; the employee reads submitted ones
grant select, insert, update on public.performance_reviews to authenticated;
create policy reviews_read on public.performance_reviews for select to authenticated
  using (public.can('people.reviews', 'people') or reviewer_id = auth.uid()
         or (employee_id = public.my_employee_id() and status <> 'draft' and public.can('people.self', 'people')));
create policy reviews_ins on public.performance_reviews for insert to authenticated
  with check (public.can('people.reviews', 'people') or (public.is_manager_of(employee_id) and public.can('people.self', 'people')));
create policy reviews_upd on public.performance_reviews for update to authenticated
  using (public.can('people.reviews', 'people') or reviewer_id = auth.uid())
  with check (public.can('people.reviews', 'people') or reviewer_id = auth.uid());

grant select on public.leave_balances, public.payroll_run_totals to authenticated;

-- ---------------------------------------------------------------------
-- HR automations (rows in the existing Control Centre)
-- ---------------------------------------------------------------------
insert into public.automation_rules (key, name, description, category, kind, module, schedule_minutes, params, params_help, sort_order) values
  ('hr_leave_notices',   'Leave notifications', 'Tells staff when their leave is approved or rejected, and tells HR when leave is approved. (Approvers are notified by the approval process.)', 'system', 'event', 'people', null, '{}', '{}', 100),
  ('hr_onboarding',      'Onboarding tasks for new employees', 'Creates the onboarding checklist when an employee record is added, and tells HR and the line manager.', 'system', 'event', 'people', null, '{}', '{}', 101),
  ('hr_contract_expiry', 'Contract and probation reminders', 'Reminds HR before a contract ends and before a probation period ends.', 'system', 'scheduled', 'people', 1440, '{"days_1": 60, "days_2": 30, "days_3": 7, "probation_days": 14}', '{"days_1": "First contract reminder, days before the end date", "days_2": "Second reminder, days before", "days_3": "Final reminder, days before", "probation_days": "Remind this many days before probation ends"}', 102),
  ('hr_attendance_alerts', 'Attendance alerts', 'Once the working day has started, tells HR how many employees have not checked in and who arrived late. Only active once people are using check-in.', 'system', 'scheduled', 'people', 60, '{"work_start_hour": 8, "grace_minutes": 15, "alert_after_minutes": 60}', '{"work_start_hour": "Working day starts at this hour (Nairobi time)", "grace_minutes": "Minutes of grace before arrival counts as late", "alert_after_minutes": "Send the alert this many minutes after the start"}', 103),
  ('hr_payroll_reminder', 'Payroll preparation reminder', 'Reminds payroll preparers to prepare the month''s payroll if no run exists yet.', 'system', 'scheduled', 'people', 1440, '{"reminder_day": 25}', '{"reminder_day": "Day of the month to remind (1-28)"}', 104)
on conflict (key) do nothing;

-- Contract and probation reminders
create or replace function public.auto_hr_contract_expiry(p jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare c record; total integer := 0; d1 integer := coalesce((p ->> 'days_1')::integer, 60); d2 integer := coalesce((p ->> 'days_2')::integer, 30);
        d3 integer := coalesce((p ->> 'days_3')::integer, 7); pd integer := coalesce((p ->> 'probation_days')::integer, 14);
        today date := public.auto_today(); left_days integer; th integer;
begin
  for c in
    select k.id, k.end_date, k.probation_end_date, k.contract_type, e.full_name
    from public.employment_contracts k join public.employees e on e.id = k.employee_id
    where k.deleted_at is null and k.status = 'active' and e.deleted_at is null and e.status <> 'left'
  loop
    if c.end_date is not null and c.end_date >= today and c.end_date - today <= greatest(d1, d2, d3) then
      left_days := c.end_date - today;
      th := case when left_days <= d3 then d3 when left_days <= d2 then d2 else d1 end;
      total := total + public.auto_notify_perm('hr_contract_expiry', 'people.manage', null,
        'Contract ends in ' || left_days || ' day' || case when left_days = 1 then '' else 's' end || ': ' || c.full_name,
        initcap(replace(c.contract_type, '_', ' ')) || ' contract ends ' || to_char(c.end_date, 'DD Mon YYYY') || '. Renew, convert or close it out.',
        '/admin/people/contracts', case when left_days <= d3 then 'critical' else 'warning' end, 'contract-end:' || c.id || ':' || th || ':' || c.end_date);
    end if;
    if c.end_date is not null and c.end_date < today then
      total := total + public.auto_notify_perm('hr_contract_expiry', 'people.manage', null, 'Contract has expired: ' || c.full_name,
        'Ended ' || to_char(c.end_date, 'DD Mon YYYY') || ' and is still marked active.', '/admin/people/contracts', 'critical', 'contract-expired:' || c.id || ':' || c.end_date);
    end if;
    if c.probation_end_date is not null and c.probation_end_date >= today and c.probation_end_date - today <= pd then
      total := total + public.auto_notify_perm('hr_contract_expiry', 'people.manage', null, 'Probation ends ' || to_char(c.probation_end_date, 'DD Mon YYYY') || ': ' || c.full_name,
        'Confirm or extend the probation.', '/admin/people/contracts', 'warning', 'probation-end:' || c.id || ':' || c.probation_end_date);
    end if;
  end loop;
  return total;
end;
$$;

-- Attendance: only when people are really using check-in (any record in the last 14 days)
create or replace function public.auto_hr_attendance_alerts(p jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare today date := public.auto_today(); local_now timestamp := now() at time zone 'Africa/Nairobi';
        start_h numeric := coalesce((p ->> 'work_start_hour')::numeric, 8); after_m numeric := coalesce((p ->> 'alert_after_minutes')::numeric, 60);
        missing integer; late integer; names text; total integer := 0;
begin
  if extract(isodow from today) >= 6 then return 0; end if;
  if local_now < date_trunc('day', local_now) + (start_h * interval '1 hour') + (after_m * interval '1 minute') then return 0; end if;
  if not exists (select 1 from public.attendance_records where work_date >= today - 14) then return 0; end if;
  select count(*), string_agg(e.full_name, ', ' order by e.full_name) into missing, names
    from public.employees e
   where e.deleted_at is null and e.status = 'active'
     and not exists (select 1 from public.attendance_records a where a.employee_id = e.id and a.work_date = today)
     and not exists (select 1 from public.leave_requests l where l.employee_id = e.id and l.status = 'approved' and today between l.start_date and l.end_date);
  select count(*) into late from public.attendance_records where work_date = today and status = 'late';
  if missing > 0 then
    total := total + public.auto_notify_perm('hr_attendance_alerts', 'people.manage', null, missing || ' employee' || case when missing = 1 then ' has' else 's have' end || ' not checked in',
      left(names, 500), '/admin/people/attendance', 'warning', 'att-missing:' || today);
  end if;
  if late > 0 then
    total := total + public.auto_notify_perm('hr_attendance_alerts', 'people.manage', null, late || ' late arrival' || case when late = 1 then '' else 's' end || ' today',
      null, '/admin/people/attendance', 'info', 'att-late:' || today || ':' || late);
  end if;
  return total;
end;
$$;

create or replace function public.auto_hr_payroll_reminder(p jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare today date := public.auto_today(); day_n integer := least(coalesce((p ->> 'reminder_day')::integer, 25), 28);
        p_start date := date_trunc('month', public.auto_today())::date;
begin
  if extract(day from today) < day_n then return 0; end if;
  if exists (select 1 from public.payroll_runs where period_start = p_start and status <> 'cancelled') then return 0; end if;
  if not exists (select 1 from public.employee_compensation) then return 0; end if;
  return public.auto_notify_perm('hr_payroll_reminder', 'people.payroll_prepare', null, 'Prepare payroll for ' || to_char(p_start, 'FMMonth YYYY'),
    'No payroll run exists for this month yet.', '/admin/people/payroll', 'info', 'payroll-rem:' || to_char(p_start, 'YYYY-MM'));
end;
$$;

update public.automation_rules set next_run_at = public.auto_next_run(schedule_minutes, params) where key in ('hr_contract_expiry', 'hr_payroll_reminder') and next_run_at is null;

-- ---------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------
revoke all on function
  public.guard_leave_insert(), public.trg_leave_submit(), public.approval_apply_leave(uuid, text, uuid),
  public.guard_onboarding_done(), public.auto_generate_onboarding(uuid), public.trg_employee_onboarding(),
  public.guard_payroll_run(), public.guard_payroll_lines(), public.approval_apply_payroll(uuid, text, uuid), public.guard_review(),
  public.auto_hr_contract_expiry(jsonb), public.auto_hr_attendance_alerts(jsonb), public.auto_hr_payroll_reminder(jsonb),
  public.next_payroll_reference(date), public.count_weekdays(date, date), public.is_manager_of(uuid)
from public, anon, authenticated;
-- used inside RLS policies / invoker triggers, so signed-in users need execute on them:
grant execute on function public.is_manager_of(uuid), public.next_payroll_reference(date) to authenticated;

revoke all on function
  public.cancel_leave_request(uuid), public.clock_in(), public.clock_out(), public.generate_onboarding(uuid), public.hire_applicant(uuid, date),
  public.payroll_generate_lines(uuid), public.submit_payroll_run(uuid), public.record_payroll_paid(uuid, text, date), public.acknowledge_review(uuid)
from public, anon;
grant execute on function
  public.cancel_leave_request(uuid), public.clock_in(), public.clock_out(), public.generate_onboarding(uuid), public.hire_applicant(uuid, date),
  public.payroll_generate_lines(uuid), public.submit_payroll_run(uuid), public.record_payroll_paid(uuid, text, date), public.acknowledge_review(uuid)
to authenticated;

-- Line managers can see the basic directory record of their direct reports (needed to review them and approve their leave).
create policy employees_manager_read on public.employees for select to authenticated
  using (public.is_manager_of(id) and public.module_enabled('people'));
