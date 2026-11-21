import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { safeNext, safePortalNext } from "@/lib/auth/safe-redirect";
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
  // Links sent to customers carry next=/portal/...; staff links carry next=/admin/...
  const wantsPortal = (searchParams.get("next") ?? "").startsWith("/portal");
  const next = wantsPortal ? safePortalNext(searchParams.get("next"), "/portal/status") : safeNext(searchParams.get("next"), "/admin/account");
  const fail = NextResponse.redirect(new URL(wantsPortal ? "/portal/login?error=link" : "/admin/login?error=link", request.url));

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
  // The email templates carry no "next". A customer (someone with a portal application) goes to choose a password
  // in the portal; staff keep their existing destination.
  let dest = next;
  if (!searchParams.get("next")) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: acc } = await supabase.from("customer_accounts").select("user_id").eq("user_id", user.id).maybeSingle();
      if (acc) dest = "/portal/set-password";
    }
  }
  const res = NextResponse.redirect(new URL(dest, request.url));
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}
