import type { Permission } from "@/lib/auth/permissions";
import type { ModuleKey } from "@/lib/modules";

/**
 * Record types that can carry restricted documents (HR and Finance). Mirrors restricted_doc_can() in the database,
 * which is the real gate (RLS on the index and policies on the storage bucket). Payroll documents are deliberately not supported.
 */
export const RESTRICTED_ENTITIES = {
  employee: { manage: "people.docs", module: "people", label: "employee" },
  contract: { manage: "people.docs", module: "people", label: "contract" },
  job_applicant: { manage: "people.docs", module: "people", label: "applicant" },
  invoice: { manage: "finance.docs", module: "finance", label: "invoice" },
  supplier_bill: { manage: "finance.docs", module: "finance", label: "supplier bill" },
  expense_claim: { manage: "finance.claims", module: "finance", label: "expense claim" },
} as const satisfies Record<string, { manage: Permission; module: ModuleKey; label: string }>;
export type RestrictedEntity = keyof typeof RESTRICTED_ENTITIES;
export const isRestrictedEntity = (v: string): v is RestrictedEntity => Object.prototype.hasOwnProperty.call(RESTRICTED_ENTITIES, v);
