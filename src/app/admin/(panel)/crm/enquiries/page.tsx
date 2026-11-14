import Link from "next/link";
import { Flash } from "@/components/admin/Flash";
import { Badge, PageHeader, Panel } from "@/components/admin/ui";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CLOSED_STATUSES, ENQUIRY_STATUSES, isEnquiryStatus, safeSearch, statusMeta } from "@/lib/crm";
import { isUuid } from "@/lib/admin/forms";

export const metadata = { title: "Enquiries" };
const PAGE = 25;
type SP = { status?: string; q?: string; assigned?: string; followup?: string; page?: string; ok?: string; error?: string };

export default async function EnquiriesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const ctx = await requirePermission("enquiries.view", "crm");
  const sb = await createSupabaseServerClient();
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const today = new Date().toISOString().slice(0, 10);

  let q = sb
    .from("enquiries")
    .select("id, reference, product_text, status, source, follow_up_date, created_at, assigned:profiles!assigned_to(full_name), customer:customers(company_name, contact_name, email)", { count: "exact" })
    .is("deleted_at", null);
  if (sp.status && isEnquiryStatus(sp.status)) q = q.eq("status", sp.status);
  if (sp.assigned === "me") q = q.eq("assigned_to", ctx.userId);
  else if (sp.assigned === "none") q = q.is("assigned_to", null);
  else if (sp.assigned && isUuid(sp.assigned)) q = q.eq("assigned_to", sp.assigned);
  if (sp.followup === "due") q = q.lte("follow_up_date", today).not("status", "in", `(${CLOSED_STATUSES.join(",")})`);
  const term = safeSearch(sp.q ?? "");
  if (term) {
    // Search the enquiry itself, and customers matching the term.
    const { data: cs } = await sb.from("customers").select("id").or(`contact_name.ilike.%${term}%,company_name.ilike.%${term}%,email.ilike.%${term}%`).limit(200);
    const ids = (cs ?? []).map((c: { id: string }) => c.id);
    q = q.or([`reference.ilike.%${term}%`, `product_text.ilike.%${term}%`, ...(ids.length ? [`customer_id.in.(${ids.join(",")})`] : [])].join(","));
  }
  const { data, count, error } = await q.order("created_at", { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1);
  const rows = (data ?? []) as any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));
  const qs = (over: Record<string, string>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ status: sp.status, q: sp.q, assigned: sp.assigned, followup: sp.followup, ...over })) if (v) p.set(k, v);
    return `?${p.toString()}`;
  };
  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

  return (
    <>
      <PageHeader
        title="Enquiries"
        description="Quote requests and messages from the website, plus anything your team logs by hand."
        actions={<>
          {ctx.has("enquiries.manage") && <Link href="/admin/crm/enquiries/new" className="btn-primary px-4 py-2 text-sm">Log an enquiry</Link>}
          {ctx.has("enquiries.export") && <a href={`/admin/crm/enquiries/export${qs({})}`} className="btn-outline px-4 py-2 text-sm">Export CSV</a>}
        </>}
      />
      <Flash ok={sp.ok} error={sp.error ?? (error ? "Enquiries could not be loaded." : undefined)} />
      <Panel className="mb-4">
        <form className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto_auto]" role="search">
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Search reference, product, name, company, email" className="field-input" aria-label="Search enquiries" />
          <select name="status" defaultValue={sp.status ?? ""} className="field-input" aria-label="Status">
            <option value="">All statuses</option>
            {ENQUIRY_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <select name="assigned" defaultValue={sp.assigned ?? ""} className="field-input" aria-label="Assigned to">
            <option value="">Anyone</option><option value="me">Assigned to me</option><option value="none">Unassigned</option>
          </select>
          <select name="followup" defaultValue={sp.followup ?? ""} className="field-input" aria-label="Follow-up">
            <option value="">Any follow-up</option><option value="due">Follow-up due</option>
          </select>
          <button className="btn-primary px-4 py-2 text-sm">Filter</button>
        </form>
      </Panel>
      <Panel>
        {rows.length === 0 ? <p className="text-sm text-grey-500">No enquiries match.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-grey-500"><tr><th className="py-2 pr-3">Ref</th><th className="pr-3">Customer</th><th className="pr-3">Request</th><th className="pr-3">Status</th><th className="pr-3">Follow-up</th><th className="pr-3">Assigned</th><th>Received</th></tr></thead>
              <tbody className="divide-y divide-grey-200">
                {rows.map((r) => {
                  const c = one<any>(r.customer), a = one<any>(r.assigned), m = statusMeta(r.status); // eslint-disable-line @typescript-eslint/no-explicit-any
                  const overdue = r.follow_up_date && r.follow_up_date <= today && !CLOSED_STATUSES.includes(r.status);
                  return (
                    <tr key={r.id}>
                      <td className="py-2.5 pr-3 font-semibold"><Link className="text-teal-dark hover:underline" href={`/admin/crm/enquiries/${r.id}`}>{r.reference}</Link></td>
                      <td className="pr-3">{c?.company_name || c?.contact_name || "-"}<span className="block text-xs text-grey-500">{c?.company_name ? c?.contact_name : c?.email}</span></td>
                      <td className="max-w-xs truncate pr-3">{r.product_text}</td>
                      <td className="pr-3"><Badge tone={m.tone}>{m.label}</Badge></td>
                      <td className="pr-3">{r.follow_up_date ? <span className={overdue ? "font-semibold text-red-700" : ""}>{r.follow_up_date}</span> : "-"}</td>
                      <td className="pr-3">{a?.full_name ?? <span className="text-grey-500">Unassigned</span>}</td>
                      <td className="whitespace-nowrap text-grey-500">{String(r.created_at).slice(0, 10)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 && (
          <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Pagination">
            {page > 1 ? <Link className="btn-outline px-3 py-1.5" href={qs({ page: String(page - 1) })}>Previous</Link> : <span />}
            <span className="text-grey-500">Page {page} of {pages} ({count} enquiries)</span>
            {page < pages ? <Link className="btn-outline px-3 py-1.5" href={qs({ page: String(page + 1) })}>Next</Link> : <span />}
          </nav>
        )}
      </Panel>
    </>
  );
}
