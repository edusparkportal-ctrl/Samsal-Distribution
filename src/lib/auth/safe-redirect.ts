/** Only allow redirects to paths inside /admin (prevents open-redirect abuse of ?next=). */
export function safeNext(value: FormDataEntryValue | string | null | undefined, fallback = "/admin"): string {
  const v = typeof value === "string" ? value : "";
  if (!v.startsWith("/admin") || v.startsWith("//") || v.includes("\\") || v.includes("://") || /[\u0000-\u001f\u007f]/.test(v)) return fallback;
  return v;
}

/** Same rule for the customer portal: only paths inside /portal. */
export function safePortalNext(value: FormDataEntryValue | string | null | undefined, fallback = "/portal"): string {
  const v = typeof value === "string" ? value : "";
  if (!(v === "/portal" || v.startsWith("/portal/") || v.startsWith("/portal?")) || v.startsWith("//") || v.includes("\\") || v.includes("://") || v.includes("..") || /[\u0000-\u001f\u007f]/.test(v)) return fallback;
  return v;
}
