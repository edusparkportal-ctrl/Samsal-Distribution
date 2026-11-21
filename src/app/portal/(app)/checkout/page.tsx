import Link from "next/link";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireCustomer } from "@/lib/portal/session";
import { PageHeader, Panel, Notice } from "@/components/admin/ui";
import { PortalFlash } from "@/components/portal/PortalFlash";
import { formatMoney, formatQty } from "@/lib/portal/format";
import type { CartRow, OrderRow } from "@/lib/portal/types";
import { checkout } from "../actions";

export const metadata = { title: "Checkout" };

export default async function Page({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  await requireCustomer();
  const supabase = await createSupabaseServerClient();
  const [{ data: cart }, { data: last }] = await Promise.all([supabase.rpc("portal_cart"), supabase.rpc("portal_orders", { p_limit: 1 })]);
  const lines = (cart as CartRow[] | null) ?? [];
  if (lines.length === 0) redirect("/portal/cart");
  const problems = lines.filter((l) => l.issue).length;
  if (problems > 0) redirect("/portal/cart?error=" + encodeURIComponent("Please fix the highlighted lines before checking out."));
  const total = lines.reduce((s, l) => s + Number(l.line_total ?? 0), 0);
  const lastAddress = ((last as OrderRow[] | null) ?? [])[0]?.delivery_address ?? "";
  const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
  const key = randomUUID(); // one per page view, so a double tap or a refresh cannot place two orders

  return (
    <>
      <PageHeader title="Checkout" description="Tell us where to deliver. We confirm every order before dispatch." />
      <PortalFlash ok={sp.ok} error={sp.error} />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <form action={checkout} className="space-y-5">
          <input type="hidden" name="idempotency_key" value={key} />
          <Panel title="Delivery">
            <div className="space-y-4">
              <div>
                <label htmlFor="address" className="field-label">Delivery address</label>
                <textarea id="address" name="address" required minLength={5} maxLength={500} rows={3} defaultValue={lastAddress} placeholder="Building, street, town. Add a landmark or contact person if helpful." className="field-input" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="requested_date" className="field-label">Preferred delivery date <span className="font-normal text-grey-500">(optional)</span></label>
                  <input id="requested_date" name="requested_date" type="date" min={tomorrow} className="field-input" />
                </div>
                <div>
                  <label htmlFor="reference" className="field-label">Your PO or reference <span className="font-normal text-grey-500">(optional)</span></label>
                  <input id="reference" name="reference" maxLength={60} className="field-input" />
                </div>
              </div>
              <div>
                <label htmlFor="notes" className="field-label">Notes for our team <span className="font-normal text-grey-500">(optional)</span></label>
                <textarea id="notes" name="notes" maxLength={1000} rows={3} className="field-input" />
              </div>
            </div>
          </Panel>
          <Notice tone="info">You will pay against your invoice. Payment details are shown on the invoice once your order has been delivered.</Notice>
          <div className="flex flex-wrap gap-3">
            <button type="submit" className="btn-accent">Place order · {formatMoney(total, lines[0]?.currency)}</button>
            <Link href="/portal/cart" className="btn-outline">Back to cart</Link>
          </div>
        </form>
        <aside>
          <Panel title="Your order">
            <ul className="divide-y divide-grey-200 text-sm">
              {lines.map((l) => (
                <li key={l.product_id} className="flex justify-between gap-3 py-2.5">
                  <span className="text-charcoal"><span className="font-semibold text-navy">{l.name}</span><br />{formatQty(l.quantity)}{l.unit ? ` ${l.unit}` : ""} × {formatMoney(l.unit_price, l.currency)}</span>
                  <span className="font-semibold text-navy">{formatMoney(l.line_total, l.currency)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 flex justify-between border-t border-grey-200 pt-3 text-base font-bold text-navy"><span>Total</span><span>{formatMoney(total, lines[0]?.currency)}</span></p>
            <p className="mt-1 text-xs text-grey-500">Excludes VAT unless your invoice states otherwise.</p>
          </Panel>
        </aside>
      </div>
    </>
  );
}
