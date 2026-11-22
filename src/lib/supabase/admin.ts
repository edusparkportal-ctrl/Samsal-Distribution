import "server-only";
import { createClient } from "@supabase/supabase-js";
import { requirePublicEnv } from "./env";

/**
 * SERVICE-ROLE client. Bypasses Row Level Security - treat like a root password.
 *
 *  - "server-only" makes the build fail if any client component imports this file.
 *  - The key comes only from SUPABASE_SERVICE_ROLE_KEY (never NEXT_PUBLIC_).
 *  - Allowed uses (keep this list short):
 *      1. saving a public website enquiry (visitors have no database access)
 *      2. creating/inviting staff accounts (Supabase Auth admin API)
 *      3. the automation dispatcher (src/lib/automation/dispatch.ts), which sends queued emails and
 *         runs the scheduler tick. It is only reachable with the CRON_SECRET or by a signed-in
 *         administrator holding automation.manage.
 *      4. security monitoring: recording security events (lib/security/events.ts) and a Super Administrator
 *         resetting another person's authenticator (settings/users/actions.ts).
 *      5. customer portal registration: sending the invitation email and checking that the portal is open
 *         (app/portal/(auth)/actions.ts). Protected by CAPTCHA and rate limits that fail closed.
 *      6. M-Pesa payments (lib/mpesa/service.ts): applying or failing a payment request through the server-only
 *         mpesa_* functions, which customers cannot call. Reached from the secret-token callback route and from
 *         actions that have already proven the signed-in customer owns the request.
 *    Everything else must use createSupabaseServerClient() so RLS applies.
 *  - Callers must do their own permission check BEFORE using it.
 */
export function createServiceClient() {
  const { url } = requirePublicEnv();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export const isServiceClientConfigured = () =>
  Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) && Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim());
