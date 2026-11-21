/** Display helpers for the customer portal (pure functions, unit tested). */

export function formatMoney(value: number | string | null | undefined, currency = "KES"): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (n === null || n === undefined || !Number.isFinite(n)) return "-";
  const body = new Intl.NumberFormat("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  return `${currency === "KES" ? "KES" : currency} ${body}`;
}

/** 10 -> "10", 2.5 -> "2.5", 1.000 -> "1". */
export function formatQty(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (n === null || n === undefined || !Number.isFinite(n)) return "-";
  return new Intl.NumberFormat("en-KE", { maximumFractionDigits: 3 }).format(n);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  const d = new Date(value.length === 10 ? `${value}T00:00:00+03:00` : value);
  if (Number.isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("en-KE", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Nairobi" }).format(d);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("en-KE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Africa/Nairobi" }).format(d);
}

export type Tone = "grey" | "teal" | "amber" | "red" | "green" | "navy";

export const ORDER_STATUS: Record<string, { label: string; tone: Tone; step: number }> = {
  submitted: { label: "Received", tone: "amber", step: 1 },
  confirmed: { label: "Confirmed", tone: "teal", step: 2 },
  processing: { label: "Being prepared", tone: "teal", step: 3 },
  partially_delivered: { label: "Partly delivered", tone: "teal", step: 4 },
  delivered: { label: "Delivered", tone: "green", step: 5 },
  invoiced: { label: "Delivered and invoiced", tone: "green", step: 5 },
  cancelled: { label: "Cancelled", tone: "red", step: 0 },
};
export const orderStatus = (s: string) => ORDER_STATUS[s] ?? { label: s, tone: "grey" as Tone, step: 0 };

/** The five milestones shown on the tracking page. */
export const TRACK_STEPS = ["Received", "Confirmed", "Being prepared", "Delivering", "Delivered"] as const;

export const AVAILABILITY: Record<string, { label: string; tone: Tone }> = {
  in_stock: { label: "In stock", tone: "green" },
  low_stock: { label: "Low stock", tone: "amber" },
  out_of_stock: { label: "Out of stock", tone: "red" },
  on_request: { label: "Availability on request", tone: "grey" },
};
export const availability = (s: string | null | undefined) => AVAILABILITY[s ?? ""] ?? AVAILABILITY.on_request;

export const CART_ISSUES: Record<string, string> = {
  unavailable: "No longer available",
  no_price: "Not available to order online",
  below_minimum: "Below the minimum order",
  step: "Quantity must be in the pack steps shown",
  exceeds_stock: "More than we currently have in stock",
};

/** Public image URL for a catalogue photo (public bucket only) or the bundled fallback. */
export function productImage(photoPath: string | null | undefined, fallback: string | null | undefined, supabaseUrl: string | undefined): string | null {
  if (photoPath && supabaseUrl) {
    try {
      const base = new URL(supabaseUrl).origin;
      return `${base}/storage/v1/object/public/public-media/${photoPath.split("/").map(encodeURIComponent).join("/")}`;
    } catch {
      /* fall through */
    }
  }
  return fallback && fallback.startsWith("/") && !fallback.startsWith("//") ? fallback : null;
}

/** Positive finite number from user input, else null. */
export function parseQty(v: FormDataEntryValue | null | undefined): number | null {
  if (typeof v !== "string" || v.trim() === "") return null;
  const n = Number(v.trim());
  return Number.isFinite(n) && n >= 0 && n <= 1_000_000 ? Math.round(n * 1000) / 1000 : null;
}
