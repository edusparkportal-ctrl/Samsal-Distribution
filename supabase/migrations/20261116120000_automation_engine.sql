-- =====================================================================
-- 0012 AUTOMATION ENGINE (module `automation`)
--
-- A database-resident automation engine. Everything here acts on REAL records only; no sample data.
--
--  * automation_rules      one row per automation: on/off switch, schedule, numeric settings, channels.
--  * automation_runs       execution log (every scheduled, manual and error run).
--  * notifications         in-app inbox, one row per recipient. UNIQUE (recipient, dedupe_key) makes
--                          every alert idempotent, so a rule that runs twice never alerts twice.
--  * notification_outbox   emails waiting to be sent, with attempts, back-off and a unique dedupe key.
--                          Rows are only queued when email is switched on (it is OFF until a sending
--                          domain is verified), so nothing queues up silently in the meantime.
--  * automation_settings   the global email switch.
--
-- Security: admins can only change the switches and numeric settings of rules that this migration
-- creates. They cannot add rules, change what a rule does, or run code. Rule logic lives in
-- SECURITY DEFINER functions (not callable from the API). Reads and writes are permission checked
-- by RLS (automation.view / automation.manage) and every change is in the activity log.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Module and permissions
-- ---------------------------------------------------------------------
insert into public.modules (key, name, description, is_core, enabled, sort_order) values
  ('automation', 'Automation', 'Reminders, alerts, comparisons and daily summaries that run on their own. Control Centre, run logs and notification settings.', false, true, 90)
on conflict (key) do nothing;

insert into public.permissions (key, module, description) values
  ('automation.view',   'automation', 'View automation rules, run logs and the outbox'),
  ('automation.manage', 'automation', 'Switch automations on or off, change schedules and settings, run them now and retry failures')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_key)
select r.id, p.perm
from public.roles r
join (values ('director', 'automation.view')) as p(role_key, perm) on p.role_key = r.key
on conflict do nothing;

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------
create table public.automation_settings (
  id             integer primary key default 1 check (id = 1),
  email_enabled  boolean not null default false,   -- stays false until a sending domain is verified
  updated_at     timestamptz not null default now()
);
insert into public.automation_settings (id) values (1);

create table public.automation_rules (
  key             text primary key check (key ~ '^[a-z][a-z0-9_]{2,60}$'),
  name            text not null,
  description     text not null,
  category        text not null check (category in ('enquiries', 'quotations', 'procurement', 'tenders', 'inventory', 'orders', 'reports', 'system')),
  kind            text not null check (kind in ('event', 'scheduled')),
  module          text references public.modules(key) on update cascade,   -- rule only runs while this module is on
  enabled         boolean not null default true,
  schedule_minutes integer check (schedule_minutes is null or schedule_minutes between 5 and 10080),
  params          jsonb not null default '{}'::jsonb,
  params_help     jsonb not null default '{}'::jsonb,
  notify_in_app   boolean not null default true,
  notify_email    boolean not null default false,
  email_capable   boolean not null default false,   -- whether this rule can send email at all
  sort_order      integer not null default 0,
  last_run_at     timestamptz,
  next_run_at     timestamptz,
  consecutive_failures integer not null default 0,
  last_error      text,
  updated_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (kind = 'event' or schedule_minutes is not null)
);

-- Settings are plain numbers in a sensible range. Nothing else can be stored, so a setting can never
-- carry anything executable.
create or replace function public.guard_automation_rule()
returns trigger language plpgsql set search_path = public as $$
declare k text; v jsonb;
begin
  if jsonb_typeof(new.params) is distinct from 'object' then
    raise exception 'Automation settings must be an object of numbers';
  end if;
  for k, v in select * from jsonb_each(new.params) loop
    if jsonb_typeof(v) <> 'number' or (v #>> '{}')::numeric < 0 or (v #>> '{}')::numeric > 100000 then
      raise exception 'Automation setting "%" must be a number between 0 and 100000', k;
    end if;
  end loop;
  if tg_op = 'UPDATE' then
    if new.key <> old.key or new.kind <> old.kind or new.module is distinct from old.module
       or new.category <> old.category or new.name <> old.name or new.params_help <> old.params_help
       or new.email_capable <> old.email_capable then
      if auth.uid() is not null then
        raise exception 'Only the switches, schedule, settings and channels of an automation can be changed';
      end if;
    end if;
    if (select array_agg(x order by x) from jsonb_object_keys(new.params) x)
       is distinct from (select array_agg(x order by x) from jsonb_object_keys(old.params) x) then
      raise exception 'Automation settings cannot be added or removed, only changed';
    end if;
    if new.notify_email and not new.email_capable then
      raise exception 'This automation does not send email';
    end if;
  end if;
  return new;
end;
$$;
create trigger automation_rules_guard before update on public.automation_rules
  for each row execute function public.guard_automation_rule();
create trigger automation_rules_updated before update on public.automation_rules
  for each row execute function public.set_updated_at();
create trigger automation_rules_audit after update on public.automation_rules
  for each row execute function public.audit_row('full');
create trigger automation_settings_audit after update on public.automation_settings
  for each row execute function public.audit_row('full');
create trigger automation_settings_updated before update on public.automation_settings
  for each row execute function public.set_updated_at();

create table public.automation_runs (
  id            uuid primary key default gen_random_uuid(),
  rule_key      text not null references public.automation_rules(key) on update cascade on delete cascade,
  trigger_type  text not null check (trigger_type in ('schedule', 'manual', 'event')),
  status        text not null default 'running' check (status in ('running', 'success', 'error')),
  items         integer not null default 0,        -- notifications / emails / records created
  error         text,
  attempt       integer not null default 1,
  triggered_by  uuid references public.profiles(id) on delete set null,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz
);
create index automation_runs_rule_idx on public.automation_runs(rule_key, started_at desc);
create index automation_runs_status_idx on public.automation_runs(status, started_at desc);

create table public.notifications (
  id            uuid primary key default gen_random_uuid(),
  recipient_id  uuid not null references public.profiles(id) on delete cascade,
  title         text not null check (length(title) between 1 and 200),
  body          text check (body is null or length(body) <= 2000),
  link          text check (link is null or link ~ '^/admin(/|$)'),
  severity      text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  rule_key      text references public.automation_rules(key) on update cascade on delete set null,
  dedupe_key    text not null check (length(dedupe_key) <= 200),
  read_at       timestamptz,
  created_at    timestamptz not null default now(),
  unique (recipient_id, dedupe_key)
);
create index notifications_inbox_idx on public.notifications(recipient_id, created_at desc);
create index notifications_unread_idx on public.notifications(recipient_id) where read_at is null;

create table public.notification_outbox (
  id              uuid primary key default gen_random_uuid(),
  rule_key        text references public.automation_rules(key) on update cascade on delete set null,
  kind            text not null check (kind in ('customer', 'supplier', 'staff')),
  to_email        text not null check (to_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  subject         text not null check (length(subject) between 1 and 200),
  body            text not null check (length(body) between 1 and 5000),
  dedupe_key      text not null unique check (length(dedupe_key) <= 200),
  status          text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  attempts        integer not null default 0,
  max_attempts    integer not null default 5,
  next_attempt_at timestamptz not null default now(),
  last_error      text,
  sent_at         timestamptz,
  created_at      timestamptz not null default now()
);
create index notification_outbox_due_idx on public.notification_outbox(next_attempt_at) where status in ('pending', 'sending');
create index notification_outbox_status_idx on public.notification_outbox(status, created_at desc);

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.automation_settings enable row level security;
alter table public.automation_rules    enable row level security;
alter table public.automation_runs     enable row level security;
alter table public.notifications       enable row level security;
alter table public.notification_outbox enable row level security;

revoke all on public.automation_settings, public.automation_rules, public.automation_runs,
              public.notifications, public.notification_outbox from anon, authenticated;

grant select on public.automation_settings, public.automation_rules, public.automation_runs to authenticated;
grant update (email_enabled) on public.automation_settings to authenticated;
grant update (enabled, schedule_minutes, params, notify_in_app, notify_email, updated_by) on public.automation_rules to authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant delete on public.notifications to authenticated;
grant select on public.notification_outbox to authenticated;

create policy automation_settings_read on public.automation_settings for select to authenticated
  using (public.can('automation.view', 'automation'));
create policy automation_settings_upd on public.automation_settings for update to authenticated
  using (public.can('automation.manage', 'automation')) with check (public.can('automation.manage', 'automation'));

create policy automation_rules_read on public.automation_rules for select to authenticated
  using (public.can('automation.view', 'automation'));
create policy automation_rules_upd on public.automation_rules for update to authenticated
  using (public.can('automation.manage', 'automation')) with check (public.can('automation.manage', 'automation'));

create policy automation_runs_read on public.automation_runs for select to authenticated
  using (public.can('automation.view', 'automation'));

-- Everyone sees only their own inbox. Staff never see another person's notifications.
create policy notifications_own_read on public.notifications for select to authenticated
  using (recipient_id = auth.uid() and public.is_staff());
create policy notifications_own_upd on public.notifications for update to authenticated
  using (recipient_id = auth.uid() and public.is_staff()) with check (recipient_id = auth.uid());
create policy notifications_own_del on public.notifications for delete to authenticated
  using (recipient_id = auth.uid() and public.is_staff());

-- The outbox holds customer and supplier email addresses: managers only.
create policy notification_outbox_read on public.notification_outbox for select to authenticated
  using (public.can('automation.manage', 'automation'));

-- ---------------------------------------------------------------------
-- Internal helpers (SECURITY DEFINER, never callable from the API)
-- ---------------------------------------------------------------------
create or replace function public.auto_rule_active(p_key text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select r.enabled and (r.module is null or public.module_enabled(r.module))
    from public.automation_rules r where r.key = p_key
  ), false);
$$;

create or replace function public.auto_param(p_key text, p_name text, p_default numeric)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce((select (r.params ->> p_name)::numeric from public.automation_rules r where r.key = p_key), p_default);
$$;

-- Active staff holding a permission (super administrators hold every permission).
create or replace function public.auto_recipients(p_perm text)
returns setof uuid language sql stable security definer set search_path = public as $$
  select p.id from public.profiles p
  join public.roles r on r.id = p.role_id
  where p.is_active
    and (r.is_super or exists (select 1 from public.role_permissions rp where rp.role_id = r.id and rp.permission_key = p_perm));
$$;

-- One in-app notification. Returns 1 when created, 0 when it already existed (duplicate prevention)
-- or when the rule's in-app channel is off.
create or replace function public.auto_notify(
  p_rule text, p_recipient uuid, p_title text, p_body text, p_link text, p_severity text, p_dedupe text
) returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if p_recipient is null then return 0; end if;
  if not coalesce((select notify_in_app from public.automation_rules where key = p_rule), true) then return 0; end if;
  insert into public.notifications (recipient_id, title, body, link, severity, rule_key, dedupe_key)
  values (p_recipient, left(p_title, 200), left(p_body, 2000), p_link, coalesce(p_severity, 'info'), p_rule, left(p_dedupe, 200))
  on conflict (recipient_id, dedupe_key) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Notify every active holder of a permission (optionally plus one specific person).
create or replace function public.auto_notify_perm(
  p_rule text, p_perm text, p_also uuid, p_title text, p_body text, p_link text, p_severity text, p_dedupe text
) returns integer language plpgsql security definer set search_path = public as $$
declare total integer := 0; uid uuid;
begin
  for uid in
    select x from (select public.auto_recipients(p_perm) as x union select p_also) s where x is not null
  loop
    total := total + public.auto_notify(p_rule, uid, p_title, p_body, p_link, p_severity, p_dedupe);
  end loop;
  return total;
end;
$$;

-- Queue an email. Nothing is queued unless the global email switch AND the rule's email channel are on.
create or replace function public.auto_enqueue_email(
  p_rule text, p_kind text, p_to text, p_subject text, p_body text, p_dedupe text
) returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if p_to is null or p_to !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return 0; end if;
  if not coalesce((select email_enabled from public.automation_settings where id = 1), false) then return 0; end if;
  if not coalesce((select notify_email and email_capable from public.automation_rules where key = p_rule), false) then return 0; end if;
  insert into public.notification_outbox (rule_key, kind, to_email, subject, body, dedupe_key)
  values (p_rule, p_kind, p_to, left(p_subject, 200), left(p_body, 5000), left(p_dedupe, 200))
  on conflict (dedupe_key) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Event automations must never block the business action that triggered them. Failures are logged
-- (and surfaced to managers) instead of raised.
create or replace function public.auto_record_failure(p_rule text, p_err text, p_trigger text default 'event')
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  insert into public.automation_runs (rule_key, trigger_type, status, error, finished_at)
  values (p_rule, p_trigger, 'error', left(p_err, 1000), now());
  update public.automation_rules
     set consecutive_failures = consecutive_failures + 1, last_error = left(p_err, 500)
   where key = p_rule;
  for uid in select public.auto_recipients('automation.manage') loop
    perform public.auto_notify('automation_health', uid, 'Automation error: ' || p_rule, left(p_err, 400),
                               '/admin/automation/logs', 'critical', 'fail:' || p_rule || ':' || to_char(now() at time zone 'Africa/Nairobi', 'YYYYMMDD'));
  end loop;
exception when others then
  null;   -- error reporting itself must never raise
end;
$$;

create or replace function public.auto_record_event(p_rule text, p_items integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_items > 0 then
    insert into public.automation_runs (rule_key, trigger_type, status, items, finished_at)
    values (p_rule, 'event', 'success', p_items, now());
    update public.automation_rules set last_run_at = now(), consecutive_failures = 0, last_error = null where key = p_rule;
  end if;
exception when others then
  null;
end;
$$;

-- Next due time: daily rules run at a fixed Nairobi hour, others every schedule_minutes.
create or replace function public.auto_next_run(p_schedule integer, p_params jsonb)
returns timestamptz language sql stable set search_path = public as $$
  select case
    when p_params ? 'run_hour' then
      (case
         when (date_trunc('day', now() at time zone 'Africa/Nairobi') + ((p_params ->> 'run_hour')::numeric * interval '1 hour')) > (now() at time zone 'Africa/Nairobi')
           then (date_trunc('day', now() at time zone 'Africa/Nairobi') + ((p_params ->> 'run_hour')::numeric * interval '1 hour'))
         else (date_trunc('day', now() at time zone 'Africa/Nairobi') + interval '1 day' + ((p_params ->> 'run_hour')::numeric * interval '1 hour'))
       end) at time zone 'Africa/Nairobi'
    else now() + make_interval(mins => p_schedule)
  end;
$$;

-- ---------------------------------------------------------------------
-- The engine
-- ---------------------------------------------------------------------
-- Runs every scheduled rule that is due (or one rule, when p_only is given). One rule failing never
-- stops the others. A failed rule is retried with back-off (5, 10, 20... minutes, capped at its own
-- schedule) and managers are notified once a day per failing rule.
create or replace function public.auto_run_due(p_trigger text default 'schedule', p_only text default null, p_by uuid default null)
returns integer language plpgsql security definer set search_path = public as $$
declare
  r public.automation_rules%rowtype;
  run_id uuid;
  made integer;
  total integer := 0;
  wait_mins integer;
begin
  if not pg_try_advisory_xact_lock(hashtext('samsal_automation_engine')) then
    return 0;   -- another tick is already running: never run the same rules twice at once
  end if;

  for r in
    select * from public.automation_rules
    where kind = 'scheduled' and enabled
      and (module is null or public.module_enabled(module))
      and (key = p_only or (p_only is null and (next_run_at is null or next_run_at <= now())))
    order by sort_order, key
  loop
    insert into public.automation_runs (rule_key, trigger_type, triggered_by, attempt)
    values (r.key, p_trigger, p_by, r.consecutive_failures + 1)
    returning id into run_id;

    begin
      execute format('select public.%I($1)', 'auto_' || r.key) into made using r.params;
      made := coalesce(made, 0);
      update public.automation_runs set status = 'success', items = made, finished_at = now() where id = run_id;
      update public.automation_rules
         set last_run_at = now(), consecutive_failures = 0, last_error = null,
             next_run_at = public.auto_next_run(r.schedule_minutes, r.params)
       where key = r.key;
      total := total + made;
    exception when others then
      wait_mins := least(r.schedule_minutes, 5 * (2 ^ least(r.consecutive_failures, 6))::integer);
      update public.automation_runs set status = 'error', error = left(sqlerrm, 1000), finished_at = now() where id = run_id;
      update public.automation_rules
         set consecutive_failures = consecutive_failures + 1, last_error = left(sqlerrm, 500),
             next_run_at = now() + make_interval(mins => wait_mins)
       where key = r.key;
      perform public.auto_notify_perm('automation_health', 'automation.manage', null,
        'Automation failed: ' || r.name, left(sqlerrm, 400), '/admin/automation/logs', 'critical',
        'fail:' || r.key || ':' || to_char(now() at time zone 'Africa/Nairobi', 'YYYYMMDD'));
    end;
  end loop;
  return total;
end;
$$;

-- Called by the scheduler (pg_cron) and by the dispatch route.
create or replace function public.run_automations()
returns integer language sql security definer set search_path = public as $$
  select public.auto_run_due('schedule', null, null);
$$;

-- "Run now" from the Control Centre: permission checked, ignores the schedule but not the on/off switch.
create or replace function public.run_automation_now(p_key text)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not public.can('automation.manage', 'automation') then
    raise exception 'Not permitted';
  end if;
  if not exists (select 1 from public.automation_rules where key = p_key and kind = 'scheduled') then
    raise exception 'Only scheduled automations can be run now';
  end if;
  if not public.auto_rule_active(p_key) then
    raise exception 'This automation is switched off, or its module is off';
  end if;
  n := public.auto_run_due('manual', p_key, auth.uid());
  return n;
end;
$$;

-- Retry a failed email immediately (managers).
create or replace function public.retry_outbox(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can('automation.manage', 'automation') then raise exception 'Not permitted'; end if;
  update public.notification_outbox
     set status = 'pending', next_attempt_at = now(), max_attempts = greatest(max_attempts, attempts + 1)
   where id = p_id and status = 'failed';
end;
$$;

-- Outbox claim/complete: used by the server-side dispatch route (service role) only.
create or replace function public.outbox_claim(p_limit integer default 20)
returns setof public.notification_outbox language plpgsql security definer set search_path = public as $$
begin
  return query
  with due as (
    select id from public.notification_outbox
    where (status = 'pending' and next_attempt_at <= now())
       or (status = 'sending' and next_attempt_at <= now() - interval '10 minutes')   -- crashed mid-send
    order by next_attempt_at
    limit greatest(1, least(p_limit, 100))
    for update skip locked
  )
  update public.notification_outbox o
     set status = 'sending', attempts = o.attempts + 1, next_attempt_at = now()
    from due where o.id = due.id
  returning o.*;
end;
$$;

create or replace function public.outbox_complete(p_id uuid, p_ok boolean, p_error text default null)
returns void language plpgsql security definer set search_path = public as $$
declare o public.notification_outbox%rowtype;
begin
  select * into o from public.notification_outbox where id = p_id for update;
  if not found then return; end if;
  if p_ok then
    update public.notification_outbox set status = 'sent', sent_at = now(), last_error = null where id = p_id;
  elsif o.attempts >= o.max_attempts then
    update public.notification_outbox set status = 'failed', last_error = left(p_error, 500) where id = p_id;
    perform public.auto_notify_perm('automation_health', 'automation.manage', null,
      'Email could not be delivered', left(coalesce(p_error, 'Unknown error'), 300), '/admin/automation/outbox', 'warning', 'outbox-fail:' || p_id);
  else
    update public.notification_outbox
       set status = 'pending', last_error = left(p_error, 500),
           next_attempt_at = now() + make_interval(mins => 5 * (2 ^ least(o.attempts, 6))::integer)
     where id = p_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Function privileges: internals are not callable through the API
-- ---------------------------------------------------------------------
revoke all on function
  public.guard_automation_rule(), public.auto_rule_active(text), public.auto_param(text, text, numeric),
  public.auto_recipients(text), public.auto_notify(text, uuid, text, text, text, text, text),
  public.auto_notify_perm(text, text, uuid, text, text, text, text, text),
  public.auto_enqueue_email(text, text, text, text, text, text), public.auto_record_failure(text, text, text),
  public.auto_record_event(text, integer), public.auto_next_run(integer, jsonb),
  public.auto_run_due(text, text, uuid), public.run_automations(),
  public.outbox_claim(integer), public.outbox_complete(uuid, boolean, text)
from public, anon, authenticated;
revoke all on function public.run_automation_now(text), public.retry_outbox(uuid) from public, anon;
grant execute on function public.run_automation_now(text), public.retry_outbox(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- The health rule: only used as the source of error notifications
-- ---------------------------------------------------------------------
insert into public.automation_rules (key, name, description, category, kind, module, sort_order, notify_in_app) values
  ('automation_health', 'Automation error alerts', 'Tells administrators when an automation or an email delivery fails, once a day per problem.', 'system', 'event', 'automation', 999, true)
on conflict (key) do nothing;
