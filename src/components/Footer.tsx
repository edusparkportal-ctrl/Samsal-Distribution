import Link from "next/link";
import { Logo } from "@/components/Logo";
import { SocialIcon } from "@/components/SocialIcon";
import { mainNav, portalHref, quoteHref } from "@/config/navigation";
import { placeholders } from "@/config/site";
import { telHref } from "@/lib/content/helpers";
import type { SiteContent } from "@/lib/content/types";

export function Footer({ content }: { content: SiteContent }) {
  const { company, contact, categories } = content;
  const social = content.social.filter((s) => s.footer);
  return (
    <footer className="on-dark bg-navy pb-20 text-white/80 lg:pb-0">
      <div className="container-x grid gap-10 py-14 md:grid-cols-12">
        <div className="md:col-span-5">
          <Logo variant="full" onDark className="h-10 w-auto" />
          <p className="mt-5 max-w-sm text-sm leading-relaxed">{company.promise}</p>
          <p className="mt-4 text-sm font-semibold text-teal-light">{company.tagline}</p>
          {company.footerText && <p className="mt-3 max-w-sm text-xs leading-relaxed text-white/70">{company.footerText}</p>}
          {social.length > 0 && (
            <ul aria-label="Social media" className="mt-5 flex gap-2">
              {social.map((s) => (
                <li key={s.id}>
                  <a href={s.url} target="_blank" rel="noopener noreferrer" aria-label={s.platform} className="flex h-9 w-9 items-center justify-center rounded border border-white/20 text-white/80 hover:border-white hover:text-white">
                    <SocialIcon platform={s.platform} />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
        <nav aria-label="Footer" className="md:col-span-2">
          <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.18em] text-white">Company</h2>
          <ul className="space-y-2.5 text-sm">
            {mainNav.map((n) => (
              <li key={n.href}>
                <Link href={n.href} className="hover:text-white">
                  {n.label}
                </Link>
              </li>
            ))}
            <li>
              <Link href={portalHref} className="hover:text-white">
                Wholesale Customer Portal
              </Link>
            </li>
            <li>
              <Link href={quoteHref} className="font-semibold text-amber hover:text-amber-dark">
                Request a Quote
              </Link>
            </li>
          </ul>
        </nav>
        <div className="md:col-span-2">
          <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.18em] text-white">Products</h2>
          <ul className="space-y-2.5 text-sm">
            {categories.map((c) => (
              <li key={c.slug}>
                <Link href={`/products?category=${c.slug}`} className="hover:text-white">
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div className="md:col-span-3">
          <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.18em] text-white">Contact</h2>
          <ul className="space-y-2.5 text-sm">
            <li>{contact.address ?? company.coverage}</li>
            <li>
              {contact.phone ? <a href={telHref(contact.phone)} className="hover:text-white">{contact.phone}</a> : <span className="text-white/60">{placeholders.phone}</span>}
            </li>
            <li>
              {contact.email ? <a href={`mailto:${contact.email}`} className="hover:text-white">{contact.email}</a> : <span className="text-white/60">{placeholders.email}</span>}
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="container-x flex flex-col gap-2 py-5 text-xs text-white/60 sm:flex-row sm:items-center sm:justify-between">
          <p>
            &copy; {new Date().getFullYear()} {company.legalName}. All rights reserved.
          </p>
          <nav aria-label="Legal" className="flex gap-5">
            <Link href="/privacy" className="hover:text-white">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-white">Terms of Service</Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
