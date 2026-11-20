import type { CookieOptions } from "@supabase/ssr";

/**
 * Session cookies: always SameSite=Lax and Secure in production. (They are not HttpOnly because the browser
 * client reads them for direct storage uploads; the nonce-based CSP in /admin is the defence against script injection.)
 */
export function hardenCookie(options: CookieOptions): CookieOptions {
  return { ...options, path: options.path ?? "/", sameSite: options.sameSite ?? "lax", secure: process.env.NODE_ENV === "production" ? true : options.secure };
}
