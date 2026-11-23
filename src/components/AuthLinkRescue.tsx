"use client";

import { useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Safety net for email links that land on the public site instead of /auth/confirm.
 *
 * This happens when the Supabase email template still uses the default {{ .ConfirmationURL }} (or the redirect
 * URL is not on the allow-list): Supabase then sends the person to the Site URL with the session in the URL
 * fragment (#access_token=...&type=invite). We pick that up, start the session and send them where they
 * belong: customers to choose a password in the portal, staff to their account page.
 * Does nothing unless the URL really carries an invite / sign-up / recovery link.
 */
export function AuthLinkRescue() {
  useEffect(() => {
    const url = new URL(window.location.href);

    // Token-hash style link that reached the wrong page: hand it to the server route unchanged.
    if (url.searchParams.get("token_hash") && url.searchParams.get("type") && url.pathname !== "/auth/confirm") {
      window.location.replace(`/auth/confirm${url.search}`);
      return;
    }

    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    // Used, expired or otherwise rejected link (Supabase puts the reason in the fragment or query string).
    if (hash.get("error") || hash.get("error_code") || url.searchParams.get("error_code") || (url.pathname === "/" && url.searchParams.get("code"))) {
      history.replaceState(null, "", url.pathname);
      window.location.replace("/portal/login?error=link");
      return;
    }
    const type = hash.get("type");
    const access = hash.get("access_token");
    const refresh = hash.get("refresh_token");
    if (!access || !refresh || !type || !["invite", "signup", "recovery", "magiclink"].includes(type)) return;

    (async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const { data, error } = await supabase.auth.setSession({ access_token: access, refresh_token: refresh });
        history.replaceState(null, "", url.pathname + url.search); // never leave tokens in the address bar
        if (error || !data.user) throw error ?? new Error("no user");
        const isCustomer = data.user.user_metadata?.portal_signup === "true";
        window.location.replace(isCustomer ? "/portal/set-password" : "/admin/account");
      } catch {
        history.replaceState(null, "", url.pathname + url.search);
        window.location.replace("/portal/login?error=link");
      }
    })();
  }, []);
  return null;
}
