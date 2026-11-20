"use client";

import { useActionState } from "react";
import { verifyMfa, type MfaState } from "../actions";

export default function VerifyForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<MfaState, FormData>(verifyMfa, {});
  return (
    <form action={action} className="space-y-5" noValidate>
      <input type="hidden" name="next" value={next} />
      <div>
        <label htmlFor="code" className="field-label">Authenticator code</label>
        <input id="code" name="code" inputMode="numeric" pattern="[0-9]*" autoComplete="one-time-code" maxLength={7} required autoFocus
          className="field-input text-center text-2xl tracking-[0.4em]" aria-describedby="code-help" />
        <p id="code-help" className="mt-1 text-xs text-grey-500">Open your authenticator app and type the 6-digit code for SAMSAL Admin.</p>
      </div>
      {state.error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn-primary w-full justify-center disabled:opacity-60">{pending ? "Checking…" : "Verify"}</button>
    </form>
  );
}
