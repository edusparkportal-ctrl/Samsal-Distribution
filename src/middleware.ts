import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { buildCsp, cspHeaderName, newNonce } from "@/lib/security/csp.mjs";

/**
 * Gatekeeper for /admin and /portal. This is a FIRST line of defence only (it redirects anonymous visitors);
 * every admin page and server action re-checks the user's permissions on the server, and the
 * database enforces them again with Row Level Security (including multi-factor assurance).
 *
 * It also issues the per-request Content-Security-Policy nonce for the admin area, so no inline script
 * is trusted there. (Set CSP_REPORT_ONLY=1 in Vercel to observe violations without blocking.)
 */
const PUBLIC_ADMIN_PATHS = ["/admin/login", "/admin/forgot-password"];
// The customer portal is a separate area with its own sign-in. Customers never use /admin.
const PUBLIC_PORTAL_PATHS = ["/portal/login", "/portal/register", "/portal/forgot-password"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const dev = process.env.NODE_ENV !== "production";
  const reportOnly = process.env.CSP_REPORT_ONLY === "1";

  const nonce = newNonce();
  const csp = buildCsp({ nonce, dev, supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL, reportUri: "/api/csp-report" });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("x-pathname", pathname);
  requestHeaders.set("content-security-policy", csp); // Next.js reads the nonce from here

  const { response, user, configured } = await updateSession(request, requestHeaders);

  response.headers.set(cspHeaderName(reportOnly), csp);
  // Never let search engines or caches keep admin or portal pages.
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  response.headers.set("Cache-Control", "private, no-store");

  const portal = pathname === "/portal" || pathname.startsWith("/portal/");
  const loginPath = portal ? "/portal/login" : "/admin/login";

  if (!configured) {
    // Supabase not set up yet: these areas simply are not available.
    if (pathname !== loginPath) return NextResponse.redirect(new URL(loginPath, request.url));
    return response;
  }

  const isPublic = portal ? PUBLIC_PORTAL_PATHS.includes(pathname) : PUBLIC_ADMIN_PATHS.includes(pathname);
  if (!user && !isPublic) {
    const url = new URL(loginPath, request.url);
    if (pathname !== "/admin" && pathname !== "/portal") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  // Only the admin area and the customer portal; the public website never touches auth cookies (keeps pages cacheable).
  matcher: ["/admin/:path*", "/portal/:path*"],
};
