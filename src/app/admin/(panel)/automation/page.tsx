import { Flash } from "@/components/admin/Flash";
import { Badge, Notice, PageHeader, Panel } from "@/components/admin/ui";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { runNow, saveRule, setEmailEnabled } from "./actions";

export const metadata = { title: "Automation Control Centre" };

type Rule = {
  key: string; name: string; description: string; category: string; kind: "event" | "scheduled"; module: string | null;
  enabled: boolean; schedule_minutes: number | null; params: Record<string, number>; params_help: Record<string, string>;
  notify_in_app: boolean; notify_email: boolean; email_capable: boolean; last_run_at: string | null; next_run_at: string | null;
  consecutive_failures: number; last_error: string | null;
};

const CATEGORY_LABEL: Record<string, string> = {
  enquiries: "Enquiries", quotations: "Quotations", procurement: "Procurement", tenders: "Tenders", inventory: "Inventory",
  orders: "Orders & deliveries", reports: "Reports", system: "System",
};
const CATEGORY_ORDER = ["enquiries", "quotations", "procurement", "tenders", "inventory", "orders", "reports", "system"];

const when = (v: string | null) => (v ? new Date(v).toLocaleString("en-KE", { timeZone: "Africa/Nairobi", dateStyle: "medium", timeStyle: "short" }) : "—");
const every = (m: number) => (m % 1440 === 0 ? `${m / 1440} day${m === 1440 ? "" : "s"}` : m % 60 === 0 ? `${m / 60} hour${m === 60 ? "" : "s"}` : `${m} minutes`);

export default async function AutomationPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePermission("automation.view", "automation");
  const canManage = ctx.has("automation.manage") || ctx.isSuper;
  const sb = await createSupabaseServerClient();
  const [{ data: rulesData }, { data: settings }, { data: mods }, { data: runs }] = await Promise.all([
    sb.from("automation_rules").select("*").neq("key", "automation_health").order("sort_order"),
    sb.from("automation_settings").select("email_enabled").eq("id", 1).maybeSingle(),
    sb.from("modules").select("key, name, enabled"),
    sb.from("automation_runs").select("status").gte("started_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString()),
  ]);
  const rules = (rulesData ?? []) as Rule[];
  const modEnabled: Record<string, boolean> = {};
  const modName: Record<string, string> = {};
  (mods ?? []).forEach((m: { key: string; name: string; enabled: boolean }) => { modEnabled[m.key] = m.enabled; modName[m.key] = m.name; });
  const runList = (runs ?? []) as { status: string }[];
  const failed24 = runList.filter((r) => r.status === "error").length;
  const emailOn = Boolean(settings?.email_enabled);
  const emailConfigured = Boolean(process.env.RESEND_API_KEY?.trim() && process.env.AUTOMATION_FROM_EMAIL?.trim());

  return (
    <>
      <PageHeader title="Automation Control Centre" description="Reminders, alerts, comparisons and summaries that run on their own. Switch each one on or off, change when it runs, and choose how it notifies people. Everything acts on real records only." />
      <Flash ok={sp.ok} error={sp.error} />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="card p-4"><p className="text-xs font-semibold uppercase tracking-wide text-grey-500">Automations on</p><p className="mt-1 text-3xl font-bold text-navy">{rules.filter((r) => r.enabled).length}<span className="text-base font-normal text-grey-500"> of {rules.length}</span></p></div>
        <div className="card p-4"><p className="text-xs font-semibold uppercase tracking-wide text-grey-500">Runs in the last 24 hours</p><p className="mt-1 text-3xl font-bold text-navy">{runList.length}</p></div>
        <div className="card p-4"><p className="text-xs font-semibold uppercase tracking-wide text-grey-500">Failed in the last 24 hours</p><p className={`mt-1 text-3xl font-bold ${failed24 ? "text-red-700" : "text-navy"}`}>{failed24}</p></div>
      </div>

      <Panel title="Email notifications" className="mb-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-2xl text-sm text-charcoal">
            <p>In-app notifications (the bell at the top of the page) always work. Emails to customers, suppliers and staff are <strong>{emailOn ? "switched on" : "switched off"}</strong>.</p>
            {!emailConfigured && <p className="mt-2 text-grey-500">Email sending needs a verified sending domain, then <code>RESEND_API_KEY</code> and <code>AUTOMATION_FROM_EMAIL</code> set in Vercel. Until then, leave this off: nothing is queued while it is off.</p>}
          </div>
          {canManage && (
            <form action={setEmailEnabled}>
              <input type="hidden" name="enabled" value={emailOn ? "false" : "true"} />
              <button className={emailOn ? "btn-outline px-4 py-2 text-sm" : "btn-primary px-4 py-2 text-sm"}>{emailOn ? "Switch email off" : "Switch email on"}</button>
            </form>
          )}
        </div>
        {emailOn && !emailConfigured && <div className="mt-3"><Notice tone="warn">Email is switched on but sending is not configured, so queued emails will wait in the outbox.</Notice></div>}
      </Panel>

      {CATEGORY_ORDER.map((cat) => {
        const list = rules.filter((r) => r.category === cat);
        if (list.length === 0) return null;
        return (
          <section key={cat} className="mb-8" aria-labelledby={`cat-${cat}`}>
            <h2 id={`cat-${cat}`} className="mb-3 text-sm font-bold uppercase tracking-[0.14em] text-teal-dark">{CATEGORY_LABEL[cat]}</h2>
            <div className="space-y-4">
              {list.map((r) => {
                const moduleOff = r.module ? modEnabled[r.module] === false : false;
                const paramKeys = Object.keys(r.params ?? {});
                return (
                  <form key={r.key} action={saveRule} className="card p-4 sm:p-5">
                    <input type="hidden" name="key" value={r.key} />
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="font-semibold text-navy">
                          {r.name}{" "}
                          <Badge tone={r.enabled && !moduleOff ? "green" : "amber"}>{moduleOff ? "Module off" : r.enabled ? "On" : "Off"}</Badge>{" "}
                          <Badge tone="grey">{r.kind === "event" ? "Instant" : `Every ${every(r.schedule_minutes ?? 0)}`}</Badge>
                          {r.consecutive_failures > 0 && <> <Badge tone="red">Failing</Badge></>}
                        </p>
                        <p className="mt-1 text-sm text-grey-500">{r.description}</p>
                        {moduleOff && r.module && <p className="mt-1 text-sm text-charcoal">Waiting for the <strong>{modName[r.module] ?? r.module}</strong> module to be switched on in Settings &gt; Modules.</p>}
                      </div>
                      {canManage && r.kind === "scheduled" && !moduleOff && r.enabled && (
                        <button type="submit" formAction={runNow} className="btn-outline shrink-0 px-3 py-1.5 text-sm">Run now</button>
                      )}
                    </div>

                    <dl className="mt-3 grid gap-x-6 gap-y-1 text-xs text-grey-500 sm:grid-cols-3">
                      <div><dt className="inline">Last run: </dt><dd className="inline text-charcoal">{when(r.last_run_at)}</dd></div>
                      {r.kind === "scheduled" && <div><dt className="inline">Next run: </dt><dd className="inline text-charcoal">{r.enabled ? when(r.next_run_at) : "—"}</dd></div>}
                    </dl>
                    {r.last_error && <div className="mt-3"><Notice tone="error">Last error: {r.last_error}</Notice></div>}

                    {canManage ? (
                      <div className="mt-4 grid gap-4 border-t border-grey-200 pt-4 sm:grid-cols-2 lg:grid-cols-3">
                        <label className="flex items-center gap-2.5 text-sm text-charcoal"><input type="checkbox" name="enabled" defaultChecked={r.enabled} className="h-4 w-4" /> Automation is on</label>
                        <label className="flex items-center gap-2.5 text-sm text-charcoal"><input type="checkbox" name="notify_in_app" defaultChecked={r.notify_in_app} className="h-4 w-4" /> In-app notifications</label>
                        {r.email_capable && <label className="flex items-center gap-2.5 text-sm text-charcoal"><input type="checkbox" name="notify_email" defaultChecked={r.notify_email} className="h-4 w-4" /> Send emails {!emailOn && <span className="text-grey-500">(email is off)</span>}</label>}
                        {r.kind === "scheduled" && (
                          <label className="block text-sm text-charcoal">Check every (minutes)
                            <input type="number" name="schedule_minutes" min={5} max={10080} defaultValue={r.schedule_minutes ?? 60} className="field-input mt-1" />
                          </label>
                        )}
                        {paramKeys.map((k) => (
                          <label key={k} className="block text-sm text-charcoal">{r.params_help?.[k] ?? k}
                            <input type="number" name={`p_${k}`} min={0} max={100000} step="any" defaultValue={r.params[k]} className="field-input mt-1" />
                          </label>
                        ))}
                        <div className="flex items-end"><button className="btn-primary px-4 py-2 text-sm">Save</button></div>
                      </div>
                    ) : (
                      <p className="mt-3 text-xs text-grey-500">You can view automations but not change them.</p>
                    )}
                  </form>
                );
              })}
            </div>
          </section>
        );
      })}
    </>
  );
}
