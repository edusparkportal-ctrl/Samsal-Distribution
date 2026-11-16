# Adding a module

A module is a feature area (for example "Customer accounts"). It appears in `/admin` only when (1) its row in the `modules` table is enabled
and (2) the user holds one of its permissions. The database enforces both through `can(permission, module)` in RLS, so hiding a menu item is never the protection.

## Steps
1. **Migration** `supabase/migrations/2026…_<name>.sql`: tables (uuid ids, `created_at/updated_at`, `deleted_at` where soft-delete makes sense), `alter table … enable row level security`, grants and policies using `public.can('<module>.view','<module>')` / `.manage`, an audit trigger (`audit_row()` or `audit_row('pii')` for personal data), a row in `public.modules`, and rows in `public.permissions` (+ `role_permissions` for default roles). Add RLS tests to `supabase/tests/rls.test.sql`.
2. **Permissions** in `src/lib/auth/permissions.ts`.
3. **Registry** entry in `src/lib/modules.ts` (label, icon, nav items with the permission each needs). The sidebar and guards are generated from it.
4. **Screens**
   - Simple list/form CRUD: add a definition to `src/lib/admin/resources-ops.ts` (table, columns, fields, `permission`, `viewPermission`, `module`, optional `children`/`links`) and a thin page `src/app/admin/(panel)/<route>/page.tsx` that renders `<ResourceView def={RESOURCES.<key>} … />` (copy an existing one). Table and column names live only on the server.
   - Anything custom: pages under `src/app/admin/(panel)/<module>/`, calling `requirePermission(perm, module)` at the top and `checkPermission` in every server action; use `createSupabaseServerClient()` (user session) so RLS applies. Use the service-role client only when a visitor or the system must write without a session.
5. **Verify the registry against the schema**: every table and column named in a definition must exist (see the test approach in `docs/OUTSTANDING_ISSUES.md`).

## Ideas the structure already allows
Customer accounts/portal (needs its own auth role separate from staff), invoicing and payments (M-Pesa integration), tender document generation,
supplier performance scoring, stock-on-order and automatic stock movement from purchase receipts and deliveries, email sending of quotations.

## Worked example: HR Outsourcing (`hr`)
Migration `20261112000011_hr_outsourcing.sql` is a complete example of the steps above: a module row (disabled), permissions, a role, three tables with Row Level Security that requires both the permission and the module switch (`can('hr.view','hr')`), activity-log triggers (candidates in `pii` mode, so values are never copied), registry entries in `src/lib/admin/resources-ops.ts`, a navigation entry in `src/lib/modules.ts`, and three three-line pages under `src/app/admin/(panel)/hr/`.
