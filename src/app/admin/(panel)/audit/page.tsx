import Link from "next/link";
import { PageHeader, Panel } from "@/components/admin/ui";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Activity log" };
const PAGE = 50;
const TABLE_RE = /^[a-z_]{1,60}$/;

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ table?: string; action?: string; page?: string }> }) {
  const sp = await searchParams;
  await requirePermission("audit.view", "audit");
  const sb = await createSupabaseServerClient();
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  let q = sb.from("audit_log").select("id, occurred_at, actor_email, action, table_name, record_id, changed_fields", { count: "exact" });
  if (sp.table && TABLE_RE.test(sp.table)) q = q.eq("table_name", sp.table);
  if (sp.action && ["insert", "update", "delete"].includes(sp.action)) q = q.eq("action", sp.action);
  const { data, count } = await q.order("occurred_at", { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1);
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));
  const qs = (p: number) => { const u = new URLSearchParams(); if (sp.table) u.set("table", sp.table); if (sp.action) u.set("action", sp.action); u.set("page", String(p)); return `?${u}`; };
  return (
    <>
      <PageHeader title="Activity log" description="Who changed what, and when. Entries cannot be edited or deleted. Customer details are not copied into the log; only the names of the fields that changed." />
      <Panel className="mb-4">
        <form className="flex flex-wrap gap-3" role="search">
          <input name="table" defaultValue={sp.table ?? ""} placeholder="Table, e.g. products" aria-label="Table" className="field-input max-w-xs" />
          <select name="action" defaultValue={sp.action ?? ""} aria-label="Action" className="field-input max-w-[10rem]"><option value="">Any action</option><option value="insert">Created</option><option value="update">Updated</option><option value="delete">Deleted</option></select>
          <button className="btn-primary px-4 py-2 text-sm">Filter</button>
        </form>
      </Panel>
      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-grey-500"><tr><th className="py-2 pr-3">When (UTC)</th><th className="pr-3">Who</th><th className="pr-3">Action</th><th className="pr-3">Record</th><th>Fields changed</th></tr></thead>
            <tbody className="divide-y divide-grey-200">
              {(data ?? []).map((r: { id: number; occurred_at: string; actor_email: string | null; action: string; table_name: string; record_id: string | null; changed_fields: string[] | null }) => (
                <tr key={r.id}><td className="whitespace-nowrap py-2 pr-3 text-grey-500">{r.occurred_at.slice(0, 19).replace("T", " ")}</td><td className="pr-3">{r.actor_email ?? "System"}</td><td className="pr-3 capitalize">{r.action}</td>
                  <td className="pr-3">{r.table_name}<span className="block max-w-[14rem] truncate text-xs text-grey-500">{r.record_id}</span></td><td className="text-xs text-grey-500">{(r.changed_fields ?? []).join(", ")}</td></tr>
              ))}
              {(data ?? []).length === 0 && <tr><td colSpan={5} className="py-3 text-grey-500">No activity recorded.</td></tr>}
            </tbody>
          </table>
        </div>
        {pages > 1 && <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Pagination">{page > 1 ? <Link className="btn-outline px-3 py-1.5" href={qs(page - 1)}>Newer</Link> : <span />}<span className="text-grey-500">Page {page} of {pages}</span>{page < pages ? <Link className="btn-outline px-3 py-1.5" href={qs(page + 1)}>Older</Link> : <span />}</nav>}
      </Panel>
    </>
  );
}
