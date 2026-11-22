import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireCustomer } from "@/lib/portal/session";
import { PageHeader, Badge } from "@/components/admin/ui";
import { PortalFlash } from "@/components/portal/PortalFlash";
import { formatDate, formatMoney, quoteStatus } from "@/lib/portal/format";
import type { QuoteRow } from "@/lib/portal/types";

export const metadata = { title: "Quotations" };
const PAGE = 20;

export default async function Page({ searchParams }: { searchParams: Promise<{ page?: string; ok?: string; error?: string }> }) {
  const sp = await searchParams;
  await requireCustomer();
  const page = Math.min(Math.max(Number.parseInt(sp.page ?? "1", 10) || 1, 1), 500);
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("portal_quotes", { p_limit: PAGE, p_offset: (page - 1) * PAGE });
  const rows = (data as QuoteRow[] | null) ?? [];
  const pages = Math.max(Math.ceil(Number(rows[0]?.total_count ?? 0) / PAGE), 1);
  return (
    <>
      <PageHeader title="Quotations" description="Ask for a price on larger or special orders, and answer the quotations we send you." actions={<Link href="/portal/quotes/new" className="btn-primary">Request a quotation</Link>} />
      <PortalFlash ok={sp.ok} error={sp.error} />
      {rows.length === 0 ? (
        <div className="card p-8 text-center text-sm text-charcoal">No quotations yet. <Link href="/portal/quotes/new" className="font-semibold text-teal-dark underline">Request one</Link> and we will reply with a price.</div>
      ) : (
        <ul className="space-y-3">
          {rows.map((q) => {
            const st = quoteStatus(q.status);
            return (
              <li key={q.id}>
                <Link href={`/portal/quotes/${q.id}`} className="card flex flex-wrap items-center justify-between gap-x-6 gap-y-2 p-4 transition-shadow hover:shadow-md">
                  <div><p className="font-bold text-navy">{q.number}</p><p className="text-sm text-grey-500">Issued {formatDate(q.issue_date)}{q.valid_until ? ` · Valid until ${formatDate(q.valid_until)}` : ""}</p></div>
                  <div className="flex items-center gap-4"><span className="font-semibold text-charcoal">{formatMoney(q.total, q.currency)}</span><Badge tone={st.tone}>{st.label}</Badge></div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {pages > 1 && (
        <nav aria-label="Pages" className="mt-8 flex items-center justify-between text-sm">
          {page > 1 ? <Link href={`/portal/quotes?page=${page - 1}`} className="btn-outline">Previous</Link> : <span />}
          <span className="text-grey-500">Page {page} of {pages}</span>
          {page < pages ? <Link href={`/portal/quotes?page=${page + 1}`} className="btn-outline">Next</Link> : <span />}
        </nav>
      )}
    </>
  );
}
