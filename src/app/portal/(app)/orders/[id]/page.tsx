import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireCustomer } from "@/lib/portal/session";
import { PageHeader, Panel, Badge } from "@/components/admin/ui";
import { PortalFlash } from "@/components/portal/PortalFlash";
import { TRACK_STEPS, formatDate, formatDateTime, formatMoney, formatQty, orderStatus } from "@/lib/portal/format";
import { isUuid } from "@/lib/admin/forms";
import type { OrderDetail } from "@/lib/portal/types";
import { cancelOrder, repeatOrder } from "../../actions";

export const metadata = { title: "Order" };

/** 0-based index of the milestone the order has reached (-1 = none, e.g. cancelled). */
function reached(o: OrderDetail): number {
  if (o.status === "cancelled") return -1;
  const ev = o.events.map((e) => e.title);
  if (o.status === "delivered" || o.status === "invoiced") return 4;
  if (ev.includes("Out for delivery") || o.status === "partially_delivered") return 3;
  if (o.status === "processing") return 2;
  if (o.status === "confirmed") return 1;
  return 0;
}

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  await requireCustomer();
  if (!isUuid(id)) notFound();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("portal_order", { p_order: id });
  const o = data as OrderDetail | null;
  if (!o) notFound();
  const st = orderStatus(o.status);
  const at = reached(o);

  return (
    <>
      <p className="mb-4 text-sm"><Link href="/portal/orders" className="font-semibold text-teal-dark underline underline-offset-2">← All orders</Link></p>
      <PageHeader title={o.number} description={`Placed ${formatDate(o.order_date)}${o.customer_reference ? ` · Your reference ${o.customer_reference}` : ""}`}
        actions={<><Badge tone={st.tone}>{st.label}</Badge>
          <form action={repeatOrder}><input type="hidden" name="order_id" value={o.id} /><button className="btn-outline">Order again</button></form></>} />
      <PortalFlash ok={sp.ok} error={sp.error} />

      {o.status !== "cancelled" ? (
        <Panel title="Progress" className="mb-6">
          <ol className="grid grid-cols-5 gap-1 text-center text-[11px] font-semibold leading-tight sm:text-xs" aria-label="Order progress">
            {TRACK_STEPS.map((label, i) => (
              <li key={label} aria-current={i === at ? "step" : undefined} className={i <= at ? "text-teal-dark" : "text-grey-500"}>
                <span className={`mx-auto mb-1.5 flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs ${i < at ? "border-teal bg-teal text-white" : i === at ? "border-teal bg-white text-teal-dark" : "border-grey-300 bg-white text-grey-500"}`}>{i < at ? "✓" : i + 1}</span>
                {label}
              </li>
            ))}
          </ol>
        </Panel>
      ) : (
        <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">This order was cancelled.{o.cancelled_reason ? ` Reason: ${o.cancelled_reason}` : ""}</div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Panel title="Items">
            <ul className="divide-y divide-grey-200 text-sm">
              {o.items.map((i) => (
                <li key={i.line_no} className="flex justify-between gap-3 py-3">
                  <span className="min-w-0"><span className="font-semibold text-navy">{i.description}</span><br /><span className="text-grey-500">{formatQty(i.quantity)}{i.unit ? ` ${i.unit}` : ""} × {formatMoney(i.unit_price, o.currency)}</span></span>
                  <span className="shrink-0 font-semibold text-navy">{formatMoney(i.line_total, o.currency)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 flex justify-between border-t border-grey-200 pt-3 text-base font-bold text-navy"><span>Total</span><span>{formatMoney(o.total, o.currency)}</span></p>
            <p className="mt-1 text-xs text-grey-500">Prices were fixed when the order was placed. Excludes VAT unless your invoice states otherwise.</p>
          </Panel>
          {o.can_cancel && (
            <Panel title="Changed your mind?">
              <p className="mb-3 text-sm text-charcoal">You can cancel this order until we confirm it.</p>
              <form action={cancelOrder} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="order_id" value={o.id} />
                <div className="min-w-[200px] flex-1"><label htmlFor="reason" className="field-label">Reason <span className="font-normal text-grey-500">(optional)</span></label><input id="reason" name="reason" maxLength={300} className="field-input" /></div>
                <button className="btn-outline !border-red-300 !text-red-700">Cancel order</button>
              </form>
            </Panel>
          )}
        </div>
        <div className="space-y-6">
          <Panel title="Tracking">
            {o.events.length === 0 ? <p className="text-sm text-grey-500">No updates yet.</p> : (
              <ol className="relative space-y-4 border-l-2 border-grey-200 pl-5">
                {[...o.events].reverse().map((e, i) => (
                  <li key={`${e.at}-${i}`} className="relative">
                    <span className={`absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-white ${i === 0 ? "bg-teal" : "bg-grey-300"}`} aria-hidden />
                    <p className="text-sm font-semibold text-navy">{e.title}</p>
                    {e.detail && <p className="text-sm text-charcoal">{e.detail}</p>}
                    <p className="text-xs text-grey-500">{formatDateTime(e.at)}</p>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
          <Panel title="Delivery">
            <dl className="space-y-2 text-sm">
              <div><dt className="font-semibold text-navy">Address</dt><dd className="whitespace-pre-line text-charcoal">{o.delivery_address ?? "-"}</dd></div>
              {o.requested_delivery_date && <div><dt className="font-semibold text-navy">Preferred date</dt><dd className="text-charcoal">{formatDate(o.requested_delivery_date)}</dd></div>}
              {o.customer_notes && <div><dt className="font-semibold text-navy">Your notes</dt><dd className="whitespace-pre-line text-charcoal">{o.customer_notes}</dd></div>}
            </dl>
          </Panel>
        </div>
      </div>
    </>
  );
}
