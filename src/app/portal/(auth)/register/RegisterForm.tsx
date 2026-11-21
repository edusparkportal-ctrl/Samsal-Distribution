"use client";

import { useActionState } from "react";
import Link from "next/link";
import Script from "next/script";
import { registerCustomer, type PortalAuthState } from "../actions";
import { FormError, FormMessage } from "@/components/portal/AuthShell";

export default function RegisterForm({ siteKey, nonce }: { siteKey: string | null; nonce?: string }) {
  const [state, action, pending] = useActionState<PortalAuthState, FormData>(registerCustomer, {});
  if (state.message) return <FormMessage>{state.message}</FormMessage>;
  return (
    <form action={action} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="company_name" className="field-label">Company name</label>
          <input id="company_name" name="company_name" required maxLength={160} autoComplete="organization" className="field-input" />
        </div>
        <div>
          <label htmlFor="contact_name" className="field-label">Contact person</label>
          <input id="contact_name" name="contact_name" required maxLength={120} autoComplete="name" className="field-input" />
        </div>
        <div>
          <label htmlFor="phone" className="field-label">Phone</label>
          <input id="phone" name="phone" type="tel" inputMode="tel" required maxLength={20} autoComplete="tel" placeholder="0712 345 678" className="field-input" />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="email" className="field-label">Work email</label>
          <input id="email" name="email" type="email" inputMode="email" required maxLength={254} autoComplete="email" className="field-input" />
        </div>
        <div>
          <label htmlFor="kra_pin" className="field-label">KRA PIN <span className="font-normal text-grey-500">(optional)</span></label>
          <input id="kra_pin" name="kra_pin" maxLength={11} autoCapitalize="characters" placeholder="A123456789B" className="field-input" />
        </div>
        <div>
          <label htmlFor="location" className="field-label">Town or area <span className="font-normal text-grey-500">(optional)</span></label>
          <input id="location" name="location" maxLength={160} autoComplete="address-level2" className="field-input" />
        </div>
      </div>
      <label className="flex items-start gap-2.5 text-sm text-charcoal">
        <input type="checkbox" name="terms" className="mt-1 h-4 w-4 rounded border-grey-300 text-teal" />
        <span>I accept the <Link href="/terms" className="font-semibold text-teal-dark underline" target="_blank">Terms</Link> and the <Link href="/privacy" className="font-semibold text-teal-dark underline" target="_blank">Privacy Policy</Link>.</span>
      </label>
      {siteKey ? (
        <>
          <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="lazyOnload" nonce={nonce} />
          <div className="cf-turnstile" data-sitekey={siteKey} />
        </>
      ) : process.env.NODE_ENV === "production" ? (
        <FormError>Registration is temporarily unavailable. Please contact us to open an account.</FormError>
      ) : null}
      {state.error && <FormError>{state.error}</FormError>}
      <button type="submit" disabled={pending || (!siteKey && process.env.NODE_ENV === "production")} className="btn-primary w-full justify-center">{pending ? "Sending…" : "Apply for an account"}</button>
      <p className="text-center text-sm text-grey-500">We email you a link to confirm your address. Our team approves each account before ordering opens.</p>
    </form>
  );
}
