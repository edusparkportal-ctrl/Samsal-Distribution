-- =====================================================================
-- 0001 FOUNDATION: roles, permissions, staff profiles, module registry
-- Target: Supabase (PostgreSQL 15+). Safe to run once, in order.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Shared trigger: keep updated_at current
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Roles and permissions (configurable by the Super Administrator)
-- ---------------------------------------------------------------------
create table public.roles (
  id           uuid primary key default gen_random_uuid(),
  key          text not null unique check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  name         text not null check (length(name) between 2 and 80),
  description  text,
  is_system    boolean not null default false,   -- built-in roles cannot be deleted
  is_super     boolean not null default false,   -- implicit access to every permission
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.permissions (
  key          text primary key check (key ~ '^[a-z_]+\.[a-z_]+$'),
  module       text not null,
  description  text not null
);

create table public.role_permissions (
  role_id         uuid not null references public.roles(id) on delete cascade,
  permission_key  text not null references public.permissions(key) on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (role_id, permission_key)
);
create index role_permissions_permission_idx on public.role_permissions(permission_key);

-- ---------------------------------------------------------------------
-- Staff profiles: 1:1 with Supabase auth.users. No role = no access.
-- ---------------------------------------------------------------------
create table public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  email          text,
  full_name      text,
  phone          text,
  job_title      text,
  role_id        uuid references public.roles(id) on delete set null,
  is_active      boolean not null default false,   -- new accounts start inactive until an admin enables them
  last_login_at  timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index profiles_role_idx on public.profiles(role_id);

-- A new auth user automatically gets an inactive, role-less profile.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Permission helpers used by every RLS policy and by the application.
-- SECURITY DEFINER so they can read role tables regardless of caller RLS.
-- ---------------------------------------------------------------------
create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_active and p.role_id is not null
  );
$$;

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    join public.roles r on r.id = p.role_id
    where p.id = auth.uid() and p.is_active and r.is_super
  );
$$;

create or replace function public.has_permission(perm text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_super_admin() or exists (
    select 1 from public.profiles p
    join public.role_permissions rp on rp.role_id = p.role_id
    where p.id = auth.uid() and p.is_active and rp.permission_key = perm
  );
$$;

-- The permission keys the current user holds (used by the admin UI; the UI is a convenience only,
-- every action is re-checked on the server and by RLS).
create or replace function public.my_permissions()
returns text[] language sql stable security definer set search_path = public as $$
  select case
    when public.is_super_admin() then coalesce((select array_agg(key order by key) from public.permissions), '{}')
    else coalesce((
      select array_agg(rp.permission_key order by rp.permission_key)
      from public.profiles p
      join public.role_permissions rp on rp.role_id = p.role_id
      where p.id = auth.uid() and p.is_active
    ), '{}')
  end;
$$;

-- Last-Super-Admin protection: the platform must always keep at least one active Super Administrator.
create or replace function public.guard_last_super_admin()
returns trigger language plpgsql security definer set search_path = public as $$
declare remaining int; was_super boolean;
begin
  if tg_op = 'UPDATE' then
    if old.role_id is not distinct from new.role_id and old.is_active is not distinct from new.is_active then
      return new;
    end if;
  end if;
  select exists (select 1 from public.roles r where r.id = old.role_id and r.is_super) into was_super;
  if was_super and old.is_active then
    select count(*) into remaining
    from public.profiles p join public.roles r on r.id = p.role_id
    where r.is_super and p.is_active and p.id <> old.id;
    if remaining = 0 then
      raise exception 'Cannot remove or deactivate the last active Super Administrator';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger profiles_guard_last_super
  before update or delete on public.profiles
  for each row execute function public.guard_last_super_admin();

-- Protect the built-in super role from being edited into something else or removed.
create or replace function public.guard_system_roles()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.is_system then raise exception 'System roles cannot be deleted'; end if;
    return old;
  end if;
  if old.is_system then
    if new.key <> old.key or new.is_super <> old.is_super or new.is_system <> old.is_system then
      raise exception 'System role identity cannot be changed';
    end if;
  end if;
  return new;
end;
$$;
create trigger roles_guard_system before update or delete on public.roles
  for each row execute function public.guard_system_roles();

-- ---------------------------------------------------------------------
-- Module registry (feature switches; see docs/MODULES.md)
-- ---------------------------------------------------------------------
create table public.modules (
  key          text primary key check (key ~ '^[a-z][a-z_]{1,30}$'),
  name         text not null,
  description  text,
  is_core      boolean not null default false,  -- core modules cannot be disabled
  enabled      boolean not null default true,
  sort_order   integer not null default 0,
  updated_at   timestamptz not null default now()
);

create or replace function public.guard_core_modules()
returns trigger language plpgsql as $$
begin
  if old.is_core and new.enabled = false then
    raise exception 'Core modules cannot be disabled';
  end if;
  return new;
end;
$$;
create trigger modules_guard_core before update on public.modules
  for each row execute function public.guard_core_modules();

-- updated_at triggers
create trigger roles_updated before update on public.roles for each row execute function public.set_updated_at();
create trigger profiles_updated before update on public.profiles for each row execute function public.set_updated_at();
create trigger modules_updated before update on public.modules for each row execute function public.set_updated_at();

-- Bootstrap helper: promote an existing auth user to Super Administrator.
-- Run once from the Supabase SQL editor (see docs/SUPABASE_SETUP.md). Not callable by API roles.
create or replace function public.bootstrap_super_admin(user_email text)
returns text language plpgsql security definer set search_path = public as $$
declare uid uuid; super_role uuid;
begin
  select id into uid from auth.users where lower(email) = lower(user_email);
  if uid is null then raise exception 'No auth user with email %', user_email; end if;
  select id into super_role from public.roles where key = 'super_admin';
  if super_role is null then raise exception 'Run the seed first: super_admin role is missing'; end if;
  update public.profiles set role_id = super_role, is_active = true where id = uid;
  return 'OK: ' || user_email || ' is now an active Super Administrator';
end;
$$;
revoke all on function public.bootstrap_super_admin(text) from public, anon, authenticated;
