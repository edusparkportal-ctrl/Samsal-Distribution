import Link from "next/link";
import { notFound } from "next/navigation";
import { Flash } from "@/components/admin/Flash";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { Badge, Notice, PageHeader, Panel } from "@/components/admin/ui";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/admin/forms";
import { computeTotals, formatLineText, money } from "@/lib/quotation";
import { deleteDraft, saveQuotation, setQuotationStatus } from "../actions";

export const metadata = { title: "Quotation" };
const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

export default async function QuotationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const ctx = await requirePermission("quotations.view", "quotations");
  if (!isUuid(id)) notFound();
  const sb = await createSupabaseServerClient();
  const { data: q } = await sb.from("quotations").select("*, customer:customers(company_name, contact_name, email), enquiry:enquiries(id, reference)").eq("id", id).maybeSingle();
  if (!q) notFound();
  const { data: items } = await sb.from("quotation_items").select("line_no, description, quantity, unit_price, unit:units(code)").eq("quotation_id", id).order("line_no");
  const lines = (items ?? []).map((i: any) => ({ description: i.description, quantity: i.quantity, unit_price: i.unit_price, unit: one<any>(i.unit)?.code ?? null })); // eslint-disable-line @typescript-eslint/no-explicit-any
  const totals = computeTotals(lines.map((l) => ({ quantity: Number(l.quantity), unitPrice: Number(l.unit_price) })), Number(q.tax_rate_percent));
  const draft = q.status === "draft", can = ctx.has("quotations.manage");
  const c = one<any>(q.customer), en = one<any>(q.enquiry); // eslint-disable-line @typescript-eslint/no-explicit-any
  const statusBtn = (to: string, label: string, cls = "btn-outline") => (
    <form action={setQuotationStatus} className="inline"><input type="hidden" name="id" value={id} /><input type="hidden" name="to" value={to} /><ConfirmButton message={`Mark this quotation as ${to}?`} className={`${cls} px-4 py-2 text-sm`}>{label}</ConfirmButton></form>
  );
  return (
    <>
      <PageHeader title={q.number} description={`${c?.company_name ?? c?.contact_name ?? "Customer"}${en ? ` · from ${en.reference}` : ""}`}
        actions={<><Badge tone={draft ? "grey" : q.status === "accepted" ? "green" : q.status === "sent" ? "navy" : "red"}>{q.status}</Badge><a href={`/admin/quotations/${id}/pdf`} className="btn-primary px-4 py-2 text-sm">Download PDF</a><Link href="/admin/quotations" className="btn-outline px-4 py-2 text-sm">Back</Link></>} />
      <Flash ok={sp.ok} error={sp.error} />
      {!draft && <div className="mb-4"><Notice tone="info">This quotation has been issued and is locked. To change it, cancel it and prepare a new one.</Notice></div>}
      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <Panel title="Lines and terms">
          <form action={saveQuotation} className="space-y-4">
            <input type="hidden" name="id" value={id} />
            <div>
              <label htmlFor="lines" className="text-sm font-semibold text-navy">Lines</label>
              <p className="text-xs text-grey-500">One per row: <code>description | quantity | unit price | unit (optional)</code>. Units: carton, box, piece, pack, kg, litre, roll, ream, …</p>
              <textarea id="lines" name="lines" rows={8} defaultValue={formatLineText(lines)} readOnly={!draft || !can} className="field-input font-mono text-sm" />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div><label htmlFor="issue_date" className="text-sm font-semibold text-navy">Issue date</label><input id="issue_date" type="date" name="issue_date" defaultValue={q.issue_date} readOnly={!draft || !can} required className="field-input" /></div>
              <div><label htmlFor="valid_until" className="text-sm font-semibold text-navy">Valid until</label><input id="valid_until" type="date" name="valid_until" defaultValue={q.valid_until ?? ""} readOnly={!draft || !can} className="field-input" /></div>
              <div><label htmlFor="tax" className="text-sm font-semibold text-navy">Tax rate %</label><input id="tax" name="tax_rate_percent" inputMode="decimal" defaultValue={String(q.tax_rate_percent)} readOnly={!draft || !can} className="field-input" /></div>
            </div>
            {[["delivery_terms", "Delivery terms"], ["payment_terms", "Payment terms"], ["notes", "Notes to the customer"]].map(([k, label]) => (
              <div key={k}><label htmlFor={k} className="text-sm font-semibold text-navy">{label}</label><textarea id={k} name={k} rows={2} maxLength={2000} defaultValue={q[k] ?? ""} readOnly={!draft || !can} className="field-input" /></div>
            ))}
            {draft && can && <button className="btn-primary px-5 py-2.5 text-sm">Save quotation</button>}
          </form>
        </Panel>
        <div className="space-y-5">
          <Panel title="Totals">
            <dl className="space-y-1 text-sm"><div className="flex justify-between"><dt>Subtotal</dt><dd>{money(totals.subtotal, q.currency)}</dd></div>
              {Number(q.tax_rate_percent) > 0 && <div className="flex justify-between"><dt>Tax ({Number(q.tax_rate_percent)}%)</dt><dd>{money(totals.tax, q.currency)}</dd></div>}
              <div className="flex justify-between border-t border-grey-200 pt-1 font-bold text-navy"><dt>Total</dt><dd>{money(totals.total, q.currency)}</dd></div></dl>
            <p className="mt-2 text-xs text-grey-500">Totals are calculated from the saved lines.</p>
          </Panel>
          {can && (
            <Panel title="Status">
              <div className="flex flex-wrap gap-2">
                {draft && statusBtn("sent", "Mark as sent", "btn-primary")}
                {draft && statusBtn("cancelled", "Cancel")}
                {q.status === "sent" && <>{statusBtn("accepted", "Customer accepted", "btn-primary")}{statusBtn("declined", "Customer declined")}{statusBtn("cancelled", "Cancel")}</>}
              </div>
              {q.decision && <p className="mt-3 text-sm">Decision: <strong>{q.decision}</strong>{q.decision_at ? ` on ${String(q.decision_at).slice(0, 10)}` : ""}{q.decision_note ? ` — ${q.decision_note}` : ""}</p>}
              {draft && <form action={deleteDraft} className="mt-4"><input type="hidden" name="id" value={id} /><ConfirmButton message="Delete this draft permanently?" className="text-sm text-red-700 hover:underline">Delete draft</ConfirmButton></form>}
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
