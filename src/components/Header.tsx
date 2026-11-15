"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, ChevronDown, Mail, MapPin, Menu, Phone, X } from "lucide-react";
import { Logo } from "@/components/Logo";
import { SocialIcon } from "@/components/SocialIcon";
import { mainNav, quoteHref } from "@/config/navigation";

export type HeaderCategory = { slug: string; name: string; summary: string };
type HeaderSocial = { id: string; platform: string; url: string };

type HeaderProps = {
  social?: HeaderSocial[];
  /** Product categories shown in the Products dropdown (from the CMS). */
  categories?: HeaderCategory[];
  tagline?: string;
  /** Contact details are shown only when they have actually been entered in the admin. */
  location?: string | null;
  phone?: string | null;
  email?: string | null;
};

const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;

/** Underline that slides in on hover and stays for the current page. */
const navLinkBase =
  "relative rounded px-3.5 py-2 text-sm font-semibold transition-colors after:absolute after:inset-x-3.5 after:bottom-0 after:h-0.5 after:origin-left after:rounded-full after:bg-amber after:transition-transform after:duration-200";

export function Header({ social = [], categories = [], tagline, location, phone, email }: HeaderProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false); // mobile menu
  const [productsOpen, setProductsOpen] = useState(false); // desktop dropdown
  const [pinned, setPinned] = useState(false); // opened by click/keyboard: stays open until closed
  const [mobileProducts, setMobileProducts] = useState(false); // mobile accordion
  const [scrolled, setScrolled] = useState(false);
  const productsRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const hasDropdown = (href: string) => href === "/products" && categories.length > 0;

  // Close menus on navigation
  useEffect(() => {
    setOpen(false);
    setProductsOpen(false);
    setPinned(false);
    setMobileProducts(false);
  }, [pathname]);

  // Lock page scroll while the mobile menu is open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Escape closes any open menu; a click outside closes the desktop dropdown
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setProductsOpen(false);
        setPinned(false);
      }
    };
    const onDown = (e: MouseEvent) => {
      if (productsRef.current && !productsRef.current.contains(e.target as Node)) {
        setProductsOpen(false);
        setPinned(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, []);

  // Soft shadow once the page has scrolled
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const openDropdown = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setProductsOpen(true);
  };
  const closeDropdownSoon = () => {
    if (pinned) return;
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setProductsOpen(false), 120);
  };
  // Hover opens the menu; a click or key press pins it open, a second one closes it.
  const toggleDropdown = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    if (pinned) {
      setPinned(false);
      setProductsOpen(false);
    } else {
      setPinned(true);
      setProductsOpen(true);
    }
  };

  const hasTopBar = Boolean(tagline || location || phone || email || social.length);

  return (
    <>
      {/* Utility bar: tagline on the left, real contact details and social links on the right. Desktop only. */}
      {hasTopBar && (
        <div className="hidden bg-navy-900 text-xs text-white/85 lg:block">
          <div className="container-x flex h-9 items-center justify-between gap-6">
            <p className="font-semibold tracking-wide text-teal-light">{tagline}</p>
            <ul className="flex items-center gap-5">
              {location && (
                <li className="flex items-center gap-1.5">
                  <MapPin aria-hidden="true" size={13} className="text-amber" />
                  <span>{location}</span>
                </li>
              )}
              {phone && (
                <li>
                  <a href={telHref(phone)} className="flex items-center gap-1.5 hover:text-white">
                    <Phone aria-hidden="true" size={13} className="text-amber" />
                    <span>{phone}</span>
                  </a>
                </li>
              )}
              {email && (
                <li>
                  <a href={`mailto:${email}`} className="flex items-center gap-1.5 hover:text-white">
                    <Mail aria-hidden="true" size={13} className="text-amber" />
                    <span>{email}</span>
                  </a>
                </li>
              )}
              {social.length > 0 && (
                <li>
                  <ul aria-label="Social media" className="flex items-center gap-1">
                    {social.map((s) => (
                      <li key={s.id}>
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={s.platform}
                          className="flex h-7 w-7 items-center justify-center rounded text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                        >
                          <SocialIcon platform={s.platform} />
                        </a>
                      </li>
                    ))}
                  </ul>
                </li>
              )}
            </ul>
          </div>
        </div>
      )}

      <header className={`sticky top-0 z-50 bg-white transition-shadow duration-200 ${scrolled ? "shadow-[0_4px_20px_rgba(20,45,78,0.10)]" : "border-b border-grey-200"}`}>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded focus:bg-navy focus:px-4 focus:py-2 focus:text-white"
        >
          Skip to main content
        </a>
        <div className="container-x flex h-16 items-center justify-between gap-3 sm:gap-4 lg:h-[76px]">
          <Link href="/" aria-label="SAMSAL Supply & Distribution - home" className="shrink-0">
            <Logo priority className="h-9 w-auto sm:h-10" />
          </Link>

          {/* Desktop navigation */}
          <nav aria-label="Main" className="hidden items-center gap-0.5 lg:flex">
            {mainNav.map((item) => {
              const active = isActive(item.href);
              const linkClass = `${navLinkBase} ${active ? "text-navy after:scale-x-100" : "text-charcoal after:scale-x-0 hover:text-navy hover:after:scale-x-100"}`;
              if (!hasDropdown(item.href)) {
                return (
                  <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={linkClass}>
                    {item.label}
                  </Link>
                );
              }
              return (
                <div key={item.href} ref={productsRef} className="relative flex items-center" onMouseEnter={openDropdown} onMouseLeave={closeDropdownSoon}>
                  <Link href={item.href} aria-current={active ? "page" : undefined} className={`${linkClass} pr-1.5`}>
                    {item.label}
                  </Link>
                  <button
                    type="button"
                    aria-label="Show product categories"
                    aria-expanded={productsOpen}
                    aria-controls="products-menu"
                    onClick={toggleDropdown}
                    className="-ml-0.5 flex h-8 w-7 items-center justify-center rounded text-charcoal transition-colors hover:text-navy"
                  >
                    <ChevronDown aria-hidden="true" size={16} className={`transition-transform duration-200 ${productsOpen ? "rotate-180" : ""}`} />
                  </button>

                  {productsOpen && (
                    <div id="products-menu" className="absolute left-1/2 top-full z-50 -translate-x-1/2 pt-3">
                      <div className="w-[26rem] overflow-hidden rounded-lg border border-grey-200 bg-white shadow-[0_18px_40px_rgba(20,45,78,0.16)]">
                        <p className="border-b border-grey-200 bg-grey px-5 py-3 text-xs font-bold uppercase tracking-[0.16em] text-teal-dark">What we supply</p>
                        <ul className="p-2">
                          {categories.map((c) => (
                            <li key={c.slug}>
                              <Link href={`/products?category=${c.slug}`} className="group flex items-start gap-3 rounded-md px-3 py-3 transition-colors hover:bg-teal-tint">
                                <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-teal" />
                                <span className="min-w-0 flex-1">
                                  <span className="block text-sm font-semibold text-navy">{c.name}</span>
                                  {c.summary && <span className="mt-0.5 block text-xs leading-relaxed text-grey-500">{c.summary}</span>}
                                </span>
                                <ArrowRight aria-hidden="true" size={16} className="mt-0.5 shrink-0 -translate-x-1 text-teal-dark opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
                              </Link>
                            </li>
                          ))}
                        </ul>
                        <div className="flex items-center justify-between border-t border-grey-200 bg-grey px-5 py-3 text-sm">
                          <Link href="/products" className="font-semibold text-navy hover:text-teal-dark">
                            View full catalogue
                          </Link>
                          <Link href={quoteHref} className="font-semibold text-teal-dark hover:underline">
                            Request a quote
                          </Link>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            <Link href={quoteHref} className="btn-accent hidden px-5 shadow-sm sm:inline-flex">
              Request a Quote
              <ArrowRight aria-hidden="true" size={16} />
            </Link>
            <button
              type="button"
              className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-grey-300 text-navy transition-colors hover:bg-grey lg:hidden"
              aria-expanded={open}
              aria-controls="mobile-menu"
              aria-label={open ? "Close menu" : "Open menu"}
              onClick={() => setOpen((o) => !o)}
            >
              {open ? <X aria-hidden="true" size={22} /> : <Menu aria-hidden="true" size={22} />}
            </button>
          </div>
        </div>

        {/*
          Mobile menu. It is positioned "absolute" against the header, not "fixed": a fixed child of a sticky,
          filtered header is sized against the header itself and collapses to nothing.
        */}
        {open && (
          <>
            <button type="button" aria-label="Close menu" tabIndex={-1} onClick={() => setOpen(false)} className="absolute inset-x-0 top-full h-screen cursor-default bg-navy/40 lg:hidden" />
            <div id="mobile-menu" className="absolute inset-x-0 top-full max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-grey-200 bg-white shadow-xl lg:hidden">
              <nav aria-label="Mobile" className="container-x flex flex-col py-2">
                {mainNav.map((item) => {
                  const active = isActive(item.href);
                  const rowClass = `flex min-h-[52px] items-center border-b border-grey-200 text-base font-semibold ${active ? "text-teal-dark" : "text-navy"}`;
                  if (!hasDropdown(item.href)) {
                    return (
                      <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`${rowClass} justify-between`}>
                        {item.label}
                        {active && <span aria-hidden="true" className="h-2 w-2 rounded-full bg-amber" />}
                      </Link>
                    );
                  }
                  return (
                    <div key={item.href} className="border-b border-grey-200">
                      <div className="flex items-center">
                        <Link href={item.href} aria-current={active ? "page" : undefined} className={`${rowClass} flex-1 border-b-0`}>
                          {item.label}
                        </Link>
                        <button
                          type="button"
                          aria-label={mobileProducts ? "Hide product categories" : "Show product categories"}
                          aria-expanded={mobileProducts}
                          onClick={() => setMobileProducts((v) => !v)}
                          className="flex h-11 w-11 items-center justify-center rounded text-navy"
                        >
                          <ChevronDown aria-hidden="true" size={20} className={`transition-transform duration-200 ${mobileProducts ? "rotate-180" : ""}`} />
                        </button>
                      </div>
                      {mobileProducts && (
                        <ul className="mb-3 ml-1 space-y-0.5 border-l-2 border-teal/40 pl-4">
                          {categories.map((c) => (
                            <li key={c.slug}>
                              <Link href={`/products?category=${c.slug}`} className="block rounded py-2.5 text-sm font-medium text-charcoal hover:text-teal-dark">
                                {c.name}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}

                <Link href={quoteHref} className="btn-accent mt-5 w-full py-3.5 text-base">
                  Request a Quote
                  <ArrowRight aria-hidden="true" size={18} />
                </Link>

                {(phone || email) && (
                  <ul className="mt-5 space-y-2 text-sm text-charcoal">
                    {phone && (
                      <li>
                        <a href={telHref(phone)} className="flex items-center gap-2 font-medium hover:text-teal-dark">
                          <Phone aria-hidden="true" size={16} className="text-teal-dark" /> {phone}
                        </a>
                      </li>
                    )}
                    {email && (
                      <li>
                        <a href={`mailto:${email}`} className="flex items-center gap-2 font-medium hover:text-teal-dark">
                          <Mail aria-hidden="true" size={16} className="text-teal-dark" /> {email}
                        </a>
                      </li>
                    )}
                  </ul>
                )}

                {social.length > 0 && (
                  <ul aria-label="Social media" className="mt-5 flex gap-2">
                    {social.map((s) => (
                      <li key={s.id}>
                        <a href={s.url} target="_blank" rel="noopener noreferrer" aria-label={s.platform} className="flex h-10 w-10 items-center justify-center rounded border border-grey-300 text-navy hover:bg-grey">
                          <SocialIcon platform={s.platform} />
                        </a>
                      </li>
                    ))}
                  </ul>
                )}

                {tagline && <p className="mb-2 mt-6 text-center text-xs font-semibold tracking-wide text-teal-dark">{tagline}</p>}
              </nav>
            </div>
          </>
        )}
      </header>
    </>
  );
}
