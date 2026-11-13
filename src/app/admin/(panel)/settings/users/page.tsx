import { Flash } from "@/components/admin/Flash";
import { Badge, PageHeader, Panel } from "@/components/admin/ui";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isServiceClientConfigured } from "@/lib/supabase/admin";
import { inviteUser, updateUserAccess } from "./actions";

export const metadata = { title: "Users" };

type Role = { id: string; key: string; name: string; is_super: boolean };

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePermission("users.manage");
  const sb = await createSupabaseServerClient();
  const [{ data: users }, { data: roles }] = await Promise.all([
    sb.from("profiles").select("id, email, full_name, role_id, is_active, last_login_at, created_at").order("created_at"),
    sb.from("roles").select("id, key, name, is_super").order("name"),
  ]);
  const roleList = (roles ?? []) as Role[];
  // Only a Super Administrator may hand out the super role (also enforced by a database trigger).
  const assignable = roleList.filter((r) => ctx.isSuper || !r.is_super);

  return (
    <>
      <PageHeader title="Users" description="Invite staff and control who can sign in and what they can do. New accounts stay inactive until given a role." />
      <Flash ok={sp.ok} error={sp.error} />
      <Panel title="Invite a staff member" className="mb-6">
        {!isServiceClientConfigured() && <p className="mb-3 rounded-md border border-amber/60 bg-amber/10 px-3 py-2 text-sm">Invitations are off: set <code>SUPABASE_SERVICE_ROLE_KEY</code> on the server.</p>}
        <form action={inviteUser} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div><label className="field-label" htmlFor="i-name">Full name</label><input id="i-name" name="full_name" required maxLength={120} className="field-input" /></div>
          <div><label className="field-label" htmlFor="i-email">Email</label><input id="i-email" name="email" type="email" required className="field-input" /></div>
          <div><label className="field-label" htmlFor="i-role">Role</label>
            <select id="i-role" name="role_id" required className="field-input" defaultValue="">
              <option value="" disabled>Choose a role</option>
              {assignable.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select></div>
          <div className="flex items-end"><button className="btn-primary w-full justify-center">Send invitation</button></div>
        </form>
      </Panel>

      <Panel title={`Staff accounts (${users?.length ?? 0})`}>
        <ul className="divide-y divide-grey-200">
          {(users ?? []).map((u: { id: string; email: string | null; full_name: string | null; role_id: string | null; is_active: boolean; last_login_at: string | null }) => {
            const self = u.id === ctx.userId;
            const isSuperRow = roleList.find((r) => r.id === u.role_id)?.is_super;
            const locked = self || (isSuperRow && !ctx.isSuper);
            return (
              <li key={u.id} className="py-4">
                <form action={updateUserAccess} className="grid items-end gap-3 sm:grid-cols-[1fr_220px_auto_auto]">
                  <input type="hidden" name="id" value={u.id} />
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-navy">{u.full_name || "(no name)"} {self && <Badge tone="teal">You</Badge>}</p>
                    <p className="truncate text-sm text-grey-500">{u.email}</p>
                    <p className="text-xs text-grey-500">{u.last_login_at ? `Last sign-in ${new Date(u.last_login_at).toLocaleDateString("en-KE", { timeZone: "Africa/Nairobi" })}` : "Never signed in"}</p>
                  </div>
                  <div>
                    <label className="sr-only" htmlFor={`r-${u.id}`}>Role for {u.email}</label>
                    <select id={`r-${u.id}`} name="role_id" defaultValue={u.role_id ?? ""} disabled={locked} className="field-input">
                      {!u.role_id && <option value="" disabled>No role</option>}
                      {roleList.filter((r) => ctx.isSuper || !r.is_super || r.id === u.role_id).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </div>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_active" defaultChecked={u.is_active} disabled={locked} className="h-4 w-4 accent-teal" /> Active</label>
                  <button className="btn-outline px-4 py-2 text-sm disabled:opacity-50" disabled={locked}>Save</button>
                </form>
                {locked && <p className="mt-1 text-xs text-grey-500">{self ? "You cannot change your own role or status." : "Only a Super Administrator can change this account."}</p>}
              </li>
            );
          })}
        </ul>
      </Panel>
    </>
  );
}
