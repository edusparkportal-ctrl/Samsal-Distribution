import Link from "next/link";
import { headers } from "next/headers";
import { Notice } from "@/components/admin/ui";
import { MFA_MARKER } from "@/lib/security/mfa";

/**
 * Shows the ?ok= / ?error= message left by lib/admin/forms.flash().
 * When the message is the database's "needs a fresh authenticator code" notice, it also offers a
 * "Verify now" link that brings the person back to this page afterwards.
 */
export async function Flash({ ok, error }: { ok?: string; error?: string }) {
  if (!ok && !error) return null;
  if (error?.includes(MFA_MARKER)) {
    const path = (await headers()).get("x-pathname") ?? "/admin";
    return (
      <div className="mb-5">
        <Notice tone="error">
          {error.replace(MFA_MARKER, "").trim()}{" "}
          <Link href={`/admin/mfa/verify?next=${encodeURIComponent(path.startsWith("/admin") ? path : "/admin")}&fresh=1`} className="font-semibold underline underline-offset-2">
            Verify now
          </Link>
        </Notice>
      </div>
    );
  }
  return (
    <div className="mb-5">
      {error ? <Notice tone="error">{error}</Notice> : <Notice tone="success">{ok}</Notice>}
    </div>
  );
}
