/** Input validation for portal forms (pure functions, unit tested). The database re-checks everything that matters. */

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const KRA_PIN_RE = /^[A-Za-z][0-9]{9}[A-Za-z]$/;
const PHONE_RE = /^\+?[0-9][0-9\s-]{6,18}$/;

export type Registration = { companyName: string; contactName: string; email: string; phone: string; kraPin: string | null; location: string | null };

const clean = (v: FormDataEntryValue | null, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : "");

export function parseRegistration(fd: FormData): { ok: true; data: Registration } | { ok: false; error: string } {
  const companyName = clean(fd.get("company_name"), 160);
  const contactName = clean(fd.get("contact_name"), 120);
  const email = clean(fd.get("email"), 254).toLowerCase();
  const phone = clean(fd.get("phone"), 20);
  const kra = clean(fd.get("kra_pin"), 11).toUpperCase();
  const location = clean(fd.get("location"), 160);
  if (companyName.length < 2) return { ok: false, error: "Enter your company name." };
  if (!contactName) return { ok: false, error: "Enter the contact person's name." };
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Enter a valid work email address." };
  if (!PHONE_RE.test(phone)) return { ok: false, error: "Enter a phone number we can reach you on, for example 0712 345 678." };
  if (kra && !KRA_PIN_RE.test(kra)) return { ok: false, error: "A KRA PIN looks like A123456789B. Leave it blank if you do not have it to hand." };
  if (fd.get("terms") !== "on") return { ok: false, error: "Please confirm that you accept the Terms and the Privacy Policy." };
  return { ok: true, data: { companyName, contactName, email, phone, kraPin: kra || null, location: location || null } };
}

/** Returns a message when the password is too weak, otherwise null. */
export function passwordProblem(password: string, email = ""): string | null {
  if (password.length < 10) return "Use at least 10 characters.";
  if (password.length > 200) return "That password is too long.";
  if (!/[a-z]/i.test(password) || !/[0-9]/.test(password)) return "Include both letters and numbers.";
  const local = email.split("@")[0]?.toLowerCase();
  if (local && local.length >= 4 && password.toLowerCase().includes(local)) return "Do not use your email address in your password.";
  if (/^(.)\1+$/.test(password) || /password|123456|qwerty/i.test(password)) return "Choose a less common password.";
  return null;
}
