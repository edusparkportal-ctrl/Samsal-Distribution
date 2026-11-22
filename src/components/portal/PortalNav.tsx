"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; badge?: number; icon: string; desktopOnly?: boolean };
const MORE: Item = { href: "/portal/more", label: "More", icon: "more" };

const ICONS: Record<string, string> = {
  home: "M3 11l9-8 9 8M5 10v10h14V10",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  box: "M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10",
  cart: "M3 4h2l2 12h11l2-8H6M9 20a1 1 0 100-2 1 1 0 000 2zM17 20a1 1 0 100-2 1 1 0 000 2z",
  doc: "M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  help: "M12 21a9 9 0 100-18 9 9 0 000 18zM9.5 9.5a2.5 2.5 0 114 2c-.9.6-1.5 1-1.5 2M12 17h.01",
};

function Icon({ name }: { name: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={ICONS[name] ?? ICONS.box} /></svg>
  );
}

const active = (path: string, href: string) => (href === "/portal" ? path === "/portal" : path === href || path.startsWith(href + "/"));

/** Top links on larger screens, a fixed bottom tab bar on phones. */
export default function PortalNav({ items }: { items: Item[] }) {
  const path = usePathname() ?? "";
  const phone = [...items.filter((i) => !i.desktopOnly), MORE];
  const moreActive = (p: string) => ["/portal/quotes", "/portal/bulk", "/portal/support", "/portal/payments", "/portal/account", "/portal/more"].some((h) => p === h || p.startsWith(h + "/"));
  return (
    <>
      <nav aria-label="Portal" className="hidden items-center gap-1 md:flex">
        {items.map((i) => (
          <Link key={i.href} href={i.href} aria-current={active(path, i.href) ? "page" : undefined}
            className={`relative flex min-h-[44px] items-center gap-2 rounded px-3.5 text-sm font-semibold transition-colors ${active(path, i.href) ? "bg-white/15 text-white" : "text-white/80 hover:bg-white/10 hover:text-white"}`}>
            {i.label}
            {!!i.badge && <span className="rounded-full bg-amber px-1.5 text-xs font-bold text-navy">{i.badge}</span>}
          </Link>
        ))}
      </nav>
      <nav aria-label="Portal" className="fixed inset-x-0 bottom-0 z-30 border-t border-grey-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        <ul className="grid" style={{ gridTemplateColumns: `repeat(${phone.length}, minmax(0, 1fr))` }}>
          {phone.map((i) => (
            <li key={i.href}>
              <Link href={i.href} aria-current={(i === MORE ? moreActive(path) : active(path, i.href)) ? "page" : undefined}
                className={`relative flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${(i === MORE ? moreActive(path) : active(path, i.href)) ? "text-teal-dark" : "text-grey-500"}`}>
                <Icon name={i.icon} />
                {i.label}
                {!!i.badge && <span className="absolute right-[22%] top-1.5 rounded-full bg-amber px-1.5 text-[10px] font-bold leading-4 text-navy">{i.badge}</span>}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
