import Link from "next/link";
import { Badge, PageHeader, Panel } from "@/components/admin/ui";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Automation run log" };

type Run = { id: string; rule_key: string; trigger_type: string; status: string; items: number; error: string | null; attempt: number; started_at: string; finished_at: string | null };
const when = (v: string) => new Date(v).toLocaleString("en-KE", { timeZone: "Africa/Nairobi", dateStyle: "medium", timeStyle: "short" });
const TRIGGER: Record<string, string> = { schedule: "Schedule", manual: "Run now", event: "Instant" };

export default async function LogsPage({ searchParams }: { searchParams: Promise<{ status?: string; rule?: string }> }) {
  const sp = await searchParams;
  await requirePermission("automation.view", "automation");
  const sb = await createSupabaseServerClient();
  const status = sp.status === "error" || sp.status === "success" ? sp.status : "";
  const rule = sp.rule && /^[a-z][a-z0-9_]{2,60}$/.test(sp.rule) ? sp.rule : "";
  let q = sb.from("automation_runs").select("id, rule_key, trigger_type, status, items, error, attempt, started_at, finished_at").order("started_at", { ascending: false }).limit(150);
  if (status) q = q.eq("status", status);
  if (rule) q = q.eq("rule_key", rule);
  const [{ data }, { data: rules }] = await Promise.all([q, sb.from("automation_rules").select("key, name")]);
  const names: Record<string, string> = {};
  (rules ?? []).forEach((r: { key: string; name: string }) => (names[r.key] = r.name));
  const runs = (data ?? []) as Run[];
  const tab = (label: string, v: string) => (
    <Link href={v ? `/admin/automation/logs?status=${v}` : "/admin/automation/logs"} className={`rounded-full border px-3 py-1 ${status === v ? "border-navy bg-navy text-white" : "border-grey-300 text-charcoal hover:bg-grey"}`}>{label}</Link>
  );
  return (
    <>
      <PageHeader title="Automation run log" description="Every automation run, newest first: when it ran, what started it, how many notifications it created, and any error. Failed scheduled runs retry automatically with a growing delay." />
      <div className="mb-4 flex flex-wrap gap-2 text-sm">{tab("All", "")}{tab("Errors", "error")}{tab("Successful", "success")}{rule && <Link href="/admin/automation/logs" className="rounded-full border border-teal px-3 py-1 text-teal-dark">Rule: {names[rule] ?? rule} ✕</Link>}</div>
      <Panel>
        {runs.length === 0 ? <p className="text-sm text-grey-500">No runs recorded yet.</p> : (
          <ul className="divide-y divide-grey-200">
            {runs.map((r) => (
              <li key={r.id} className="py-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Link href={`/admin/automation/logs?rule=${r.rule_key}`} className="font-semibold text-navy hover:underline">{names[r.rule_key] ?? r.rule_key}</Link>
                  <Badge tone={r.status === "success" ? "green" : r.status === "error" ? "red" : "amber"}>{r.status === "success" ? "Success" : r.status === "error" ? "Error" : "Running"}</Badge>
                  <span className="text-xs text-grey-500">{TRIGGER[r.trigger_type] ?? r.trigger_type}{r.attempt > 1 ? ` · attempt ${r.attempt}` : ""}</span>
                  <span className="text-xs text-grey-500">{when(r.started_at)}</span>
                  {r.status === "success" && <span className="text-xs text-charcoal">{r.items} item{r.items === 1 ? "" : "s"}</span>}
                </div>
                {r.error && <p className="mt-1 break-words text-sm text-red-800">{r.error}</p>}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
