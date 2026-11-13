import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Gatekeeper for /admin. This is a FIRST line of defence only (it redirects anonymous visitors);
 * every admin page and server action re-checks the user's permissions on the server, and the
 * database enforces them again with Row Level Security.
 */
const PUBLIC_ADMIN_PATHS = ["/admin/login", "/admin/forgot-password"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const { response, user, configured } = await updateSession(request);

  // Never let search engines or caches keep admin pages.
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  response.headers.set("Cache-Control", "private, no-store");

  if (!configured) {
    // Supabase not set up yet: the admin area simply is not available.
    if (pathname !== "/admin/login") return NextResponse.redirect(new URL("/admin/login", request.url));
    return response;
  }

  const isPublic = PUBLIC_ADMIN_PATHS.includes(pathname);
  if (!user && !isPublic) {
    const url = new URL("/admin/login", request.url);
    if (pathname !== "/admin") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  // Only the admin area; the public website never touches auth cookies (keeps pages cacheable).
  matcher: ["/admin/:path*"],
};
