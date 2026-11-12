"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/Logo";
import { mainNav, quoteHref } from "@/config/navigation";

export function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close the mobile menu on navigation
  useEffect(() => setOpen(false), [pathname]);

  // Lock scroll while the mobile menu is open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <header className="sticky top-0 z-50 border-b border-grey-200 bg-white/95 backdrop-blur">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded focus:bg-navy focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to main content
      </a>
      <div className="container-x flex h-16 items-center justify-between gap-3 sm:h-[72px] sm:gap-4">
        <Link href="/" aria-label="SAMSAL Supply & Distribution - home" className="shrink-0">
          <Logo priority className="h-9 w-auto sm:h-10" />
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {mainNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={`rounded px-3 py-2 text-sm font-semibold transition-colors ${
                isActive(item.href)
                  ? "text-navy underline decoration-amber decoration-2 underline-offset-[10px]"
                  : "text-charcoal hover:text-navy"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link href={quoteHref} className="btn-accent hidden px-4 sm:inline-flex">
            Request a Quote
          </Link>
          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded border border-grey-300 text-navy lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X aria-hidden="true" size={22} /> : <Menu aria-hidden="true" size={22} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div id="mobile-menu" className="fixed inset-x-0 bottom-0 top-16 z-40 overflow-y-auto bg-white lg:hidden">
          <nav aria-label="Mobile" className="container-x flex flex-col py-4">
            {mainNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(item.href) ? "page" : undefined}
                className={`border-b border-grey-200 py-4 text-lg font-semibold ${
                  isActive(item.href) ? "text-teal-dark" : "text-navy"
                }`}
              >
                {item.label}
              </Link>
            ))}
            <Link href={quoteHref} className="btn-accent mt-6 w-full py-3.5 text-base">
              Request a Quote
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
