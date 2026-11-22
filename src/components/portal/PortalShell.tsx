import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/Logo";
import PortalNav from "./PortalNav";
import { portalSignOut } from "@/app/portal/(auth)/actions";
import type { PortalContext } from "@/lib/portal/session";

export function PortalShell({ ctx, children }: { ctx: PortalContext; children: ReactNode }) {
  const items = [
    { href: "/portal", label: "Home", icon: "home" },
    { href: "/portal/catalogue", label: "Catalogue", icon: "grid" },
    { href: "/portal/orders", label: "Orders", icon: "box" },
    { href: "/portal/invoices", label: "Invoices", icon: "doc" },
    { href: "/portal/quotes", label: "Quotes", icon: "help", desktopOnly: true },
    { href: "/portal/bulk", label: "Bulk order", icon: "grid", desktopOnly: true },
    { href: "/portal/support", label: "Support", icon: "help", desktopOnly: true },
    { href: "/portal/cart", label: "Cart", icon: "cart", badge: ctx.cartLines || undefined },
  ];
  return (
    <div className="min-h-screen bg-grey pb-20 md:pb-0">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">Skip to content</a>
      <header className="bg-navy text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2.5 sm:px-6">
          <Link href="/portal" aria-label="Portal home" className="shrink-0"><Logo onDark /></Link>
          <PortalNav items={items} />
          <div className="flex items-center gap-3 text-sm">
            <Link href="/portal/account" className="hidden max-w-[16ch] truncate text-white/85 underline-offset-2 hover:underline sm:block" title={ctx.company}>{ctx.company}</Link>
            <Link href="/portal/account" className="sm:hidden text-white/85 underline underline-offset-2">Account</Link>
            <form action={portalSignOut}><button className="min-h-[44px] rounded px-2 text-white/85 hover:text-white">Sign out</button></form>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
