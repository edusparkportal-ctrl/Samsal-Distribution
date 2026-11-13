import Link from "next/link";
import type { ReactNode } from "react";

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold text-navy">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-grey-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`card p-5 sm:p-6 ${className}`}>
      {title && <h2 className="mb-4 text-base font-bold text-navy">{title}</h2>}
      {children}
    </section>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "error" | "success"; children: ReactNode }) {
  const tones = {
    info: "border-teal/40 bg-teal-tint text-navy",
    warn: "border-amber/60 bg-amber/10 text-charcoal",
    error: "border-red-200 bg-red-50 text-red-800",
    success: "border-green-200 bg-green-50 text-green-900",
  } as const;
  return <div role={tone === "error" ? "alert" : "status"} className={`rounded-md border px-3.5 py-2.5 text-sm ${tones[tone]}`}>{children}</div>;
}

export function Badge({ children, tone = "grey" }: { children: ReactNode; tone?: "grey" | "teal" | "amber" | "red" | "green" | "navy" }) {
  const tones = {
    grey: "bg-grey-200 text-charcoal", teal: "bg-teal-tint text-teal-dark", amber: "bg-amber/20 text-charcoal",
    red: "bg-red-100 text-red-800", green: "bg-green-100 text-green-900", navy: "bg-navy text-white",
  } as const;
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}

export function StatCard({ label, value, href, hint }: { label: string; value: number | string; href?: string; hint?: string }) {
  const body = (
    <div className="card p-4 transition-shadow hover:shadow-md">
      <p className="text-xs font-semibold uppercase tracking-wide text-grey-500">{label}</p>
      <p className="mt-1 text-3xl font-bold text-navy">{value}</p>
      {hint && <p className="mt-1 text-xs text-grey-500">{hint}</p>}
    </div>
  );
  return href ? <Link href={href} className="block focus-visible:outline-2 focus-visible:outline-teal">{body}</Link> : body;
}
