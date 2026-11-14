import { Flash } from "@/components/admin/Flash";
import { PageHeader, Panel } from "@/components/admin/ui";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeSearch } from "@/lib/crm";
import { updateCustomer } from "../enquiries/actions";

export const metadata = { title: "Customers" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; edit?: string; ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePermission("enquiries.view", "crm");
  const sb = await createSupabaseServerClient();
  let q = sb.from("customers").select("id, company_name, contact_name, email, phone, location, created_at").is("deleted_at", null);
  const term = safeSearch(sp.q ?? "");
  if (term) q = q.or(`contact_name.ilike.%${term}%,company_name.ilike.%${term}%,email.ilike.%${term}%`);
  const { data } = await q.order("created_at", { ascending: false }).limit(100);
  const can = ctx.has("enquiries.manage");
  return (
    <>
      <PageHeader title="Customers" description="Created automatically from website enquiries. Keep only what you need to serve the customer." />
      <Flash ok={sp.ok} error={sp.error} />
      <Panel className="mb-4"><form role="search" className="flex gap-3"><input name="q" defaultValue={sp.q ?? ""} placeholder="Search name, organisation or email" aria-label="Search customers" className="field-input" /><button className="btn-primary px-4 py-2 text-sm">Search</button></form></Panel>
      <Panel>
        <ul className="divide-y divide-grey-200">
          {(data ?? []).map((c: { id: string; company_name: string | null; contact_name: string; email: string; phone: string | null; location: string | null }) => (
            <li key={c.id} className="py-3">
              <details>
                <summary className="cursor-pointer text-sm"><span className="font-semibold text-navy">{c.company_name ?? c.contact_name}</span> <span className="text-grey-500">{c.company_name ? `${c.contact_name} · ` : ""}{c.email}</span></summary>
                {can ? (
                  <form action={updateCustomer} className="mt-3 grid gap-3 sm:grid-cols-2">
                    <input type="hidden" name="id" value={c.id} />
                    <input name="company_name" defaultValue={c.company_name ?? ""} placeholder="Organisation" aria-label="Organisation" className="field-input" maxLength={160} />
                    <input name="contact_name" defaultValue={c.contact_name} placeholder="Contact" aria-label="Contact" required className="field-input" maxLength={120} />
                    <input name="email" type="email" defaultValue={c.email} aria-label="Email" required className="field-input" maxLength={200} />
                    <input name="phone" defaultValue={c.phone ?? ""} placeholder="Telephone" aria-label="Telephone" className="field-input" maxLength={40} />
                    <input name="location" defaultValue={c.location ?? ""} placeholder="Location" aria-label="Location" className="field-input sm:col-span-2" maxLength={200} />
                    <button className="btn-primary w-fit px-4 py-2 text-sm">Save</button>
                  </form>
                ) : <p className="mt-2 text-sm">{c.phone ?? ""} {c.location ?? ""}</p>}
              </details>
            </li>
          ))}
          {(data ?? []).length === 0 && <li className="py-3 text-sm text-grey-500">No customers found.</li>}
        </ul>
      </Panel>
    </>
  );
}
