-- =====================================================================
-- SECURITY HARDENING
--   1. Multi-factor authentication enforced in the DATABASE (not only in the app):
--        - roles.require_mfa; a signed-in user whose role requires MFA has NO access until the session is aal2
--        - sensitive transitions (payments, approvals of money, user/role/module changes, opening restricted files)
--          additionally need a RECENT second-factor check
--   2. Staff-only module list (it was readable by anonymous visitors)
--   3. security_events (monitoring log) and security_posture() (health checks), plus a daily automation rule
-- Nothing here stores secrets. Internal contexts (migrations, service role, cron) have no end user
-- (auth.uid() is null) and are never blocked by the MFA rules.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Which roles must use MFA
-- ---------------------------------------------------------------------
alter table public.roles add column if not exists require_mfa boolean not null default false;

-- Roles that handle money, people data or access control start with MFA required. Editable by a Super Administrator.
update public.roles set require_mfa = true
where is_super or key in ('director', 'hr_manager', 'hr_officer', 'payroll_officer', 'finance_manager', 'accountant', 'procurement_manager');

-- Super Administrator roles always require MFA, and only a Super Administrator may change the flag.
create or replace function public.guard_roles_mfa_flag()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.is_super then new.require_mfa := true; end if;
  if tg_op = 'UPDATE' and new.require_mfa is distinct from old.require_mfa and auth.uid() is not null and not public.is_super_admin() then
    raise exception 'Only a Super Administrator can change whether a role requires multi-factor authentication';
  end if;
  return new;
end;
$$;
create trigger roles_guard_mfa_flag before insert or update on public.roles for each row execute function public.guard_roles_mfa_flag();

-- ---------------------------------------------------------------------
-- 2. Session assurance helpers (read the verified JWT that PostgREST passes in)
-- ---------------------------------------------------------------------
-- True when this session completed a second factor (aal2). "Recent" additionally needs a TOTP check inside the last p_max_age seconds.
-- No end user (migrations, service role, cron) = trusted internal context.
create or replace function public.mfa_ok(p_max_age integer default 900)
returns boolean language sql stable set search_path = public as $$
  select auth.uid() is null
      or (
        coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
        and (
          p_max_age is null
          or exists (
            select 1
            from jsonb_array_elements(case when jsonb_typeof(auth.jwt() -> 'amr') = 'array' then auth.jwt() -> 'amr' else '[]'::jsonb end) a
            where a ->> 'method' = 'totp'
              and coalesce((a ->> 'timestamp')::bigint, 0) >= extract(epoch from now())::bigint - p_max_age
          )
        )
      );
$$;

create or replace function public.mfa_required_for_me()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select r.is_super or r.require_mfa
    from public.profiles p join public.roles r on r.id = p.role_id
    where p.id = auth.uid() and p.is_active
  ), false);
$$;

-- A role that requires MFA is treated as signed-out until the session is aal2.
create or replace function public.mfa_satisfied()
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is null or not public.mfa_required_for_me() or public.mfa_ok(null);
$$;

-- What the application asks after sign-in (no data is exposed: a single boolean about the caller).
create or replace function public.my_mfa_required()
returns boolean language sql stable security definer set search_path = public as $$
  select public.mfa_required_for_me();
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active and p.role_id is not null)
     and public.mfa_satisfied();
$$;

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p join public.roles r on r.id = p.role_id
    where p.id = auth.uid() and p.is_active and r.is_super
  ) and public.mfa_satisfied();
$$;

create or replace function public.has_permission(perm text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_super_admin() or (
    public.mfa_satisfied() and exists (
      select 1 from public.profiles p join public.role_permissions rp on rp.role_id = p.role_id
      where p.id = auth.uid() and p.is_active and rp.permission_key = perm
    )
  );
$$;

create or replace function public.my_permissions()
returns text[] language sql stable security definer set search_path = public as $$
  select case
    when not public.mfa_satisfied() then '{}'::text[]
    when public.is_super_admin() then coalesce((select array_agg(key order by key) from public.permissions), '{}')
    else coalesce((
      select array_agg(rp.permission_key order by rp.permission_key)
      from public.profiles p join public.role_permissions rp on rp.role_id = p.role_id
      where p.id = auth.uid() and p.is_active
    ), '{}')
  end;
$$;

revoke all on function public.mfa_ok(integer), public.mfa_required_for_me(), public.mfa_satisfied(), public.my_mfa_required(), public.guard_roles_mfa_flag() from public, anon;
grant execute on function public.mfa_ok(integer), public.mfa_required_for_me(), public.mfa_satisfied(), public.my_mfa_required() to authenticated;

-- ---------------------------------------------------------------------
-- 3. Sensitive operations need a RECENT second-factor check (15 minutes)
-- ---------------------------------------------------------------------
create or replace function public.guard_mfa()
returns trigger language plpgsql set search_path = public as $$
begin
  if not public.mfa_ok(900) then
    raise exception '[mfa] This action needs a fresh authenticator code. Verify now, then repeat it.' using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.guard_mfa_decision()
returns trigger language plpgsql security definer set search_path = public as $$
declare s text;
begin
  select subject into s from public.approval_requests where id = new.request_id;
  if s in ('payroll', 'bill', 'expense') and not public.mfa_ok(900) then
    raise exception '[mfa] Approving payments needs a fresh authenticator code. Verify now, then repeat it.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- Money: payroll, supplier bills, expense claims (approval and payment states).
create trigger payroll_runs_mfa before update on public.payroll_runs for each row
  when (new.status in ('approved', 'paid_recorded') and new.status is distinct from old.status) execute function public.guard_mfa();
create trigger supplier_bills_mfa before update on public.supplier_bills for each row
  when (new.status in ('approved', 'partially_paid', 'paid') and new.status is distinct from old.status) execute function public.guard_mfa();
create trigger expense_claims_mfa before update on public.expense_claims for each row
  when (new.status in ('approved', 'paid_recorded') and new.status is distinct from old.status) execute function public.guard_mfa();
create trigger approval_decisions_mfa before insert on public.approval_decisions for each row execute function public.guard_mfa_decision();

-- Access control: who has which role, what each role may do, which modules are on.
create trigger profiles_mfa before update on public.profiles for each row
  when (new.role_id is distinct from old.role_id or new.is_active is distinct from old.is_active) execute function public.guard_mfa();
create trigger roles_mfa before insert or update or delete on public.roles for each row execute function public.guard_mfa();
create trigger role_permissions_mfa before insert or update or delete on public.role_permissions for each row execute function public.guard_mfa();
create trigger modules_mfa before update on public.modules for each row
  when (new.enabled is distinct from old.enabled) execute function public.guard_mfa();

revoke all on function public.guard_mfa(), public.guard_mfa_decision() from public, anon;

-- Opening a restricted HR/Finance file needs an MFA-verified session (any age within the session).
create or replace function public.restricted_doc_open(p_id uuid)
returns table (storage_path text, file_name text) language plpgsql security definer set search_path = public as $$
declare d public.restricted_documents%rowtype;
begin
  if not public.mfa_ok(null) then raise exception '[mfa] Opening restricted documents needs multi-factor verification.' using errcode = 'P0001'; end if;
  select * into d from public.restricted_documents where id = p_id;
  if not found or not public.restricted_doc_can(d.entity_type, d.entity_id, 'read') then raise exception 'Not found'; end if;
  insert into public.document_access_log (doc_id, entity_type, entity_id, file_name, actor_id) values (d.id, d.entity_type, d.entity_id, d.file_name, auth.uid());
  return query select d.storage_path, d.file_name;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. The module list is for staff only (anonymous visitors could see which modules are switched on)
-- ---------------------------------------------------------------------
drop policy if exists modules_read on public.modules;
create policy modules_read on public.modules for select to authenticated using (public.is_staff());

-- ---------------------------------------------------------------------
-- 5. Security monitoring
-- ---------------------------------------------------------------------
insert into public.permissions (key, module, description) values
  ('security.view', 'audit', 'View the security dashboard: sign-in failures, rate-limit blocks, MFA coverage and configuration checks')
on conflict (key) do nothing;

create table public.security_events (
  id       bigint generated always as identity primary key,
  at       timestamptz not null default now(),
  kind     text not null check (kind ~ '^[a-z0-9_]{3,40}$'),
  severity text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  actor    uuid,
  ip_hint  text check (ip_hint is null or length(ip_hint) <= 64),
  detail   jsonb not null default '{}'::jsonb check (pg_column_size(detail) <= 4096)
);
create index security_events_at_idx on public.security_events (at desc);
create index security_events_kind_idx on public.security_events (kind, at desc);

alter table public.security_events enable row level security;
revoke all on public.security_events from anon, authenticated;
grant select on public.security_events to authenticated;
create policy security_events_read on public.security_events for select to authenticated using (public.has_permission('security.view'));

-- Written only by the server (service role) or by internal jobs. Never callable by browsers.
create or replace function public.security_log(p_kind text, p_severity text default 'info', p_actor uuid default null, p_ip text default null, p_detail jsonb default '{}')
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.security_events (kind, severity, actor, ip_hint, detail)
  values (left(p_kind, 40), case when p_severity in ('info', 'warning', 'critical') then p_severity else 'info' end, p_actor, left(p_ip, 64), coalesce(p_detail, '{}'::jsonb));
end;
$$;
revoke all on function public.security_log(text, text, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.security_log(text, text, uuid, text, jsonb) to service_role;

-- Internal health checks. Returns counts and names only: no secrets, no personal data beyond staff display names.
create or replace function public.security_posture_internal()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  supers integer; nomfa jsonb; nomfa_n integer; rls_off integer; anon_write integer; unconfirmed integer;
  failed integer; blocks integer; csp integer; captcha integer; issues jsonb := '[]'::jsonb;
begin
  select count(*) into supers from public.profiles p join public.roles r on r.id = p.role_id where r.is_super and p.is_active;
  select coalesce(jsonb_agg(jsonb_build_object('name', coalesce(nullif(p.full_name, ''), p.email), 'role', r.name) order by p.full_name), '[]'::jsonb), count(*)
    into nomfa, nomfa_n
  from public.profiles p join public.roles r on r.id = p.role_id
  where p.is_active and (r.is_super or r.require_mfa)
    and not exists (select 1 from auth.mfa_factors f where f.user_id = p.id and f.status = 'verified');
  select count(*) into rls_off from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity;
  select count(*) into anon_write from information_schema.role_table_grants
    where grantee = 'anon' and table_schema = 'public' and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE');
  select count(*) into unconfirmed from public.profiles p where p.is_active and p.role_id is null;
  select count(*) into failed from public.security_events where kind in ('login_failed', 'mfa_failed') and at > now() - interval '24 hours';
  select count(*) into blocks from public.security_events where kind = 'ratelimit_block' and at > now() - interval '24 hours';
  select count(*) into csp from public.security_events where kind = 'csp_violation' and at > now() - interval '24 hours';
  select count(*) into captcha from public.security_events where kind in ('captcha_failed', 'token_failed') and at > now() - interval '24 hours';

  if rls_off > 0 then issues := issues || jsonb_build_array(jsonb_build_object('key', 'rls_off', 'severity', 'critical', 'title', rls_off || ' table(s) have Row Level Security switched off', 'detail', 'Every table in the public schema must have RLS enabled.')); end if;
  if anon_write > 0 then issues := issues || jsonb_build_array(jsonb_build_object('key', 'anon_write', 'severity', 'critical', 'title', 'Anonymous visitors can write to ' || anon_write || ' table(s)', 'detail', 'The anonymous role must be read-only.')); end if;
  if nomfa_n > 0 then issues := issues || jsonb_build_array(jsonb_build_object('key', 'mfa_missing', 'severity', 'warning', 'title', nomfa_n || ' account(s) that must use MFA have not set it up', 'detail', 'They cannot use the admin area until they enrol an authenticator app.')); end if;
  if supers < 2 then issues := issues || jsonb_build_array(jsonb_build_object('key', 'single_super', 'severity', 'warning', 'title', 'Only ' || supers || ' active Super Administrator', 'detail', 'Keep a second Super Administrator so an MFA reset or lock-out can be recovered from inside the system.')); end if;
  if supers > 4 then issues := issues || jsonb_build_array(jsonb_build_object('key', 'many_supers', 'severity', 'warning', 'title', supers || ' active Super Administrators', 'detail', 'Review whether all of them need unrestricted access.')); end if;
  if failed >= 20 then issues := issues || jsonb_build_array(jsonb_build_object('key', 'failed_logins', 'severity', 'warning', 'title', failed || ' failed sign-in or MFA attempts in 24 hours', 'detail', 'Possible password guessing. Check the security dashboard.')); end if;
  if blocks >= 50 then issues := issues || jsonb_build_array(jsonb_build_object('key', 'rate_blocks', 'severity', 'warning', 'title', blocks || ' requests were rate-limited in 24 hours', 'detail', 'Possible automated abuse of the website forms or sign-in.')); end if;

  return jsonb_build_object(
    'super_admins', supers, 'mfa_missing', nomfa, 'mfa_missing_count', nomfa_n, 'tables_without_rls', rls_off, 'anon_write_grants', anon_write,
    'failed_auth_24h', failed, 'rate_limit_blocks_24h', blocks, 'csp_reports_24h', csp, 'captcha_failures_24h', captcha, 'issues', issues
  );
end;
$$;
revoke all on function public.security_posture_internal() from public, anon, authenticated;

create or replace function public.security_posture()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('security.view') then raise exception 'Not permitted'; end if;
  return public.security_posture_internal();
end;
$$;
revoke all on function public.security_posture() from public, anon;
grant execute on function public.security_posture() to authenticated;

-- Daily automated check: tells people with security.view (Super Administrators by default) about problems. Also trims the log (1 year).
insert into public.automation_rules (key, name, description, category, kind, module, schedule_minutes, params, params_help, sort_order) values
  ('security_checks', 'Daily security checks', 'Checks MFA coverage, Row Level Security, anonymous write access, Super Administrator count and sign-in failure spikes, and notifies the security team. Keeps one year of security events.', 'system', 'scheduled', 'audit', 1440, '{"retention_days": 365}', '{"retention_days": "How long to keep security events"}', 200)
on conflict (key) do nothing;

create or replace function public.auto_security_checks(p jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare v jsonb; i jsonb; total integer := 0; keep integer := greatest(30, coalesce((p ->> 'retention_days')::integer, 365));
begin
  v := public.security_posture_internal();
  for i in select * from jsonb_array_elements(v -> 'issues') loop
    total := total + public.auto_notify_perm('security_checks', 'security.view', null, left(i ->> 'title', 200), i ->> 'detail', '/admin/security',
      i ->> 'severity', 'sec:' || (i ->> 'key') || ':' || public.auto_today());
  end loop;
  delete from public.security_events where at < now() - make_interval(days => keep);
  return total;
end;
$$;
revoke all on function public.auto_security_checks(jsonb) from public, anon, authenticated;
update public.automation_rules set next_run_at = public.auto_next_run(schedule_minutes, params) where key = 'security_checks' and next_run_at is null;
