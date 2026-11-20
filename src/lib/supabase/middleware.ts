import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabasePublicEnv } from "./env";
import { hardenCookie } from "./cookies";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Refreshes the Supabase session cookie on every admin request and returns the verified user.
 * Uses auth.getUser() (which re-validates the token with Supabase) rather than getSession().
 * `requestHeaders` carries the per-request CSP nonce to the page (Next.js reads it to nonce its own scripts).
 */
export async function updateSession(request: NextRequest, requestHeaders?: Headers) {
  const forward = () => {
    const h = new Headers(requestHeaders ?? request.headers);
    h.set("cookie", request.headers.get("cookie") ?? "");
    return NextResponse.next({ request: { headers: h } });
  };
  let response = forward();
  const env = supabasePublicEnv();
  if (!env) return { response, user: null, configured: false as const };

  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(list: CookieToSet[]) {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = forward();
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, hardenCookie(options)));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { response, user, configured: true as const };
}
