import { Flash } from "@/components/admin/Flash";
import { PageHeader, Panel } from "@/components/admin/ui";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/admin/forms";
import { createQuotation } from "../actions";

export const metadata = { title: "New quotation" };

export default async function NewQuotation({ searchParams }: { searchParams: Promise<{ enquiry?: string; ok?: string; error?: string }> }) {
  const sp = await searchParams;
  await requirePermission("quotations.manage", "quotations");
  const sb = await createSupabaseServerClient();
  const enquiry = sp.enquiry && isUuid(sp.enquiry) ? sp.enquiry : null;
  const { data: customers } = enquiry ? { data: [] } : await sb.from("customers").select("id, company_name, contact_name, email").is("deleted_at", null).order("company_name").limit(500);
  const { data: e } = enquiry ? await sb.from("enquiries").select("reference, product_text").eq("id", enquiry).maybeSingle() : { data: null };
  return (
    <>
      <PageHeader title="New quotation" description="Creates a draft. Nothing is sent to the customer until you download the PDF and send it yourself." />
      <Flash ok={sp.ok} error={sp.error} />
      <Panel>
        <form action={createQuotation} className="max-w-xl space-y-4">
          {enquiry && e ? (
            <><input type="hidden" name="enquiry_id" value={enquiry} /><p className="text-sm">From enquiry <strong>{e.reference}</strong>: {e.product_text}. The customer is taken from the enquiry.</p></>
          ) : (
            <div><label htmlFor="customer_id" className="text-sm font-semibold text-navy">Customer</label>
              <select id="customer_id" name="customer_id" required className="field-input"><option value="">Choose…</option>{(customers ?? []).map((c: { id: string; company_name: string | null; contact_name: string; email: string }) => <option key={c.id} value={c.id}>{(c.company_name ? `${c.company_name} — ` : "") + c.contact_name} ({c.email})</option>)}</select></div>
          )}
          <button className="btn-primary px-5 py-2.5 text-sm">Create draft</button>
        </form>
      </Panel>
    </>
  );
}
