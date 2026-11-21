import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/Logo";

/** Centred card used by the portal sign-in, registration and password pages. */
export function AuthShell({ title, subtitle, children, wide = false }: { title: string; subtitle?: string; children: ReactNode; wide?: boolean }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-navy px-4 py-10">
      <div className={`w-full ${wide ? "max-w-xl" : "max-w-md"}`}>
        <div className="mb-8 flex justify-center"><Logo onDark /></div>
        <div className="rounded-lg bg-white p-6 shadow-xl sm:p-8">
          <h1 className="text-xl font-bold text-navy">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-grey-500">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
        <p className="mt-6 text-center text-xs text-white/70"><Link href="/" className="underline underline-offset-2">Back to the website</Link></p>
      </div>
    </main>
  );
}

export function FormError({ children }: { children: ReactNode }) {
  return <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{children}</p>;
}
export function FormMessage({ children }: { children: ReactNode }) {
  return <p role="status" className="rounded-md border border-teal/40 bg-teal-tint px-3 py-2 text-sm text-navy">{children}</p>;
}
