"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, Globe, Building2, Users, Share2, Home, Package, Tag, Wrench, Factory, Image as ImageIcon, Search, Megaphone, File as FileIcon,
  Inbox, Contact, FileText, Truck, ClipboardList, Warehouse, ArrowLeftRight, ShoppingCart, Gavel, BarChart3, ShieldCheck, Settings, KeyRound,
  Layers, Zap, Wallet, UserPlus, ClipboardCheck, Bell, LogOut, Menu, X, ChevronDown, UserCircle, ExternalLink, type LucideIcon,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { signOut } from "@/app/admin/login/actions";
import type { NavIcon } from "@/lib/modules";

const ICONS: Record<NavIcon, LucideIcon> = {
  globe: Globe, building: Building2, users: Users, share: Share2, home: Home, package: Package, tag: Tag, wrench: Wrench, factory: Factory,
  image: ImageIcon, search: Search, megaphone: Megaphone, file: FileIcon, inbox: Inbox, contact: Contact, filetext: FileText, truck: Truck,
  clipboard: ClipboardList, warehouse: Warehouse, arrows: ArrowLeftRight, cart: ShoppingCart, gavel: Gavel, chart: BarChart3, shield: ShieldCheck,
  settings: Settings, key: KeyRound, layers: Layers, zap: Zap, wallet: Wallet, userplus: UserPlus, clipboardcheck: ClipboardCheck,
};

export type ShellNav = {
  modules: { key: string; label: string; icon: NavIcon; items: { label: string; href: string }[] }[];
  departments: { key: string; label: string; icon: NavIcon; modules: { key: string; label: string; items: { label: string; href: string }[] }[] }[];
  settings: { label: string; href: string }[];
};

export function AdminShell({ nav, user, unread = 0, approvals = 0, children }: { nav: ShellNav; user: { name: string; role: string }; unread?: number; approvals?: number; children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [openDeps, setOpenDeps] = useState<string[]>([]);
  useEffect(() => setOpen(false), [pathname]);

  const link = (href: string, label: string, Icon?: LucideIcon) => {
    const active = pathname === href || (href !== "/admin" && pathname.startsWith(href + "/"));
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? "page" : undefined}
        className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${active ? "bg-white/15 font-semibold text-white" : "text-white/75 hover:bg-white/10 hover:text-white"}`}
      >
        {Icon && <Icon aria-hidden="true" size={17} />}
        {label}
      </Link>
    );
  };

  const sidebar = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 px-6 pb-3 pt-4"><Logo onDark /></div>
      {/* The menu scrolls on its own: the logo stays put and scrolling here never moves the page behind it. */}
      <nav aria-label="Admin" className="admin-sidebar-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-6 pt-1">
      <div className="space-y-1.5">
        <div>{link("/admin", "Dashboard", LayoutDashboard)}</div>
        {nav.departments.map((d) => {
          const Icon = ICONS[d.icon] ?? Layers;
          const hrefs = d.modules.flatMap((m) => m.items.map((i) => i.href));
          const hasActive = hrefs.some((h) => pathname === h || pathname.startsWith(h + "/"));
          const isOpen = hasActive || openDeps.includes(d.key);
          const single = d.modules.length === 1;
          return (
            <div key={d.key}>
              <button
                type="button"
                onClick={() => setOpenDeps((cur) => (cur.includes(d.key) ? cur.filter((k) => k !== d.key) : [...cur, d.key]))}
                aria-expanded={isOpen}
                aria-controls={`dep-${d.key}`}
                className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-semibold transition-colors ${hasActive ? "text-white" : "text-white/85 hover:bg-white/10 hover:text-white"}`}
              >
                <Icon aria-hidden="true" size={17} />
                <span className="flex-1">{d.label}</span>
                <ChevronDown aria-hidden="true" size={15} className={`transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </button>
              {isOpen && (
                <div id={`dep-${d.key}`} className="ml-3 mt-0.5 space-y-2 border-l border-white/15 pl-2">
                  {d.modules.map((m) => (
                    <div key={m.key} className="space-y-0.5">
                      {/* A module with one item is just a link; several items get a small heading (skipped when it repeats the department name). */}
                      {m.items.length === 1
                        ? link(m.items[0].href, m.label)
                        : (
                          <>
                            {!single && <p className="px-3 pt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-teal-light">{m.label}</p>}
                            {m.items.map((i) => link(i.href, i.label))}
                          </>
                        )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {nav.settings.length > 0 && (
          <div>
            <p className="mb-1 flex items-center gap-2 px-3 text-[11px] font-bold uppercase tracking-[0.16em] text-teal-light"><Settings aria-hidden="true" size={14} />Settings</p>
            <div className="space-y-0.5">{nav.settings.map((i) => link(i.href, i.label))}</div>
          </div>
        )}
      </div>
      </nav>
    </div>
  );

  return (
    <div className="min-h-screen bg-grey">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden h-dvh w-64 overflow-hidden bg-navy lg:block">{sidebar}</aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Admin menu">
          <button aria-label="Close menu" className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 h-dvh w-72 max-w-[85vw] overflow-hidden bg-navy shadow-xl">{sidebar}</aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-grey-200 bg-white px-4 sm:px-6">
          <button onClick={() => setOpen((v) => !v)} className="-ml-2 rounded p-2 text-navy hover:bg-grey lg:hidden" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open}>
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
          <Link href="/" target="_blank" rel="noopener" className="hidden items-center gap-1.5 text-sm text-grey-500 hover:text-navy lg:flex">
            <ExternalLink aria-hidden="true" size={14} /> View website
          </Link>
          <div className="ml-auto flex items-center gap-3">
            <Link href="/admin/approvals" className="relative rounded p-2 text-navy hover:bg-grey" aria-label={approvals > 0 ? `Approvals, ${approvals} waiting for you` : "Approvals"}>
              <ClipboardCheck aria-hidden="true" size={20} />
              {approvals > 0 && <span aria-hidden="true" className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-teal px-1 text-[10px] font-bold leading-none text-white">{approvals > 99 ? "99+" : approvals}</span>}
            </Link>
            <Link href="/admin/notifications" className="relative rounded p-2 text-navy hover:bg-grey" aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}>
              <Bell aria-hidden="true" size={20} />
              {unread > 0 && <span aria-hidden="true" className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber px-1 text-[10px] font-bold leading-none text-navy">{unread > 99 ? "99+" : unread}</span>}
            </Link>
            <Link href="/admin/account" className="flex items-center gap-2 rounded px-2 py-1 text-sm text-charcoal hover:bg-grey">
              <UserCircle aria-hidden="true" size={20} className="text-teal-dark" />
              <span className="hidden text-left leading-tight sm:block"><span className="block font-semibold text-navy">{user.name}</span><span className="block text-xs text-grey-500">{user.role}</span></span>
              <span className="sr-only sm:hidden">Account</span>
            </Link>
            <form action={signOut}>
              <button type="submit" className="flex items-center gap-1.5 rounded border border-grey-300 px-3 py-1.5 text-sm font-medium text-navy hover:bg-grey">
                <LogOut aria-hidden="true" size={15} /> <span className="hidden sm:inline">Sign out</span><span className="sr-only sm:hidden">Sign out</span>
              </button>
            </form>
          </div>
        </header>
        <main id="admin-main" className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
