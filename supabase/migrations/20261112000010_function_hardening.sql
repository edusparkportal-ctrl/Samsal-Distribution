-- =====================================================================
-- 0010 FUNCTION HARDENING (from the Supabase security advisor)
-- 1. Trigger functions are never meant to be called through the API: remove EXECUTE from API roles.
--    (Triggers keep working: the privilege is only checked when a trigger is created.)
-- 2. Pin search_path on the remaining trigger functions.
-- The RLS helper functions (has_permission, can, is_staff, ...) stay executable on purpose: policies
-- evaluate them as the calling role, and they only reveal the caller's own access.
-- =====================================================================
do $$
declare f text;
begin
  foreach f in array array[
    'audit_row()','guard_last_super_admin()','guard_po_approval()','guard_profile_privileges()',
    'guard_quotation_items()','guard_quotation_update()','guard_role_permissions()','handle_new_user()',
    'log_enquiry_status()','guard_system_roles()','guard_core_modules()','block_movement_changes()',
    'block_audit_changes()','set_updated_at()'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;

alter function public.set_updated_at() set search_path = public;
alter function public.guard_system_roles() set search_path = public;
alter function public.guard_core_modules() set search_path = public;
alter function public.block_movement_changes() set search_path = public;
alter function public.block_audit_changes() set search_path = public;
