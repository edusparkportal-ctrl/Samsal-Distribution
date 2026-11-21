"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPortalReset, type PortalAuthState } from "../actions";
import { AuthShell, FormError, FormMessage } from "@/components/portal/AuthShell";

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState<PortalAuthState, FormData>(requestPortalReset, {});
  return (
    <AuthShell title="Reset your password" subtitle="Enter your account email and we will send you a reset link.">
      <form action={action} className="space-y-5" noValidate>
        <div>
          <label htmlFor="email" className="field-label">Email address</label>
          <input id="email" name="email" type="email" inputMode="email" autoComplete="email" required className="field-input" />
        </div>
        {state.error && <FormError>{state.error}</FormError>}
        {state.message && <FormMessage>{state.message}</FormMessage>}
        <button type="submit" disabled={pending} className="btn-primary w-full justify-center">{pending ? "Sending…" : "Send reset link"}</button>
        <p className="text-center text-sm"><Link href="/portal/login" className="font-medium text-teal-dark underline underline-offset-2">Back to sign-in</Link></p>
      </form>
    </AuthShell>
  );
}
