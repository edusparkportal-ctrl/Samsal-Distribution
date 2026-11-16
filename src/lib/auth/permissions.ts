/**
 * Permission keys. These MUST match the rows in public.permissions (supabase migration 0007).
 * Roles are data (Super Administrator can edit them in the admin panel); the keys are code.
 */
export const PERMISSIONS = {
  "content.manage": "Edit company info, homepage, staff directory, social links, services, industries, announcements, SEO",
  "products.manage": "Create, edit, archive products, categories and specifications",
  "media.view": "View the media library",
  "media.manage": "Upload, replace and delete files",
  "users.manage": "Invite staff, assign roles, activate or deactivate accounts",
  "roles.manage": "Create roles and assign permissions",
  "settings.manage": "Enable or disable platform modules",
  "enquiries.view": "View customers and enquiries",
  "enquiries.manage": "Update, assign and annotate enquiries",
  "enquiries.export": "Export enquiry data",
  "quotations.view": "View quotations",
  "quotations.manage": "Create, edit and issue quotations",
  "suppliers.view": "View suppliers",
  "suppliers.manage": "Create and edit suppliers",
  "purchasing.view": "View supplier quotes and purchase orders",
  "purchasing.manage": "Create and edit supplier quotes and purchase orders",
  "purchasing.approve": "Approve purchase orders",
  "inventory.view": "View warehouses and stock",
  "inventory.manage": "Record stock movements, manage warehouses",
  "orders.view": "View sales orders and deliveries",
  "orders.manage": "Create and edit sales orders and deliveries",
  "tenders.view": "View tenders",
  "tenders.manage": "Create and edit tenders",
  "hr.view": "View HR outsourcing requests, candidates and placements",
  "hr.manage": "Create and edit HR outsourcing requests, candidates and placements",
  "audit.view": "View the activity log",
  "reports.view": "View and export reports",
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const isPermission = (v: string): v is Permission => v in PERMISSIONS;
