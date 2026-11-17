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
  | "inventory" | "orders" | "tenders" | "hr" | "automation" | "reports" | "audit";

export type NavIcon =
  | "globe" | "building" | "users" | "share" | "home" | "package" | "tag" | "wrench" | "factory" | "image" | "search" | "megaphone" | "file"
  | "inbox" | "contact" | "filetext" | "truck" | "clipboard" | "warehouse" | "arrows" | "cart" | "gavel" | "chart" | "shield" | "settings" | "key" | "layers" | "zap";

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
  { key: "audit", label: "Activity log", icon: "shield", items: [{ label: "Activity log", href: "/admin/audit", permission: "audit.view" }] },
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
  return { modules, settings };
}
