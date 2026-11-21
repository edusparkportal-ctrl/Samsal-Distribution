"use server";

import { revalidatePath } from "next/cache";
import { checkPermission, checkStepUp } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dbError, flash, isUuid, optStr, str } from "@/lib/admin/forms";

const PATH = "/admin/portal/accounts";
const DECISIONS = ["approve", "reject", "suspend", "reactivate"] as const;

/**
 * Approve, reject, suspend or reactivate a customer's portal login. Approving links the login to a customer
 * record, which is what lets that person see the customer's prices and orders, so it needs a fresh
 * authenticator code (the database requires it too).
 */
export async function reviewAccount(formData: FormData) {
  const auth = await checkPermission("portal.manage", "portal");
  if (!auth.ok) flash(PATH, "error", auth.error);
  const step = await checkStepUp();
  if (!step.ok) flash(PATH, "error", step.error);
  const user = str(formData, "user_id", 40);
  const decision = str(formData, "decision", 20);
  const customer = str(formData, "customer_id", 40);
  if (!isUuid(user) || !(DECISIONS as readonly string[]).includes(decision)) flash(PATH, "error", "Invalid request.");
  if (customer && !isUuid(customer)) flash(PATH, "error", "Invalid customer.");
  const sb = await createSupabaseServerClient();
  const { error } = await sb.rpc("portal_review_account", { p_user: user, p_decision: decision, p_customer: customer || null, p_note: optStr(formData, "note", 500) });
  if (error) flash(PATH, "error", dbError(error));
  revalidatePath(PATH);
  const done = { approve: "Account approved. The customer can now sign in and order.", reject: "Application rejected.", suspend: "Account suspended.", reactivate: "Account reactivated." }[decision];
  flash(PATH, "ok", done!);
}
