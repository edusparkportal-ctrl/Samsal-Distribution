import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabasePublicEnv } from "./env";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Refreshes the Supabase session cookie on every admin request and returns the verified user.
 * Uses auth.getUser() (which re-validates the token with Supabase) rather than getSession().
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const env = supabasePublicEnv();
  if (!env) return { response, user: null, configured: false as const };

  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(list: CookieToSet[]) {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { response, user, configured: true as const };
}
