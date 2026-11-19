/**
 * Finance resources (module `finance`): categories, the income/expense ledger and budgets.
 * Invoices, supplier bills and expense claims have their own screens because they move through approval and payment states.
 * Ledger rows created by the system (receipts, payments) are read-only in the database; corrections are new entries.
 */
import type { ResourceDef } from "./resources";

const opt = (values: string[]) => values.map((v) => ({ value: v, label: v.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) }));

export const FINANCE_RESOURCES: Record<string, ResourceDef> = {
  finance_categories: {
    key: "finance_categories", base: "/admin/finance", route: "categories", table: "finance_categories", label: "Categories", singular: "Category", pk: "id",
    description: "Income and expense categories used by the ledger, budgets and reports. A few starting categories exist; add the ones you need. Categories used by automatic postings (sales, payroll and so on) cannot be removed.",
    permission: "finance.manage", viewPermission: "finance.manage", module: "finance", publicSite: false, orderBy: "name", activeColumn: "is_active", noDelete: true, newLabel: "Add category",
    columns: [{ key: "name", label: "Category" }, { key: "kind", label: "Type", badge: { income: "green", expense: "amber" } }],
    fields: [
      { type: "text", name: "name", label: "Category name", required: true, max: 80 },
      { type: "select", name: "kind", label: "Type", required: true, default: "expense", options: opt(["income", "expense"]) },
      { type: "checkbox", name: "is_active", label: "Available for new entries", default: true },
    ],
  },

  finance_transactions: {
    key: "finance_transactions", base: "/admin/finance", route: "ledger", table: "finance_transactions", label: "Ledger", singular: "Ledger entry", pk: "id",
    description: "Money in and money out. Receipts, supplier payments, reimbursements and payroll are posted here automatically when a person records them and cannot be edited: add a correcting entry instead. Add other income and expenses by hand.",
    permission: "finance.manage", viewPermission: "finance.view", module: "finance", publicSite: false, orderBy: "txn_date", newLabel: "Add entry", filterStatus: false,
    columns: [{ key: "txn_date", label: "Date" }, { key: "kind", label: "Type", badge: { income: "green", expense: "amber" } }, { key: "category_id", label: "Category", lookup: { table: "finance_categories", labelCol: "name" } }, { key: "amount", label: "Amount" }, { key: "currency", label: "Cur." }, { key: "description", label: "Description" }, { key: "source", label: "Source" }],
    fields: [
      { type: "date", name: "txn_date", label: "Date", required: true },
      { type: "select", name: "kind", label: "Money in or out", required: true, default: "expense", options: [{ value: "income", label: "Income (money in)" }, { value: "expense", label: "Expense (money out)" }] },
      { type: "relation", name: "category_id", label: "Category", required: true, table: "finance_categories", labelCol: "name", orderBy: "name", filter: ["is_active", true], help: "Must match the type above." },
      { type: "number", name: "amount", label: "Amount", required: true, min: 0.01, max: 1000000000, decimal: true },
      { type: "text", name: "currency", label: "Currency", required: true, max: 3, placeholder: "KES", pattern: /^[A-Z]{3}$/, patternMessage: "Use a 3-letter code such as KES." },
      { type: "text", name: "description", label: "What it was for", required: true, max: 300 },
      { type: "text", name: "counterparty", label: "From / paid to", max: 160 },
      { type: "text", name: "reference", label: "Reference", max: 120 },
    ],
  },

  budgets: {
    key: "budgets", base: "/admin/finance", route: "budgets", table: "budgets", label: "Budgets", singular: "Budget", pk: "id",
    description: "A budget for one category over a period. Actual figures come from the ledger, so they are always in step with the books. See the comparison on the Finance overview.",
    permission: "finance.manage", viewPermission: "finance.view", module: "finance", publicSite: false, createdBy: "created_by", orderBy: "period_start", noDelete: true, newLabel: "Add budget",
    columns: [{ key: "name", label: "Budget" }, { key: "category_id", label: "Category", lookup: { table: "finance_categories", labelCol: "name" } }, { key: "period_start", label: "From" }, { key: "period_end", label: "To" }, { key: "amount", label: "Amount" }, { key: "currency", label: "Cur." }],
    fields: [
      { type: "text", name: "name", label: "Budget name", required: true, max: 120, placeholder: "e.g. Fuel, 2027" },
      { type: "relation", name: "category_id", label: "Category", required: true, table: "finance_categories", labelCol: "name", orderBy: "name" },
      { type: "date", name: "period_start", label: "Period start", required: true },
      { type: "date", name: "period_end", label: "Period end", required: true },
      { type: "number", name: "amount", label: "Budgeted amount", required: true, min: 0, max: 1000000000, decimal: true },
      { type: "text", name: "currency", label: "Currency", required: true, max: 3, placeholder: "KES", pattern: /^[A-Z]{3}$/, patternMessage: "Use a 3-letter code such as KES." },
      { type: "textarea", name: "notes", label: "Notes", max: 1000, rows: 2 },
    ],
  },
};
