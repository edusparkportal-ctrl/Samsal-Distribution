import Link from "next/link";
import { Flash } from "@/components/admin/Flash";
import { Badge, PageHeader, Panel } from "@/components/admin/ui";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { addItem, generateChecklist, toggleItem } from "./actions";

export const metadata = { title: "Tender document checklists" };
export const dynamic = "force-dynamic";

type Tender = { id: string; reference: string; title: string; procuring_entity: string; submission_deadline: string | null; bid_status: string; submission_status: string };
type Item = { id: string; tender_id: string; label: string; is_done: boolean; sort_order: number; source: string };

const when = (v: string) => new Date(v).toLocaleString("en-KE", { timeZone: "Africa/Nairobi", dateStyle: "medium", timeStyle: "short" });

export default async function ChecklistsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; all?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePermission("tenders.view", "tenders");
  const canManage = ctx.has("tenders.manage") || ctx.isSuper;
  const sb = await createSupabaseServerClient();
  let tq = sb.from("tenders").select("id, reference, title, procuring_entity, submission_deadline, bid_status, submission_status").is("deleted_at", null).order("submission_deadline", { ascending: true, nullsFirst: false });
  if (sp.all !== "1") tq = tq.in("bid_status", ["monitoring", "preparing", "ready"]);
  const [{ data: tenders }, { data: items }] = await Promise.all([
    tq,
    sb.from("tender_checklist_items").select("id, tender_id, label, is_done, sort_order, source").order("sort_order").order("created_at"),
  ]);
  const byTender = new Map<string, Item[]>();
  ((items ?? []) as Item[]).forEach((i) => byTender.set(i.tender_id, [...(byTender.get(i.tender_id) ?? []), i]));
  const list = (tenders ?? []) as Tender[];

  return (
    <>
      <PageHeader title="Tender document checklists" description="A checklist is created automatically when a tender is added or moves to Preparing, from the editable template plus the tender's own eligibility notes. The template is a generic starting point: always check the tender document itself for what is actually required." actions={
        <Link href={sp.all === "1" ? "/admin/checklists" : "/admin/checklists?all=1"} className="btn-outline px-3 py-2 text-sm">{sp.all === "1" ? "Show active tenders only" : "Include closed tenders"}</Link>
      } />
      <Flash ok={sp.ok} error={sp.error} />
      {list.length === 0 ? (
        <Panel><p className="text-sm text-grey-500">No tenders to show. Add a tender under Tenders and its checklist will appear here.</p></Panel>
      ) : (
        <div className="space-y-5">
          {list.map((t) => {
            const its = byTender.get(t.id) ?? [];
            const done = its.filter((i) => i.is_done).length;
            return (
              <Panel key={t.id}>
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-base font-bold text-navy">{t.reference}: {t.title}</h2>
                    <p className="text-sm text-grey-500">{t.procuring_entity}{t.submission_deadline ? ` · closes ${when(t.submission_deadline)}` : " · no deadline recorded"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={its.length > 0 && done === its.length ? "green" : "amber"}>{done} of {its.length} done</Badge>
                    {canManage && <form action={generateChecklist}><input type="hidden" name="tender_id" value={t.id} /><button className="btn-outline px-3 py-1.5 text-sm">{its.length ? "Add missing items" : "Generate checklist"}</button></form>}
                  </div>
                </div>
                {its.length > 0 && (
                  <ul className="divide-y divide-grey-200">
                    {its.map((i) => (
                      <li key={i.id} className="flex items-start justify-between gap-3 py-2">
                        <span className={`text-sm ${i.is_done ? "text-grey-500 line-through" : "text-charcoal"}`}>{i.label}</span>
                        {canManage ? (
                          <form action={toggleItem} className="shrink-0">
                            <input type="hidden" name="id" value={i.id} />
                            <input type="hidden" name="done" value={i.is_done ? "false" : "true"} />
                            <button className={`rounded border px-3 py-1 text-sm ${i.is_done ? "border-grey-300 text-navy hover:bg-grey" : "border-teal bg-teal-tint text-teal-dark hover:bg-teal hover:text-white"}`}>{i.is_done ? "Undo" : "Mark done"}</button>
                          </form>
                        ) : <Badge tone={i.is_done ? "green" : "grey"}>{i.is_done ? "Done" : "Open"}</Badge>}
                      </li>
                    ))}
                  </ul>
                )}
                {canManage && (
                  <form action={addItem} className="mt-3 flex gap-2">
                    <input type="hidden" name="tender_id" value={t.id} />
                    <input name="label" maxLength={400} placeholder="Add your own item" aria-label={`Add a checklist item to ${t.reference}`} className="field-input flex-1" />
                    <button className="btn-primary px-4 py-2 text-sm">Add</button>
                  </form>
                )}
              </Panel>
            );
          })}
        </div>
      )}
    </>
  );
}
