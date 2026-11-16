-- =====================================================================
-- 0011 HR OUTSOURCING (module `hr`) - ships DISABLED.
--
-- A separate business line under SAMSAL Supply & Distribution Limited, prepared in advance and kept
-- switched off until the legal registrations and working capital are in place. A Super Administrator
-- turns it on in Admin > Settings > Modules; no code change or redeploy is needed.
--
-- While the module is off, the database itself refuses every read and write on these tables (the
-- policies use can(permission, 'hr'), which requires the module switch), so switching it off is a
-- real stop, not just a hidden menu.
--
-- Data minimisation: candidate records deliberately hold NO national ID number, KRA PIN, bank,
-- date-of-birth, health or family details, and no CV files. Candidate changes are written to the
-- activity log in 'pii' mode (field names only, never the values).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Module, permissions, role
-- ---------------------------------------------------------------------
insert into public.modules (key, name, description, is_core, enabled, sort_order) values
  ('hr', 'HR Outsourcing', 'Client staffing requests, candidate pool and placements. Off until the business is ready to offer this service.', false, false, 85)
on conflict (key) do nothing;

insert into public.permissions (key, module, description) values
  ('hr.view',   'hr', 'View HR outsourcing requests, candidates and placements'),
  ('hr.manage', 'hr', 'Create and edit HR outsourcing requests, candidates and placements')
on conflict (key) do nothing;

insert into public.roles (key, name, description, is_system, is_super) values
  ('hr_manager', 'HR Manager', 'Runs the HR outsourcing line: client staffing requests, candidates and placements. Read access to enquiries.', false, false)
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_key)
select r.id, p.perm
from public.roles r
join (values
  ('hr_manager', 'hr.view'), ('hr_manager', 'hr.manage'), ('hr_manager', 'enquiries.view'),
  ('director', 'hr.view')
) as p(role_key, perm) on p.role_key = r.key
on conflict do nothing;

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------
create sequence public.hr_requisition_ref_seq start 1001;

-- A client's request for staff
create table public.hr_requisitions (
  id            uuid primary key default gen_random_uuid(),
  reference     text not null unique default ('HRQ-' || nextval('public.hr_requisition_ref_seq')),
  client_name   text not null check (length(client_name) between 1 and 200),
  customer_id   uuid references public.customers(id) on delete set null,
  title         text not null check (length(title) between 1 and 200),
  description   text check (description is null or length(description) <= 3000),
  headcount     integer not null default 1 check (headcount between 1 and 10000),
  location      text check (location is null or length(location) <= 120),
  desired_start date,
  arrangement   text not null default 'placement' check (arrangement in ('placement', 'managed_staffing')),
  status        text not null default 'open' check (status in ('open', 'sourcing', 'shortlisted', 'filled', 'on_hold', 'closed', 'cancelled')),
  owner_id      uuid references public.profiles(id) on delete set null,
  internal_notes text check (internal_notes is null or length(internal_notes) <= 3000),
  created_by    uuid references public.profiles(id) on delete set null,
  deleted_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index hr_requisitions_status_idx on public.hr_requisitions(status) where deleted_at is null;

-- People available for placement. Minimal data, with a consent record.
create table public.hr_candidates (
  id                    uuid primary key default gen_random_uuid(),
  full_name             text not null check (length(full_name) between 1 and 160),
  phone                 text check (phone is null or length(phone) <= 40),
  email                 text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  location              text check (location is null or length(location) <= 120),
  skills                text check (skills is null or length(skills) <= 2000),
  availability          text check (availability is null or length(availability) <= 200),
  source                text check (source is null or length(source) <= 200),
  status                text not null default 'new' check (status in ('new', 'screened', 'shortlisted', 'placed', 'not_suitable', 'withdrawn')),
  consent_recorded      boolean not null default false,
  consent_date          date,
  retention_review_date date,
  notes                 text check (notes is null or length(notes) <= 3000),
  created_by            uuid references public.profiles(id) on delete set null,
  deleted_at            timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint hr_candidates_consent_date check (not consent_recorded or consent_date is not null)
);
create index hr_candidates_status_idx on public.hr_candidates(status) where deleted_at is null;

-- A candidate put forward for a request
create table public.hr_placements (
  id             uuid primary key default gen_random_uuid(),
  requisition_id uuid not null references public.hr_requisitions(id) on delete restrict,
  candidate_id   uuid not null references public.hr_candidates(id) on delete restrict,
  status         text not null default 'proposed' check (status in ('proposed', 'interview', 'offered', 'active', 'ended', 'declined')),
  start_date     date,
  end_date       date,
  fee_note       text check (fee_note is null or length(fee_note) <= 500),
  notes          text check (notes is null or length(notes) <= 3000),
  created_by     uuid references public.profiles(id) on delete set null,
  deleted_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (requisition_id, candidate_id),
  constraint hr_placements_dates check (end_date is null or start_date is null or end_date >= start_date)
);
create index hr_placements_requisition_idx on public.hr_placements(requisition_id);
create index hr_placements_candidate_idx on public.hr_placements(candidate_id);

do $$
declare t text;
begin
  foreach t in array array['hr_requisitions', 'hr_candidates', 'hr_placements'] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_updated', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Activity log
-- ---------------------------------------------------------------------
create trigger hr_requisitions_audit after insert or update or delete on public.hr_requisitions for each row execute function public.audit_row('full');
create trigger hr_placements_audit   after insert or update or delete on public.hr_placements   for each row execute function public.audit_row('full');
create trigger hr_candidates_audit   after insert or update or delete on public.hr_candidates   for each row execute function public.audit_row('pii');

-- ---------------------------------------------------------------------
-- Row Level Security: the permission AND the module switch are both required
-- ---------------------------------------------------------------------
alter table public.hr_requisitions enable row level security;
alter table public.hr_candidates   enable row level security;
alter table public.hr_placements   enable row level security;

revoke all on public.hr_requisitions, public.hr_candidates, public.hr_placements from anon, authenticated;
revoke all on sequence public.hr_requisition_ref_seq from anon, authenticated;
grant usage on sequence public.hr_requisition_ref_seq to authenticated;

do $$
declare t text;
begin
  foreach t in array array['hr_requisitions', 'hr_candidates', 'hr_placements'] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.can(%L, %L))', t || '_read', t, 'hr.view', 'hr');
    execute format('create policy %I on public.%I for insert to authenticated with check (public.can(%L, %L))', t || '_ins', t, 'hr.manage', 'hr');
    execute format('create policy %I on public.%I for update to authenticated using (public.can(%L, %L)) with check (public.can(%L, %L))', t || '_upd', t, 'hr.manage', 'hr', 'hr.manage', 'hr');
    -- Records are archived (soft delete) from the admin; permanent deletion, for example to honour an
    -- erasure request, is for the Super Administrator only.
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_super_admin())', t || '_del', t);
  end loop;
end $$;
