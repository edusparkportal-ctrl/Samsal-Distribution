import Link from "next/link";
import { Flash } from "@/components/admin/Flash";
import { Badge, PageHeader, Panel } from "@/components/admin/ui";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createRole, deleteRole, saveRolePermissions } from "./actions";

export const metadata = { title: "Roles & permissions" };

type Role = { id: string; key: string; name: string; description: string | null; is_system: boolean; is_super: boolean };
type PermRow = { key: string; module: string; description: string };

export default async function RolesPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; role?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePermission("roles.manage");
  const sb = await createSupabaseServerClient();
  const [{ data: roles }, { data: perms }] = await Promise.all([
    sb.from("roles").select("id, key, name, description, is_system, is_super").order("name"),
    sb.from("permissions").select("key, module, description").order("module").order("key"),
  ]);
  const roleList = (roles ?? []) as Role[];
  const selected = roleList.find((r) => r.id === sp.role) ?? roleList.find((r) => !r.is_super) ?? roleList[0];
  const { data: granted } = selected ? await sb.from("role_permissions").select("permission_key").eq("role_id", selected.id) : { data: [] };
  const grantedSet = new Set((granted ?? []).map((g: { permission_key: string }) => g.permission_key));

  // Group permissions by module for readability. Only keys known to the code are shown as editable.
  const groups = new Map<string, PermRow[]>();
  ((perms ?? []) as PermRow[]).filter((p) => p.key in PERMISSIONS).forEach((p) => groups.set(p.module, [...(groups.get(p.module) ?? []), p]));

  return (
    <>
      <PageHeader title="Roles & permissions" description="Create roles and decide exactly what each can do. Changes apply the next time the person loads a page. Only a Super Administrator can change permissions." />
      <Flash ok={sp.ok} error={sp.error} />
      {!ctx.isSuper && <div className="mb-5 rounded-md border border-amber/60 bg-amber/10 px-3 py-2 text-sm">You can view roles, but only a Super Administrator can change them.</div>}
      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <div className="space-y-4">
          <Panel title="Roles">
            <ul className="space-y-1">
              {roleList.map((r) => (
                <li key={r.id}>
                  <Link href={`/admin/settings/roles?role=${r.id}`} className={`flex items-center justify-between rounded px-3 py-2 text-sm ${selected?.id === r.id ? "bg-navy text-white" : "text-charcoal hover:bg-grey"}`}>
                    <span>{r.name}</span>{r.is_super && <span className="text-[10px] font-bold uppercase tracking-wide opacity-80">All access</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
          {ctx.isSuper && (
            <Panel title="New role">
              <form action={createRole} className="space-y-3">
                <div><label className="field-label" htmlFor="n-name">Name</label><input id="n-name" name="name" required maxLength={80} className="field-input" /></div>
                <div><label className="field-label" htmlFor="n-desc">Description</label><input id="n-desc" name="description" maxLength={300} className="field-input" /></div>
                <button className="btn-outline w-full justify-center">Create role</button>
              </form>
            </Panel>
          )}
        </div>

        {selected && (
          <Panel>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-navy">{selected.name} {selected.is_system && <Badge tone="grey">Built-in</Badge>}</h2>
                {selected.description && <p className="mt-1 max-w-xl text-sm text-grey-500">{selected.description}</p>}
              </div>
              {ctx.isSuper && !selected.is_system && (
                <form action={deleteRole}><input type="hidden" name="role_id" value={selected.id} /><button className="rounded border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50">Delete role</button></form>
              )}
            </div>
            {selected.is_super ? (
              <p className="text-sm text-charcoal">This role always has every permission, including ones added by future modules. It cannot be edited or deleted.</p>
            ) : (
              <form action={saveRolePermissions} className="space-y-6">
                <input type="hidden" name="role_id" value={selected.id} />
                {[...groups.entries()].map(([module, list]) => (
                  <fieldset key={module}>
                    <legend className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-teal-dark">{module}</legend>
                    <div className="space-y-2">
                      {list.map((p) => (
                        <label key={p.key} className="flex items-start gap-3 rounded border border-grey-200 p-3 text-sm has-[:checked]:border-teal has-[:checked]:bg-teal-tint">
                          <input type="checkbox" name="perm" value={p.key} defaultChecked={grantedSet.has(p.key)} disabled={!ctx.isSuper} className="mt-0.5 h-4 w-4 accent-teal" />
                          <span><span className="font-semibold text-navy">{p.key}</span><span className="block text-grey-500">{PERMISSIONS[p.key as keyof typeof PERMISSIONS]}</span></span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ))}
                {ctx.isSuper && <button className="btn-primary">Save permissions</button>}
              </form>
            )}
          </Panel>
        )}
      </div>
    </>
  );
}
