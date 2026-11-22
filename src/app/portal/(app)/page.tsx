import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireCustomer } from "@/lib/portal/session";
import { PageHeader, Panel, StatCard, Badge } from "@/components/admin/ui";
import { PortalFlash } from "@/components/portal/PortalFlash";
import { formatDate, formatMoney, orderStatus } from "@/lib/portal/format";
import type { OrderRow } from "@/lib/portal/types";
import { repeatOrder } from "./actions";

export const metadata = { title: "Home" };

export default async function Page({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireCustomer();
  const supabase = await createSupabaseServerClient();
  const [{ data: dash }, { data: recent }] = await Promise.all([supabase.rpc("portal_dashboard"), supabase.rpc("portal_orders", { p_limit: 5 })]);
  const d = (dash ?? {}) as { open_orders?: number; awaiting_delivery?: number; ordered_90_days?: number; cart_lines?: number; outstanding?: number; overdue_count?: number; open_invoices?: number; open_quotes?: number };
  const orders = (recent as OrderRow[] | null) ?? [];
  const last = orders.find((o) => o.status !== "cancelled");

  return (
    <>
      <PageHeader title={`Welcome, ${ctx.contactName.split(" ")[0]}`} description={ctx.company}
        actions={<><Link href="/portal/catalogue" className="btn-primary">Browse catalogue</Link>{last && (
          <form action={repeatOrder}><input type="hidden" name="order_id" value={last.id} /><button className="btn-outline">Repeat last order</button></form>)}</>} />
      <PortalFlash ok={sp.ok} error={sp.error} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Open orders" value={d.open_orders ?? 0} href="/portal/orders" />
        <StatCard label="On the way" value={d.awaiting_delivery ?? 0} href="/portal/orders" hint="Orders with a delivery scheduled" />
        <StatCard label="Ordered, last 90 days" value={formatMoney(d.ordered_90_days ?? 0)} hint="Excluding cancelled orders" />
        <StatCard label="In your cart" value={d.cart_lines ?? 0} href="/portal/cart" />
        <StatCard label="Amount owed" value={formatMoney(d.outstanding ?? 0)} href="/portal/invoices" hint={d.overdue_count ? `${d.overdue_count} overdue` : `${d.open_invoices ?? 0} unpaid invoice${d.open_invoices === 1 ? "" : "s"}`} />
        <StatCard label="Quotations to answer" value={d.open_quotes ?? 0} href="/portal/quotes" />
      </div>
      <Panel title="Recent orders" className="mt-6">
        {orders.length === 0 ? (
          <p className="text-sm text-charcoal">You have not placed an order yet. <Link href="/portal/catalogue" className="font-semibold text-teal-dark underline">Start with the catalogue</Link>.</p>
        ) : (
          <ul className="divide-y divide-grey-200">
            {orders.map((o) => {
              const st = orderStatus(o.status);
              return (
                <li key={o.id}>
                  <Link href={`/portal/orders/${o.id}`} className="flex min-h-[56px] flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3 hover:bg-grey/60">
                    <span><span className="font-semibold text-navy">{o.number}</span> <span className="text-sm text-grey-500">{formatDate(o.order_date)}</span></span>
                    <span className="flex items-center gap-3"><span className="text-sm font-semibold text-charcoal">{formatMoney(o.total, o.currency)}</span><Badge tone={st.tone}>{st.label}</Badge></span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </>
  );
}
