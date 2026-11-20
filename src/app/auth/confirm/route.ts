import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { safeNext } from "@/lib/auth/safe-redirect";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/security/request";
import { logSecurityEvent } from "@/lib/security/events";

// Only the link types we actually send. (Others, such as magic links or email-change, are not part of this app.)
const ALLOWED_TYPES: readonly string[] = ["invite", "recovery", "email"];

/**
 * Target of the links in Supabase invitation / password-reset emails:
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite|recovery|email
 * Verifies the one-time token, starts a session, then sends the user to set a password.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = safeNext(searchParams.get("next"), "/admin/account");
  const fail = NextResponse.redirect(new URL("/admin/login?error=link", request.url));

  if (!isSupabaseConfigured() || !tokenHash || !type || !ALLOWED_TYPES.includes(type) || tokenHash.length > 200) return fail;
  const ip = clientIp(request.headers);
  const rl = await rateLimit(`confirm:${ip}`, 20, 10 * 60 * 1000, { failure: "degraded" });
  if (!rl.ok) {
    await logSecurityEvent("ratelimit_block", { severity: "warning", ip, detail: { where: "auth_confirm" } });
    return fail;
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({ type: type as EmailOtpType, token_hash: tokenHash });
  if (error) {
    await logSecurityEvent("login_failed", { severity: "info", ip, detail: { reason: "bad_link", type } });
    return fail;
  }
  const res = NextResponse.redirect(new URL(next, request.url));
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}
