/**
 * Shared validation + sanitisation. Used by the browser (instant feedback)
 * AND by the API route (the authoritative check - never trust the client).
 */

export type FormKind = "quote" | "enquiry";

export type FormValues = {
  organisation: string;
  contactName: string;
  email: string;
  phone: string;
  product: string;
  specifications: string;
  quantity: string;
  deliveryLocation: string;
  deliveryDate: string; // YYYY-MM-DD
  instructions: string;
  message: string; // enquiry form only
};

export type FieldErrors = Partial<Record<keyof FormValues | "file", string>>;

export const LIMITS = {
  short: 150,
  long: 3000,
  maxFileBytes: 4 * 1024 * 1024, // 4 MB (Vercel serverless request bodies are capped at ~4.5 MB)
  allowedExtensions: ["pdf", "doc", "docx", "xls", "xlsx", "csv", "txt", "jpg", "jpeg", "png"],
};

export const emptyValues: FormValues = {
  organisation: "",
  contactName: "",
  email: "",
  phone: "",
  product: "",
  specifications: "",
  quantity: "",
  deliveryLocation: "",
  deliveryDate: "",
  instructions: "",
  message: "",
};

/** Strip control characters, collapse dangerous whitespace and trim. */
export function clean(input: unknown, max: number): string {
  if (typeof input !== "string") return "";
  return input
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, max);
}

export function cleanSingleLine(input: unknown, max: number): string {
  return clean(input, max).replace(/\s*\n+\s*/g, " ");
}

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[A-Za-z]{2,}$/;

export function isValidEmail(v: string) {
  return v.length <= 254 && EMAIL_RE.test(v);
}

/** Accepts Kenyan local (07xx / 01xx), +254 and other international numbers. */
export function isValidPhone(v: string) {
  const compact = v.replace(/[\s\-().]/g, "");
  if (!/^\+?\d+$/.test(compact)) return false;
  const digits = compact.replace(/^\+/, "");
  if (digits.length < 9 || digits.length > 15) return false;
  // Kenyan numbers entered locally should be 10 digits (07XXXXXXXX / 01XXXXXXXX)
  if (/^0/.test(digits)) return digits.length === 10;
  return true;
}

/** Today's date (YYYY-MM-DD) in Nairobi, regardless of server time zone. */
export function todayInNairobi(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function sanitiseValues(raw: Record<string, unknown>): FormValues {
  return {
    organisation: cleanSingleLine(raw.organisation, LIMITS.short),
    contactName: cleanSingleLine(raw.contactName, LIMITS.short),
    email: cleanSingleLine(raw.email, 254).toLowerCase(),
    phone: cleanSingleLine(raw.phone, 30),
    product: cleanSingleLine(raw.product, LIMITS.short),
    specifications: clean(raw.specifications, LIMITS.long),
    quantity: cleanSingleLine(raw.quantity, LIMITS.short),
    deliveryLocation: cleanSingleLine(raw.deliveryLocation, LIMITS.short),
    deliveryDate: cleanSingleLine(raw.deliveryDate, 10),
    instructions: clean(raw.instructions, LIMITS.long),
    message: clean(raw.message, LIMITS.long),
  };
}

export function validate(kind: FormKind, v: FormValues, today = todayInNairobi()): FieldErrors {
  const e: FieldErrors = {};

  if (kind === "quote" && !v.organisation) e.organisation = "Enter your organisation or business name.";
  if (!v.contactName) e.contactName = "Enter the contact person's name.";
  else if (v.contactName.length < 2) e.contactName = "Name looks too short.";

  if (!v.email) e.email = "Enter your email address.";
  else if (!isValidEmail(v.email)) e.email = "Enter a valid email address, e.g. name@company.co.ke.";

  if (!v.phone) e.phone = "Enter a telephone number.";
  else if (!isValidPhone(v.phone)) e.phone = "Enter a valid number, e.g. 0712 345 678 or +254 712 345 678.";

  if (kind === "quote") {
    if (!v.product) e.product = "Tell us which product or service you need.";
    if (!v.specifications) e.specifications = "Describe the specifications (type, size, grade, brand preference, etc.).";
    if (!v.quantity) e.quantity = "Enter the quantity required.";
    if (!v.deliveryLocation) e.deliveryLocation = "Enter the preferred delivery location.";
    if (!v.deliveryDate) e.deliveryDate = "Choose the date you need delivery by.";
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(v.deliveryDate) || Number.isNaN(Date.parse(v.deliveryDate)))
      e.deliveryDate = "Enter a valid date.";
    else if (v.deliveryDate < today) e.deliveryDate = "The delivery date cannot be in the past.";
  } else {
    if (!v.message) e.message = "Please tell us how we can help.";
    else if (v.message.length < 10) e.message = "Please add a little more detail (at least 10 characters).";
  }

  return e;
}

export function fileExtension(name: string) {
  const i = name.lastIndexOf(".");
  return i === -1 ? "" : name.slice(i + 1).toLowerCase();
}

/** Returns an error message, or null if the file is acceptable (or absent). */
export function validateFile(file: { name: string; size: number } | null | undefined): string | null {
  if (!file || file.size === 0) return null;
  if (file.size > LIMITS.maxFileBytes) return "File is too large. Maximum size is 4 MB.";
  if (!LIMITS.allowedExtensions.includes(fileExtension(file.name)))
    return `Unsupported file type. Allowed: ${LIMITS.allowedExtensions.join(", ").toUpperCase()}.`;
  return null;
}

export function safeFilename(name: string) {
  const ext = fileExtension(name);
  const base = name
    .slice(0, name.length - (ext ? ext.length + 1 : 0))
    .replace(/[^\w.\- ]+/g, "_")
    .slice(0, 80)
    .trim();
  return `${base || "attachment"}${ext ? `.${ext}` : ""}`;
}

export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
