import Link from "next/link";
import { notFound } from "next/navigation";
import { Flash } from "@/components/admin/Flash";
import { PrintButton } from "@/components/admin/PrintButton";
import { Badge, PageHeader, Panel } from "@/components/admin/ui";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/admin/forms";
import { day, money } from "@/lib/finance/format";
import { addLine, issueInvoice, recordPayment, removeLine, saveDraft, voidInvoice } from "../actions";

export const metadata = { title: "Invoice" };
export const dynamic = "force-dynamic";
const TONE = { draft: "grey", issued: "amber", partially_paid: "amber", paid: "green", void: "red" } as const;

export default async function InvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await requirePermission("finance.view", "finance");
  if (!isUuid(id)) notFound();
  const sb = await createSupabaseServerClient();
  const { data: inv } = await sb.from("invoices").select("*").eq("id", id).maybeSingle();
  if (!inv) notFound();
  const [{ data: items }, { data: pays }, { data: tot }, { data: cust }, { data: co }] = await Promise.all([
    sb.from("invoice_items").select("id, line_no, description, quantity, unit_price").eq("invoice_id", id).order("line_no"),
    sb.from("invoice_payments").select("id, paid_on, amount, method, reference").eq("invoice_id", id).order("paid_on"),
    sb.from("invoice_totals").select("subtotal, tax, total, paid, balance").eq("invoice_id", id).maybeSingle(),
    sb.from("customers").select("company_name, contact_name, email, location").eq("id", inv.customer_id).maybeSingle(),
    sb.from("company_settings").select("registered_name, address_line, registration_details").eq("id", 1).maybeSingle(),
  ]);
  const can = ctx.has("finance.invoices") || ctx.isSuper;
  const draft = inv.status === "draft";
  const open = inv.status === "issued" || inv.status === "partially_paid";
  const cur = inv.currency as string;

  return (
    <>
      <PageHeader title={`Invoice ${inv.number}`} actions={<><Link href="/admin/finance/invoices" className="btn-outline px-3 py-2 text-sm print:hidden">All invoices</Link>{!draft && <PrintButton label="Print or save as PDF" />}</>} />
      <Flash ok={sp.ok} error={sp.error} />
      <div className="space-y-5">
        <Panel>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="text-sm">
              <p className="font-semibold text-navy">{co?.registered_name ?? "SAMSAL Supply & Distribution Limited"}</p>
              {co?.address_line && <p>{co.address_line}</p>}
              {co?.registration_details && <p className="whitespace-pre-line text-grey-500">{co.registration_details}</p>}
            </div>
            <div className="text-sm sm:text-right">
              <p><Badge tone={TONE[inv.status as keyof typeof TONE] ?? "grey"}>{String(inv.status).replace("_", " ")}</Badge></p>
              <p className="mt-1">Issued: {day(inv.issue_date) || "not yet"}</p>
              <p>Due: {day(inv.due_date) || "set when issued"}</p>
            </div>
          </div>
          <div className="mt-4 text-sm"><p className="text-xs uppercase text-grey-500">Bill to</p><p className="font-medium text-navy">{cust?.company_name || cust?.contact_name}</p>{cust?.company_name && <p>{cust.contact_name}</p>}{cust?.location && <p>{cust.location}</p>}{cust?.email && <p>{cust.email}</p>}</div>
          {inv.status === "void" && <p className="mt-3 text-sm text-red-700">Voided: {inv.void_reason}</p>}
        </Panel>

        <Panel title="Lines">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead><tr className="border-b border-grey-200 text-xs uppercase text-grey-500"><th className="py-2 pr-3">Description</th><th className="pr-3 text-right">Qty</th><th className="pr-3 text-right">Unit price</th><th className="pr-3 text-right">Amount</th>{draft && can && <th className="print:hidden" />}</tr></thead>
              <tbody>
                {(items ?? []).map((l: { id: string; description: string; quantity: number; unit_price: number }) => (
                  <tr key={l.id} className="border-b border-grey-100">
                    <td className="py-2 pr-3">{l.description}</td><td className="pr-3 text-right">{Number(l.quantity)}</td>
                    <td className="pr-3 text-right">{money(l.unit_price, cur)}</td><td className="pr-3 text-right">{money(Math.round(l.quantity * l.unit_price * 100) / 100, cur)}</td>
                    {draft && can && <td className="print:hidden"><form action={removeLine}><input type="hidden" name="id" value={id} /><input type="hidden" name="line" value={l.id} /><button className="text-xs font-medium text-red-700 underline underline-offset-2">Remove</button></form></td>}
                  </tr>
                ))}
              </tbody>
              <tfoot className="text-sm">
                <tr><td colSpan={3} className="pt-3 pr-3 text-right text-grey-500">Subtotal</td><td className="pt-3 pr-3 text-right">{money(tot?.subtotal, cur)}</td></tr>
                <tr><td colSpan={3} className="pr-3 text-right text-grey-500">Tax ({Number(inv.tax_rate)}%)</td><td className="pr-3 text-right">{money(tot?.tax, cur)}</td></tr>
                <tr><td colSpan={3} className="pr-3 text-right font-semibold text-navy">Total</td><td className="pr-3 text-right font-semibold text-navy">{money(tot?.total, cur)}</td></tr>
                {!draft && inv.status !== "void" && <><tr><td colSpan={3} className="pr-3 text-right text-grey-500">Paid</td><td className="pr-3 text-right">{money(tot?.paid, cur)}</td></tr><tr><td colSpan={3} className="pr-3 text-right font-semibold">Balance due</td><td className="pr-3 text-right font-semibold">{money(tot?.balance, cur)}</td></tr></>}
              </tfoot>
            </table>
          </div>
          {inv.notes && <p className="mt-4 whitespace-pre-line text-sm text-charcoal">{inv.notes}</p>}
          {draft && can && (
            <form action={addLine} className="mt-4 grid gap-2 border-t border-grey-200 pt-4 sm:grid-cols-[1fr_6rem_8rem_auto] print:hidden">
              <input type="hidden" name="id" value={id} />
              <input name="description" required maxLength={300} placeholder="Description" aria-label="Description" className="field-input" />
              <input name="quantity" required defaultValue="1" inputMode="decimal" aria-label="Quantity" className="field-input" />
              <input name="unit_price" required inputMode="decimal" placeholder="Unit price" aria-label="Unit price" className="field-input" />
              <button className="btn-outline px-4 py-2 text-sm">Add line</button>
            </form>
          )}
        </Panel>

        {draft && can && (
          <div className="grid gap-5 lg:grid-cols-2 print:hidden">
            <Panel title="Details">
              <form action={saveDraft} className="space-y-3 text-sm">
                <input type="hidden" name="id" value={id} />
                <label className="block"><span className="mb-1 block font-medium text-navy">Due date</span><input type="date" name="due_date" defaultValue={inv.due_date ?? ""} className="field-input" /></label>
                <label className="block"><span className="mb-1 block font-medium text-navy">Tax rate (%)</span><input name="tax_rate" defaultValue={String(inv.tax_rate)} inputMode="decimal" className="field-input" /></label>
                <label className="block"><span className="mb-1 block font-medium text-navy">Notes</span><textarea name="notes" rows={3} maxLength={2000} defaultValue={inv.notes ?? ""} className="field-input" /></label>
                <button className="btn-outline px-4 py-2 text-sm">Save details</button>
              </form>
            </Panel>
            <Panel title="Issue">
              <p className="mb-3 text-sm text-charcoal">Issuing locks the invoice and records who issued it. It is not sent to the customer automatically: print or save it as a PDF and send it yourself.</p>
              <form action={issueInvoice}><input type="hidden" name="id" value={id} /><button className="btn-primary px-4 py-2 text-sm">Issue invoice</button></form>
            </Panel>
          </div>
        )}

        {(pays ?? []).length > 0 && (
          <Panel title="Payments received">
            <ul className="divide-y divide-grey-200 text-sm">{(pays ?? []).map((p: { id: string; paid_on: string; amount: number; method: string; reference: string | null }) => <li key={p.id} className="flex flex-wrap justify-between gap-2 py-2"><span>{day(p.paid_on)} · {p.method}{p.reference ? ` · ${p.reference}` : ""}</span><strong>{money(p.amount, cur)}</strong></li>)}</ul>
          </Panel>
        )}

        {open && can && (
          <div className="grid gap-5 lg:grid-cols-2 print:hidden">
            <Panel title="Record a payment received">
              <form action={recordPayment} className="grid gap-3 text-sm sm:grid-cols-2">
                <input type="hidden" name="id" value={id} />
                <label><span className="mb-1 block font-medium text-navy">Amount</span><input name="amount" required inputMode="decimal" defaultValue={String(tot?.balance ?? "")} className="field-input" /></label>
                <label><span className="mb-1 block font-medium text-navy">Date received</span><input type="date" name="paid_on" className="field-input" /></label>
                <label><span className="mb-1 block font-medium text-navy">Method</span><select name="method" className="field-input">{["bank", "mpesa", "cash", "cheque", "other"].map((m) => <option key={m} value={m}>{m}</option>)}</select></label>
                <label><span className="mb-1 block font-medium text-navy">Reference</span><input name="reference" maxLength={120} className="field-input" /></label>
                <div className="sm:col-span-2"><button className="btn-primary px-4 py-2 text-sm">Record payment</button></div>
              </form>
            </Panel>
            {(pays ?? []).length === 0 && (
              <Panel title="Void this invoice">
                <form action={voidInvoice} className="space-y-3 text-sm"><input type="hidden" name="id" value={id} />
                  <label className="block"><span className="mb-1 block font-medium text-navy">Reason</span><input name="reason" required minLength={3} maxLength={300} className="field-input" /></label>
                  <button className="rounded border border-red-600 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50">Void invoice</button></form>
              </Panel>
            )}
          </div>
        )}
        {draft && can && (
          <Panel title="Discard this draft" className="print:hidden">
            <form action={voidInvoice} className="flex flex-col gap-2 text-sm sm:flex-row sm:items-end"><input type="hidden" name="id" value={id} />
              <label className="flex-1"><span className="mb-1 block font-medium text-navy">Reason</span><input name="reason" required minLength={3} maxLength={300} defaultValue="Draft not needed" className="field-input" /></label>
              <button className="rounded border border-red-600 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50">Void draft</button></form>
          </Panel>
        )}
      </div>
    </>
  );
}
