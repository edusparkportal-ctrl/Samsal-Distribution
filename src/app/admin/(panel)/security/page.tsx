import { Badge, Notice, PageHeader, Panel, StatCard } from "@/components/admin/ui";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isProduction, missingPublicFormControls, securityConfig } from "@/lib/security/env";

export const metadata = { title: "Security" };
export const dynamic = "force-dynamic";

type Issue = { key: string; severity: "warning" | "critical"; title: string; detail: string };
type Posture = {
  super_admins: number; mfa_missing: { name: string; role: string }[]; mfa_missing_count: number; tables_without_rls: number; anon_write_grants: number;
  failed_auth_24h: number; rate_limit_blocks_24h: number; csp_reports_24h: number; captcha_failures_24h: number; issues: Issue[];
};
type EventRow = { id: number; at: string; kind: string; severity: "info" | "warning" | "critical"; ip_hint: string | null; detail: Record<string, unknown> };

const tone = { info: "grey", warning: "amber", critical: "red" } as const;
const KIND_LABEL: Record<string, string> = {
  login_failed: "Sign-in failed", login_ok: "Signed in", mfa_failed: "Authenticator code failed", mfa_enrolled: "Authenticator added", mfa_removed: "Authenticator removed",
  mfa_reset: "Two-step verification reset", ratelimit_block: "Rate limited", captcha_failed: "Spam check failed", token_failed: "Form token rejected",
  csp_violation: "Browser blocked content (CSP)", cron_unauthorised: "Scheduler called without the secret", export_data: "Data exported", stepup_denied: "Fresh code required",
  config_missing: "Security setting missing", origin_rejected: "Cross-site request rejected", upload_rejected: "Upload rejected",
};

const ok = (v: boolean) => (v ? <Badge tone="green">Set</Badge> : <Badge tone="red">Missing</Badge>);

export default async function SecurityPage() {
  await requirePermission("security.view", "audit");
  const sb = await createSupabaseServerClient();
  const [{ data: posture, error }, { data: events }] = await Promise.all([
    sb.rpc("security_posture"),
    sb.from("security_events").select("id, at, kind, severity, ip_hint, detail").order("at", { ascending: false }).limit(100),
  ]);
  const p = posture as Posture | null;
  const cfg = securityConfig();
  const missingForms = missingPublicFormControls(cfg);

  return (
    <>
      <PageHeader title="Security" description="Sign-in activity, two-step verification coverage, protection settings and the latest security events. Checked automatically every day; Super Administrators are notified of problems." />
      {error && <div className="mb-5"><Notice tone="error">The security checks could not run. Make sure the latest database migrations have been applied.</Notice></div>}

      {p && p.issues.length === 0 && <div className="mb-5"><Notice tone="success">All automatic checks passed.</Notice></div>}
      {p && p.issues.length > 0 && (
        <Panel title={`Needs attention (${p.issues.length})`} className="mb-6">
          <ul className="divide-y divide-grey-200">
            {p.issues.map((i) => (
              <li key={i.key} className="flex items-start gap-3 py-3">
                <Badge tone={i.severity === "critical" ? "red" : "amber"}>{i.severity}</Badge>
                <div><p className="font-semibold text-navy">{i.title}</p><p className="text-sm text-grey-500">{i.detail}</p></div>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {p && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Failed sign-ins (24h)" value={p.failed_auth_24h} hint="Passwords and authenticator codes" />
          <StatCard label="Rate-limited (24h)" value={p.rate_limit_blocks_24h} hint="Requests refused for coming too fast" />
          <StatCard label="Spam checks failed (24h)" value={p.captcha_failures_24h} hint="CAPTCHA or form token" />
          <StatCard label="Blocked content (24h)" value={p.csp_reports_24h} hint="Content-Security-Policy reports" />
          <StatCard label="Super Administrators" value={p.super_admins} hint="Keep at least two, no more than four" />
          <StatCard label="Without two-step verification" value={p.mfa_missing_count} hint="Accounts whose role requires it" />
          <StatCard label="Tables without row security" value={p.tables_without_rls} hint="Must be 0" />
          <StatCard label="Anonymous write access" value={p.anon_write_grants} hint="Must be 0" />
        </div>
      )}

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Protection settings on this server">
          <p className="mb-3 text-xs text-grey-500">Shows only whether each setting exists. Values are never displayed.</p>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-grey-200">
              <tr><td className="py-2">Shared rate limiting (Redis)</td><td className="py-2 text-right">{ok(cfg.redis)}</td></tr>
              <tr><td className="py-2">CAPTCHA secret (Turnstile)</td><td className="py-2 text-right">{ok(cfg.turnstileSecret)}</td></tr>
              <tr><td className="py-2">CAPTCHA site key</td><td className="py-2 text-right">{ok(cfg.turnstileSiteKey)}</td></tr>
              <tr><td className="py-2">Form token secret</td><td className="py-2 text-right">{ok(cfg.formToken)}</td></tr>
              <tr><td className="py-2">Scheduler secret</td><td className="py-2 text-right">{ok(cfg.cronSecret)}</td></tr>
              <tr><td className="py-2">Server database key</td><td className="py-2 text-right">{ok(cfg.serviceRole)}</td></tr>
              <tr><td className="py-2">Content-Security-Policy mode</td><td className="py-2 text-right">{process.env.CSP_REPORT_ONLY === "1" ? <Badge tone="amber">Report only</Badge> : <Badge tone="green">Enforced</Badge>}</td></tr>
            </tbody>
          </table>
          {isProduction() && missingForms.length > 0 && (
            <div className="mt-3"><Notice tone="error">The website forms are switched off until these are set: {missingForms.join(", ")}.</Notice></div>
          )}
        </Panel>
        <Panel title="Accounts that must set up two-step verification">
          {p && p.mfa_missing.length === 0 ? <p className="text-sm text-charcoal">Everyone whose role requires it has set it up.</p> : (
            <ul className="divide-y divide-grey-200 text-sm">
              {(p?.mfa_missing ?? []).map((m, i) => <li key={i} className="flex justify-between py-2"><span>{m.name}</span><span className="text-grey-500">{m.role}</span></li>)}
            </ul>
          )}
          <p className="mt-3 text-xs text-grey-500">These people are asked to set it up at their next sign-in and cannot use the admin area until they do.</p>
        </Panel>
      </div>

      <Panel title="Backups and recovery">
        <ul className="list-disc space-y-1 pl-5 text-sm text-charcoal">
          <li>The database is backed up by Supabase. Confirm the backup schedule and point-in-time recovery under Supabase, Database, Backups.</li>
          <li>A scheduled restore drill (GitHub Actions, &ldquo;Backup restore drill&rdquo;) restores a recent copy into a temporary database and checks that the data and the security rules are intact.</li>
          <li>The recovery steps are in <code>docs/SECURITY.md</code>.</li>
        </ul>
      </Panel>

      <Panel title="Latest security events" className="mt-6">
        {(events ?? []).length === 0 ? <p className="text-sm text-grey-500">Nothing recorded yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead><tr className="border-b border-grey-200 text-xs uppercase tracking-wide text-grey-500"><th className="py-2 pr-3">When</th><th className="py-2 pr-3">Event</th><th className="py-2 pr-3">Level</th><th className="py-2 pr-3">Network</th><th className="py-2">Details</th></tr></thead>
              <tbody className="divide-y divide-grey-200">
                {((events ?? []) as EventRow[]).map((e) => (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap py-2 pr-3">{new Date(e.at).toLocaleString("en-KE", { timeZone: "Africa/Nairobi", dateStyle: "medium", timeStyle: "short" })}</td>
                    <td className="py-2 pr-3">{KIND_LABEL[e.kind] ?? e.kind}</td>
                    <td className="py-2 pr-3"><Badge tone={tone[e.severity]}>{e.severity}</Badge></td>
                    <td className="py-2 pr-3 font-mono text-xs">{e.ip_hint ?? "-"}</td>
                    <td className="max-w-xs truncate py-2 text-xs text-grey-500">{Object.entries(e.detail ?? {}).map(([k, v]) => `${k}: ${String(v)}`).join(" · ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
