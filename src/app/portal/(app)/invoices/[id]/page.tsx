import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireCustomer } from "@/lib/portal/session";
import { PageHeader, Panel, Badge, Notice } from "@/components/admin/ui";
import { PortalFlash } from "@/components/portal/PortalFlash";
import MpesaWatcher from "@/components/portal/MpesaWatcher";
import { formatDate, formatMoney, formatQty, invoiceStatus, payMethod } from "@/lib/portal/format";
import { isUuid } from "@/lib/admin/forms";
import { getMpesaConfig } from "@/lib/mpesa/service";
import type { InvoiceDetail, MpesaStatus, PayInfo } from "@/lib/portal/types";
import { payWithMpesa } from "../actions";

export const metadata = { title: "Invoice" };
const DONE: Record<string, { tone: "success" | "error" | "info"; text: string }> = {
  succeeded: { tone: "success", text: "Payment received. Thank you." },
  failed: { tone: "error", text: "The payment did not go through. You have not been charged; please try again." },
  cancelled: { tone: "error", text: "The payment was cancelled on your phone. You have not been charged." },
  expired: { tone: "error", text: "The request timed out. If money left your account, contact us with the M-Pesa message and we will match it." },
  needs_review: { tone: "info", text: "We received your payment and our team is confirming it. It will show on this invoice shortly." },
};

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string; pay?: string; done?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  await requireCustomer();
  if (!isUuid(id)) notFound();
  const supabase = await createSupabaseServerClient();
  const [{ data }, { data: payInfo }] = await Promise.all([supabase.rpc("portal_invoice", { p_invoice: id }), supabase.rpc("portal_pay_info")]);
  const inv = data as InvoiceDetail | null;
  if (!inv) notFound();
  const pay = (payInfo ?? null) as PayInfo | null;
  const st = invoiceStatus(inv.status, inv.overdue);
  const payable = inv.status !== "paid" && Number(inv.balance) > 0;
  const mpesaOn = Boolean(pay?.mpesa_online) && Boolean(getMpesaConfig()) && inv.currency === "KES" && payable;
  let pending: MpesaStatus | null = null;
  if (sp.pay && isUuid(sp.pay)) {
    const { data: m } = await supabase.rpc("portal_mpesa_status", { p_id: sp.pay });
    const ms = m as MpesaStatus | null;
    if (ms && ms.invoice_id === id && (ms.status === "pending" || ms.status === "created")) pending = ms;
  }
  const done = sp.done ? DONE[sp.done] : undefined;
  const maxPay = Math.floor(Number(inv.balance));

  return (
    <>
      <p className="mb-4 text-sm"><Link href="/portal/invoices" className="font-semibold text-teal-dark underline underline-offset-2">← All invoices</Link></p>
      <PageHeader title={inv.number} description={`Issued ${formatDate(inv.issue_date)} · Due ${formatDate(inv.due_date)}`}
        actions={<><Badge tone={st.tone}>{st.label}</Badge><a href={`/portal/invoices/${inv.id}/pdf`} className="btn-outline">Download PDF</a></>} />
      <PortalFlash ok={sp.ok} error={sp.error} />
      {done && <div className="mb-5"><Notice tone={done.tone}>{done.text}</Notice></div>}
      {pending && <div className="mb-5"><MpesaWatcher id={pending.id} invoiceId={inv.id} /></div>}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Panel title="Items">
            <div className="-mx-2 overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead><tr className="border-b border-grey-200 text-left text-xs uppercase tracking-wide text-grey-500"><th className="px-2 py-2">Description</th><th className="px-2 py-2 text-right">Qty</th><th className="px-2 py-2 text-right">Price</th><th className="px-2 py-2 text-right">Amount</th></tr></thead>
                <tbody className="divide-y divide-grey-200">
                  {inv.items.map((i) => (
                    <tr key={i.line_no}><td className="px-2 py-2.5 text-charcoal">{i.description}</td><td className="px-2 py-2.5 text-right">{formatQty(i.quantity)}</td><td className="px-2 py-2.5 text-right">{formatMoney(i.unit_price, inv.currency)}</td><td className="px-2 py-2.5 text-right font-semibold">{formatMoney(i.line_total, inv.currency)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <dl className="mt-4 ml-auto max-w-xs space-y-1 text-sm">
              <div className="flex justify-between"><dt className="text-grey-500">Subtotal</dt><dd>{formatMoney(inv.subtotal, inv.currency)}</dd></div>
              {Number(inv.tax_rate) > 0 && <div className="flex justify-between"><dt className="text-grey-500">Tax ({formatQty(inv.tax_rate)}%)</dt><dd>{formatMoney(inv.tax, inv.currency)}</dd></div>}
              <div className="flex justify-between border-t border-grey-200 pt-1 font-bold text-navy"><dt>Total</dt><dd>{formatMoney(inv.total, inv.currency)}</dd></div>
              {Number(inv.paid) > 0 && <div className="flex justify-between"><dt className="text-grey-500">Paid</dt><dd>{formatMoney(inv.paid, inv.currency)}</dd></div>}
              <div className="flex justify-between font-bold text-navy"><dt>Balance due</dt><dd>{formatMoney(inv.balance, inv.currency)}</dd></div>
            </dl>
            {inv.notes && <p className="mt-4 whitespace-pre-line text-sm text-charcoal">{inv.notes}</p>}
          </Panel>
          {inv.payments.length > 0 && (
            <Panel title="Payments received">
              <ul className="divide-y divide-grey-200 text-sm">
                {inv.payments.map((p, k) => (
                  <li key={k} className="flex flex-wrap items-center justify-between gap-2 py-2.5"><span>{formatDate(p.paid_on)} · {payMethod(p.method)}{p.reference ? ` · ${p.reference}` : ""}</span><span className="font-semibold">{formatMoney(p.amount, inv.currency)}</span></li>
                ))}
              </ul>
            </Panel>
          )}
        </div>

        <div className="space-y-6">
          {payable && mpesaOn && !pending && (
            <Panel title="Pay with M-Pesa">
              <form action={payWithMpesa} className="space-y-3">
                <input type="hidden" name="invoice_id" value={inv.id} />
                <div><label htmlFor="phone" className="field-label">M-Pesa phone number</label><input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" required placeholder="0712 345 678" className="field-input" /></div>
                <div><label htmlFor="amount" className="field-label">Amount (KES)</label><input id="amount" name="amount" type="number" inputMode="numeric" min={1} max={Math.min(maxPay, 250000)} step={1} defaultValue={Math.min(maxPay, 250000)} required className="field-input" />
                  <p className="mt-1 text-xs text-grey-500">Balance KES {maxPay.toLocaleString("en-KE")}. You can pay part now.</p></div>
                <button className="btn-primary w-full">Send M-Pesa prompt</button>
                <p className="text-xs text-grey-500">A prompt appears on your phone. Enter your M-Pesa PIN to pay. We never see your PIN.</p>
              </form>
            </Panel>
          )}
          {payable && (pay?.mpesa_number || pay?.bank_instructions || pay?.payment_note) && (
            <Panel title={mpesaOn ? "Other ways to pay" : "How to pay"}>
              <div className="space-y-3 text-sm text-charcoal">
                {pay?.mpesa_number && (
                  <div><p className="font-semibold text-navy">M-Pesa {pay.mpesa_kind === "till" ? "Buy Goods (Till)" : "Paybill"}</p>
                    <p>{pay.mpesa_kind === "till" ? "Till number" : "Business number"}: <span className="font-semibold">{pay.mpesa_number}</span></p>
                    {pay.mpesa_kind === "paybill" && <p>Account number: <span className="font-semibold">{inv.number}</span></p>}</div>
                )}
                {pay?.bank_instructions && <div><p className="font-semibold text-navy">Bank transfer</p><p className="whitespace-pre-line">{pay.bank_instructions}</p><p className="mt-1">Use {inv.number} as the reference.</p></div>}
                {pay?.payment_note && <p className="whitespace-pre-line text-grey-500">{pay.payment_note}</p>}
              </div>
            </Panel>
          )}
          {inv.order_id && <Panel title="Related order"><Link href={`/portal/orders/${inv.order_id}`} className="font-semibold text-teal-dark underline underline-offset-2">{inv.order_number}</Link></Panel>}
        </div>
      </div>
    </>
  );
}
