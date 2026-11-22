import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireCustomer } from "@/lib/portal/session";
import { PageHeader, Badge } from "@/components/admin/ui";
import { PortalFlash } from "@/components/portal/PortalFlash";
import { formatDateTime, ticketStatus } from "@/lib/portal/format";
import type { TicketRow } from "@/lib/portal/types";

export const metadata = { title: "Support" };
const PAGE = 20;
const FILTERS: [string, string][] = [["", "All"], ["open", "Open"], ["resolved", "Resolved"], ["closed", "Closed"]];

export default async function Page({ searchParams }: { searchParams: Promise<{ status?: string; page?: string; ok?: string; error?: string }> }) {
  const sp = await searchParams;
  await requireCustomer();
  const status = FILTERS.some(([v]) => v === sp.status) ? sp.status ?? "" : "";
  const page = Math.min(Math.max(Number.parseInt(sp.page ?? "1", 10) || 1, 1), 500);
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("portal_tickets", { p_status: status || null, p_limit: PAGE, p_offset: (page - 1) * PAGE });
  const rows = (data as TicketRow[] | null) ?? [];
  const pages = Math.max(Math.ceil(Number(rows[0]?.total_count ?? 0) / PAGE), 1);
  const href = (st: string, pg = 1) => `/portal/support?${new URLSearchParams({ ...(st ? { status: st } : {}), ...(pg > 1 ? { page: String(pg) } : {}) }).toString()}`;
  return (
    <>
      <PageHeader title="Support" description="Questions or problems with an order, delivery, invoice or payment. We reply here." actions={<Link href="/portal/support/new" className="btn-primary">New ticket</Link>} />
      <PortalFlash ok={sp.ok} error={sp.error} />
      <div className="-mx-4 mb-5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex gap-2 whitespace-nowrap pb-1">
          {FILTERS.map(([v, label]) => (
            <li key={v}><Link href={href(v)} aria-current={status === v ? "true" : undefined} className={`inline-flex min-h-[40px] items-center rounded-full border px-4 text-sm font-semibold ${status === v ? "border-navy bg-navy text-white" : "border-grey-300 bg-white text-navy hover:border-navy"}`}>{label}</Link></li>
          ))}
        </ul>
      </div>
      {rows.length === 0 ? (
        <div className="card p-8 text-center text-sm text-charcoal">No tickets here. <Link href="/portal/support/new" className="font-semibold text-teal-dark underline">Open one</Link> if you need help.</div>
      ) : (
        <ul className="space-y-3">
          {rows.map((t) => {
            const st = ticketStatus(t.status);
            return (
              <li key={t.id}>
                <Link href={`/portal/support/${t.id}`} className="card flex flex-wrap items-center justify-between gap-x-6 gap-y-2 p-4 transition-shadow hover:shadow-md">
                  <div className="min-w-0"><p className="truncate font-bold text-navy">{t.subject}</p><p className="text-sm text-grey-500">{t.reference} · Updated {formatDateTime(t.last_activity_at)}</p></div>
                  <Badge tone={st.tone}>{st.label}</Badge>
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
