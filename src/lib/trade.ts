/**
 * Trade documents: shared types and the type-specific fields. The catalogue of document types, their order and
 * permissions lives in the database (doc_types, doc_flow); this file only describes how to show and fill them.
 */
export const BRAND = { black: "#0B0C0E", blue: "#2E5E8E", blueLight: "#5B8DBE", gold: "#C9A227", goldLight: "#E3C766" } as const;

export type DocType = {
  key: string; name: string; module_group: string; chain: string; prefix: string; step_no: number; party: "supplier" | "customer" | "none";
  permission: string; approval_subject: string | null; has_lines: boolean; has_prices: boolean; description: string | null;
};
export type TradeDoc = {
  id: string; doc_type: string; number: string; status: string; title: string | null; reference: string | null;
  supplier_id: string | null; customer_id: string | null; parent_id: string | null; root_id: string | null; po_id: string | null; bill_id: string | null;
  warehouse_id: string | null; currency: string; doc_date: string; due_date: string | null; total: number; notes: string | null;
  data: Record<string, string>; approval_id: string | null; created_by: string | null; issued_at: string | null; completed_at: string | null;
  cancel_reason: string | null; created_at: string;
};
export type TradeLine = {
  id: string; doc_id: string; line_no: number; product_id: string | null; variant_id: string | null; po_item_id: string | null;
  description: string; quantity: number; accepted_qty: number | null; unit_id: string | null; unit_price: number; note: string | null;
};

export const STATUS_LABEL: Record<string, string> = {
  draft: "Draft", pending_approval: "Awaiting approval", approved: "Approved", rejected: "Rejected", issued: "Issued", completed: "Completed", cancelled: "Cancelled",
};
export const STATUS_TONE: Record<string, "grey" | "teal" | "amber" | "red" | "green" | "navy"> = {
  draft: "grey", pending_approval: "amber", approved: "teal", rejected: "red", issued: "navy", completed: "green", cancelled: "grey",
};
export const GROUP_LABEL: Record<string, string> = {
  procurement: "Procurement", sales: "Sales", warehouse: "Warehouse", logistics: "Logistics", finance: "Finance", quality: "Quality control", contracts: "Contracts",
};
export const CHAIN_LABEL: Record<string, string> = { purchasing: "Purchasing chain", sales: "Sales chain", returns: "Returns and adjustments", tenders: "Tenders" };

export type DataField = { key: string; label: string; kind?: "text" | "textarea" | "date" | "select"; options?: string[]; required?: boolean };
const METHODS = ["Bank transfer", "M-Pesa", "Cheque", "Cash"];
export const DATA_FIELDS: Record<string, DataField[]> = {
  purchase_requisition: [{ key: "department", label: "Requesting department" }, { key: "needed_by", label: "Needed by", kind: "date" }, { key: "reason", label: "Reason for the purchase", kind: "textarea" }],
  rfq: [{ key: "reply_by", label: "Reply by", kind: "date" }, { key: "delivery_terms", label: "Delivery requirements", kind: "textarea" }],
  supplier_quotation: [{ key: "valid_until", label: "Quotation valid until", kind: "date" }, { key: "payment_terms", label: "Payment terms" }, { key: "delivery_days", label: "Delivery time (days)" }],
  comparison_sheet: [{ key: "compared", label: "Quotations compared (supplier, price, terms)", kind: "textarea" }, { key: "chosen_supplier", label: "Chosen supplier" }, { key: "reason", label: "Reason for the choice", kind: "textarea" }],
  purchase_approval: [{ key: "justification", label: "Justification", kind: "textarea" }],
  purchase_order: [{ key: "payment_terms", label: "Payment terms" }, { key: "delivery_terms", label: "Delivery terms" }, { key: "delivery_address", label: "Deliver to", kind: "textarea" }],
  proforma_invoice: [{ key: "payment_terms", label: "Payment terms" }],
  payment_voucher: [{ key: "payee", label: "Payee" }, { key: "method", label: "Payment method", kind: "select", options: METHODS }, { key: "bank_details", label: "Bank / M-Pesa details", kind: "textarea" }, { key: "purpose", label: "Purpose" }],
  payment_confirmation: [{ key: "payment_reference", label: "Payment reference (bank or M-Pesa)", required: true }, { key: "method", label: "Payment method", kind: "select", options: METHODS }, { key: "paid_on", label: "Date paid", kind: "date" }],
  supplier_delivery_note: [{ key: "vehicle_reg", label: "Vehicle registration" }, { key: "driver_name", label: "Driver" }, { key: "received_by", label: "Received at gate by" }],
  grn: [{ key: "received_by", label: "Received by" }, { key: "condition_notes", label: "Condition of goods on arrival", kind: "textarea" }],
  inspection_report: [{ key: "result", label: "Overall result", kind: "select", options: ["pass", "partial", "fail"] }, { key: "inspector", label: "Inspector" }, { key: "findings", label: "Findings", kind: "textarea" }],
  supplier_tax_invoice: [{ key: "kra_pin", label: "Supplier KRA PIN" }],
};

export const money = (n: number | string, cur = "KES") => `${cur} ${Number(n).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const qtyFmt = (n: number | string) => { const v = Number(n); return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(3))); };
export const when = (v: string | null) => (v ? new Date(v).toLocaleString("en-KE", { timeZone: "Africa/Nairobi", dateStyle: "medium", timeStyle: "short" }) : "");
export const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

/** Read the numbered line inputs (l_desc_1 ...) of the document form into the JSON the database expects. */
export function readLines(fd: FormData, max = 60) {
  const out: Record<string, unknown>[] = [];
  const get = (k: string, n: number) => { const v = fd.get(`${k}_${n}`); return typeof v === "string" ? v.trim() : ""; };
  for (let i = 1; i <= max; i++) {
    const description = get("l_desc", i).slice(0, 300);
    if (!description) continue;
    out.push({
      description, quantity: get("l_qty", i) || "0", unit_price: get("l_price", i) || "0",
      variant_id: get("l_var", i) || null, product_id: get("l_prod", i) || null, po_item_id: get("l_po", i) || null,
      accepted_qty: get("l_acc", i) || null, unit_id: get("l_unit", i) || null, note: get("l_note", i).slice(0, 200) || null,
    });
  }
  return out;
}
