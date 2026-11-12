import Link from "next/link";
import { Logo } from "@/components/Logo";
import { mainNav, quoteHref } from "@/config/navigation";
import { categories } from "@/config/products";
import { placeholders, site } from "@/config/site";

export function Footer() {
  const { contact } = site;
  return (
    <footer className="on-dark bg-navy text-white/80">
      <div className="container-x grid gap-10 py-14 md:grid-cols-12">
        <div className="md:col-span-5">
          <Logo variant="full" onDark className="h-10 w-auto" />
          <p className="mt-5 max-w-sm text-sm leading-relaxed">{site.promise}</p>
          <p className="mt-4 text-sm font-semibold text-teal-light">{site.tagline}</p>
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
                <Link href={`/products#${c.slug}`} className="hover:text-white">
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="md:col-span-3">
          <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.18em] text-white">Contact</h2>
          <ul className="space-y-2.5 text-sm">
            <li>{site.serviceLocation}</li>
            <li>
              {contact.phone ? <a href={`tel:${contact.phone.replace(/\s/g, "")}`} className="hover:text-white">{contact.phone}</a> : <span className="text-white/60">{placeholders.phone}</span>}
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
            &copy; {new Date().getFullYear()} {site.legalName}. All rights reserved.
          </p>
          <p>Serving businesses and institutions in Nairobi, Kenya.</p>
        </div>
      </div>
    </footer>
  );
}
