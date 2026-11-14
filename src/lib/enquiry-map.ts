import type { FormKind, FormValues } from "@/lib/validation";

/**
 * Pure mapping from a validated website form submission to database rows.
 * No I/O here so it can be unit tested. Only the fields the CRM needs are kept; the attachment
 * itself is never stored (only its name), and nothing is copied that the visitor did not submit.
 */
export type CustomerRow = { company_name: string | null; contact_name: string; email: string; phone: string | null };
export type EnquiryRow = {
  product_text: string;
  quantity_text: string | null;
  delivery_location: string | null;
  required_by: string | null;
  message: string | null;
  source: "website";
  attachment_name: string | null;
};

const orNull = (s: string | undefined) => (s && s.trim() !== "" ? s.trim() : null);

export function mapSubmission(kind: FormKind, v: FormValues, attachmentName: string | null): { customer: CustomerRow; enquiry: EnquiryRow; categoryName: string | null } {
  const customer: CustomerRow = {
    company_name: orNull(v.organisation),
    contact_name: v.contactName.trim().slice(0, 120),
    email: v.email.trim().toLowerCase(),
    phone: orNull(v.phone),
  };
  if (kind === "quote") {
    const detail = [v.specifications && `Specifications: ${v.specifications}`, v.instructions && `Instructions: ${v.instructions}`].filter(Boolean).join("\n\n");
    return {
      customer,
      categoryName: orNull(v.category),
      enquiry: {
        product_text: v.product.trim().slice(0, 2000),
        quantity_text: orNull(v.quantity),
        delivery_location: orNull(v.deliveryLocation),
        required_by: /^\d{4}-\d{2}-\d{2}$/.test(v.deliveryDate) ? v.deliveryDate : null,
        message: orNull(detail)?.slice(0, 4000) ?? null,
        source: "website",
        attachment_name: attachmentName,
      },
    };
  }
  return {
    customer,
    categoryName: null,
    enquiry: {
      product_text: "General enquiry",
      quantity_text: null,
      delivery_location: null,
      required_by: null,
      message: orNull(v.message)?.slice(0, 4000) ?? null,
      source: "website",
      attachment_name: null,
    },
  };
}
