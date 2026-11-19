import { Flash } from "@/components/admin/Flash";
import { RestrictedDocuments } from "@/components/admin/RestrictedDocuments";
import { Badge, PageHeader, Panel } from "@/components/admin/ui";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { day, money } from "@/lib/finance/format";
import { cancelClaim, markReimbursed, submitClaim } from "./actions";

export const metadata = { title: "Expense claims" };
export const dynamic = "force-dynamic";

type Claim = { id: string; number: string; employee_id: string; category_id: string; expense_date: string; amount: number; currency: string; description: string; status: string };
const TONE = { pending: "amber", approved: "teal", rejected: "red", cancelled: "grey", paid_recorded: "green" } as const;
const LABEL: Record<string, string> = { pending: "Awaiting approval", approved: "Approved, not yet reimbursed", rejected: "Rejected", cancelled: "Cancelled", paid_recorded: "Reimbursed" };

export default async function ClaimsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; docs?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePermission("finance.claims", "finance");
  const sb = await createSupabaseServerClient();
  const { data: me } = await sb.rpc("my_employee_id");
  const [{ data: claims }, { data: cats }, { data: emps }, { data: reqs }] = await Promise.all([
    sb.from("expense_claims").select("id, number, employee_id, category_id, expense_date, amount, currency, description, status").order("created_at", { ascending: false }).limit(200),
    sb.from("finance_categories").select("id, name").eq("kind", "expense").eq("is_active", true).order("name"),
    sb.from("employees").select("id, full_name"),
    sb.from("approval_requests").select("record_id, status, steps, current_step").eq("subject", "expense").eq("status", "pending"),
  ]);
  const cn = new Map((cats ?? []).map((c: { id: string; name: string }) => [c.id, c.name]));
  const en = new Map((emps ?? []).map((e: { id: string; full_name: string }) => [e.id, e.full_name]));
  const waiting = new Map((reqs ?? []).map((r: { record_id: string; steps: { step_no: number; label: string }[]; current_step: number }) => [r.record_id, r.steps?.find((s) => s.step_no === r.current_step)?.label ?? ""]));
  const payer = ctx.has("finance.bills") || ctx.isSuper;
  const all = (claims ?? []) as Claim[];

  return (
    <>
      <PageHeader title="Expense claims" description="Claim back money you spent for the business. Your claim goes to the approvers named in the approval rules; you cannot approve your own. After approval, Finance records the reimbursement. Keep your receipts: document storage for them is on the claim record." />
      <Flash ok={sp.ok} error={sp.error} />
      <div className="space-y-5">
        {sp.docs && /^[0-9a-f-]{36}$/.test(sp.docs) && <RestrictedDocuments entityType="expense_claim" entityId={sp.docs} backPath={`/admin/finance/claims?docs=${sp.docs}`} />}
        {me ? (
          <Panel title="New claim">
            <form action={submitClaim} className="grid gap-3 text-sm sm:grid-cols-3">
              <label><span className="mb-1 block font-medium text-navy">Category</span><select name="category_id" required className="field-input"><option value="">Choose…</option>{(cats ?? []).map((c: { id: string; name: string }) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
              <label><span className="mb-1 block font-medium text-navy">Date spent</span><input type="date" name="expense_date" required defaultValue={new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" })} className="field-input" /></label>
              <label><span className="mb-1 block font-medium text-navy">Amount</span><input name="amount" required inputMode="decimal" className="field-input" /><input type="hidden" name="currency" value="KES" /></label>
              <label className="sm:col-span-3"><span className="mb-1 block font-medium text-navy">What was it for?</span><input name="description" required maxLength={500} className="field-input" /></label>
              <div className="sm:col-span-3"><button className="btn-primary px-4 py-2 text-sm">Submit claim</button></div>
            </form>
          </Panel>
        ) : <p className="text-sm text-charcoal">Your sign-in account is not linked to an employee record, so you cannot submit claims yet. Ask HR.</p>}

        <Panel title="Claims">
          {all.length === 0 ? <p className="text-sm text-grey-500">No claims.</p> : (
            <ul className="divide-y divide-grey-200 text-sm">
              {all.map((c) => (
                <li key={c.id} className="py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0"><p className="font-semibold text-navy">{c.number} · {en.get(c.employee_id) ?? "Employee"} <Badge tone={TONE[c.status as keyof typeof TONE] ?? "grey"}>{LABEL[c.status] ?? c.status}</Badge></p>
                      <p className="break-words text-charcoal">{cn.get(c.category_id)} · {c.description}</p><p className="text-xs text-grey-500">{day(c.expense_date)}{c.status === "pending" && waiting.get(c.id) ? ` · waiting for: ${waiting.get(c.id)}` : ""}</p></div>
                    <strong>{money(c.amount, c.currency)}</strong>
                  </div>
                  <a href={`/admin/finance/claims?docs=${c.id}`} className="mt-2 inline-block text-xs font-medium text-teal-dark underline underline-offset-2">Receipts and documents</a>
                  {c.status === "pending" && c.employee_id === me && <form action={cancelClaim} className="mt-2"><input type="hidden" name="id" value={c.id} /><button className="text-xs font-medium text-red-700 underline underline-offset-2">Cancel claim</button></form>}
                  {c.status === "approved" && payer && (
                    <form action={markReimbursed} className="mt-2 grid gap-2 sm:grid-cols-[1fr_9rem_auto]"><input type="hidden" name="id" value={c.id} />
                      <input name="reference" required minLength={3} maxLength={120} placeholder="Payment reference" aria-label="Payment reference" className="field-input" />
                      <input type="date" name="paid_on" aria-label="Date paid" className="field-input" />
                      <button className="btn-outline px-3 py-1.5 text-sm">Record reimbursement made</button></form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
