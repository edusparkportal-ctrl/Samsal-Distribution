import "server-only";
import { createServiceClient, isServiceClientConfigured } from "@/lib/supabase/admin";
import { mapSubmission } from "@/lib/enquiry-map";
import type { FormKind, FormValues } from "@/lib/validation";

/**
 * Saves a website submission into the CRM using the service-role client (visitors have no database
 * access). It NEVER throws: if the database is unavailable the caller still delivers the email, so a
 * database problem cannot lose an enquiry. Returns the enquiry reference, or null if it was not saved.
 */
export async function saveWebsiteEnquiry(kind: FormKind, values: FormValues, attachmentName: string | null): Promise<string | null> {
  if (!isServiceClientConfigured()) return null;
  try {
    const sb = createServiceClient();
    const { customer, enquiry, categoryName } = mapSubmission(kind, values, attachmentName);

    // Reuse the customer when the same email + organisation has written before.
    let q = sb.from("customers").select("id").is("deleted_at", null).ilike("email", customer.email.replace(/[%_\\]/g, "\\$&"));
    q = customer.company_name ? q.ilike("company_name", customer.company_name.replace(/[%_\\]/g, "\\$&")) : q.is("company_name", null);
    const found = await q.limit(1).maybeSingle();
    let customerId: string | null = found.data?.id ?? null;
    if (!customerId) {
      const ins = await sb.from("customers").insert(customer).select("id").single();
      if (ins.error) {
        // Lost a race with a concurrent identical submission: look again.
        const again = await sb.from("customers").select("id").ilike("email", customer.email).limit(1).maybeSingle();
        customerId = again.data?.id ?? null;
      } else customerId = ins.data.id;
    }

    let categoryId: string | null = null;
    if (categoryName) {
      const c = await sb.from("product_categories").select("id").eq("name", categoryName).limit(1).maybeSingle();
      categoryId = c.data?.id ?? null;
    }
    let productId: string | null = null;
    if (kind === "quote") {
      const p = await sb.from("products").select("id").eq("name", enquiry.product_text).is("deleted_at", null).limit(1).maybeSingle();
      productId = p.data?.id ?? null;
    }

    const { data, error } = await sb
      .from("enquiries")
      .insert({ ...enquiry, customer_id: customerId, category_id: categoryId, product_id: productId })
      .select("reference")
      .single();
    if (error) {
      console.error("[enquiries] insert failed", error.code, error.message);
      return null;
    }
    return data.reference as string;
  } catch (err) {
    console.error("[enquiries] save failed", err instanceof Error ? err.message : err);
    return null;
  }
}
