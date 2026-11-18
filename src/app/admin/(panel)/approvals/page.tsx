import { Flash } from "@/components/admin/Flash";
import { PageHeader, Panel } from "@/components/admin/ui";
import { requireStaff } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { RequestCard, type ApprovalRow } from "./RequestCard";

export const metadata = { title: "Approvals" };
export const dynamic = "force-dynamic";

const COLS = "id, subject, title, summary, link, amount, status, current_step, steps, requested_by, created_at";

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireStaff();
  const sb = await createSupabaseServerClient();
  // RLS shows only requests this person made, is the subject of, may decide, or has decided.
  const { data } = await sb.from("approval_requests").select(COLS).order("created_at", { ascending: false }).limit(100);
  const rows = (data ?? []) as ApprovalRow[];
  const pending = rows.filter((r) => r.status === "pending");
  const decidable = new Set<string>();
  await Promise.all(pending.map(async (r) => {
    const { data: ok } = await sb.rpc("approval_can_decide", { p_request: r.id, p_user: ctx.userId });
    if (ok === true) decidable.add(r.id);
  }));
  const ids = Array.from(new Set(rows.map((r) => r.requested_by).filter((v): v is string => Boolean(v))));
  const { data: ppl } = ids.length ? await sb.from("profiles").select("id, full_name, email").in("id", ids) : { data: [] };
  const names = new Map((ppl ?? []).map((p: { id: string; full_name: string | null; email: string }) => [p.id, p.full_name || p.email]));
  const who = (r: ApprovalRow) => (r.requested_by ? names.get(r.requested_by) ?? "a colleague" : "the system");

  const waiting = pending.filter((r) => decidable.has(r.id));
  const mine = pending.filter((r) => r.requested_by === ctx.userId);
  const history = rows.filter((r) => r.status !== "pending").slice(0, 20);

  return (
    <>
      <PageHeader title="Approvals" description="Requests waiting for your decision, and the ones you have made. Nothing that needs approval is carried out until the people named in the approval rules have approved it, and nobody can approve their own request." />
      <Flash ok={sp.ok} error={sp.error} />
      <div className="space-y-6">
        <Panel title={`Waiting for you (${waiting.length})`}>
          {waiting.length === 0 ? <p className="text-sm text-grey-500">Nothing is waiting for your decision.</p> : <ul className="space-y-3">{waiting.map((r) => <RequestCard key={r.id} r={r} who={who(r)} canDecide canCancel={false} />)}</ul>}
        </Panel>
        <Panel title={`Your requests in progress (${mine.length})`}>
          {mine.length === 0 ? <p className="text-sm text-grey-500">You have no requests in progress.</p> : <ul className="space-y-3">{mine.map((r) => <RequestCard key={r.id} r={r} who="you" canDecide={false} canCancel />)}</ul>}
        </Panel>
        <Panel title="Recently decided">
          {history.length === 0 ? <p className="text-sm text-grey-500">Nothing decided yet.</p> : <ul className="space-y-3">{history.map((r) => <RequestCard key={r.id} r={r} who={who(r)} canDecide={false} canCancel={false} />)}</ul>}
        </Panel>
      </div>
    </>
  );
}
