import { Flash } from "@/components/admin/Flash";
import { Badge, Notice, PageHeader, Panel } from "@/components/admin/ui";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { day, money } from "@/lib/finance/format";
import { billFromPo, createBill, recordBillPayment, submitBill, voidBill } from "./actions";

export const metadata = { title: "Supplier bills" };
export const dynamic = "force-dynamic";

type Bill = { id: string; number: string; supplier_id: string; supplier_reference: string | null; status: string; currency: string; due_date: string | null; amount: number; description: string | null; created_by: string | null };
type Tot = { bill_id: string; paid: number; balance: number };
const TONE = { draft: "grey", pending_approval: "amber", approved: "teal", partially_paid: "amber", paid: "green", void: "red" } as const;
const LABEL: Record<string, string> = { draft: "Draft", pending_approval: "Awaiting approval", approved: "Approved, unpaid", partially_paid: "Part paid", paid: "Paid", void: "Void" };

export default async function BillsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; status?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePermission("finance.view", "finance");
  const can = ctx.has("finance.bills") || ctx.isSuper;
  const sb = await createSupabaseServerClient();
  let q = sb.from("supplier_bills").select("id, number, supplier_id, supplier_reference, status, currency, due_date, amount, description, created_by").is("deleted_at", null).order("created_at", { ascending: false }).limit(200);
  if (sp.status && Object.keys(LABEL).includes(sp.status)) q = q.eq("status", sp.status);
  const [{ data }, { data: tots }, { data: sup }] = await Promise.all([q, sb.from("bill_totals").select("bill_id, paid, balance"), sb.from("suppliers").select("id, name").is("deleted_at", null).order("name")]);
  const tot = new Map(((tots ?? []) as Tot[]).map((t) => [t.bill_id, t]));
  const sn = new Map((sup ?? []).map((s: { id: string; name: string }) => [s.id, s.name]));
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" });

  let pos: { id: string; number: string; supplier_id: string }[] = [];
  if (can && ctx.moduleEnabled("procurement")) {
    const [{ data: p }, { data: billed }] = await Promise.all([
      sb.from("purchase_orders").select("id, number, supplier_id").in("status", ["received", "partially_received"]).is("deleted_at", null).limit(50),
      sb.from("supplier_bills").select("purchase_order_id").not("purchase_order_id", "is", null).neq("status", "void"),
    ]);
    const done = new Set((billed ?? []).map((b: { purchase_order_id: string }) => b.purchase_order_id));
    pos = ((p ?? []) as typeof pos).filter((x) => !done.has(x.id));
  }

  return (
    <>
      <PageHeader title="Supplier bills" description="What you owe suppliers. A bill must be approved before a payment can be recorded, and the person who prepared it cannot record the payment. This system records payments; it never makes them." />
      <Flash ok={sp.ok} error={sp.error} />
      <div className="space-y-5">
        {pos.length > 0 && (
          <Panel title="Received orders without a bill">
            <ul className="space-y-2 text-sm">{pos.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2"><span><strong className="text-navy">{p.number}</strong> · {sn.get(p.supplier_id) ?? "Supplier"}</span>
                <form action={billFromPo}><input type="hidden" name="po" value={p.id} /><button className="btn-outline px-3 py-1.5 text-sm">Create draft bill</button></form></li>
            ))}</ul>
          </Panel>
        )}
        {can && (
          <Panel title="Capture a bill">
            <form action={createBill} className="grid gap-3 text-sm sm:grid-cols-3">
              <label className="sm:col-span-2"><span className="mb-1 block font-medium text-navy">Supplier</span><select name="supplier_id" required className="field-input"><option value="">Choose…</option>{(sup ?? []).map((s: { id: string; name: string }) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
              <label><span className="mb-1 block font-medium text-navy">Supplier's invoice number</span><input name="supplier_reference" maxLength={80} className="field-input" /></label>
              <label><span className="mb-1 block font-medium text-navy">Amount owed</span><input name="amount" required inputMode="decimal" className="field-input" /></label>
              <label><span className="mb-1 block font-medium text-navy">Currency</span><input name="currency" defaultValue="KES" maxLength={3} className="field-input uppercase" /></label>
              <label><span className="mb-1 block font-medium text-navy">Bill date</span><input type="date" name="bill_date" className="field-input" /></label>
              <label><span className="mb-1 block font-medium text-navy">Due date</span><input type="date" name="due_date" className="field-input" /></label>
              <label className="sm:col-span-2"><span className="mb-1 block font-medium text-navy">What it is for</span><input name="description" maxLength={500} className="field-input" /></label>
              <div className="sm:col-span-3"><button className="btn-primary px-4 py-2 text-sm">Save draft bill</button></div>
            </form>
          </Panel>
        )}
        <nav className="flex flex-wrap gap-2 text-sm">
          {["", ...Object.keys(LABEL)].map((s) => <a key={s || "all"} href={s ? `/admin/finance/bills?status=${s}` : "/admin/finance/bills"} className={`rounded border px-3 py-1 ${(sp.status ?? "") === s ? "border-navy bg-navy text-white" : "border-grey-300 text-navy hover:bg-grey"}`}>{s ? LABEL[s] : "All"}</a>)}
        </nav>
        <Panel>
          {(data ?? []).length === 0 ? <p className="text-sm text-grey-500">No bills.</p> : (
            <ul className="divide-y divide-grey-200">
              {((data ?? []) as Bill[]).map((b) => {
                const t = tot.get(b.id);
                const overdue = (b.status === "approved" || b.status === "partially_paid") && b.due_date && b.due_date < today;
                const mine = b.created_by === ctx.userId;
                return (
                  <li key={b.id} className="py-3 text-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0"><p className="font-semibold text-navy">{b.number} · {sn.get(b.supplier_id) ?? "Supplier"} <Badge tone={TONE[b.status as keyof typeof TONE] ?? "grey"}>{LABEL[b.status] ?? b.status}</Badge>{overdue ? <> <Badge tone="red">overdue</Badge></> : null}</p>
                        <p className="break-words text-charcoal">{b.description}{b.supplier_reference ? ` · their ref ${b.supplier_reference}` : ""}</p>
                        <p className="text-xs text-grey-500">Due {day(b.due_date) || "not set"}</p></div>
                      <div className="text-right"><p className="font-semibold">{money(b.amount, b.currency)}</p>{t && t.paid > 0 && <p className="text-xs text-grey-500">Paid {money(t.paid, b.currency)} · balance {money(t.balance, b.currency)}</p>}</div>
                    </div>
                    {can && b.status === "draft" && (
                      <div className="mt-2 flex flex-wrap gap-3">
                        <form action={submitBill}><input type="hidden" name="id" value={b.id} /><button className="btn-primary px-3 py-1.5 text-sm">Submit for approval</button></form>
                        <form action={voidBill} className="flex items-center gap-2"><input type="hidden" name="id" value={b.id} /><input name="reason" required minLength={3} placeholder="Reason to discard" className="field-input w-48" aria-label="Reason" /><button className="text-sm font-medium text-red-700 underline underline-offset-2">Void</button></form>
                      </div>
                    )}
                    {b.status === "pending_approval" && <p className="mt-2 text-xs text-grey-500">Waiting for the approvers named in the approval rules (see Approvals).</p>}
                    {can && (b.status === "approved" || b.status === "partially_paid") && (
                      mine ? <Notice tone="info">You prepared this bill, so someone else must record the payment.</Notice> : (
                        <form action={recordBillPayment} className="mt-2 grid gap-2 sm:grid-cols-[8rem_9rem_7rem_1fr_auto]">
                          <input type="hidden" name="id" value={b.id} />
                          <input name="amount" required inputMode="decimal" defaultValue={String(t?.balance ?? "")} aria-label="Amount paid" className="field-input" />
                          <input type="date" name="paid_on" aria-label="Date paid" className="field-input" />
                          <select name="method" aria-label="Method" className="field-input">{["bank", "mpesa", "cash", "cheque", "other"].map((m) => <option key={m}>{m}</option>)}</select>
                          <input name="reference" required minLength={3} maxLength={120} placeholder="Payment reference" aria-label="Payment reference" className="field-input" />
                          <button className="btn-outline px-3 py-1.5 text-sm">Record payment made</button>
                        </form>
                      )
                    )}
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
