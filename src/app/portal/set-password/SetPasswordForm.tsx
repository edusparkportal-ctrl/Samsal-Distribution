"use client";

import { useActionState } from "react";
import { setPortalPassword, type PortalAuthState } from "../(auth)/actions";
import { FormError } from "@/components/portal/AuthShell";

export default function SetPasswordForm({ change = false }: { change?: boolean }) {
  const [state, action, pending] = useActionState<PortalAuthState, FormData>(setPortalPassword, {});
  return (
    <form action={action} className="space-y-5" noValidate>
      {change && (
        <>
          <input type="hidden" name="mode" value="change" />
          <div>
            <label htmlFor="current" className="field-label">Current password</label>
            <input id="current" name="current" type="password" autoComplete="current-password" required className="field-input" />
          </div>
        </>
      )}
      <div>
        <label htmlFor="password" className="field-label">New password</label>
        <input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} className="field-input" />
      </div>
      <div>
        <label htmlFor="confirm" className="field-label">Repeat the password</label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={10} className="field-input" />
      </div>
      {state.error && <FormError>{state.error}</FormError>}
      <button type="submit" disabled={pending} className="btn-primary w-full justify-center">{pending ? "Saving…" : "Save password"}</button>
    </form>
  );
}
