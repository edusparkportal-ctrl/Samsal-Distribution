/** Only allow redirects to paths inside /admin (prevents open-redirect abuse of ?next=). */
export function safeNext(value: FormDataEntryValue | string | null | undefined, fallback = "/admin"): string {
  const v = typeof value === "string" ? value : "";
  if (!v.startsWith("/admin") || v.startsWith("//") || v.includes("\\") || v.includes("://")) return fallback;
  return v;
}
