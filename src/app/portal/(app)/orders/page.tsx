import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireCustomer } from "@/lib/portal/session";
import { PageHeader, Badge } from "@/components/admin/ui";
import { PortalFlash } from "@/components/portal/PortalFlash";
import { ORDER_STATUS, formatDate, formatMoney, orderStatus } from "@/lib/portal/format";
import type { OrderRow } from "@/lib/portal/types";

export const metadata = { title: "Orders" };
const PAGE = 20;
const FILTERS: [string, string][] = [["", "All"], ["submitted", "Received"], ["confirmed", "Confirmed"], ["processing", "Preparing"], ["partially_delivered", "Partly delivered"], ["delivered", "Delivered"], ["cancelled", "Cancelled"]];

export default async function Page({ searchParams }: { searchParams: Promise<{ status?: string; page?: string; ok?: string; error?: string }> }) {
  const sp = await searchParams;
  await requireCustomer();
  const status = sp.status && sp.status in ORDER_STATUS ? sp.status : "";
  const page = Math.min(Math.max(Number.parseInt(sp.page ?? "1", 10) || 1, 1), 500);
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("portal_orders", { p_status: status || null, p_limit: PAGE, p_offset: (page - 1) * PAGE });
  const rows = (data as OrderRow[] | null) ?? [];
  const total = Number(rows[0]?.total_count ?? 0);
  const pages = Math.max(Math.ceil(total / PAGE), 1);
  const href = (st: string, pg = 1) => `/portal/orders?${new URLSearchParams({ ...(st ? { status: st } : {}), ...(pg > 1 ? { page: String(pg) } : {}) }).toString()}`;

  return (
    <>
      <PageHeader title="Orders" description="Track every order from received to delivered." />
      <PortalFlash ok={sp.ok} error={sp.error} />
      <div className="-mx-4 mb-5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex gap-2 whitespace-nowrap pb-1">
          {FILTERS.map(([v, label]) => (
            <li key={v}><Link href={href(v)} aria-current={status === v ? "true" : undefined} className={`inline-flex min-h-[40px] items-center rounded-full border px-4 text-sm font-semibold ${status === v ? "border-navy bg-navy text-white" : "border-grey-300 bg-white text-navy hover:border-navy"}`}>{label}</Link></li>
          ))}
        </ul>
      </div>
      {rows.length === 0 ? (
        <div className="card p-8 text-center text-sm text-charcoal">No orders here yet. <Link href="/portal/catalogue" className="font-semibold text-teal-dark underline">Browse the catalogue</Link>.</div>
      ) : (
        <ul className="space-y-3">
          {rows.map((o) => {
            const st = orderStatus(o.status);
            return (
              <li key={o.id}>
                <Link href={`/portal/orders/${o.id}`} className="card flex flex-wrap items-center justify-between gap-x-6 gap-y-2 p-4 transition-shadow hover:shadow-md">
                  <div>
                    <p className="font-bold text-navy">{o.number}</p>
                    <p className="text-sm text-grey-500">{formatDate(o.order_date)} · {o.item_count} item{Number(o.item_count) === 1 ? "" : "s"}{o.customer_reference ? ` · Ref ${o.customer_reference}` : ""}</p>
                  </div>
                  <div className="flex items-center gap-4"><span className="font-semibold text-charcoal">{formatMoney(o.total, o.currency)}</span><Badge tone={st.tone}>{st.label}</Badge></div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {pages > 1 && (
        <nav aria-label="Pages" className="mt-8 flex items-center justify-between text-sm">
          {page > 1 ? <Link href={href(status, page - 1)} className="btn-outline">Previous</Link> : <span />}
          <span className="text-grey-500">Page {page} of {pages}</span>
          {page < pages ? <Link href={href(status, page + 1)} className="btn-outline">Next</Link> : <span />}
        </nav>
      )}
    </>
  );
}
