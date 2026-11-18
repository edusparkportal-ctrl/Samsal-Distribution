/**
 * RESOURCE REGISTRY - everything editable in the admin panel is described here.
 *
 * The generic admin pages and server actions (src/app/admin/(panel)/website/*) read these
 * definitions. Because the SERVER looks up the table and the allowed columns from this registry,
 * a browser can never choose which table or column is written: unknown resources and unknown
 * form fields are ignored or rejected.
 *
 * To make something else editable: add a definition here and a nav item in src/lib/modules.ts.
 * No change to the generic pages is needed (see docs/MODULES.md).
 */
import type { Permission } from "@/lib/auth/permissions";
import type { ModuleKey } from "@/lib/modules";
import { CATEGORY_ICONS, SERVICE_ICONS } from "@/lib/content/types";
import { OPS_RESOURCES } from "./resources-ops";
import { PEOPLE_RESOURCES } from "./resources-people";

type Base = { name: string; label: string; col?: string; required?: boolean; help?: string; section?: string };
export type Field =
  | (Base & { type: "text" | "email" | "slug"; max?: number; pattern?: RegExp; patternMessage?: string; placeholder?: string })
  | (Base & { type: "url"; httpsOnly?: boolean; allowInternal?: boolean; max?: number })
  | (Base & { type: "textarea"; max?: number; rows?: number })
  | (Base & { type: "checkbox"; default?: boolean })
  | (Base & { type: "number"; min?: number; max?: number; default?: number; decimal?: boolean })
  | (Base & { type: "date" })
  | (Base & { type: "select"; options: { value: string; label: string }[]; default?: string })
  | (Base & { type: "relation"; table: string; labelCol: string; orderBy?: string; filter?: [string, unknown] })
  | (Base & { type: "media"; kind: "image" | "document" })
  | (Base & { type: "datetime" });

export type ChildList = {
  name: string; label: string; table: string; fk: string; help: string;
  mode: "lines" | "pairs" | "items"; textCol?: string; labelCol?: string; valueCol?: string; max?: number;
};
export type LinkList = { name: string; label: string; table: string; fk: string; other: string; optionsTable: string; optionLabel: string; noSort?: boolean };

export type ResourceDef = {
  key: string;
  route: string;                 // /admin/website/<route>
  table: string;
  label: string;                 // plural, e.g. "Products"
  singular: string;
  description: string;
  permission: Permission;
  module?: ModuleKey;
  pk: "id" | "path" | "employee_id";
  singleton?: boolean;
  fields: Field[];
  columns: { key: string; label: string; badge?: Record<string, "teal" | "grey" | "amber" | "green" | "red">; lookup?: { table: string; labelCol: string } }[];
  orderBy: string;
  sortable?: boolean;            // has sort_order and Up/Down controls
  activeColumn?: "is_active" | "enabled";
  softDelete?: "deleted_at";     // otherwise a real delete
  children?: ChildList[];
  links?: LinkList[];
  slugFrom?: string;             // field name used to derive an empty slug
  filterStatus?: boolean;        // list can be filtered with ?status=
  newLabel?: string;
  // ---- business-module resources (suppliers, orders, ...) ----
  base?: string;                 // URL base, default /admin/website
  viewPermission?: Permission;   // may open the list; `permission` is then the one needed to change things
  publicSite?: boolean;          // false: saving does not purge the public website cache
  createdBy?: string;            // column that receives the signed-in user's id on create
  createOnly?: boolean;          // append-only records (no edit, no delete)
  noDelete?: boolean;
  documentType?: "supplier" | "supplier_quote" | "purchase_order" | "tender" | "delivery"; // attach private documents on the edit page
  statusOptions?: { value: string; label: string }[]; // list filter chips
  beforeSave?: (values: Record<string, unknown>) => void;
};


const WEBSITE: Record<string, ResourceDef> = {
  company: {
    key: "company", route: "company", table: "company_settings", label: "Company", singular: "Company information", pk: "id", singleton: true,
    description: "Your registered name, brand, description, address, hours and quotation settings. Anything left blank is simply not shown on the website.",
    permission: "content.manage", module: "website", columns: [], orderBy: "id",
    fields: [
      { type: "text", name: "registered_name", label: "Registered company name", required: true, max: 160, section: "Identity" },
      { type: "text", name: "brand_name", label: "Brand name", required: true, max: 80 },
      { type: "text", name: "tagline", label: "Tagline", max: 120 },
      { type: "media", name: "logo_media_id", label: "Logo (optional)", kind: "image", help: "Leave empty to keep the built-in SAMSAL logo." },
      { type: "textarea", name: "promise", label: "Short promise (footer and introduction)", max: 400, rows: 3, section: "About" },
      { type: "textarea", name: "description", label: "Company description", max: 800, rows: 4 },
      { type: "textarea", name: "mission", label: "Mission", max: 600, rows: 3, help: "Shown on the About page only when filled in." },
      { type: "textarea", name: "vision", label: "Vision", max: 600, rows: 3 },
      { type: "text", name: "address_line", label: "Business address", max: 200, section: "Location and hours", help: "Not published until you enter it." },
      { type: "text", name: "city", label: "City", max: 80 },
      { type: "text", name: "country", label: "Country", max: 80 },
      { type: "text", name: "business_hours", label: "Business hours", max: 160, placeholder: "e.g. Monday to Friday, 8:00 to 17:00" },
      { type: "text", name: "service_coverage", label: "Service coverage", max: 200 },
      { type: "textarea", name: "footer_text", label: "Extra footer text", max: 300, rows: 2 },
      { type: "text", name: "quotation_prefix", label: "Quotation number prefix", max: 12, pattern: /^[A-Z0-9-]{1,12}$/, patternMessage: "Use capital letters, digits and dashes only.", section: "Quotations" },
      { type: "number", name: "quotation_validity_days", label: "Quotations stay valid for (days)", min: 1, max: 365, default: 14 },
      { type: "text", name: "currency", label: "Currency code", max: 3, pattern: /^[A-Z]{3}$/, patternMessage: "Use a 3-letter code such as KES." },
      { type: "textarea", name: "quotation_terms", label: "Standard quotation terms", max: 2000, rows: 5, help: "Printed at the bottom of every quotation PDF. Have them reviewed by your adviser." },
      { type: "textarea", name: "registration_details", label: "Registration details for quotations", max: 400, rows: 2, help: "Printed on quotations only if you fill this in. Enter only details you can prove." },
      { type: "text", name: "tax_pin", label: "Tax PIN for quotations", max: 40 },
    ],
  },
  homepage: {
    key: "homepage", route: "homepage", table: "homepage_settings", label: "Homepage", singular: "Homepage", pk: "id", singleton: true,
    description: "The hero section and section headings on the home page. Featured products, service highlights and industries come from their own lists.",
    permission: "content.manage", module: "website", columns: [], orderBy: "id",
    fields: [
      { type: "text", name: "headline", label: "Main headline", required: true, max: 120, section: "Hero" },
      { type: "textarea", name: "subheadline", label: "Supporting description", max: 400, rows: 3 },
      { type: "media", name: "hero_media_id", label: "Hero image", kind: "image", help: "Leave empty to keep the built-in illustration." },
      { type: "text", name: "primary_cta_label", label: "Primary button text", max: 40, section: "Buttons" },
      { type: "url", name: "primary_cta_href", label: "Primary button link", allowInternal: true, httpsOnly: true, help: "A page on this site (like /quote) or a full https:// address." },
      { type: "text", name: "secondary_cta_label", label: "Secondary button text", max: 40 },
      { type: "url", name: "secondary_cta_href", label: "Secondary button link", allowInternal: true, httpsOnly: true },
      { type: "text", name: "products_heading", label: "Products section heading", max: 80, section: "Section headings" },
      { type: "text", name: "services_heading", label: "Services section heading", max: 80 },
      { type: "text", name: "industries_heading", label: "Industries section heading", max: 80 },
    ],
  },
  staff: {
    key: "staff", route: "staff", table: "staff_members", label: "Management team", singular: "Team member", pk: "id", newLabel: "Add team member",
    description: "Only add people who have approved being listed. Their email is shown publicly only if you tick the box.",
    permission: "content.manage", module: "website", orderBy: "sort_order", sortable: true, activeColumn: "is_active", softDelete: "deleted_at",
    columns: [{ key: "full_name", label: "Name" }, { key: "position", label: "Position" }, { key: "department", label: "Department" }],
    fields: [
      { type: "text", name: "full_name", label: "Full name", required: true, max: 120 },
      { type: "text", name: "position", label: "Position", required: true, max: 120 },
      { type: "text", name: "department", label: "Department", max: 80 },
      { type: "textarea", name: "biography", label: "Biography", max: 1500, rows: 5 },
      { type: "media", name: "photo_media_id", label: "Photograph", kind: "image" },
      { type: "email", name: "email", label: "Email" },
      { type: "checkbox", name: "show_email", label: "Show this email publicly (only if approved)" },
      { type: "url", name: "linkedin_url", label: "LinkedIn profile", httpsOnly: true, max: 300, help: "Must be a linkedin.com address." },
      { type: "checkbox", name: "is_active", label: "Visible on the website", default: true },
    ],
  },
  contacts: {
    key: "contacts", route: "contacts", table: "contact_channels", label: "Contact details", singular: "Contact detail", pk: "id", newLabel: "Add contact detail",
    description: "Telephone numbers, email addresses and WhatsApp. These replace the placeholders on the website the moment you save. Keep one primary per type.",
    permission: "content.manage", module: "website", orderBy: "sort_order", sortable: true, activeColumn: "is_active",
    columns: [{ key: "kind", label: "Type", badge: { phone: "teal", email: "grey", whatsapp: "green" } }, { key: "label", label: "Label" }, { key: "value", label: "Value" }],
    fields: [
      { type: "select", name: "kind", label: "Type", required: true, options: [{ value: "phone", label: "Telephone" }, { value: "email", label: "Email" }, { value: "whatsapp", label: "WhatsApp" }] },
      { type: "text", name: "label", label: "Label", required: true, max: 60, placeholder: "e.g. Sales" },
      { type: "text", name: "value", label: "Number or address", required: true, max: 120 },
      { type: "checkbox", name: "is_public", label: "Show publicly on the website", default: true },
      { type: "checkbox", name: "is_primary", label: "Primary for this type (used in buttons, footer and structured data)" },
      { type: "checkbox", name: "is_active", label: "Active", default: true },
    ],
  },
  social: {
    key: "social", route: "social", table: "social_links", label: "Social media", singular: "Social account", pk: "id", newLabel: "Add social account",
    description: "Add only accounts that really exist. Choose where each icon appears. Nothing is hardcoded in the website.",
    permission: "content.manage", module: "website", orderBy: "sort_order", sortable: true, activeColumn: "enabled",
    columns: [{ key: "platform", label: "Platform" }, { key: "url", label: "Address" }],
    fields: [
      { type: "text", name: "platform", label: "Platform", required: true, max: 40, placeholder: "e.g. LinkedIn" },
      { type: "url", name: "url", label: "Profile address", required: true, httpsOnly: true, max: 300 },
      { type: "checkbox", name: "enabled", label: "Enabled", default: true },
      { type: "checkbox", name: "show_in_header", label: "Show in the header" },
      { type: "checkbox", name: "show_in_footer", label: "Show in the footer", default: true },
      { type: "checkbox", name: "show_on_contact", label: "Show on the Contact page", default: true },
    ],
  },
  announcements: {
    key: "announcements", route: "announcements", table: "announcements", label: "Announcements", singular: "Announcement", pk: "id", newLabel: "Add announcement",
    description: "A short notice shown in a banner at the top of the website. Optionally set start and end times (Nairobi time).",
    permission: "content.manage", module: "website", orderBy: "created_at", activeColumn: "is_active",
    columns: [{ key: "message", label: "Message" }],
    fields: [
      { type: "text", name: "message", label: "Message", required: true, max: 300 },
      { type: "url", name: "link_href", label: "Link (optional)", allowInternal: true, httpsOnly: true },
      { type: "datetime", name: "starts_at", label: "Show from" },
      { type: "datetime", name: "ends_at", label: "Show until" },
      { type: "checkbox", name: "is_active", label: "Active", default: true },
    ],
  },
  products: {
    key: "products", route: "products", table: "products", label: "Products", singular: "Product", pk: "id", newLabel: "Add product", filterStatus: true,
    description: "Published products appear on the Products page. Drafts and archived products stay hidden. State only facts you can stand behind: no invented brands, prices or certifications.",
    permission: "products.manage", module: "website", orderBy: "sort_order", sortable: true, softDelete: "deleted_at", slugFrom: "name",
    columns: [{ key: "name", label: "Product" }, { key: "status", label: "Status", badge: { published: "green", draft: "amber", archived: "grey" } }, { key: "is_featured", label: "Featured" }],
    fields: [
      { type: "text", name: "name", label: "Product name", required: true, max: 160 },
      { type: "slug", name: "slug", label: "Web address name", max: 80, help: "Lower-case letters, digits and dashes. Left empty it is made from the name. Changing it changes the product link." },
      { type: "relation", name: "category_id", label: "Category", table: "product_categories", labelCol: "name", orderBy: "sort_order", required: true },
      { type: "textarea", name: "summary", label: "Short summary", max: 300, rows: 2 },
      { type: "textarea", name: "description", label: "Description", max: 2000, rows: 5 },
      { type: "media", name: "photo_media_id", label: "Photograph", kind: "image", help: "Without a photo, the category illustration is shown." },
      { type: "text", name: "image_alt", label: "Image description (for screen readers)", max: 160 },
      { type: "text", name: "packaging", label: "Pack sizes", max: 160, help: "Leave empty to show “Pack sizes confirmed on quotation”." },
      { type: "relation", name: "unit_id", label: "Unit of measure", table: "units", labelCol: "name", orderBy: "name" },
      { type: "select", name: "status", label: "Visibility", required: true, default: "draft", options: [{ value: "draft", label: "Draft (hidden)" }, { value: "published", label: "Published (visible)" }, { value: "archived", label: "Archived (hidden)" }] },
      { type: "checkbox", name: "is_featured", label: "Feature on the homepage" },
    ],
    children: [{ name: "specs", label: "Specifications", table: "product_specifications", fk: "product_id", mode: "pairs", labelCol: "label", valueCol: "value", max: 30, help: "One per line, written as Label: Value (for example “Format: Specified per order”)." }],
  },
  categories: {
    key: "categories", route: "categories", table: "product_categories", label: "Product categories", singular: "Category", pk: "id", newLabel: "Add category",
    description: "Categories group products on the website and in the quote form.",
    permission: "products.manage", module: "website", orderBy: "sort_order", sortable: true, activeColumn: "is_active", slugFrom: "name",
    columns: [{ key: "name", label: "Category" }, { key: "slug", label: "Address name" }],
    fields: [
      { type: "text", name: "name", label: "Name", required: true, max: 100 },
      { type: "slug", name: "slug", label: "Web address name", max: 60 },
      { type: "textarea", name: "summary", label: "Short summary", max: 300, rows: 2 },
      { type: "textarea", name: "description", label: "Description", max: 1000, rows: 3 },
      { type: "select", name: "icon", label: "Icon", options: CATEGORY_ICONS.map((i) => ({ value: i, label: i })), default: "boxes" },
      { type: "text", name: "seo_description", label: "Search-engine description", max: 200 },
      { type: "checkbox", name: "is_active", label: "Visible on the website", default: true },
    ],
  },
  services: {
    key: "services", route: "services", table: "services", label: "Services", singular: "Service", pk: "id", newLabel: "Add service",
    description: "Services shown on the Services page and the homepage highlights. Describe only what the business actually offers.",
    permission: "content.manage", module: "website", orderBy: "sort_order", sortable: true, activeColumn: "is_active", slugFrom: "title",
    columns: [{ key: "title", label: "Service" }, { key: "is_featured", label: "Highlighted" }],
    fields: [
      { type: "text", name: "title", label: "Title", required: true, max: 120 },
      { type: "slug", name: "slug", label: "Web address name", max: 60 },
      { type: "textarea", name: "summary", label: "Short summary", max: 300, rows: 2 },
      { type: "textarea", name: "description", label: "Full description", max: 1500, rows: 4 },
      { type: "select", name: "icon", label: "Icon", options: SERVICE_ICONS.map((i) => ({ value: i, label: i })), default: "boxes" },
      { type: "checkbox", name: "is_featured", label: "Highlight on the homepage", default: true },
      { type: "checkbox", name: "is_active", label: "Visible on the website", default: true },
    ],
  },
  industries: {
    key: "industries", route: "industries", table: "industries", label: "Industries", singular: "Industry", pk: "id", newLabel: "Add industry",
    description: "Sectors the business serves. Describe typical needs only; do not claim past contracts or approvals.",
    permission: "content.manage", module: "website", orderBy: "sort_order", sortable: true, activeColumn: "is_active", slugFrom: "title",
    columns: [{ key: "title", label: "Industry" }],
    fields: [
      { type: "text", name: "title", label: "Name", required: true, max: 120 },
      { type: "slug", name: "slug", label: "Web address name", max: 60 },
      { type: "textarea", name: "summary", label: "Short summary", max: 300, rows: 2 },
      { type: "checkbox", name: "is_featured", label: "Show on the homepage", default: true },
      { type: "checkbox", name: "is_active", label: "Visible on the website", default: true },
    ],
    children: [{ name: "needs", label: "Typical needs", table: "industry_needs", fk: "industry_id", mode: "lines", textCol: "text", max: 20, help: "One per line." }],
    links: [{ name: "categories", label: "Related product categories", table: "industry_categories", fk: "industry_id", other: "category_id", optionsTable: "product_categories", optionLabel: "name" }],
  },
  process: {
    key: "process", route: "process", table: "process_steps", label: "How it works", singular: "Step", pk: "id", newLabel: "Add step",
    description: "The numbered steps on the Services page.",
    permission: "content.manage", module: "website", orderBy: "sort_order", sortable: true, activeColumn: "is_active",
    columns: [{ key: "title", label: "Step" }, { key: "body", label: "Text" }],
    fields: [
      { type: "text", name: "title", label: "Title", required: true, max: 80 },
      { type: "textarea", name: "body", label: "Text", required: true, max: 300, rows: 2 },
      { type: "checkbox", name: "is_active", label: "Visible", default: true },
    ],
  },
  values: {
    key: "values", route: "values", table: "company_values", label: "Core values", singular: "Value", pk: "id", newLabel: "Add value",
    description: "Core values shown on the About page once at least one is added.",
    permission: "content.manage", module: "website", orderBy: "sort_order", sortable: true, activeColumn: "is_active",
    columns: [{ key: "title", label: "Value" }, { key: "description", label: "Meaning" }],
    fields: [
      { type: "text", name: "title", label: "Value", required: true, max: 80 },
      { type: "textarea", name: "description", label: "What it means", max: 300, rows: 2 },
      { type: "checkbox", name: "is_active", label: "Visible", default: true },
    ],
  },
  documents: {
    key: "documents", route: "documents", table: "site_documents", label: "Downloads", singular: "Download", pk: "id", newLabel: "Add download",
    description: "Documents offered on the website. Without a file the entry says “available on request”. Only attach files the business has approved for public release.",
    permission: "content.manage", module: "website", orderBy: "sort_order", sortable: true, activeColumn: "is_active",
    columns: [{ key: "title", label: "Document" }, { key: "description", label: "Description" }],
    fields: [
      { type: "text", name: "title", label: "Title", required: true, max: 120 },
      { type: "textarea", name: "description", label: "Description", max: 300, rows: 2 },
      { type: "media", name: "media_id", label: "File (PDF or image)", kind: "document", help: "Upload it in the Media library first. It becomes public." },
      { type: "checkbox", name: "is_active", label: "Visible", default: true },
    ],
  },
  seo: {
    key: "seo", route: "seo", table: "seo_pages", label: "SEO", singular: "Page SEO", pk: "path", newLabel: "Add page SEO",
    description: "Override the title, description, sharing image and canonical address of a page. Pages without an entry use their built-in text.",
    permission: "content.manage", module: "website", orderBy: "path",
    columns: [{ key: "path", label: "Page" }, { key: "title", label: "Title" }],
    fields: [
      { type: "text", name: "path", label: "Page path", required: true, max: 120, pattern: /^\/([a-z0-9/-]*)$/, patternMessage: "Start with / and use lower-case letters, digits and dashes, e.g. /about.", help: "Use / for the home page." },
      { type: "text", name: "title", label: "Page title", max: 70, help: "Up to 70 characters." },
      { type: "textarea", name: "description", label: "Meta description", max: 170, rows: 3, help: "Up to 170 characters." },
      { type: "media", name: "og_image_media_id", label: "Social sharing image", kind: "image" },
      { type: "url", name: "canonical_url", label: "Canonical address (optional)", httpsOnly: true, max: 300 },
      { type: "checkbox", name: "noindex", label: "Ask search engines not to list this page" },
    ],
  },
};

export const RESOURCES: Record<string, ResourceDef> = { ...WEBSITE, ...OPS_RESOURCES, ...PEOPLE_RESOURCES };
/** The /admin/website/[resource] pages serve only the website resources. */
export const RESOURCE_BY_ROUTE: Record<string, ResourceDef> = Object.fromEntries(Object.values(WEBSITE).map((r) => [r.route, r]));
export const resourceBase = (d: ResourceDef) => `${d.base ?? "/admin/website"}/${d.route}`;
