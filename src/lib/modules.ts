/**
 * MODULE REGISTRY
 * ---------------
 * The single place where admin modules are declared. The sidebar, route guards and the dashboard are
 * all generated from this list, so adding a module never means editing the shell.
 *
 * A module appears in the admin area only when BOTH are true:
 *   1. its row in the database table `modules` is enabled (Super Administrator toggles this), and
 *   2. the signed-in user holds the permission of at least one of its items.
 * The database enforces the same two conditions with RLS (see can() in migration 0005), so hiding a
 * menu item is a convenience, never the security boundary.
 *
 * To add a module, see docs/MODULES.md. In short: migration (tables + RLS + permissions + modules
 * row) -> an entry below -> pages under src/app/admin/<module>/.
 */
import type { Permission } from "@/lib/auth/permissions";

export type ModuleKey =
  | "website" | "crm" | "quotations" | "suppliers" | "procurement"
  | "inventory" | "orders" | "portal" | "trade" | "tenders" | "hr" | "people" | "finance" | "approvals" | "automation" | "reports" | "audit";

export type NavIcon =
  | "globe" | "building" | "users" | "share" | "home" | "package" | "tag" | "wrench" | "factory" | "image" | "search" | "megaphone" | "file"
  | "inbox" | "contact" | "filetext" | "truck" | "clipboard" | "warehouse" | "arrows" | "cart" | "gavel" | "chart" | "shield" | "settings" | "key" | "layers" | "zap" | "wallet" | "userplus" | "clipboardcheck";

export type AdminNavItem = { label: string; href: string; permission: Permission };
export type AdminModuleDef = {
  key: ModuleKey;
  label: string;
  icon: NavIcon;
  items: AdminNavItem[];
};

export const ADMIN_MODULES: AdminModuleDef[] = [
  {
    key: "website",
    label: "Website",
    icon: "globe",
    items: [
      { label: "Company", href: "/admin/website/company", permission: "content.manage" },
      { label: "Homepage", href: "/admin/website/homepage", permission: "content.manage" },
      { label: "Management team", href: "/admin/website/staff", permission: "content.manage" },
      { label: "Contact details", href: "/admin/website/contacts", permission: "content.manage" },
      { label: "Social media", href: "/admin/website/social", permission: "content.manage" },
      { label: "Announcements", href: "/admin/website/announcements", permission: "content.manage" },
      { label: "Products", href: "/admin/website/products", permission: "products.manage" },
      { label: "Categories", href: "/admin/website/categories", permission: "products.manage" },
      { label: "Services", href: "/admin/website/services", permission: "content.manage" },
      { label: "How it works", href: "/admin/website/process", permission: "content.manage" },
      { label: "Industries", href: "/admin/website/industries", permission: "content.manage" },
      { label: "Core values", href: "/admin/website/values", permission: "content.manage" },
      { label: "Downloads", href: "/admin/website/documents", permission: "content.manage" },
      { label: "Media library", href: "/admin/website/media", permission: "media.view" },
      { label: "SEO", href: "/admin/website/seo", permission: "content.manage" },
    ],
  },
  {
    key: "crm",
    label: "Customers",
    icon: "inbox",
    items: [
      { label: "Enquiries", href: "/admin/crm/enquiries", permission: "enquiries.view" },
      { label: "Customers", href: "/admin/crm/customers", permission: "enquiries.view" },
    ],
  },
  { key: "quotations", label: "Quotations", icon: "filetext", items: [{ label: "Quotations", href: "/admin/quotations", permission: "quotations.view" }] },
  { key: "suppliers", label: "Suppliers", icon: "factory", items: [{ label: "Suppliers", href: "/admin/suppliers", permission: "suppliers.view" }] },
  {
    key: "procurement",
    label: "Procurement",
    icon: "clipboard",
    items: [
      { label: "Supplier quotes", href: "/admin/procurement/supplier-quotes", permission: "purchasing.view" },
      { label: "Quote comparison", href: "/admin/procurement/quote-comparison", permission: "purchasing.view" },
      { label: "Purchase orders", href: "/admin/procurement/purchase-orders", permission: "purchasing.view" },
    ],
  },
  {
    key: "inventory",
    label: "Inventory",
    icon: "warehouse",
    items: [
      { label: "Warehouses", href: "/admin/inventory/warehouses", permission: "inventory.view" },
      { label: "Stock items", href: "/admin/inventory/variants", permission: "inventory.view" },
      { label: "Stock movements", href: "/admin/inventory/movements", permission: "inventory.view" },
      { label: "Stock balances", href: "/admin/inventory/balances", permission: "inventory.view" },
    ],
  },
  {
    key: "orders",
    label: "Orders",
    icon: "cart",
    items: [
      { label: "Sales orders", href: "/admin/orders/sales-orders", permission: "orders.view" },
      { label: "Deliveries", href: "/admin/orders/deliveries", permission: "orders.view" },
    ],
  },
  {
    key: "portal",
    label: "Customer portal",
    icon: "users",
    items: [
      { label: "Accounts", href: "/admin/portal/accounts", permission: "portal.view" },
      { label: "List prices", href: "/admin/portal/prices", permission: "portal.view" },
      { label: "Customer prices", href: "/admin/portal/customer-prices", permission: "portal.view" },
      { label: "Tracking updates", href: "/admin/portal/updates", permission: "portal.view" },
      { label: "Support tickets", href: "/admin/portal/tickets", permission: "portal.view" },
      { label: "M-Pesa payments", href: "/admin/portal/mpesa", permission: "portal.view" },
      { label: "Payment settings", href: "/admin/portal/payment-settings", permission: "portal.view" },
    ],
  },
  {
    key: "tenders",
    label: "Tenders",
    icon: "gavel",
    items: [
      { label: "Tenders", href: "/admin/tenders", permission: "tenders.view" },
      { label: "Document checklists", href: "/admin/checklists", permission: "tenders.view" },
    ],
  },
  {
    key: "hr",
    label: "HR Outsourcing",
    icon: "users",
    items: [
      { label: "Staffing requests", href: "/admin/hr/requisitions", permission: "hr.view" },
      { label: "Candidates", href: "/admin/hr/candidates", permission: "hr.view" },
      { label: "Placements", href: "/admin/hr/placements", permission: "hr.view" },
    ],
  },
  {
    key: "people",
    label: "Human Resources",
    icon: "userplus",
    items: [
      { label: "My HR", href: "/admin/people/me", permission: "people.self" },
      { label: "Employees", href: "/admin/people/employees", permission: "people.view" },
      { label: "Departments", href: "/admin/people/departments", permission: "people.view" },
      { label: "Contracts", href: "/admin/people/contracts", permission: "people.view" },
      { label: "Leave", href: "/admin/people/leave", permission: "people.view" },
      { label: "Leave types", href: "/admin/people/leave-types", permission: "people.view" },
      { label: "Attendance", href: "/admin/people/attendance", permission: "people.view" },
      { label: "Onboarding", href: "/admin/people/onboarding", permission: "people.view" },
      { label: "Onboarding template", href: "/admin/people/onboarding-template", permission: "people.manage" },
      { label: "Vacancies", href: "/admin/people/vacancies", permission: "people.view" },
      { label: "Applicants", href: "/admin/people/applicants", permission: "people.view" },
      { label: "Performance reviews", href: "/admin/people/reviews", permission: "people.reviews" },
      { label: "Salary records", href: "/admin/people/compensation", permission: "people.compensation" },
      { label: "Payroll", href: "/admin/people/payroll", permission: "people.payroll_prepare" },
    ],
  },
  {
    key: "finance",
    label: "Finance",
    icon: "wallet",
    items: [
      { label: "Overview", href: "/admin/finance", permission: "finance.view" },
      { label: "Invoices", href: "/admin/finance/invoices", permission: "finance.view" },
      { label: "Supplier bills", href: "/admin/finance/bills", permission: "finance.view" },
      { label: "Expense claims", href: "/admin/finance/claims", permission: "finance.claims" },
      { label: "Ledger", href: "/admin/finance/ledger", permission: "finance.view" },
      { label: "Budgets", href: "/admin/finance/budgets", permission: "finance.view" },
      { label: "Reports", href: "/admin/finance/reports", permission: "finance.reports" },
      { label: "Categories", href: "/admin/finance/categories", permission: "finance.manage" },
    ],
  },
  {
    key: "trade",
    label: "Trade documents",
    icon: "filetext",
    items: [
      { label: "Documents dashboard", href: "/admin/trade", permission: "trade.view" },
      { label: "Purchasing chain", href: "/admin/trade/chain/purchasing", permission: "trade.view" },
      { label: "Archive & search", href: "/admin/trade/archive", permission: "trade.view" },
    ],
  },
  {
    key: "approvals",
    label: "Approvals",
    icon: "clipboardcheck",
    items: [
      { label: "Approval rules", href: "/admin/approvals/policies", permission: "approvals.manage" },
      { label: "Approval steps", href: "/admin/approvals/steps", permission: "approvals.manage" },
      { label: "All requests", href: "/admin/approvals/all", permission: "approvals.view_all" },
    ],
  },
  {
    key: "automation",
    label: "Automation",
    icon: "zap",
    items: [
      { label: "Control Centre", href: "/admin/automation", permission: "automation.view" },
      { label: "Run log", href: "/admin/automation/logs", permission: "automation.view" },
      { label: "Email outbox", href: "/admin/automation/outbox", permission: "automation.manage" },
    ],
  },
  { key: "reports", label: "Reports", icon: "chart", items: [{ label: "Reports", href: "/admin/reports", permission: "reports.view" }] },
  { key: "audit", label: "Activity log", icon: "shield", items: [{ label: "Activity log", href: "/admin/audit", permission: "audit.view" }, { label: "Security", href: "/admin/security", permission: "security.view" }] },
];

/**
 * DEPARTMENTS
 * -----------
 * The sidebar groups modules under the department that uses them, so it stays short. This is purely
 * presentational: permissions and module switches are unchanged. A module not listed here appears
 * under "Other" so nothing can ever go missing from the menu.
 */
export type DepartmentDef = { key: string; label: string; icon: NavIcon; modules: ModuleKey[] };
export const DEPARTMENTS: DepartmentDef[] = [
  { key: "sales", label: "Sales & Customers", icon: "inbox", modules: ["crm", "quotations", "orders", "portal"] },
  { key: "supply", label: "Procurement & Supply", icon: "truck", modules: ["suppliers", "procurement", "trade", "inventory", "tenders"] },
  { key: "people", label: "Human Resources", icon: "userplus", modules: ["people", "hr"] },
  { key: "finance", label: "Finance", icon: "wallet", modules: ["finance"] },
  { key: "marketing", label: "Website & Marketing", icon: "globe", modules: ["website"] },
  { key: "management", label: "Management", icon: "shield", modules: ["approvals", "automation", "reports", "audit"] },
];

/** Settings pages are not modules (always present) but are permission-gated the same way. */
export const SETTINGS_ITEMS: AdminNavItem[] = [
  { label: "Users", href: "/admin/settings/users", permission: "users.manage" },
  { label: "Roles & permissions", href: "/admin/settings/roles", permission: "roles.manage" },
  { label: "Modules", href: "/admin/settings/modules", permission: "settings.manage" },
];

export function moduleForPath(pathname: string): ModuleKey | null {
  const hit = ADMIN_MODULES.find((m) => m.items.some((i) => pathname === i.href || pathname.startsWith(i.href + "/")));
  return hit?.key ?? null;
}

/** Build the visible sidebar for a user: enabled modules only, items they may view only. */
export function buildNav(opts: {
  has: (p: Permission) => boolean;
  moduleEnabled: (k: ModuleKey) => boolean;
}) {
  const modules = ADMIN_MODULES.filter((m) => opts.moduleEnabled(m.key))
    .map((m) => ({ ...m, items: m.items.filter((i) => opts.has(i.permission)) }))
    .filter((m) => m.items.length > 0);
  const settings = SETTINGS_ITEMS.filter((i) => opts.has(i.permission));
  const placed = new Set(DEPARTMENTS.flatMap((d) => d.modules));
  const groups: (Omit<DepartmentDef, "modules"> & { modules: typeof modules })[] = DEPARTMENTS.map((d) => ({
    ...d,
    modules: d.modules.map((k) => modules.find((m) => m.key === k)).filter((m): m is (typeof modules)[number] => !!m),
  }));
  const rest = modules.filter((m) => !placed.has(m.key));
  if (rest.length) groups.push({ key: "other", label: "Other", icon: "layers", modules: rest });
  const departments = groups.filter((d) => d.modules.length > 0);
  return { modules, departments, settings };
}
