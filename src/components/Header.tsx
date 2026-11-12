import Link from "next/link";
import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { mainNav, quoteHref } from "@/config/navigation";

export function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/90 backdrop-blur-xl">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded-md focus:bg-navy focus:px-4 focus:py-2 focus:text-white">Skip to main content</a>

      <div className="container-x flex h-16 items-center justify-between gap-3 sm:h-[74px]">
        <Link href="/" aria-label="SAMSAL Supply & Distribution - home" className="shrink-0">
          <Logo priority className="h-8 w-auto sm:h-9" />
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {mainNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={`rounded-full px-3.5 py-2 text-sm font-semibold transition-colors ${
                isActive(item.href) ? "bg-slate-100 text-navy" : "text-slate-600 hover:bg-slate-100 hover:text-navy"
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
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-300 bg-white text-navy shadow-sm lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X aria-hidden="true" size={22} /> : <Menu aria-hidden="true" size={22} />}
          </button>
        </div>
      </div>

      {open && (
        <div id="mobile-menu" className="fixed inset-x-0 bottom-0 top-16 z-40 overflow-y-auto bg-white lg:hidden">
          <nav aria-label="Mobile" className="container-x flex flex-col py-4">
            {mainNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(item.href) ? "page" : undefined}
                className={`border-b border-slate-200 py-4 text-lg font-semibold ${
                  isActive(item.href) ? "text-teal-dark" : "text-slate-700"
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
