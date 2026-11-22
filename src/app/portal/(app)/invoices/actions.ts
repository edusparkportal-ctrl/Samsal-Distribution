"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireCustomer } from "@/lib/portal/session";
import { flash, dbError, isUuid, str } from "@/lib/admin/forms";
import { parseShillings } from "@/lib/portal/format";
import { rateLimit } from "@/lib/rate-limit";
import { callbackUrl, stkPush } from "@/lib/mpesa/daraja";
import { attachRequest, failRequest, getMpesaConfig } from "@/lib/mpesa/service";
import { site } from "@/config/site";

/**
 * Pay an invoice with M-Pesa. The browser sends only: which invoice, a phone number and an amount.
 * The database decides whether that is allowed (ownership, payable status, amount <= balance, no duplicate in flight);
 * Safaricom's prompt goes to the phone; and the payment is applied only when Safaricom confirms it (callback route).
 */
export async function payWithMpesa(fd: FormData) {
  const ctx = await requireCustomer();
  const invoice = String(fd.get("invoice_id") ?? "");
  if (!isUuid(invoice)) flash("/portal/invoices", "error", "That invoice could not be found.");
  const to = `/portal/invoices/${invoice}`;
  const cfg = getMpesaConfig();
  if (!cfg) flash(to, "error", "Online M-Pesa payment is not available yet. Please use the payment details shown.");
  const rl = await rateLimit(`pmpesa:${ctx.userId}`, 6, 10 * 60 * 1000, { failure: "closed" });
  if (!rl.ok) flash(to, "error", "Too many payment attempts. Please wait a few minutes.");
  const amount = parseShillings(fd.get("amount"));
  if (amount === null) flash(to, "error", "Enter the amount in whole shillings (up to KES 250,000).");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("portal_mpesa_prepare", { p_invoice: invoice, p_phone: str(fd, "phone", 20), p_amount: amount });
  if (error) flash(to, "error", dbError(error));
  const prep = data as { id: string; amount: number; phone: string; account_ref: string; description: string };

  let sent = false;
  try {
    const acc = await stkPush(cfg!, { amount: prep.amount, phone: prep.phone, accountRef: prep.account_ref, description: prep.description, callbackUrl: callbackUrl(site.url, cfg!.callbackToken) }, (u, i) => fetch(u, i as RequestInit));
    await attachRequest(prep.id, acc.merchantRequestId, acc.checkoutRequestId);
    sent = true;
  } catch {
    await failRequest(prep.id, "The payment request could not be sent to M-Pesa.").catch(() => undefined);
  }
  revalidatePath(to);
  if (!sent) flash(to, "error", "We could not send the M-Pesa prompt. Please try again, or use the payment details shown.");
  flash(`${to}?pay=${prep.id}`, "ok", "Check your phone and enter your M-Pesa PIN to complete the payment.");
}
