import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { requirePublicEnv } from "./env";

/**
 * Supabase client acting AS THE SIGNED-IN USER (anon key + the user's session cookie).
 * Every query runs under Row Level Security, so database permissions apply even if application code
 * has a bug. Use this for all admin reads/writes.
 */
export async function createSupabaseServerClient() {
  const { url, anonKey } = requirePublicEnv();
  const cookieStore = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(list) {
        try {
          list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component, where cookies are read-only. The middleware refreshes the session.
        }
      },
    },
  });
}
