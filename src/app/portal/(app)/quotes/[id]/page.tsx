import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireCustomer } from "@/lib/portal/session";
import { PageHeader, Panel, Badge } from "@/components/admin/ui";
import { PortalFlash } from "@/components/portal/PortalFlash";
import { formatDate, formatDateTime, formatMoney, formatQty, quoteStatus } from "@/lib/portal/format";
import { isUuid } from "@/lib/admin/forms";
import type { QuoteDetail } from "@/lib/portal/types";
import { decideQuote } from "../actions";

export const metadata = { title: "Quotation" };

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  await requireCustomer();
  if (!isUuid(id)) notFound();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("portal_quote", { p_quote: id });
  const q = data as QuoteDetail | null;
  if (!q) notFound();
  const st = quoteStatus(q.status);
  return (
    <>
      <p className="mb-4 text-sm"><Link href="/portal/quotes" className="font-semibold text-teal-dark underline underline-offset-2">← All quotations</Link></p>
      <PageHeader title={q.number} description={`Issued ${formatDate(q.issue_date)}${q.valid_until ? ` · Valid until ${formatDate(q.valid_until)}` : ""}`}
        actions={<><Badge tone={st.tone}>{st.label}</Badge><a href={`/portal/quotes/${q.id}/pdf`} className="btn-outline">Download PDF</a></>} />
      <PortalFlash ok={sp.ok} error={sp.error} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Panel title="Items">
            <div className="-mx-2 overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead><tr className="border-b border-grey-200 text-left text-xs uppercase tracking-wide text-grey-500"><th className="px-2 py-2">Description</th><th className="px-2 py-2 text-right">Qty</th><th className="px-2 py-2 text-right">Price</th><th className="px-2 py-2 text-right">Amount</th></tr></thead>
                <tbody className="divide-y divide-grey-200">
                  {q.items.map((i) => (
                    <tr key={i.line_no}><td className="px-2 py-2.5 text-charcoal">{i.description}</td><td className="px-2 py-2.5 text-right">{formatQty(i.quantity)}{i.unit ? ` ${i.unit}` : ""}</td><td className="px-2 py-2.5 text-right">{formatMoney(i.unit_price, q.currency)}</td><td className="px-2 py-2.5 text-right font-semibold">{formatMoney(i.line_total, q.currency)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <dl className="mt-4 ml-auto max-w-xs space-y-1 text-sm">
              <div className="flex justify-between"><dt className="text-grey-500">Subtotal</dt><dd>{formatMoney(q.subtotal, q.currency)}</dd></div>
              {Number(q.tax_rate) > 0 && <div className="flex justify-between"><dt className="text-grey-500">Tax ({formatQty(q.tax_rate)}%)</dt><dd>{formatMoney(q.tax, q.currency)}</dd></div>}
              <div className="flex justify-between border-t border-grey-200 pt-1 font-bold text-navy"><dt>Total</dt><dd>{formatMoney(q.total, q.currency)}</dd></div>
            </dl>
          </Panel>
          {(q.delivery_terms || q.payment_terms || q.notes) && (
            <Panel title="Terms">
              <dl className="space-y-3 text-sm text-charcoal">
                {q.delivery_terms && <div><dt className="font-semibold text-navy">Delivery</dt><dd className="whitespace-pre-line">{q.delivery_terms}</dd></div>}
                {q.payment_terms && <div><dt className="font-semibold text-navy">Payment</dt><dd className="whitespace-pre-line">{q.payment_terms}</dd></div>}
                {q.notes && <div><dt className="font-semibold text-navy">Notes</dt><dd className="whitespace-pre-line">{q.notes}</dd></div>}
              </dl>
            </Panel>
          )}
        </div>
        <div>
          {q.can_decide ? (
            <Panel title="Your answer">
              <form action={decideQuote} className="space-y-3">
                <input type="hidden" name="quote_id" value={q.id} />
                <div><label htmlFor="note" className="field-label">Message (optional)</label><textarea id="note" name="note" rows={3} maxLength={500} className="field-input" /></div>
                <button name="decision" value="accepted" className="btn-primary w-full">Accept quotation</button>
                <button name="decision" value="declined" className="btn-outline w-full">Decline</button>
                <p className="text-xs text-grey-500">Accepting tells our team you want to go ahead. We will confirm your order with you.</p>
              </form>
            </Panel>
          ) : (
            <Panel title="Your answer">
              <p className="text-sm text-charcoal">{q.decision ? `You ${q.decision} this quotation${q.decision_at ? ` on ${formatDateTime(q.decision_at)}` : ""}.` : q.status === "expired" ? "This quotation has expired. Request a new one and we will update the price." : "This quotation is no longer open."}</p>
              {q.decision_note && <p className="mt-2 whitespace-pre-line text-sm text-grey-500">“{q.decision_note}”</p>}
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
