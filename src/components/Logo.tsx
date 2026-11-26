import { site } from "@/config/site";

/**
 * The SAMSAL logo. It always shows the logo uploaded under Website > Company (served by /brand/logo, which falls back
 * to the built-in logo). On dark backgrounds it sits on a white panel so any logo stays readable.
 */
export function Logo({ variant = "full", onDark = false, className = "" }: { variant?: "full" | "mark"; onDark?: boolean; className?: string; priority?: boolean }) {
  const size = className || (variant === "mark" ? "h-10 w-auto" : "h-10 w-auto");
  // eslint-disable-next-line @next/next/no-img-element -- the route already serves a right-sized image
  const img = <img src="/brand/logo" alt={`${site.legalName} logo`} className={`block max-w-[240px] object-contain ${size}`} />;
  if (!onDark) return img;
  return <span className="inline-flex rounded-md bg-white px-2.5 py-1.5 align-middle">{img}</span>;
}
