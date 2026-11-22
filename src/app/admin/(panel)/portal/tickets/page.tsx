import Link from "next/link";
import { Badge, PageHeader, Panel, Notice } from "@/components/admin/ui";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Flash } from "@/components/admin/Flash";

export const metadata = { title: "Support tickets" };
type Row = { id: string; reference: string; subject: string; category: string; status: string; last_activity_at: string; customer: { company_name: string | null; contact_name: string } | { company_name: string | null; contact_name: string }[] | null };
const TONE: Record<string, "green" | "amber" | "red" | "grey" | "teal"> = { open: "amber", in_progress: "teal", awaiting_customer: "grey", resolved: "green", closed: "grey" };
const LABEL: Record<string, string> = { open: "Open", in_progress: "In progress", awaiting_customer: "Awaiting customer", resolved: "Resolved", closed: "Closed" };
const FILTERS = ["", "open", "in_progress", "awaiting_customer", "resolved", "closed"];

export default async function Page({ searchParams }: { searchParams: Promise<{ status?: string; ok?: string; error?: string }> }) {
  const sp = await searchParams;
  await requirePermission("portal.view", "portal");
  const sb = await createSupabaseServerClient();
  let q = sb.from("support_tickets").select("id, reference, subject, category, status, last_activity_at, customer:customers(company_name, contact_name)").order("last_activity_at", { ascending: false }).limit(200);
  if (sp.status && FILTERS.includes(sp.status)) q = q.eq("status", sp.status);
  const { data, error } = await q;
  const rows = (data ?? []) as unknown as Row[];
  return (
    <>
      <PageHeader title="Support tickets" description="Questions and problems from portal customers. Replies appear in the customer's portal." />
      <Flash ok={sp.ok} error={sp.error} />
      {error && <Notice tone="error">These records could not be loaded.</Notice>}
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        {FILTERS.map((s) => (
          <Link key={s} href={s ? `/admin/portal/tickets?status=${s}` : "/admin/portal/tickets"} className={`rounded-full border px-3 py-1 font-semibold ${(sp.status ?? "") === s ? "border-navy bg-navy text-white" : "border-grey-300 bg-white text-navy"}`}>{s ? LABEL[s] : "All"}</Link>
        ))}
      </div>
      <Panel>
        {rows.length === 0 ? <p className="text-sm text-charcoal">No tickets.</p> : (
          <ul className="divide-y divide-grey-200">
            {rows.map((r) => {
              const c = Array.isArray(r.customer) ? r.customer[0] : r.customer;
              return (
                <li key={r.id}>
                  <Link href={`/admin/portal/tickets/${r.id}`} className="flex flex-wrap items-center justify-between gap-2 py-3 hover:bg-grey-100">
                    <span className="min-w-0"><span className="block truncate font-semibold text-navy">{r.subject}</span><span className="block text-xs text-grey-500">{r.reference} · {c?.company_name || c?.contact_name || "-"} · {r.category} · {new Date(r.last_activity_at).toLocaleString("en-KE", { timeZone: "Africa/Nairobi", dateStyle: "medium", timeStyle: "short" })}</span></span>
                    <Badge tone={TONE[r.status] ?? "grey"}>{LABEL[r.status] ?? r.status}</Badge>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </>
  );
}
