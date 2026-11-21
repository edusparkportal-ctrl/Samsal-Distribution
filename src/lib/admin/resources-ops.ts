/**
 * Business-module resources (suppliers, procurement, inventory, orders, tenders).
 * Same engine as the website resources; see resources.ts. Table and column names live here, on the
 * server, so a browser can never choose what is written. Row Level Security and database triggers
 * remain the real enforcement (e.g. purchase-order approval rules); the forms only make them usable.
 */
import type { ResourceDef } from "./resources";

const opt = (values: string[]) => values.map((v) => ({ value: v, label: v.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) }));
const STATUS_TONE = { draft: "grey", pending_approval: "amber", approved: "teal", sent: "teal", partially_received: "amber", received: "green", cancelled: "red", confirmed: "teal", processing: "amber", partially_delivered: "amber", delivered: "green", invoiced: "green", scheduled: "grey", in_transit: "amber", failed: "red" } as const;
const HR_REQUEST_TONE = { open: "amber", sourcing: "amber", shortlisted: "teal", filled: "green", on_hold: "grey", closed: "grey", cancelled: "red" } as const;
const HR_CANDIDATE_TONE = { new: "grey", screened: "amber", shortlisted: "teal", placed: "green", not_suitable: "red", withdrawn: "grey" } as const;
const HR_PLACEMENT_TONE = { proposed: "grey", interview: "amber", offered: "teal", active: "green", ended: "grey", declined: "red" } as const;
const CURRENCY = { type: "text", name: "currency", label: "Currency", max: 3, pattern: /^[A-Z]{3}$/, patternMessage: "Use a 3-letter code such as KES." } as const;

export const OPS_RESOURCES: Record<string, ResourceDef> = {
  suppliers: {
    key: "suppliers", documentType: "supplier", base: "/admin", route: "suppliers", table: "suppliers", label: "Suppliers", singular: "Supplier", pk: "id",
    description: "Companies you buy from. Record only what you have been given; nothing here appears on the website.",
    permission: "suppliers.manage", viewPermission: "suppliers.view", module: "suppliers", publicSite: false, createdBy: "created_by",
    softDelete: "deleted_at", activeColumn: "is_active", orderBy: "name", newLabel: "Add supplier",
    columns: [{ key: "name", label: "Name" }, { key: "contact_name", label: "Contact" }, { key: "phone", label: "Phone" }, { key: "location", label: "Location" }],
    fields: [
      { type: "text", name: "name", label: "Supplier name", required: true, max: 160 },
      { type: "text", name: "contact_name", label: "Contact person", max: 120 },
      { type: "email", name: "email", label: "Email" },
      { type: "text", name: "phone", label: "Telephone", max: 40 },
      { type: "text", name: "location", label: "Location", max: 120 },
      { type: "textarea", name: "address", label: "Address", max: 300, rows: 2 },
      { type: "textarea", name: "registration_info", label: "Registration details (as supplied by them)", max: 400, rows: 2, help: "Only enter details the supplier has actually provided." },
      { type: "textarea", name: "notes", label: "Internal notes", max: 2000, rows: 3 },
      { type: "checkbox", name: "is_active", label: "Active supplier", default: true },
    ],
    links: [{ name: "categories", label: "Categories supplied", table: "supplier_categories", fk: "supplier_id", other: "category_id", optionsTable: "product_categories", optionLabel: "name", noSort: true }],
  },

  supplier_quotes: {
    key: "supplier_quotes", documentType: "supplier_quote", base: "/admin/procurement", route: "supplier-quotes", table: "supplier_quotes", label: "Supplier quotes", singular: "Supplier quote", pk: "id",
    description: "Prices suppliers have quoted you, so you can compare before quoting a customer or raising a purchase order.",
    permission: "purchasing.manage", viewPermission: "purchasing.view", module: "procurement", publicSite: false, createdBy: "created_by",
    softDelete: "deleted_at", orderBy: "created_at", newLabel: "Record supplier quote",
    columns: [{ key: "product_text", label: "Item" }, { key: "supplier_id", label: "Supplier", lookup: { table: "suppliers", labelCol: "name" } }, { key: "unit_price", label: "Unit price" }, { key: "valid_until", label: "Valid until" }],
    fields: [
      { type: "relation", name: "supplier_id", label: "Supplier", table: "suppliers", labelCol: "name", required: true },
      { type: "text", name: "product_text", label: "Item or specification", required: true, max: 300 },
      { type: "relation", name: "enquiry_id", label: "For enquiry (optional)", table: "enquiries", labelCol: "reference", orderBy: "created_at" },
      { type: "number", name: "unit_price", label: "Unit price", required: true, decimal: true, min: 0 },
      { type: "number", name: "quantity", label: "Quantity quoted for", decimal: true, min: 0 },
      { type: "number", name: "additional_costs", label: "Additional costs (transport, handling…)", decimal: true, min: 0, default: 0 },
      { type: "text", name: "additional_costs_note", label: "What the additional costs are", max: 200 },
      CURRENCY,
      { type: "date", name: "valid_until", label: "Quote valid until" },
      { type: "textarea", name: "notes", label: "Notes", max: 1000, rows: 3 },
    ],
  },

  purchase_orders: {
    key: "purchase_orders", documentType: "purchase_order", base: "/admin/procurement", route: "purchase-orders", table: "purchase_orders", label: "Purchase orders", singular: "Purchase order", pk: "id",
    description: "Orders placed with suppliers. Approval needs the “approve purchase orders” permission and cannot be given by the person who created the order.",
    permission: "purchasing.manage", viewPermission: "purchasing.view", module: "procurement", publicSite: false, createdBy: "created_by",
    softDelete: "deleted_at", orderBy: "created_at", newLabel: "Create purchase order", filterStatus: true,
    statusOptions: opt(["draft", "pending_approval", "approved", "sent", "partially_received", "received", "cancelled"]),
    columns: [{ key: "number", label: "Number" }, { key: "supplier_id", label: "Supplier", lookup: { table: "suppliers", labelCol: "name" } }, { key: "status", label: "Status", badge: STATUS_TONE }, { key: "expected_date", label: "Expected" }],
    fields: [
      { type: "relation", name: "supplier_id", label: "Supplier", table: "suppliers", labelCol: "name", required: true },
      { type: "relation", name: "supplier_quote_id", label: "Based on supplier quote (optional)", table: "supplier_quotes", labelCol: "product_text", orderBy: "created_at" },
      { type: "select", name: "status", label: "Status", required: true, default: "draft", options: opt(["draft", "pending_approval", "approved", "sent", "partially_received", "received", "cancelled"]), help: "Moving to Approved or beyond records who approved it and when. The database refuses it if you are not allowed to." },
      CURRENCY,
      { type: "date", name: "order_date", label: "Order date" },
      { type: "date", name: "expected_date", label: "Expected delivery" },
      { type: "textarea", name: "notes", label: "Notes", max: 1000, rows: 3 },
    ],
    children: [{ name: "items", label: "Order lines", table: "purchase_order_items", fk: "po_id", mode: "items", help: "One per line: description | quantity | unit price. Example: A4 paper, 80gsm | 50 | 620" }],
  },

  warehouses: {
    key: "warehouses", base: "/admin/inventory", route: "warehouses", table: "warehouses", label: "Warehouses", singular: "Warehouse", pk: "id",
    description: "Places where stock is held. Nothing is assumed: add a warehouse only when you have one.",
    permission: "inventory.manage", viewPermission: "inventory.view", module: "inventory", publicSite: false, noDelete: true,
    activeColumn: "is_active", orderBy: "name", newLabel: "Add warehouse",
    columns: [{ key: "name", label: "Name" }, { key: "address", label: "Address" }],
    fields: [
      { type: "text", name: "name", label: "Warehouse name", required: true, max: 120 },
      { type: "textarea", name: "address", label: "Address", max: 300, rows: 2 },
      { type: "checkbox", name: "is_active", label: "In use", default: true },
    ],
  },

  variants: {
    key: "variants", base: "/admin/inventory", route: "variants", table: "product_variants", label: "Stock items", singular: "Stock item", pk: "id",
    description: "The sellable/stockable versions of a product (for example a pack size) with an optional reorder level. Stock is counted per stock item.",
    permission: "inventory.manage", viewPermission: "inventory.view", module: "inventory", publicSite: false, noDelete: true,
    activeColumn: "is_active", orderBy: "name", newLabel: "Add stock item",
    columns: [{ key: "name", label: "Name" }, { key: "sku", label: "SKU" }, { key: "product_id", label: "Product", lookup: { table: "products", labelCol: "name" } }, { key: "reorder_level", label: "Reorder at" }],
    fields: [
      { type: "relation", name: "product_id", label: "Product", table: "products", labelCol: "name", required: true },
      { type: "text", name: "name", label: "Stock item name", required: true, max: 160, help: "For example “5 litre jerrycan”." },
      { type: "text", name: "sku", label: "SKU / code (optional)", max: 60 },
      { type: "relation", name: "unit_id", label: "Unit", table: "units", labelCol: "name" },
      { type: "number", name: "reorder_level", label: "Reorder level (optional)", decimal: true, min: 0, help: "Stock at or below this is flagged on the balances page." },
      { type: "checkbox", name: "is_active", label: "Active", default: true },
    ],
  },

  stock_movements: {
    key: "stock_movements", base: "/admin/inventory", route: "movements", table: "stock_movements", label: "Stock movements", singular: "Stock movement", pk: "id",
    description: "Every receipt, issue and adjustment. Movements cannot be edited or deleted; correct a mistake by recording an adjustment. Balances are calculated from these records.",
    permission: "inventory.manage", viewPermission: "inventory.view", module: "inventory", publicSite: false, createdBy: "created_by", createOnly: true,
    orderBy: "created_at", newLabel: "Record movement",
    columns: [{ key: "created_at", label: "When" }, { key: "movement_type", label: "Type" }, { key: "quantity", label: "Quantity" }, { key: "variant_id", label: "Stock item", lookup: { table: "product_variants", labelCol: "name" } }, { key: "warehouse_id", label: "Warehouse", lookup: { table: "warehouses", labelCol: "name" } }],
    fields: [
      { type: "relation", name: "variant_id", label: "Stock item", table: "product_variants", labelCol: "name", required: true },
      { type: "relation", name: "warehouse_id", label: "Warehouse", table: "warehouses", labelCol: "name", required: true },
      { type: "select", name: "movement_type", label: "Movement", required: true, options: [
        { value: "receipt", label: "Receipt (stock in)" }, { value: "issue", label: "Issue (stock out)" }, { value: "return", label: "Customer return (stock in)" },
        { value: "transfer_in", label: "Transfer in" }, { value: "transfer_out", label: "Transfer out" }, { value: "adjustment", label: "Adjustment (use + or −)" } ] },
      { type: "number", name: "quantity", label: "Quantity", required: true, decimal: true, help: "Enter a positive number; issues and transfers out are recorded as negative automatically. Adjustments keep the sign you type (e.g. -3)." },
      { type: "text", name: "note", label: "Reason / note", max: 300, help: "Required for adjustments." },
    ],
    beforeSave(v) {
      const t = String(v.movement_type), q = Number(v.quantity);
      if (!q) throw new Error("Quantity cannot be zero.");
      if (t === "adjustment" && !String(v.note ?? "").trim()) throw new Error("Please give a reason for the adjustment.");
      if (t === "issue" || t === "transfer_out") v.quantity = -Math.abs(q);
      else if (t !== "adjustment") v.quantity = Math.abs(q);
      v.reference_type = "manual";
    },
  },

  sales_orders: {
    key: "sales_orders", base: "/admin/orders", route: "sales-orders", table: "sales_orders", label: "Sales orders", singular: "Sales order", pk: "id",
    description: "Confirmed customer orders. Create one when a quotation is accepted or an order arrives directly.",
    permission: "orders.manage", viewPermission: "orders.view", module: "orders", publicSite: false, createdBy: "created_by",
    softDelete: "deleted_at", orderBy: "created_at", newLabel: "Create sales order", filterStatus: true,
    statusOptions: opt(["draft", "submitted", "confirmed", "processing", "partially_delivered", "delivered", "invoiced", "cancelled"]),
    columns: [{ key: "number", label: "Number" }, { key: "customer_id", label: "Customer", lookup: { table: "customers", labelCol: "contact_name" } }, { key: "status", label: "Status", badge: STATUS_TONE }, { key: "order_date", label: "Ordered" }],
    fields: [
      { type: "relation", name: "customer_id", label: "Customer", table: "customers", labelCol: "contact_name", required: true },
      { type: "relation", name: "quotation_id", label: "From quotation (optional)", table: "quotations", labelCol: "number", orderBy: "created_at" },
      { type: "select", name: "status", label: "Status", required: true, default: "draft", options: opt(["draft", "submitted", "confirmed", "processing", "partially_delivered", "delivered", "invoiced", "cancelled"]), help: "\"Submitted\" = placed by a customer in the portal and waiting for you to confirm it." },
      CURRENCY,
      { type: "date", name: "order_date", label: "Order date", required: true },
      { type: "textarea", name: "delivery_address", label: "Delivery address", max: 400, rows: 2 },
      { type: "textarea", name: "notes", label: "Internal notes", max: 1000, rows: 3, help: "Not shown to the customer." },
      { type: "text", name: "customer_reference", label: "Customer PO / reference", max: 60 },
      { type: "textarea", name: "customer_notes", label: "Customer's notes (from the portal)", max: 1000, rows: 2 },
      { type: "date", name: "requested_delivery_date", label: "Customer's preferred delivery date" },
    ],
    children: [{ name: "items", label: "Order lines", table: "sales_order_items", fk: "order_id", mode: "items", help: "One per line: description | quantity | unit price." }],
  },

  deliveries: {
    key: "deliveries", documentType: "delivery", base: "/admin/orders", route: "deliveries", table: "deliveries", label: "Deliveries", singular: "Delivery", pk: "id",
    description: "Delivery notes for sales orders: when, who and what vehicle, and who received the goods.",
    permission: "orders.manage", viewPermission: "orders.view", module: "orders", publicSite: false, createdBy: "created_by", noDelete: true,
    orderBy: "created_at", newLabel: "Schedule delivery", filterStatus: true,
    statusOptions: opt(["scheduled", "in_transit", "delivered", "failed", "cancelled"]),
    columns: [{ key: "number", label: "Number" }, { key: "sales_order_id", label: "Order", lookup: { table: "sales_orders", labelCol: "number" } }, { key: "status", label: "Status", badge: STATUS_TONE }, { key: "scheduled_date", label: "Scheduled" }],
    fields: [
      { type: "relation", name: "sales_order_id", label: "Sales order", table: "sales_orders", labelCol: "number", orderBy: "created_at", required: true },
      { type: "select", name: "status", label: "Status", required: true, default: "scheduled", options: opt(["scheduled", "in_transit", "delivered", "failed", "cancelled"]) },
      { type: "date", name: "scheduled_date", label: "Scheduled date" },
      { type: "datetime", name: "delivered_at", label: "Delivered at (Nairobi time)" },
      { type: "text", name: "driver_name", label: "Driver", max: 120 },
      { type: "text", name: "vehicle_reg", label: "Vehicle registration", max: 20 },
      { type: "text", name: "recipient_name", label: "Received by", max: 120 },
      { type: "textarea", name: "notes", label: "Notes", max: 1000, rows: 3 },
    ],
  },

  tenders: {
    key: "tenders", documentType: "tender", base: "/admin", route: "tenders", table: "tenders", label: "Tenders", singular: "Tender", pk: "id",
    description: "Track tender opportunities, deadlines, eligibility requirements and outcomes. Record only real tenders; nothing is shown publicly.",
    permission: "tenders.manage", viewPermission: "tenders.view", module: "tenders", publicSite: false,
    softDelete: "deleted_at", orderBy: "submission_deadline", newLabel: "Add tender",
    columns: [{ key: "reference", label: "Reference" }, { key: "procuring_entity", label: "Procuring entity" }, { key: "submission_deadline", label: "Deadline" }, { key: "bid_status", label: "Bid", badge: { monitoring: "grey", preparing: "amber", ready: "teal", abandoned: "red" } }, { key: "award_outcome", label: "Outcome", badge: { won: "green", lost: "red", pending: "grey", cancelled: "red", not_applicable: "grey" } }],
    fields: [
      { type: "text", name: "reference", label: "Tender reference", required: true, max: 80 },
      { type: "text", name: "procuring_entity", label: "Procuring entity", required: true, max: 200 },
      { type: "text", name: "title", label: "Title", required: true, max: 300 },
      { type: "datetime", name: "submission_deadline", label: "Submission deadline (Nairobi time)" },
      { type: "textarea", name: "eligibility_requirements", label: "Eligibility requirements", max: 3000, rows: 4, help: "As stated in the tender document." },
      { type: "number", name: "estimated_cost", label: "Estimated value", decimal: true, min: 0 },
      CURRENCY,
      { type: "select", name: "bid_status", label: "Bid status", required: true, default: "monitoring", options: opt(["monitoring", "preparing", "ready", "abandoned"]) },
      { type: "select", name: "submission_status", label: "Submission", required: true, default: "not_submitted", options: opt(["not_submitted", "submitted", "late", "withdrawn"]) },
      { type: "select", name: "award_outcome", label: "Award outcome", required: true, default: "pending", options: opt(["pending", "won", "lost", "cancelled", "not_applicable"]) },
      { type: "relation", name: "owner_id", label: "Responsible person", table: "profiles", labelCol: "full_name" },
      { type: "textarea", name: "internal_notes", label: "Internal notes", max: 3000, rows: 4 },
    ],
    links: [{ name: "categories", label: "Product categories involved", table: "tender_categories", fk: "tender_id", other: "category_id", optionsTable: "product_categories", optionLabel: "name", noSort: true }],
  },

  // ---- HR Outsourcing (module `hr`, ships disabled). Internal records only; nothing here is public. ----
  hr_requisitions: {
    key: "hr_requisitions", base: "/admin/hr", route: "requisitions", table: "hr_requisitions", label: "Staffing requests", singular: "Staffing request", pk: "id",
    description: "Requests from clients for staff. Record what the client actually asked for.",
    permission: "hr.manage", viewPermission: "hr.view", module: "hr", publicSite: false, createdBy: "created_by",
    softDelete: "deleted_at", orderBy: "created_at", newLabel: "Add staffing request", filterStatus: true,
    statusOptions: opt(["open", "sourcing", "shortlisted", "filled", "on_hold", "closed", "cancelled"]),
    columns: [{ key: "reference", label: "Reference" }, { key: "client_name", label: "Client" }, { key: "title", label: "Role" }, { key: "headcount", label: "Staff needed" }, { key: "status", label: "Status", badge: HR_REQUEST_TONE }],
    fields: [
      { type: "text", name: "client_name", label: "Client organisation", required: true, max: 200 },
      { type: "relation", name: "customer_id", label: "Linked customer (optional)", table: "customers", labelCol: "contact_name", filter: ["deleted_at", null], help: "Link to a customer you already have in Customers." },
      { type: "text", name: "title", label: "Role requested", required: true, max: 200 },
      { type: "textarea", name: "description", label: "Requirements", max: 3000, rows: 4, help: "Duties, experience, working pattern, as stated by the client." },
      { type: "number", name: "headcount", label: "Number of staff needed", required: true, min: 1, max: 10000, default: 1 },
      { type: "text", name: "location", label: "Work location", max: 120 },
      { type: "date", name: "desired_start", label: "Desired start date" },
      { type: "select", name: "arrangement", label: "Arrangement", required: true, default: "placement", options: [{ value: "placement", label: "Placement (we introduce, the client employs)" }, { value: "managed_staffing", label: "Managed staffing (we employ)" }], help: "Managed staffing means SAMSAL becomes the employer. Confirm the legal and payroll set-up before offering it." },
      { type: "select", name: "status", label: "Status", required: true, default: "open", options: opt(["open", "sourcing", "shortlisted", "filled", "on_hold", "closed", "cancelled"]) },
      { type: "relation", name: "owner_id", label: "Responsible person", table: "profiles", labelCol: "full_name" },
      { type: "textarea", name: "internal_notes", label: "Internal notes", max: 3000, rows: 3 },
    ],
  },

  hr_candidates: {
    key: "hr_candidates", base: "/admin/hr", route: "candidates", table: "hr_candidates", label: "Candidates", singular: "Candidate", pk: "id",
    description: "People available for placement. Keep personal data to a minimum: do not record ID numbers, KRA PINs, bank details, dates of birth or health information here.",
    permission: "hr.manage", viewPermission: "hr.view", module: "hr", publicSite: false, createdBy: "created_by",
    softDelete: "deleted_at", orderBy: "created_at", newLabel: "Add candidate", filterStatus: true,
    statusOptions: opt(["new", "screened", "shortlisted", "placed", "not_suitable", "withdrawn"]),
    columns: [{ key: "full_name", label: "Name" }, { key: "location", label: "Location" }, { key: "availability", label: "Availability" }, { key: "status", label: "Status", badge: HR_CANDIDATE_TONE }, { key: "consent_recorded", label: "Consent recorded" }],
    fields: [
      { type: "text", name: "full_name", label: "Full name", required: true, max: 160 },
      { type: "text", name: "phone", label: "Telephone", max: 40 },
      { type: "email", name: "email", label: "Email" },
      { type: "text", name: "location", label: "Location", max: 120 },
      { type: "textarea", name: "skills", label: "Skills and experience (summary)", max: 2000, rows: 4 },
      { type: "text", name: "availability", label: "Availability", max: 200 },
      { type: "text", name: "source", label: "How we found them", max: 200 },
      { type: "select", name: "status", label: "Status", required: true, default: "new", options: opt(["new", "screened", "shortlisted", "placed", "not_suitable", "withdrawn"]) },
      { type: "checkbox", name: "consent_recorded", label: "The candidate has agreed to us holding their details", default: false, help: "Tick only once you have their agreement, then enter the date below." },
      { type: "date", name: "consent_date", label: "Date consent was given", help: "Required when consent is ticked." },
      { type: "date", name: "retention_review_date", label: "Review or delete by", help: "Do not keep candidate details longer than needed." },
      { type: "textarea", name: "notes", label: "Internal notes", max: 3000, rows: 3 },
    ],
    beforeSave(values) {
      if (values.consent_recorded && !values.consent_date) throw new Error("Enter the date consent was given.");
    },
  },

  hr_placements: {
    key: "hr_placements", base: "/admin/hr", route: "placements", table: "hr_placements", label: "Placements", singular: "Placement", pk: "id",
    description: "A candidate put forward for a staffing request, and how it progressed.",
    permission: "hr.manage", viewPermission: "hr.view", module: "hr", publicSite: false, createdBy: "created_by",
    softDelete: "deleted_at", orderBy: "created_at", newLabel: "Record placement", filterStatus: true,
    statusOptions: opt(["proposed", "interview", "offered", "active", "ended", "declined"]),
    columns: [{ key: "requisition_id", label: "Request", lookup: { table: "hr_requisitions", labelCol: "reference" } }, { key: "candidate_id", label: "Candidate", lookup: { table: "hr_candidates", labelCol: "full_name" } }, { key: "status", label: "Status", badge: HR_PLACEMENT_TONE }, { key: "start_date", label: "Start" }],
    fields: [
      { type: "relation", name: "requisition_id", label: "Staffing request", table: "hr_requisitions", labelCol: "reference", orderBy: "created_at", filter: ["deleted_at", null], required: true },
      { type: "relation", name: "candidate_id", label: "Candidate", table: "hr_candidates", labelCol: "full_name", filter: ["deleted_at", null], required: true },
      { type: "select", name: "status", label: "Status", required: true, default: "proposed", options: opt(["proposed", "interview", "offered", "active", "ended", "declined"]) },
      { type: "date", name: "start_date", label: "Start date" },
      { type: "date", name: "end_date", label: "End date" },
      { type: "text", name: "fee_note", label: "Agreed fee or terms (note)", max: 500, help: "A short note of what was agreed with the client." },
      { type: "textarea", name: "notes", label: "Notes", max: 3000, rows: 3 },
    ],
  },

  // ---- Customer portal (module `portal`, ships disabled) ----
  portal_prices: {
    key: "portal_prices", base: "/admin/portal", route: "prices", table: "product_prices", label: "List prices", singular: "List price", pk: "product_id",
    description: "The standard price, minimum order and pack step for each product that customers may order online. A product without a price shows \"Price on request\" and a quotation button.",
    permission: "portal.pricing", viewPermission: "portal.view", module: "portal", publicSite: false, createdBy: "updated_by", orderBy: "updated_at", newLabel: "Set a price",
    columns: [{ key: "product_id", label: "Product", lookup: { table: "products", labelCol: "name" } }, { key: "unit_price", label: "Price (KES)" }, { key: "min_order_qty", label: "Minimum" }, { key: "qty_step", label: "Step" }, { key: "is_orderable", label: "Orderable" }],
    fields: [
      { type: "relation", name: "product_id", label: "Product", table: "products", labelCol: "name", orderBy: "name", filter: ["deleted_at", null], required: true },
      { type: "number", name: "unit_price", label: "Price per unit (KES, excluding VAT)", decimal: true, min: 0, required: true },
      { type: "number", name: "min_order_qty", label: "Minimum order quantity", decimal: true, min: 0.001, default: 1, required: true },
      { type: "number", name: "qty_step", label: "Order in multiples of", decimal: true, min: 0.001, default: 1, required: true, help: "For example 10 if a product is sold in cartons of 10." },
      { type: "checkbox", name: "is_orderable", label: "Customers can order this online", default: true },
    ],
  },
  portal_customer_prices: {
    key: "portal_customer_prices", base: "/admin/portal", route: "customer-prices", table: "customer_prices", label: "Customer prices", singular: "Customer price", pk: "id",
    description: "A special price for one customer: either a fixed price or a percentage off the list price, optionally between two dates. Only that customer sees it.",
    permission: "portal.pricing", viewPermission: "portal.view", module: "portal", publicSite: false, createdBy: "created_by", orderBy: "created_at", newLabel: "Add customer price",
    columns: [{ key: "customer_id", label: "Customer", lookup: { table: "customers", labelCol: "contact_name" } }, { key: "product_id", label: "Product", lookup: { table: "products", labelCol: "name" } }, { key: "unit_price", label: "Fixed price" }, { key: "discount_percent", label: "Discount %" }, { key: "valid_to", label: "Until" }],
    fields: [
      { type: "relation", name: "customer_id", label: "Customer", table: "customers", labelCol: "contact_name", filter: ["deleted_at", null], required: true },
      { type: "relation", name: "product_id", label: "Product", table: "products", labelCol: "name", orderBy: "name", filter: ["deleted_at", null], required: true },
      { type: "number", name: "unit_price", label: "Fixed price per unit (KES)", decimal: true, min: 0, help: "Fill in this OR the discount, not both." },
      { type: "number", name: "discount_percent", label: "Discount off the list price (%)", decimal: true, min: 0, max: 100 },
      { type: "date", name: "valid_from", label: "Valid from" },
      { type: "date", name: "valid_to", label: "Valid until" },
      { type: "text", name: "note", label: "Note", max: 300 },
    ],
  },
  portal_order_updates: {
    key: "portal_order_updates", base: "/admin/portal", route: "updates", table: "order_events", label: "Tracking updates", singular: "Tracking update", pk: "id",
    description: "What customers see on an order's tracking timeline. Status changes and deliveries are added automatically; post extra updates here (for example \"Packed and ready\"). Never put driver phone numbers or internal remarks in a visible update.",
    permission: "portal.manage", viewPermission: "portal.view", module: "portal", publicSite: false, createdBy: "created_by", createOnly: true, orderBy: "created_at", newLabel: "Post an update",
    columns: [{ key: "order_id", label: "Order", lookup: { table: "sales_orders", labelCol: "number" } }, { key: "title", label: "Update" }, { key: "customer_visible", label: "Customer sees it" }, { key: "created_at", label: "When" }],
    fields: [
      { type: "relation", name: "order_id", label: "Sales order", table: "sales_orders", labelCol: "number", orderBy: "created_at", filter: ["deleted_at", null], required: true },
      { type: "text", name: "title", label: "Update (short)", required: true, max: 120, placeholder: "e.g. Packed and ready for dispatch" },
      { type: "textarea", name: "detail", label: "More detail", max: 500, rows: 2 },
      { type: "checkbox", name: "customer_visible", label: "Show this to the customer", default: true },
    ],
  },
};
