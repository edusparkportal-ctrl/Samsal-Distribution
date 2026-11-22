import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireCustomer } from "@/lib/portal/session";
import { PageHeader } from "@/components/admin/ui";
import { formatDate, formatMoney, payMethod } from "@/lib/portal/format";
import type { PaymentRow } from "@/lib/portal/types";

export const metadata = { title: "Payment history" };
const PAGE = 25;

export default async function Page({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const sp = await searchParams;
  await requireCustomer();
  const page = Math.min(Math.max(Number.parseInt(sp.page ?? "1", 10) || 1, 1), 500);
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("portal_payments", { p_limit: PAGE, p_offset: (page - 1) * PAGE });
  const rows = (data as PaymentRow[] | null) ?? [];
  const pages = Math.max(Math.ceil(Number(rows[0]?.total_count ?? 0) / PAGE), 1);
  return (
    <>
      <p className="mb-4 text-sm"><Link href="/portal/invoices" className="font-semibold text-teal-dark underline underline-offset-2">← Invoices</Link></p>
      <PageHeader title="Payment history" description="Every payment we have received from you." />
      {rows.length === 0 ? (
        <div className="card p-8 text-center text-sm text-charcoal">No payments recorded yet.</div>
      ) : (
        <ul className="space-y-3">
          {rows.map((p, k) => (
            <li key={k} className="card flex flex-wrap items-center justify-between gap-x-6 gap-y-1 p-4">
              <div>
                <p className="font-bold text-navy">{formatMoney(p.amount, p.currency)}</p>
                <p className="text-sm text-grey-500">{formatDate(p.paid_on)} · {payMethod(p.method)}{p.reference ? ` · ${p.reference}` : ""}</p>
              </div>
              <Link href={`/portal/invoices/${p.invoice_id}`} className="text-sm font-semibold text-teal-dark underline underline-offset-2">{p.invoice_number}</Link>
            </li>
          ))}
        </ul>
      )}
      {pages > 1 && (
        <nav aria-label="Pages" className="mt-8 flex items-center justify-between text-sm">
          {page > 1 ? <Link href={`/portal/payments?page=${page - 1}`} className="btn-outline">Previous</Link> : <span />}
          <span className="text-grey-500">Page {page} of {pages}</span>
          {page < pages ? <Link href={`/portal/payments?page=${page + 1}`} className="btn-outline">Next</Link> : <span />}
        </nav>
      )}
    </>
  );
}
