import Link from "next/link";
import Image from "next/image";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireCustomer } from "@/lib/portal/session";
import { PageHeader, Panel, Notice, Badge } from "@/components/admin/ui";
import { PortalFlash } from "@/components/portal/PortalFlash";
import { CART_ISSUES, availability, formatMoney, formatQty, productImage } from "@/lib/portal/format";
import type { CartRow } from "@/lib/portal/types";
import { clearCart, setCartQuantity } from "../actions";

export const metadata = { title: "Cart" };

export default async function Page({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  await requireCustomer();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("portal_cart");
  const lines = (data as CartRow[] | null) ?? [];
  const problems = lines.filter((l) => l.issue).length;
  const total = lines.reduce((s, l) => s + Number(l.line_total ?? 0), 0);

  return (
    <>
      <PageHeader title="Your cart" description="Prices are your prices today. They are confirmed again when you place the order." />
      <PortalFlash ok={sp.ok} error={sp.error} />
      {lines.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-charcoal">Your cart is empty.</p>
          <p className="mt-4"><Link href="/portal/catalogue" className="btn-primary">Browse the catalogue</Link></p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <ul className="space-y-3">
            {lines.map((l) => {
              const img = productImage(l.photo_path, l.fallback_image, process.env.NEXT_PUBLIC_SUPABASE_URL);
              const a = availability(l.availability);
              return (
                <li key={l.product_id} className="card p-4">
                  <div className="flex gap-4">
                    <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded bg-grey">
                      {img && <Image src={img} alt="" fill sizes="80px" unoptimized={img.endsWith(".svg")} className="object-cover" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <Link href={`/portal/catalogue/${l.slug}`} className="font-bold text-navy hover:underline">{l.name}</Link>
                        <span className="font-bold text-navy">{formatMoney(l.line_total, l.currency)}</span>
                      </div>
                      <p className="mt-0.5 text-sm text-grey-500">{l.packaging ? `${l.packaging} · ` : ""}{formatMoney(l.unit_price, l.currency)}{l.unit ? ` per ${l.unit}` : ""} <Badge tone={a.tone}>{a.label}</Badge></p>
                      {l.issue && <p role="alert" className="mt-2 text-sm font-semibold text-red-700">{CART_ISSUES[l.issue] ?? "Check this line"}{l.issue === "below_minimum" || l.issue === "step" ? ` (minimum ${formatQty(l.min_order_qty)}, steps of ${formatQty(l.qty_step)})` : ""}.</p>}
                      <form action={setCartQuantity} className="mt-3 flex flex-wrap items-center gap-2">
                        <input type="hidden" name="product_id" value={l.product_id} />
                        <label htmlFor={`c-${l.product_id}`} className="sr-only">Quantity of {l.name}</label>
                        <input id={`c-${l.product_id}`} name="quantity" type="number" inputMode="decimal" min={0} step={l.qty_step ?? 1} defaultValue={l.quantity} className="field-input !min-h-[44px] w-28" />
                        <button className="btn-outline !px-4">Update</button>
                        <button name="remove" value="1" className="min-h-[44px] px-2 text-sm font-semibold text-red-700 underline underline-offset-2" aria-label={`Remove ${l.name}`}>Remove</button>
                      </form>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          <aside className="lg:sticky lg:top-6 lg:self-start">
            <Panel title="Order summary">
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-charcoal">{lines.length} product{lines.length === 1 ? "" : "s"}</dt><dd className="font-semibold text-navy">{formatMoney(total, lines[0]?.currency)}</dd></div>
                <div className="flex justify-between border-t border-grey-200 pt-2 text-base"><dt className="font-bold text-navy">Total</dt><dd className="font-bold text-navy">{formatMoney(total, lines[0]?.currency)}</dd></div>
              </dl>
              <p className="mt-2 text-xs text-grey-500">Excludes VAT unless your invoice states otherwise. Delivery is arranged when we confirm your order.</p>
              {problems > 0 && <div className="mt-4"><Notice tone="warn">Fix the {problems} highlighted line{problems === 1 ? "" : "s"} before checking out.</Notice></div>}
              <div className="mt-4 grid gap-2">
                {problems === 0 ? <Link href="/portal/checkout" className="btn-accent justify-center">Checkout</Link> : <span className="btn-accent justify-center opacity-60" aria-disabled="true">Checkout</span>}
                <Link href="/portal/catalogue" className="btn-outline justify-center">Keep shopping</Link>
              </div>
              <p className="mt-3 text-center text-sm"><Link href="/portal/quotes/new?from=cart" className="font-semibold text-teal-dark underline underline-offset-2">Need a better price? Request a quotation</Link></p>
              <form action={clearCart} className="mt-3 text-center"><button className="min-h-[44px] text-sm text-grey-500 underline underline-offset-2">Empty cart</button></form>
            </Panel>
          </aside>
        </div>
      )}
    </>
  );
}
