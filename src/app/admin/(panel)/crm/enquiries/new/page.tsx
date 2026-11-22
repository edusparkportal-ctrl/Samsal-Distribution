import { Flash } from "@/components/admin/Flash";
import { PageHeader, Panel } from "@/components/admin/ui";
import { requirePermission } from "@/lib/auth/session";
import { ENQUIRY_SOURCES } from "@/lib/crm";
import { createEnquiry } from "../actions";

export const metadata = { title: "Log an enquiry" };
const F = ({ id, label, children }: { id: string; label: string; children: React.ReactNode }) => (<div><label htmlFor={id} className="text-sm font-semibold text-navy">{label}</label>{children}</div>);

export default async function NewEnquiry({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  await requirePermission("enquiries.manage", "crm");
  return (
    <>
      <PageHeader title="Log an enquiry" description="Record a request that came in by phone, email, in person or from a tender notice. Only record what the customer has told you." />
      <Flash ok={sp.ok} error={sp.error} />
      <Panel>
        <form action={createEnquiry} className="grid gap-4 sm:grid-cols-2">
          <F id="source" label="Source"><select id="source" name="source" className="field-input" defaultValue="phone">{ENQUIRY_SOURCES.filter((s) => s !== "website" && s !== "portal").map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}</select></F>
          <F id="company_name" label="Organisation (optional)"><input id="company_name" name="company_name" maxLength={160} className="field-input" /></F>
          <F id="contact_name" label="Contact person"><input id="contact_name" name="contact_name" required maxLength={120} className="field-input" /></F>
          <F id="email" label="Email"><input id="email" type="email" name="email" required maxLength={200} className="field-input" /></F>
          <F id="phone" label="Telephone (optional)"><input id="phone" name="phone" maxLength={40} className="field-input" /></F>
          <F id="delivery_location" label="Delivery location (optional)"><input id="delivery_location" name="delivery_location" maxLength={200} className="field-input" /></F>
          <div className="sm:col-span-2"><F id="product_text" label="What do they need?"><textarea id="product_text" name="product_text" required rows={3} maxLength={2000} className="field-input" /></F></div>
          <F id="quantity_text" label="Quantity (optional)"><input id="quantity_text" name="quantity_text" maxLength={200} className="field-input" /></F>
          <F id="required_by" label="Required by (optional)"><input id="required_by" type="date" name="required_by" className="field-input" /></F>
          <div className="sm:col-span-2"><F id="message" label="Notes (optional)"><textarea id="message" name="message" rows={3} maxLength={4000} className="field-input" /></F></div>
          <div className="sm:col-span-2"><button className="btn-primary px-5 py-2.5 text-sm">Save enquiry</button></div>
        </form>
      </Panel>
    </>
  );
}
