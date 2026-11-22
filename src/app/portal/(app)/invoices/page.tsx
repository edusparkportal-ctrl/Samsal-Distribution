import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireCustomer } from "@/lib/portal/session";
import { PageHeader, Badge, StatCard } from "@/components/admin/ui";
import { PortalFlash } from "@/components/portal/PortalFlash";
import { formatDate, formatMoney, invoiceStatus } from "@/lib/portal/format";
import type { InvoiceRow } from "@/lib/portal/types";

export const metadata = { title: "Invoices" };
const PAGE = 20;
const FILTERS: [string, string][] = [["", "All"], ["open", "Unpaid"], ["overdue", "Overdue"], ["paid", "Paid"]];

export default async function Page({ searchParams }: { searchParams: Promise<{ status?: string; page?: string; ok?: string; error?: string }> }) {
  const sp = await searchParams;
  await requireCustomer();
  const status = FILTERS.some(([v]) => v === sp.status) ? sp.status ?? "" : "";
  const page = Math.min(Math.max(Number.parseInt(sp.page ?? "1", 10) || 1, 1), 500);
  const supabase = await createSupabaseServerClient();
  const [{ data }, { data: dash }] = await Promise.all([
    supabase.rpc("portal_invoices", { p_status: status || null, p_limit: PAGE, p_offset: (page - 1) * PAGE }),
    supabase.rpc("portal_dashboard"),
  ]);
  const rows = (data as InvoiceRow[] | null) ?? [];
  const d = (dash ?? {}) as { outstanding?: number; overdue_count?: number; open_invoices?: number };
  const total = Number(rows[0]?.total_count ?? 0);
  const pages = Math.max(Math.ceil(total / PAGE), 1);
  const href = (st: string, pg = 1) => `/portal/invoices?${new URLSearchParams({ ...(st ? { status: st } : {}), ...(pg > 1 ? { page: String(pg) } : {}) }).toString()}`;

  return (
    <>
      <PageHeader title="Invoices" description="Your invoices, what is owed, and how to pay." actions={<Link href="/portal/payments" className="btn-outline">Payment history</Link>} />
      <PortalFlash ok={sp.ok} error={sp.error} />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Amount owed" value={formatMoney(d.outstanding ?? 0)} hint={`${d.open_invoices ?? 0} unpaid invoice${d.open_invoices === 1 ? "" : "s"}`} />
        <StatCard label="Overdue" value={d.overdue_count ?? 0} hint="Past the due date" />
      </div>
      <div className="-mx-4 mb-5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex gap-2 whitespace-nowrap pb-1">
          {FILTERS.map(([v, label]) => (
            <li key={v}><Link href={href(v)} aria-current={status === v ? "true" : undefined} className={`inline-flex min-h-[40px] items-center rounded-full border px-4 text-sm font-semibold ${status === v ? "border-navy bg-navy text-white" : "border-grey-300 bg-white text-navy hover:border-navy"}`}>{label}</Link></li>
          ))}
        </ul>
      </div>
      {rows.length === 0 ? (
        <div className="card p-8 text-center text-sm text-charcoal">No invoices here yet.</div>
      ) : (
        <ul className="space-y-3">
          {rows.map((i) => {
            const st = invoiceStatus(i.status, i.overdue);
            return (
              <li key={i.id}>
                <Link href={`/portal/invoices/${i.id}`} className="card flex flex-wrap items-center justify-between gap-x-6 gap-y-2 p-4 transition-shadow hover:shadow-md">
                  <div>
                    <p className="font-bold text-navy">{i.number}</p>
                    <p className="text-sm text-grey-500">Issued {formatDate(i.issue_date)} · Due {formatDate(i.due_date)}{i.order_number ? ` · Order ${i.order_number}` : ""}</p>
                  </div>
                  <div className="flex items-center gap-4 text-right">
                    <span><span className="block font-semibold text-charcoal">{formatMoney(i.total, i.currency)}</span>{Number(i.balance) > 0 && Number(i.paid) > 0 && <span className="block text-xs text-grey-500">Balance {formatMoney(i.balance, i.currency)}</span>}</span>
                    <Badge tone={st.tone}>{st.label}</Badge>
                  </div>
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
