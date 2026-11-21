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
