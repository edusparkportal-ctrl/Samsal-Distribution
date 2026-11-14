import Link from "next/link";
import { notFound } from "next/navigation";
import { Flash } from "@/components/admin/Flash";
import { Badge, PageHeader, Panel } from "@/components/admin/ui";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/admin/forms";
import { ENQUIRY_STATUSES, statusMeta } from "@/lib/crm";
import { addNote, updateEnquiry } from "../actions";

export const metadata = { title: "Enquiry" };
const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

export default async function EnquiryPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const ctx = await requirePermission("enquiries.view", "crm");
  if (!isUuid(id)) notFound();
  const sb = await createSupabaseServerClient();
  const { data: e } = await sb
    .from("enquiries")
    .select("*, customer:customers(id, company_name, contact_name, email, phone, location), category:product_categories(name)")
    .eq("id", id).is("deleted_at", null).maybeSingle();
  if (!e) notFound();
  const [notes, history, staff, quotes] = await Promise.all([
    sb.from("enquiry_notes").select("id, body, created_at, author:profiles!author_id(full_name)").eq("enquiry_id", id).order("created_at", { ascending: false }),
    sb.from("enquiry_status_history").select("id, from_status, to_status, changed_at, by:profiles!changed_by(full_name)").eq("enquiry_id", id).order("changed_at", { ascending: false }),
    sb.from("profiles").select("id, full_name").eq("is_active", true).order("full_name"),
    ctx.has("quotations.view") ? sb.from("quotations").select("id, number, status, issue_date").eq("enquiry_id", id).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
  ]);
  const c = one<any>(e.customer); // eslint-disable-line @typescript-eslint/no-explicit-any
  const m = statusMeta(e.status);
  const can = ctx.has("enquiries.manage");

  return (
    <>
      <PageHeader title={e.reference} description={`Received ${String(e.created_at).slice(0, 16).replace("T", " ")} UTC via ${String(e.source).replace("_", " ")}`}
        actions={<><Badge tone={m.tone}>{m.label}</Badge><Link href="/admin/crm/enquiries" className="btn-outline px-4 py-2 text-sm">Back to list</Link></>} />
      <Flash ok={sp.ok} error={sp.error} />
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          <Panel title="Request">
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <div className="sm:col-span-2"><dt className="font-semibold text-navy">Product / service</dt><dd>{e.product_text}</dd></div>
              <div><dt className="font-semibold text-navy">Category</dt><dd>{one<any>(e.category)?.name ?? "-"}</dd></div>{/* eslint-disable-line @typescript-eslint/no-explicit-any */}
              <div><dt className="font-semibold text-navy">Quantity</dt><dd>{e.quantity_text ?? "-"}</dd></div>
              <div><dt className="font-semibold text-navy">Delivery location</dt><dd>{e.delivery_location ?? "-"}</dd></div>
              <div><dt className="font-semibold text-navy">Required by</dt><dd>{e.required_by ?? "-"}</dd></div>
              {e.attachment_name && <div className="sm:col-span-2"><dt className="font-semibold text-navy">Attachment</dt><dd>{e.attachment_name} <span className="text-grey-500">(sent by email; not stored here)</span></dd></div>}
              <div className="sm:col-span-2"><dt className="font-semibold text-navy">Message</dt><dd className="whitespace-pre-wrap">{e.message ?? "-"}</dd></div>
            </dl>
          </Panel>
          <Panel title="Notes">
            {can && (
              <form action={addNote} className="mb-4 space-y-2">
                <input type="hidden" name="id" value={id} />
                <label htmlFor="note" className="sr-only">Add a note</label>
                <textarea id="note" name="body" rows={3} maxLength={4000} required className="field-input" placeholder="Call notes, supplier prices, decisions…" />
                <button className="btn-primary px-4 py-2 text-sm">Add note</button>
              </form>
            )}
            <ul className="space-y-3">
              {(notes.data ?? []).map((n: any) => ( // eslint-disable-line @typescript-eslint/no-explicit-any
                <li key={n.id} className="rounded-md bg-grey p-3 text-sm"><p className="whitespace-pre-wrap">{n.body}</p><p className="mt-1 text-xs text-grey-500">{one<any>(n.author)?.full_name ?? "Unknown"} · {String(n.created_at).slice(0, 16).replace("T", " ")} UTC</p></li>
              ))}
              {(notes.data ?? []).length === 0 && <li className="text-sm text-grey-500">No notes yet.</li>}
            </ul>
          </Panel>
        </div>
        <div className="space-y-5">
          <Panel title="Customer">
            {c ? (
              <div className="space-y-1 text-sm">
                <p className="font-semibold text-navy">{c.company_name ?? c.contact_name}</p>
                {c.company_name && <p>{c.contact_name}</p>}
                <p><a className="text-teal-dark hover:underline" href={`mailto:${c.email}`}>{c.email}</a></p>
                {c.phone && <p>{c.phone}</p>}
                {c.location && <p>{c.location}</p>}
              </div>
            ) : <p className="text-sm text-grey-500">No customer linked.</p>}
          </Panel>
          <Panel title="Manage">
            <form action={updateEnquiry} className="space-y-3">
              <input type="hidden" name="id" value={id} />
              <div><label htmlFor="status" className="text-sm font-semibold text-navy">Status</label>
                <select id="status" name="status" defaultValue={e.status} disabled={!can} className="field-input">{ENQUIRY_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select></div>
              <div><label htmlFor="assigned_to" className="text-sm font-semibold text-navy">Assigned to</label>
                <select id="assigned_to" name="assigned_to" defaultValue={e.assigned_to ?? ""} disabled={!can} className="field-input"><option value="">Unassigned</option>{(staff.data ?? []).map((s: { id: string; full_name: string }) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</select></div>
              <div><label htmlFor="follow_up_date" className="text-sm font-semibold text-navy">Follow-up date</label>
                <input id="follow_up_date" type="date" name="follow_up_date" defaultValue={e.follow_up_date ?? ""} disabled={!can} className="field-input" /></div>
              {can && <button className="btn-primary px-4 py-2 text-sm">Save changes</button>}
            </form>
          </Panel>
          {ctx.has("quotations.view") && (
            <Panel title="Quotations">
              <ul className="space-y-1 text-sm">
                {(quotes.data ?? []).map((q: { id: string; number: string; status: string; issue_date: string }) => <li key={q.id}><Link className="text-teal-dark hover:underline" href={`/admin/quotations/${q.id}`}>{q.number}</Link> <Badge>{q.status}</Badge></li>)}
                {(quotes.data ?? []).length === 0 && <li className="text-grey-500">None yet.</li>}
              </ul>
              {ctx.has("quotations.manage") && ctx.moduleEnabled("quotations") && <Link href={`/admin/quotations/new?enquiry=${id}`} className="btn-outline mt-3 inline-block px-4 py-2 text-sm">Prepare quotation</Link>}
            </Panel>
          )}
          <Panel title="Status history">
            <ol className="space-y-1 text-xs text-grey-500">
              {(history.data ?? []).map((h: any) => <li key={h.id}>{String(h.changed_at).slice(0, 16).replace("T", " ")} · {h.from_status ? `${statusMeta(h.from_status).label} → ` : ""}{statusMeta(h.to_status).label}{one<any>(h.by)?.full_name ? ` · ${one<any>(h.by).full_name}` : ""}</li>)}{/* eslint-disable-line @typescript-eslint/no-explicit-any */}
            </ol>
          </Panel>
        </div>
      </div>
    </>
  );
}
