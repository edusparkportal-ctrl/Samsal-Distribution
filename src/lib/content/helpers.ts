/** Pure link helpers for content-driven contact details. */
export function whatsappHref(number: string | null | undefined, message?: string): string | null {
  const n = (number ?? "").replace(/\D/g, "");
  if (!n) return null;
  return `https://wa.me/${n}?text=${encodeURIComponent(message ?? "Hello SAMSAL, I would like to make a procurement enquiry.")}`;
}
export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;

/** Shows the last sentence of the headline in amber, e.g. "Reliable Supply. / Smarter Procurement." */
export function splitHeadline(h: string): [string, string | null] {
  const parts = h.trim().match(/[^.!?]+[.!?]*/g)?.map((p) => p.trim()).filter(Boolean) ?? [];
  if (parts.length < 2) return [h.trim(), null];
  return [parts.slice(0, -1).join(" "), parts[parts.length - 1]];
}
