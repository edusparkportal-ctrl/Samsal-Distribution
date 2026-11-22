import Link from "next/link";
import { requireCustomer } from "@/lib/portal/session";
import { PageHeader } from "@/components/admin/ui";
import { PortalFlash } from "@/components/portal/PortalFlash";
import BulkUploader from "@/components/portal/BulkUploader";

export const metadata = { title: "Bulk order" };

export default async function Page({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  await requireCustomer();
  return (
    <>
      <PageHeader title="Bulk order" description="Upload a list of products and quantities. We check each row against your prices and stock, then you add the good ones to your cart." actions={<a href="/portal/bulk/template" className="btn-outline">Download sample file</a>} />
      <PortalFlash ok={sp.ok} error={sp.error} />
      <div className="mb-6 card p-5 text-sm text-charcoal sm:p-6">
        <p className="font-semibold text-navy">How it works</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Two columns: <strong>product code (or exact name)</strong> and <strong>quantity</strong>. A header row is optional. Save your sheet as CSV.</li>
          <li>Up to 300 rows, 200 KB.</li>
          <li>We show what is ready and why any row cannot be ordered. Nothing is ordered until you check out from your cart.</li>
        </ol>
        <p className="mt-2 text-grey-500">Use the exact product name as shown in the <Link href="/portal/catalogue" className="underline">catalogue</Link>, or the product code from your account manager. Items that are not priced for online ordering need a <Link href="/portal/quotes/new" className="underline">quotation</Link>.</p>
      </div>
      <BulkUploader />
    </>
  );
}
