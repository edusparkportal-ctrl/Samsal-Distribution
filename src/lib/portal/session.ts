import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export type PortalContext = {
  userId: string;
  email: string;
  contactName: string;
  company: string;
  cartLines: number;
  openOrders: number;
};

export type PortalSession =
  | { status: "unconfigured" }
  | { status: "anonymous" }
  | { status: "no_application"; email: string } // signed in, but never applied (for example a staff login)
  | { status: "pending"; email: string; company: string }
  | { status: "rejected"; email: string; company: string }
  | { status: "suspended"; email: string; company: string }
  | { status: "unavailable"; email: string } // approved, but the portal is switched off
  | { status: "ok"; ctx: PortalContext };

/**
 * Who is calling the portal. The application row is the caller's own (RLS: user_id = auth.uid()), and the
 * "ok" state additionally requires portal_dashboard() to answer, which only happens for an ACTIVE account of
 * a live customer while the module is enabled. Cached per request.
 */
export const getPortalSession = cache(async (): Promise<PortalSession> => {
  if (!isSupabaseConfigured()) return { status: "unconfigured" };
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "anonymous" };
  const email = user.email ?? "";

  const { data: acc } = await supabase.from("customer_accounts").select("status, company_name, contact_name").eq("user_id", user.id).maybeSingle();
  if (!acc) return { status: "no_application", email };
  if (acc.status === "pending") return { status: "pending", email, company: acc.company_name };
  if (acc.status === "rejected") return { status: "rejected", email, company: acc.company_name };
  if (acc.status === "suspended") return { status: "suspended", email, company: acc.company_name };

  const { data: dash } = await supabase.rpc("portal_dashboard");
  if (!dash) return { status: "unavailable", email };
  const d = dash as { customer?: string; open_orders?: number; cart_lines?: number };
  return {
    status: "ok",
    ctx: {
      userId: user.id,
      email,
      contactName: acc.contact_name,
      company: d.customer || acc.company_name,
      cartLines: Number(d.cart_lines ?? 0),
      openOrders: Number(d.open_orders ?? 0),
    },
  };
});

/** For portal pages: sends everyone who is not an approved, active customer to the right place. */
export async function requireCustomer(): Promise<PortalContext> {
  const s = await getPortalSession();
  if (s.status === "ok") return s.ctx;
  if (s.status === "anonymous" || s.status === "unconfigured") redirect("/portal/login");
  redirect("/portal/status");
}
