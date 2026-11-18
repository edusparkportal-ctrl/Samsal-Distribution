import { Flash } from "@/components/admin/Flash";
import { PageHeader, Panel } from "@/components/admin/ui";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createInvoice } from "../actions";

export const metadata = { title: "New invoice" };

export default async function NewInvoice({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  await requirePermission("finance.invoices", "finance");
  const sb = await createSupabaseServerClient();
  const { data: customers } = await sb.from("customers").select("id, company_name, contact_name").is("deleted_at", null).order("company_name").limit(500);
  return (
    <>
      <PageHeader title="New invoice" description="Creates a draft. Add the lines on the next screen." />
      <Flash ok={sp.ok} error={sp.error} />
      <Panel>
        <form action={createInvoice} className="grid max-w-2xl gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><label htmlFor="customer_id" className="text-sm font-semibold text-navy">Customer</label>
            <select id="customer_id" name="customer_id" required className="field-input"><option value="">Choose…</option>{(customers ?? []).map((c: { id: string; company_name: string | null; contact_name: string }) => <option key={c.id} value={c.id}>{c.company_name ? `${c.company_name} (${c.contact_name})` : c.contact_name}</option>)}</select></div>
          <div><label htmlFor="due_date" className="text-sm font-semibold text-navy">Due date</label><input id="due_date" type="date" name="due_date" className="field-input" /><p className="mt-1 text-xs text-grey-500">If empty, 30 days after issue.</p></div>
          <div><label htmlFor="currency" className="text-sm font-semibold text-navy">Currency</label><input id="currency" name="currency" defaultValue="KES" maxLength={3} className="field-input uppercase" /></div>
          <div><label htmlFor="tax_rate" className="text-sm font-semibold text-navy">Tax rate (%)</label><input id="tax_rate" name="tax_rate" defaultValue="0" inputMode="decimal" className="field-input" /><p className="mt-1 text-xs text-grey-500">Enter the VAT (or other tax) percentage that applies, as confirmed by your accountant. Nothing is assumed.</p></div>
          <div className="sm:col-span-2"><label htmlFor="notes" className="text-sm font-semibold text-navy">Notes shown on the invoice</label><textarea id="notes" name="notes" rows={3} maxLength={2000} className="field-input" /></div>
          <div className="sm:col-span-2"><button className="btn-primary px-5 py-2.5 text-sm">Create draft</button></div>
        </form>
      </Panel>
    </>
  );
}
