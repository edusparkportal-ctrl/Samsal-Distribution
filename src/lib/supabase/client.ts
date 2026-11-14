"use client";

import { createBrowserClient } from "@supabase/ssr";
import { requirePublicEnv } from "./env";

/**
 * Browser client (anon key + the signed-in user's session). Used ONLY for uploading files straight to
 * Supabase Storage, which keeps large files off the Vercel function body limit. Storage policies
 * (migration 0006) decide who may write, and the server re-validates every upload before it is used.
 */
export function createSupabaseBrowserClient() {
  const { url, anonKey } = requirePublicEnv();
  return createBrowserClient(url, anonKey);
}
