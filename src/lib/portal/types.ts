/** Shapes returned by the portal_* database functions (see supabase/migrations/20261120100000_customer_portal.sql). */
export type CatalogueRow = {
  product_id: string; slug: string; name: string; summary: string | null; description: string | null;
  category_id: string | null; category_name: string | null; packaging: string | null; unit: string | null;
  photo_path: string | null; fallback_image: string | null; image_alt: string | null;
  unit_price: number | null; list_price: number | null; special: boolean; currency: string;
  min_order_qty: number | null; qty_step: number | null; orderable: boolean; availability: string; total_count: number;
};
export type CartRow = {
  product_id: string; slug: string; name: string; packaging: string | null; unit: string | null; fallback_image: string | null; photo_path: string | null; image_alt: string | null;
  quantity: number; unit_price: number | null; line_total: number | null; currency: string; min_order_qty: number | null; qty_step: number | null; availability: string | null; issue: string | null;
};
export type OrderRow = {
  id: string; number: string; status: string; order_date: string; submitted_at: string | null; customer_reference: string | null; currency: string;
  item_count: number; total: number; delivery_address: string | null; total_count: number;
};
export type OrderDetail = {
  id: string; number: string; status: string; currency: string; order_date: string; submitted_at: string | null; delivery_address: string | null;
  customer_reference: string | null; customer_notes: string | null; requested_delivery_date: string | null; cancelled_reason: string | null; source: string; can_cancel: boolean; total: number;
  items: { line_no: number; product_id: string | null; description: string; quantity: number; unit: string | null; unit_price: number; line_total: number }[];
  events: { kind: string; title: string; detail: string | null; at: string }[];
};
export type CategoryRow = { id: string; slug: string; name: string; product_count: number };

// ---- phase 2 ----
export type Party = { company: string | null; contact: string | null; email: string | null; phone: string | null; location: string | null };
export type InvoiceRow = {
  id: string; number: string; status: string; issue_date: string | null; due_date: string | null; currency: string; subtotal: number; tax: number; total: number;
  paid: number; balance: number; overdue: boolean; order_number: string | null; total_count: number;
};
export type InvoiceDetail = {
  id: string; number: string; status: string; currency: string; issue_date: string | null; due_date: string | null; tax_rate: number; notes: string | null; customer: Party;
  overdue: boolean; order_id: string | null; order_number: string | null; subtotal: number; tax: number; total: number; paid: number; balance: number;
  items: { line_no: number; description: string; quantity: number; unit_price: number; line_total: number }[];
  payments: { paid_on: string; amount: number; method: string; reference: string | null }[];
};
export type PaymentRow = { paid_on: string; amount: number; method: string; reference: string | null; invoice_id: string; invoice_number: string; currency: string; total_count: number };
export type PayInfo = { mpesa_online: boolean; mpesa_kind: "paybill" | "till"; mpesa_number: string | null; bank_instructions: string | null; payment_note: string | null };
export type CompanyInfo = { legal_name: string | null; address: string | null; city: string | null; country: string | null; registration_details: string | null; tax_pin: string | null; quotation_terms: string | null; phone: string | null; email: string | null };
export type QuoteRow = { id: string; number: string; status: string; issue_date: string; valid_until: string | null; currency: string; total: number; total_count: number };
export type QuoteDetail = {
  id: string; number: string; status: string; currency: string; issue_date: string; valid_until: string | null; delivery_terms: string | null; payment_terms: string | null; notes: string | null;
  tax_rate: number; subtotal: number; tax: number; total: number; can_decide: boolean; decision: string | null; decision_at: string | null; decision_note: string | null; customer: Party;
  items: { line_no: number; description: string; quantity: number; unit: string | null; unit_price: number; line_total: number }[];
};
export type MpesaStatus = { id: string; status: string; amount: number; receipt: string | null; invoice_id: string; age: number; message: string | null };
