import { Flash } from "@/components/admin/Flash";
import { Badge, PageHeader, Panel } from "@/components/admin/ui";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cancelLeave } from "./actions";

export const metadata = { title: "Leave" };
export const dynamic = "force-dynamic";

type LR = { id: string; employee_id: string; leave_type_id: string; start_date: string; end_date: string; days: number; status: string; reason: string | null };
const TONE = { pending: "amber", approved: "green", rejected: "red", cancelled: "grey" } as const;
const d = (v: string) => new Date(v + "T00:00:00").toLocaleDateString("en-KE", { dateStyle: "medium" });

export default async function LeavePage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; status?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePermission("people.view", "people");
  const sb = await createSupabaseServerClient();
  let q = sb.from("leave_requests").select("id, employee_id, leave_type_id, start_date, end_date, days, status, reason").order("start_date", { ascending: false }).limit(300);
  if (sp.status && Object.keys(TONE).includes(sp.status)) q = q.eq("status", sp.status);
  const [{ data }, emps, types] = await Promise.all([q, sb.from("employees").select("id, full_name"), sb.from("leave_types").select("id, name")]);
  const en = new Map((emps.data ?? []).map((e: { id: string; full_name: string }) => [e.id, e.full_name]));
  const tn = new Map((types.data ?? []).map((t: { id: string; name: string }) => [t.id, t.name]));
  const canManage = ctx.has("people.manage") || ctx.isSuper;
  return (
    <>
      <PageHeader title="Leave" description="All leave requests. Leave is approved by the approvers named in the approval rules (by default the employee's line manager) on the Approvals page; HR cannot skip that step here." />
      <Flash ok={sp.ok} error={sp.error} />
      <nav className="mb-4 flex flex-wrap gap-2 text-sm">
        {["", "pending", "approved", "rejected", "cancelled"].map((s) => (
          <a key={s || "all"} href={s ? `/admin/people/leave?status=${s}` : "/admin/people/leave"} className={`rounded border px-3 py-1 ${(sp.status ?? "") === s ? "border-navy bg-navy text-white" : "border-grey-300 text-navy hover:bg-grey"}`}>{s ? s[0].toUpperCase() + s.slice(1) : "All"}</a>
        ))}
      </nav>
      <Panel>
        {(data ?? []).length === 0 ? <p className="text-sm text-grey-500">No leave requests.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead><tr className="border-b border-grey-200 text-xs uppercase text-grey-500"><th className="py-2 pr-3">Employee</th><th className="pr-3">Type</th><th className="pr-3">From</th><th className="pr-3">To</th><th className="pr-3">Days</th><th className="pr-3">Status</th><th /></tr></thead>
              <tbody>
                {((data ?? []) as LR[]).map((l) => (
                  <tr key={l.id} className="border-b border-grey-100">
                    <td className="py-2 pr-3 font-medium text-navy">{en.get(l.employee_id) ?? "Employee"}</td>
                    <td className="pr-3">{tn.get(l.leave_type_id) ?? ""}</td><td className="pr-3">{d(l.start_date)}</td><td className="pr-3">{d(l.end_date)}</td><td className="pr-3">{l.days}</td>
                    <td className="pr-3"><Badge tone={TONE[l.status as keyof typeof TONE] ?? "grey"}>{l.status}</Badge></td>
                    <td>{canManage && (l.status === "pending" || l.status === "approved") && <form action={cancelLeave}><input type="hidden" name="id" value={l.id} /><button className="text-xs font-medium text-red-700 underline underline-offset-2">Cancel</button></form>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
