/**
 * Supabase environment access.
 *
 * NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are safe to expose: they only allow what
 * Row Level Security allows. (Newer Supabase projects call the anon key the "publishable key";
 * NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is accepted as an alias.)
 *
 * SUPABASE_SERVICE_ROLE_KEY bypasses RLS. It must NEVER be prefixed NEXT_PUBLIC_ and is only read
 * inside src/lib/supabase/admin.ts, which imports "server-only".
 */
export function supabasePublicEnv(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)?.trim();
  return url && anonKey ? { url: url.replace(/\/$/, ""), anonKey } : null;
}

export const isSupabaseConfigured = () => supabasePublicEnv() !== null;

export function requirePublicEnv() {
  const env = supabasePublicEnv();
  if (!env) {
    throw new Error("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (see docs/SUPABASE_SETUP.md).");
  }
  return env;
}
