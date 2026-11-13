import { Flash } from "@/components/admin/Flash";
import { PageHeader, Panel, Badge } from "@/components/admin/ui";
import { requireStaff } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { changePassword, updateProfile } from "./actions";

export const metadata = { title: "My account" };

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireStaff();
  const sb = await createSupabaseServerClient();
  const { data: p } = await sb.from("profiles").select("full_name, phone, job_title, last_login_at").eq("id", ctx.userId).maybeSingle();
  const perms = [...ctx.permissions].sort();

  return (
    <>
      <PageHeader title="My account" description="Your profile and password." />
      <Flash ok={sp.ok} error={sp.error} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Profile">
          <form action={updateProfile} className="space-y-4">
            <div><label className="field-label" htmlFor="email">Email (sign-in)</label><input id="email" value={ctx.email} readOnly className="field-input bg-grey" /></div>
            <div><label className="field-label" htmlFor="full_name">Full name</label><input id="full_name" name="full_name" defaultValue={p?.full_name ?? ""} required maxLength={120} className="field-input" /></div>
            <div><label className="field-label" htmlFor="job_title">Job title</label><input id="job_title" name="job_title" defaultValue={p?.job_title ?? ""} maxLength={80} className="field-input" /></div>
            <div><label className="field-label" htmlFor="phone">Phone</label><input id="phone" name="phone" defaultValue={p?.phone ?? ""} maxLength={40} autoComplete="tel" className="field-input" /></div>
            <button className="btn-primary">Save profile</button>
          </form>
        </Panel>
        <div className="space-y-6">
          <Panel title="Change password">
            <form action={changePassword} className="space-y-4">
              <div><label className="field-label" htmlFor="password">New password</label><input id="password" name="password" type="password" autoComplete="new-password" minLength={12} required className="field-input" /><p className="mt-1 text-xs text-grey-500">At least 12 characters.</p></div>
              <div><label className="field-label" htmlFor="confirm">Confirm new password</label><input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={12} required className="field-input" /></div>
              <button className="btn-primary">Change password</button>
            </form>
          </Panel>
          <Panel title="Your access">
            <p className="text-sm text-charcoal">Role: <Badge tone="navy">{ctx.roleName}</Badge></p>
            {p?.last_login_at && <p className="mt-2 text-xs text-grey-500">Last sign-in: {new Date(p.last_login_at).toLocaleString("en-KE", { timeZone: "Africa/Nairobi" })}</p>}
            <details className="mt-3 text-sm"><summary className="cursor-pointer font-medium text-teal-dark">Permissions ({perms.length})</summary>
              <ul className="mt-2 flex flex-wrap gap-1.5">{perms.map((k) => <li key={k}><Badge>{k}</Badge></li>)}</ul>
            </details>
          </Panel>
        </div>
      </div>
    </>
  );
}
