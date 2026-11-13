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
