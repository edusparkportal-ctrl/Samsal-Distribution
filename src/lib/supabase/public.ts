import { createClient } from "@supabase/supabase-js";
import { supabasePublicEnv } from "./env";

/**
 * Cookie-free, anonymous client for the PUBLIC website. It can only read what the anon RLS policies
 * allow (published content). Because it reads no cookies, pages that use it can be cached and
 * revalidated (ISR). Returns null when Supabase is not configured so callers can fall back to the
 * static content in src/config.
 */
export function createPublicClient() {
  const env = supabasePublicEnv();
  if (!env) return null;
  return createClient(env.url, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      // Let Next.js cache the request and revalidate by tag (see src/lib/content).
      fetch: (input, init) => fetch(input, { ...init, next: { revalidate: 60, tags: ["cms"] } }),
    },
  });
}
