import { PageHeader, Panel } from "@/components/admin/ui";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { RequestCard, type ApprovalRow } from "../RequestCard";

export const metadata = { title: "All approval requests" };
export const dynamic = "force-dynamic";

export default async function AllApprovals({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const sp = await searchParams;
  await requirePermission("approvals.view_all", "approvals");
  const sb = await createSupabaseServerClient();
  let q = sb.from("approval_requests").select("id, subject, title, summary, link, amount, status, current_step, steps, requested_by, created_at").order("created_at", { ascending: false }).limit(200);
  if (sp.status && ["pending", "approved", "rejected", "cancelled"].includes(sp.status)) q = q.eq("status", sp.status);
  const { data } = await q;
  const rows = (data ?? []) as ApprovalRow[];
  const ids = Array.from(new Set(rows.map((r) => r.requested_by).filter((v): v is string => Boolean(v))));
  const { data: ppl } = ids.length ? await sb.from("profiles").select("id, full_name, email").in("id", ids) : { data: [] };
  const names = new Map((ppl ?? []).map((p: { id: string; full_name: string | null; email: string }) => [p.id, p.full_name || p.email]));
  return (
    <>
      <PageHeader title="All approval requests" description="A read-only oversight view. Decisions are made by the named approvers on the Approvals page." />
      <nav className="mb-4 flex flex-wrap gap-2 text-sm">
        {["", "pending", "approved", "rejected", "cancelled"].map((s) => (
          <a key={s || "all"} href={s ? `/admin/approvals/all?status=${s}` : "/admin/approvals/all"} className={`rounded border px-3 py-1 ${(sp.status ?? "") === s ? "border-navy bg-navy text-white" : "border-grey-300 text-navy hover:bg-grey"}`}>{s ? s[0].toUpperCase() + s.slice(1) : "All"}</a>
        ))}
      </nav>
      <Panel>{rows.length === 0 ? <p className="text-sm text-grey-500">No requests.</p> : <ul className="space-y-3">{rows.map((r) => <RequestCard key={r.id} r={r} who={r.requested_by ? names.get(r.requested_by) ?? "a colleague" : "the system"} canDecide={false} canCancel={false} />)}</ul>}</Panel>
    </>
  );
}
