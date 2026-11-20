import "server-only";
import { createServiceClient, isServiceClientConfigured } from "@/lib/supabase/admin";
import { ipHint } from "@/lib/security/request";

export type SecurityEventKind =
  | "login_failed" | "login_ok" | "mfa_failed" | "mfa_enrolled" | "mfa_removed" | "mfa_reset"
  | "ratelimit_block" | "captcha_failed" | "token_failed" | "csp_violation" | "cron_unauthorised"
  | "upload_rejected" | "export_data" | "stepup_denied" | "config_missing" | "origin_rejected";

/**
 * Records a security event for the dashboard and the daily checks. NEVER throws and never blocks the caller:
 * monitoring must not be able to break a sign-in or a customer's form. Falls back to the platform log.
 * `detail` must not contain secrets, passwords, codes, tokens or message bodies.
 */
export async function logSecurityEvent(
  kind: SecurityEventKind,
  opts: { severity?: "info" | "warning" | "critical"; actor?: string | null; ip?: string | null; detail?: Record<string, string | number | boolean | null> } = {},
): Promise<void> {
  const severity = opts.severity ?? "info";
  const hint = opts.ip ? ipHint(opts.ip) : null;
  const detail = JSON.stringify(opts.detail ?? {}).slice(0, 3000);
  try {
    if (!isServiceClientConfigured()) throw new Error("service role not configured");
    const { error } = await createServiceClient().rpc("security_log", {
      p_kind: kind, p_severity: severity, p_actor: opts.actor ?? null, p_ip: hint, p_detail: JSON.parse(detail),
    });
    if (error) throw new Error(error.message);
  } catch {
    // Fall back to the platform log (Vercel keeps it); one structured line, no secrets.
    console.warn(`[security-event] ${JSON.stringify({ kind, severity, ip: hint, detail: JSON.parse(detail) })}`);
  }
}
