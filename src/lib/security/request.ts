/**
 * Request helpers shared by route handlers and server actions.
 */

/**
 * Best available client address. On Vercel the platform sets x-vercel-forwarded-for / x-real-ip itself
 * (a visitor cannot choose them); a client-supplied x-forwarded-for is only used as the last resort.
 */
export function clientIp(h: { get(name: string): string | null }): string {
  const pick = (v: string | null) => v?.split(",")[0]?.trim() || "";
  return pick(h.get("x-vercel-forwarded-for")) || pick(h.get("x-real-ip")) || pick(h.get("x-forwarded-for")) || "unknown";
}

/** Coarse, non-identifying hint for logs: IPv4 /24 or IPv6 /48 with the host part masked. */
export function ipHint(ip: string): string | null {
  if (!ip || ip === "unknown") return null;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return ip.replace(/\.\d{1,3}$/, ".x");
  if (ip.includes(":")) return ip.split(":").slice(0, 3).join(":") + "::x";
  return null;
}

/** Browser submissions must come from our own site. Requests with no Origin (non-browser clients) are judged by the other controls. */
export function originAllowed(h: { get(name: string): string | null }, siteUrl = process.env.NEXT_PUBLIC_SITE_URL): boolean {
  const origin = h.get("origin");
  if (!origin) return true;
  try {
    const o = new URL(origin);
    const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
    if (o.host === host) return true;
    if (siteUrl && o.host === new URL(siteUrl).host) return true;
    return o.hostname === "localhost" && process.env.NODE_ENV !== "production";
  } catch {
    return false;
  }
}
