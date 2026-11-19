import Link from "next/link";
import { Flash } from "@/components/admin/Flash";
import { Badge, Notice, PageHeader, Panel } from "@/components/admin/ui";
import { requireStaff } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/admin/forms";
import { createRun, generateLines, recordPaid, removeLine, saveLines, submitRun } from "./actions";

export const metadata = { title: "Payroll" };
export const dynamic = "force-dynamic";

type Run = { id: string; reference: string; period_start: string; period_end: string; currency: string; status: string; notes: string | null; prepared_by: string | null; paid_on: string | null; payment_reference: string | null };
type Totals = { run_id: string; lines: number; gross: number; deductions: number; net: number };
type Line = { id: string; employee_id: string; gross_pay: number; deductions: number; net_pay: number; note: string | null };
const TONE = { draft: "grey", pending_approval: "amber", approved: "teal", paid_recorded: "green", cancelled: "red" } as const;
const LABEL: Record<string, string> = { draft: "Draft", pending_approval: "Awaiting approval", approved: "Approved, not yet paid", paid_recorded: "Payment recorded", cancelled: "Cancelled" };
const money = (n: number, c: string) => `${c} ${Number(n).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const d = (v: string) => new Date(v + "T00:00:00").toLocaleDateString("en-KE", { dateStyle: "medium" });

export default async function PayrollPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; run?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireStaff();
  const prepare = ctx.has("people.payroll_prepare") || ctx.isSuper;
  const approver = ctx.has("people.payroll_approve") || ctx.has("finance.payroll_approve") || ctx.isSuper;
  if (!(prepare || approver) || !ctx.moduleEnabled("people")) redirect("/admin/forbidden");
  const sb = await createSupabaseServerClient();
  const [{ data: runs }, { data: totals }] = await Promise.all([
    sb.from("payroll_runs").select("id, reference, period_start, period_end, currency, status, notes, prepared_by, paid_on, payment_reference").order("period_start", { ascending: false }).limit(60),
    sb.from("payroll_run_totals").select("run_id, lines, gross, deductions, net"),
  ]);
  const list = (runs ?? []) as Run[];
  const tot = new Map(((totals ?? []) as Totals[]).map((t) => [t.run_id, t]));
  const current = sp.run && isUuid(sp.run) ? list.find((r) => r.id === sp.run) : undefined;

  const banner = <Notice tone="warn">This system <strong>records</strong> payroll. It never pays anyone. A run must be approved by an HR approver and then a Finance approver (neither can be the person who prepared it) before it can be recorded as paid, and the payment itself is made outside this system. It does not calculate PAYE, NSSF, SHIF, the housing levy or other statutory deductions: enter those yourself and have your accountant confirm the figures.</Notice>;

  if (current) {
    const [{ data: lines }, { data: emps }, { data: reqs }] = await Promise.all([
      sb.from("payroll_lines").select("id, employee_id, gross_pay, deductions, net_pay, note").eq("run_id", current.id),
      sb.from("employees").select("id, full_name, employee_no"),
      sb.from("approval_requests").select("id, status, current_step, steps").eq("subject", "payroll").eq("record_id", current.id).order("created_at", { ascending: false }).limit(1),
    ]);
    const en = new Map((emps ?? []).map((e: { id: string; full_name: string; employee_no: string }) => [e.id, `${e.full_name} (${e.employee_no})`]));
    const t = tot.get(current.id);
    const draft = current.status === "draft";
    const req = (reqs ?? [])[0] as { status: string; current_step: number; steps: { step_no: number; label: string }[] } | undefined;
    const iPrepared = current.prepared_by === ctx.userId;
    return (
      <>
        <PageHeader title={`Payroll ${current.reference}`} description={`${d(current.period_start)} to ${d(current.period_end)}`} actions={<Link href="/admin/people/payroll" className="btn-outline px-3 py-2 text-sm">All payroll runs</Link>} />
        <Flash ok={sp.ok} error={sp.error} />
        <div className="space-y-5">
          {banner}
          <Panel>
            <p className="flex flex-wrap items-center gap-3 text-sm"><Badge tone={TONE[current.status as keyof typeof TONE] ?? "grey"}>{LABEL[current.status] ?? current.status}</Badge>
              {t && <span className="text-charcoal">{t.lines} employee(s) · gross {money(t.gross, current.currency)} · deductions {money(t.deductions, current.currency)} · <strong>net {money(t.net, current.currency)}</strong></span>}</p>
            {current.status === "pending_approval" && req && <p className="mt-2 text-sm text-grey-500">Waiting at step {req.current_step}: {req.steps?.find((s) => s.step_no === req.current_step)?.label}. Approvers decide on the <Link href="/admin/approvals" className="underline">Approvals</Link> page.</p>}
            {current.status === "paid_recorded" && <p className="mt-2 text-sm text-charcoal">Recorded as paid on {current.paid_on ? d(current.paid_on) : ""}. Payment reference: {current.payment_reference}</p>}
            {draft && req?.status === "rejected" && <p className="mt-2 text-sm text-red-700">The last submission was rejected. Correct the run and submit it again.</p>}
          </Panel>

          <Panel title="Lines">
            {(lines ?? []).length === 0 ? (
              <div className="text-sm text-charcoal">
                <p className="mb-3">No lines yet.{draft && prepare ? " Fill the run from recorded salary records (employees without a salary record are left out)." : ""}</p>
                {draft && prepare && <form action={generateLines}><input type="hidden" name="id" value={current.id} /><button className="btn-primary px-4 py-2 text-sm">Fill from salary records</button></form>}
              </div>
            ) : (
              <form action={saveLines}>
                <input type="hidden" name="id" value={current.id} />
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[680px] text-left text-sm">
                    <thead><tr className="border-b border-grey-200 text-xs uppercase text-grey-500"><th className="py-2 pr-3">Employee</th><th className="pr-3 text-right">Gross</th><th className="pr-3">Deductions</th><th className="pr-3 text-right">Net</th><th className="pr-3">Note</th>{draft && prepare && <th />}</tr></thead>
                    <tbody>
                      {((lines ?? []) as Line[]).map((l) => (
                        <tr key={l.id} className="border-b border-grey-100 align-middle">
                          <td className="py-2 pr-3 font-medium text-navy">{en.get(l.employee_id) ?? "Employee"}</td>
                          <td className="pr-3 text-right">{Number(l.gross_pay).toLocaleString("en-KE", { minimumFractionDigits: 2 })}</td>
                          <td className="pr-3">{draft && prepare ? <input name={`ded_${l.id}`} defaultValue={String(l.deductions)} inputMode="decimal" className="w-28 rounded border border-grey-300 px-2 py-1" aria-label="Deductions" /> : Number(l.deductions).toLocaleString("en-KE", { minimumFractionDigits: 2 })}</td>
                          <td className="pr-3 text-right font-semibold">{Number(l.net_pay).toLocaleString("en-KE", { minimumFractionDigits: 2 })}</td>
                          <td className="pr-3">{draft && prepare ? <input name={`note_${l.id}`} defaultValue={l.note ?? ""} maxLength={500} className="w-full min-w-40 rounded border border-grey-300 px-2 py-1" aria-label="Note" /> : l.note}</td>
                          {draft && prepare && <td><button type="submit" form={`rm_${l.id}`} className="text-xs font-medium text-red-700 underline underline-offset-2">Remove</button></td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {draft && prepare && <div className="mt-4 flex flex-wrap gap-2"><button className="btn-outline px-4 py-2 text-sm">Save deductions</button></div>}
              </form>
              {draft && prepare && ((lines ?? []) as Line[]).map((l) => (
                <form key={l.id} id={`rm_${l.id}`} action={removeLine}><input type="hidden" name="id" value={current.id} /><input type="hidden" name="line" value={l.id} /></form>
              ))}
            )}
          </Panel>

          {draft && prepare && (lines ?? []).length > 0 && (
            <Panel title="Submit for approval">
              <p className="mb-3 text-sm text-charcoal">Check the figures first. After you submit, the lines are locked. If an approver rejects the run it comes back here as a draft.</p>
              <form action={submitRun}><input type="hidden" name="id" value={current.id} /><button className="btn-primary px-4 py-2 text-sm">Submit for approval</button></form>
            </Panel>
          )}

          {current.status === "approved" && (
            <Panel title="Record that payment was made">
              {ctx.has("finance.payroll_approve") || ctx.isSuper ? (
                iPrepared ? <p className="text-sm text-charcoal">You prepared this run, so someone else must record the payment.</p> : (
                  <form action={recordPaid} className="grid gap-3 sm:grid-cols-3">
                    <input type="hidden" name="id" value={current.id} />
                    <label className="text-sm sm:col-span-2"><span className="mb-1 block font-medium text-navy">Payment reference from the bank or payment provider</span><input name="reference" required minLength={3} maxLength={120} className="w-full rounded border border-grey-300 px-3 py-2" /></label>
                    <label className="text-sm"><span className="mb-1 block font-medium text-navy">Date paid</span><input type="date" name="paid_on" className="w-full rounded border border-grey-300 px-3 py-2" /></label>
                    <div className="sm:col-span-3"><button className="btn-primary px-4 py-2 text-sm">Record payment</button></div>
                  </form>
                )
              ) : <p className="text-sm text-charcoal">This run is approved. A Finance approver records the payment once it has been made.</p>}
            </Panel>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Payroll" description="Payroll records for each pay period." />
      <Flash ok={sp.ok} error={sp.error} />
      <div className="space-y-5">
        {banner}
        {prepare && (
          <Panel title="Start a payroll run">
            <form action={createRun} className="grid gap-3 sm:grid-cols-4">
              <label className="text-sm"><span className="mb-1 block font-medium text-navy">Period start</span><input type="date" name="period_start" required className="w-full rounded border border-grey-300 px-3 py-2" /></label>
              <label className="text-sm"><span className="mb-1 block font-medium text-navy">Period end</span><input type="date" name="period_end" required className="w-full rounded border border-grey-300 px-3 py-2" /></label>
              <label className="text-sm"><span className="mb-1 block font-medium text-navy">Currency</span><input name="currency" defaultValue="KES" maxLength={3} className="w-full rounded border border-grey-300 px-3 py-2 uppercase" /></label>
              <div className="flex items-end"><button className="btn-primary px-4 py-2 text-sm">Start run</button></div>
            </form>
          </Panel>
        )}
        <Panel title="Payroll runs">
          {list.length === 0 ? <p className="text-sm text-grey-500">No payroll runs yet.</p> : (
            <ul className="divide-y divide-grey-200 text-sm">
              {list.map((r) => {
                const t = tot.get(r.id);
                return (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <span><Link href={`/admin/people/payroll?run=${r.id}`} className="font-semibold text-navy underline underline-offset-2">{r.reference}</Link> <span className="text-grey-500">{d(r.period_start)} to {d(r.period_end)}{t ? ` · ${t.lines} employee(s) · net ${money(t.net, r.currency)}` : ""}</span></span>
                    <Badge tone={TONE[r.status as keyof typeof TONE] ?? "grey"}>{LABEL[r.status] ?? r.status}</Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
