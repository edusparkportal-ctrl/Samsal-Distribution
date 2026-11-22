import "server-only";
import { createServiceClient, isServiceClientConfigured } from "@/lib/supabase/admin";
import { mpesaConfig, type Complete, type MpesaConfig } from "./daraja";

/** The Daraja configuration, or null when the feature is not set up (then no M-Pesa button is shown anywhere). */
export const getMpesaConfig = (): MpesaConfig | null => (isServiceClientConfigured() ? mpesaConfig() : null);

/**
 * Database side of M-Pesa. Uses the service role ONLY for the three server-only functions that apply or fail a
 * payment request (customers cannot call them). Callers must have verified the customer and the request first.
 */
export const completeViaDb: Complete = async (checkout, code, desc, receipt, amount, phone) => {
  const { data, error } = await createServiceClient().rpc("mpesa_complete", { p_checkout: checkout, p_result_code: code, p_desc: desc, p_receipt: receipt, p_amount: amount, p_phone: phone });
  if (error) throw new Error("complete failed");
  return String(data);
};

export async function attachRequest(id: string, merchant: string, checkout: string) {
  const { error } = await createServiceClient().rpc("mpesa_attach_request", { p_id: id, p_merchant: merchant, p_checkout: checkout });
  if (error) throw new Error("attach failed");
}

export async function failRequest(id: string, reason: string) {
  await createServiceClient().rpc("mpesa_fail_request", { p_id: id, p_reason: reason });
}

/** Looks up the Safaricom id of a request. The caller has already proved the request belongs to the signed-in customer. */
export async function checkoutIdOf(id: string): Promise<string | null> {
  const { data } = await createServiceClient().from("mpesa_payments").select("checkout_request_id").eq("id", id).maybeSingle();
  return (data?.checkout_request_id as string | null) ?? null;
}
