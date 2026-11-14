import type { Permission } from "@/lib/auth/permissions";
import type { ModuleKey } from "@/lib/modules";

/** Which permission/module governs documents attached to each kind of record (mirrors the record_documents RLS). */
export const DOC_ENTITIES = {
  supplier: { view: "suppliers.view", manage: "suppliers.manage", module: "suppliers", label: "supplier" },
  supplier_quote: { view: "purchasing.view", manage: "purchasing.manage", module: "procurement", label: "supplier quote" },
  purchase_order: { view: "purchasing.view", manage: "purchasing.manage", module: "procurement", label: "purchase order" },
  tender: { view: "tenders.view", manage: "tenders.manage", module: "tenders", label: "tender" },
  delivery: { view: "orders.view", manage: "orders.manage", module: "orders", label: "delivery" },
  quotation: { view: "quotations.view", manage: "quotations.manage", module: "quotations", label: "quotation" },
} as const satisfies Record<string, { view: Permission; manage: Permission; module: ModuleKey; label: string }>;
export type DocEntity = keyof typeof DOC_ENTITIES;
export const isDocEntity = (v: string): v is DocEntity => Object.prototype.hasOwnProperty.call(DOC_ENTITIES, v);
