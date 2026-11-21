import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import RegisterForm from "./RegisterForm";
import { AuthShell } from "@/components/portal/AuthShell";

export const metadata: Metadata = { title: "Apply for a wholesale account", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function Page() {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || null;
  return (
    <AuthShell wide title="Apply for a wholesale account" subtitle="Tell us about your business. Approved customers see their own prices and can order online.">
      <RegisterForm siteKey={siteKey} nonce={nonce} />
      <p className="mt-6 border-t border-grey-200 pt-5 text-center text-sm text-charcoal">
        Already approved? <Link href="/portal/login" className="font-semibold text-teal-dark underline underline-offset-2">Sign in</Link>
      </p>
    </AuthShell>
  );
}
