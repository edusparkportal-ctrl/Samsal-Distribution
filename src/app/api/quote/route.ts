import { NextResponse } from "next/server";
import { inspectAttachment } from "@/lib/file-check";
import { MIN_FILL_MS, verifyToken } from "@/lib/form-token";
import { rateLimit } from "@/lib/rate-limit";
import {
  LIMITS,
  escapeHtml,
  safeFilename,
  sanitiseValues,
  validate,
  type FormKind,
  type FormValues,
} from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Request body = file (max 4 MB) + text fields. Anything larger is rejected before parsing.
const MAX_BODY_BYTES = LIMITS.maxFileBytes + 256 * 1024;

function json(body: Record<string, unknown>, status = 200, headers?: Record<string, string>) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

function clientIp(req: Request) {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "unknown").trim();
}

/** Only accept browser submissions from our own site (blocks simple cross-site posting). */
function originAllowed(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return true; // non-browser clients / same-origin GET-style requests: other checks still apply
  try {
    const o = new URL(origin);
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
    if (o.host === host) return true;
    const configured = process.env.NEXT_PUBLIC_SITE_URL;
    if (configured && o.host === new URL(configured).host) return true;
    return o.hostname === "localhost";
  } catch {
    return false;
  }
}

async function verifyTurnstile(token: string, ip: string) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // not configured -> skip
  if (!token) return false;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token, remoteip: ip }),
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

function buildEmail(kind: FormKind, v: FormValues, fileName: string | null) {
  const rows: [string, string][] =
    kind === "quote"
      ? [
          ["Organisation", v.organisation],
          ["Contact person", v.contactName],
          ["Email", v.email],
          ["Telephone", v.phone],
          ["Product / service", v.product],
          ["Category", v.category || "-"],
          ["Specifications", v.specifications],
          ["Quantity", v.quantity],
          ["Delivery location", v.deliveryLocation],
          ["Required by", v.deliveryDate],
          ["Additional instructions", v.instructions || "-"],
          ["Attachment", fileName ?? "None"],
        ]
      : [
          ["Organisation", v.organisation || "-"],
          ["Contact person", v.contactName],
          ["Email", v.email],
          ["Telephone", v.phone],
          ["Message", v.message],
        ];

  // Subject lines must be single-line; values are already stripped of newlines by sanitiseValues.
  const subject =
    kind === "quote"
      ? `Quote request: ${v.product} - ${v.organisation}`
      : `Website enquiry from ${v.contactName}${v.organisation ? ` (${v.organisation})` : ""}`;

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#263238;max-width:640px">
  <h2 style="color:#142D4E;margin:0 0 4px">${kind === "quote" ? "New quotation request" : "New website enquiry"}</h2>
  <p style="margin:0 0 16px;color:#6B7885">Submitted via the SAMSAL website</p>
  <table style="border-collapse:collapse;width:100%">
    ${rows
      .map(
        ([k, val]) =>
          `<tr><td style="padding:8px 12px;border:1px solid #E3E8ED;background:#F4F6F8;width:190px;vertical-align:top"><strong>${escapeHtml(k)}</strong></td><td style="padding:8px 12px;border:1px solid #E3E8ED;white-space:pre-wrap">${escapeHtml(val)}</td></tr>`,
      )
      .join("")}
  </table>
  <p style="margin-top:16px;color:#6B7885;font-size:12px">Reply directly to this email to respond to the customer.</p>
</div>`;

  const text = rows.map(([k, val]) => `${k}: ${val}`).join("\n");
  return { subject, html, text };
}

export async function POST(req: Request) {
  const ip = clientIp(req);

  // ---- Cheap rejections first (before reading the body) ----------------
  if (!originAllowed(req)) {
    return json({ ok: false, message: "This request was not accepted." }, 403);
  }
  const declaredLength = Number(req.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return json({ ok: false, message: "Your submission is too large. Attachments are limited to 4 MB." }, 413);
  }

  const rl = await rateLimit(`quote:${ip}`);
  if (!rl.ok) {
    return json(
      { ok: false, message: "Too many submissions. Please wait a few minutes and try again, or contact us directly." },
      429,
      { "Retry-After": String(rl.retryAfter) },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ ok: false, message: "We could not read your submission. Please try again." }, 400);
  }

  // ---- Spam protection -------------------------------------------------
  // 1. Honeypot: real users never see or fill this field. Bots get a silent "ok" so they do not adapt.
  if (String(form.get("website") ?? "") !== "") {
    return json({ ok: true, message: "Thank you." });
  }
  // 2. Server-signed timing token (cannot be forged by the client). Skipped only if FORM_TOKEN_SECRET is unset.
  const tokenResult = verifyToken(String(form.get("formToken") ?? ""));
  if (tokenResult !== "ok" && tokenResult !== "skipped") {
    const msg =
      tokenResult === "too_fast"
        ? "Please take a moment to review the form and submit again."
        : "Your form session expired. Please refresh the page and submit again.";
    return json({ ok: false, message: msg, retry: true, minWaitMs: MIN_FILL_MS }, 400);
  }
  // 3. Optional Cloudflare Turnstile
  if (!(await verifyTurnstile(String(form.get("cf-turnstile-response") ?? ""), ip))) {
    return json({ ok: false, message: "Spam check failed. Please refresh the page and try again." }, 400);
  }

  // ---- Validate --------------------------------------------------------
  const kind: FormKind = form.get("kind") === "enquiry" ? "enquiry" : "quote";
  const raw: Record<string, unknown> = {};
  form.forEach((value, key) => {
    if (typeof value === "string") raw[key] = value;
  });
  const values = sanitiseValues(raw);
  const errors = validate(kind, values);

  // Link-stuffing heuristic: free-text fields with many URLs are almost always spam.
  const freeText = `${values.specifications} ${values.instructions} ${values.message}`;
  if ((freeText.match(/https?:\/\//gi) ?? []).length > 3) {
    return json({ ok: false, message: "Please remove links from your message and try again." }, 422);
  }

  const fileEntry = form.get("attachment");
  const file = kind === "quote" && fileEntry instanceof File && fileEntry.size > 0 ? fileEntry : null;
  let attachmentBase64: string | null = null;
  let attachmentName: string | null = null;
  if (file) {
    // Checks size, extension, declared MIME type AND actual file content (magic bytes).
    const check = await inspectAttachment(file);
    if (!check.ok) errors.file = check.error;
    else {
      attachmentName = safeFilename(file.name);
      attachmentBase64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    }
  }

  if (Object.keys(errors).length > 0) {
    return json({ ok: false, message: "Please correct the highlighted fields.", errors }, 422);
  }

  // ---- Deliver ---------------------------------------------------------
  const apiKey = process.env.RESEND_API_KEY;
  const to = (process.env.QUOTE_TO_EMAIL ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const from = process.env.QUOTE_FROM_EMAIL || "SAMSAL Website <onboarding@resend.dev>";
  const { subject, html, text } = buildEmail(kind, values, attachmentName);

  if (!apiKey || to.length === 0) {
    if (process.env.NODE_ENV !== "production") {
      // Development only: show what would have been sent. The response says plainly that nothing was emailed.
      console.log("\n[quote api] Email not configured - would have sent:\n", subject, "\n", text, "\n");
      return json({
        ok: true,
        delivered: false,
        message: "Development mode: email is not configured, so nothing was emailed. The enquiry was logged in the terminal.",
      });
    }
    console.error("[quote api] RESEND_API_KEY or QUOTE_TO_EMAIL is not configured.");
    return json(
      {
        ok: false,
        message:
          "We could not send your request right now. Please contact us by telephone or WhatsApp, or try again later.",
      },
      503,
    );
  }

  let emailId: string | null = null;
  try {
    const payload: Record<string, unknown> = { from, to, reply_to: values.email, subject, html, text };
    if (attachmentBase64 && attachmentName) {
      payload.attachments = [{ filename: attachmentName, content: attachmentBase64 }];
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      console.error("[quote api] Resend error", res.status, await res.text());
      return json({ ok: false, message: "We could not send your request. Please try again shortly." }, 502);
    }
    // Success is reported only when the email provider accepted the message AND returned an id.
    const data = (await res.json().catch(() => ({}))) as { id?: string };
    emailId = typeof data.id === "string" && data.id ? data.id : null;
    if (!emailId) {
      console.error("[quote api] Resend returned no message id");
      return json({ ok: false, message: "We could not confirm that your request was sent. Please try again." }, 502);
    }
  } catch (err) {
    console.error("[quote api] Delivery failed", err);
    return json({ ok: false, message: "We could not send your request. Please try again shortly." }, 502);
  }

  // Nothing is stored: the enquiry exists only in the delivered email.
  return json({
    ok: true,
    delivered: true,
    message:
      kind === "quote"
        ? "Thank you. Your quotation request has been received and we will respond by email or telephone."
        : "Thank you. Your enquiry has been received and we will be in touch.",
  });
}
