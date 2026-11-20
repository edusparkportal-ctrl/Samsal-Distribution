import { NextResponse } from "next/server";
import { inspectAttachment } from "@/lib/file-check";
import { MIN_FILL_MS, consumeToken, verifyToken } from "@/lib/form-token";
import { verifyTurnstile } from "@/lib/captcha";
import { clientIp as ipFrom, originAllowed as originOk } from "@/lib/security/request";
import { missingPublicFormControls } from "@/lib/security/env";
import { logSecurityEvent } from "@/lib/security/events";
import { saveWebsiteEnquiry } from "@/lib/enquiries";
import { dispatchOutbox } from "@/lib/automation/dispatch";
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

const clientIp = (req: Request) => ipFrom(req.headers);
const originAllowed = (req: Request) => originOk(req.headers);

const UNAVAILABLE =
  "Online requests are temporarily unavailable. Please contact us by telephone or WhatsApp, or try again later.";

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
    await logSecurityEvent("origin_rejected", { severity: "info", ip, detail: { where: "quote" } });
    return json({ ok: false, message: "This request was not accepted." }, 403);
  }

  // FAIL CLOSED: in production the spam controls are mandatory. If any is not configured, nothing is accepted.
  if (process.env.NODE_ENV === "production") {
    const missing = missingPublicFormControls();
    if (missing.length > 0) {
      console.error(`[quote api] Refusing submissions: required security settings are missing: ${missing.join(", ")}`);
      await logSecurityEvent("config_missing", { severity: "critical", detail: { where: "quote", missing: missing.join(",") } });
      return json({ ok: false, message: UNAVAILABLE }, 503);
    }
  }

  // The body size must be declared (browsers always declare it) and within the limit, before anything is read.
  const declaredLength = Number(req.headers.get("content-length"));
  if (!Number.isFinite(declaredLength) || declaredLength <= 0) {
    return json({ ok: false, message: "This request was not accepted." }, 411);
  }
  if (declaredLength > MAX_BODY_BYTES) {
    return json({ ok: false, message: "Your submission is too large. Attachments are limited to 4 MB." }, 413);
  }

  const rl = await rateLimit(`quote:${ip}`); // fails closed when the shared store is unavailable
  if (!rl.ok) {
    await logSecurityEvent("ratelimit_block", { severity: rl.reason === "limited" ? "info" : "critical", ip, detail: { where: "quote", reason: rl.reason ?? "limited" } });
    if (rl.reason !== "limited") return json({ ok: false, message: UNAVAILABLE }, 503, { "Retry-After": String(rl.retryAfter) });
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
  // 2. Server-signed, single-use timing token (cannot be forged by the client). Mandatory in production.
  const formToken = String(form.get("formToken") ?? "");
  const tokenResult = verifyToken(formToken);
  if (tokenResult === "unconfigured") return json({ ok: false, message: UNAVAILABLE }, 503);
  if (tokenResult !== "ok" && tokenResult !== "skipped") {
    await logSecurityEvent("token_failed", { severity: "info", ip, detail: { reason: tokenResult } });
    const msg =
      tokenResult === "too_fast"
        ? "Please take a moment to review the form and submit again."
        : "Your form session expired. Please refresh the page and submit again.";
    return json({ ok: false, message: msg, retry: true, minWaitMs: MIN_FILL_MS }, 400);
  }
  if (tokenResult === "ok" && !(await consumeToken(formToken))) {
    await logSecurityEvent("token_failed", { severity: "warning", ip, detail: { reason: "replayed" } });
    return json({ ok: false, message: "Your form session expired. Please refresh the page and submit again.", retry: true, minWaitMs: MIN_FILL_MS }, 400);
  }
  // 3. Cloudflare Turnstile. Mandatory in production: a missing secret, token or an unreachable service all refuse.
  const captcha = await verifyTurnstile(String(form.get("cf-turnstile-response") ?? ""), ip);
  if (!captcha.ok) {
    await logSecurityEvent("captcha_failed", { severity: captcha.reason === "unconfigured" ? "critical" : "info", ip, detail: { reason: captcha.reason } });
    if (captcha.reason === "unconfigured" || captcha.reason === "unavailable") return json({ ok: false, message: UNAVAILABLE }, 503);
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

  // ---- Store in the CRM (never throws; null when the database is not configured or unavailable) ----
  const reference = await saveWebsiteEnquiry(kind, values, attachmentName);
  const saved = reference !== null;
  // Send the acknowledgement email the database just queued (does nothing unless email automation is on).
  if (saved) {
    try {
      await dispatchOutbox(5);
    } catch {
      /* the enquiry is already saved; the daily dispatch will pick the email up */
    }
  }
  const thanks = {
    ok: true,
    message:
      kind === "quote"
        ? "Thank you. Your quotation request has been received and we will respond by email or telephone."
        : "Thank you. Your enquiry has been received and we will be in touch.",
    ...(reference ? { reference } : {}),
  };

  // ---- Deliver ---------------------------------------------------------
  const apiKey = process.env.RESEND_API_KEY;
  const to = (process.env.QUOTE_TO_EMAIL ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const from = process.env.QUOTE_FROM_EMAIL || "SAMSAL Website <onboarding@resend.dev>";
  const built = buildEmail(kind, values, attachmentName);
  const subject = reference ? `[${reference}] ${built.subject}` : built.subject;
  const { html, text } = built;

  if (!apiKey || to.length === 0) {
    if (saved) return json({ ...thanks, delivered: false });
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
      if (saved) return json({ ...thanks, delivered: false });
      return json({ ok: false, message: "We could not send your request. Please try again shortly." }, 502);
    }
    // Success is reported only when the email provider accepted the message AND returned an id.
    const data = (await res.json().catch(() => ({}))) as { id?: string };
    emailId = typeof data.id === "string" && data.id ? data.id : null;
    if (!emailId) {
      console.error("[quote api] Resend returned no message id");
      if (saved) return json({ ...thanks, delivered: false });
      return json({ ok: false, message: "We could not confirm that your request was sent. Please try again." }, 502);
    }
  } catch (err) {
    console.error("[quote api] Delivery failed", err);
    if (saved) return json({ ...thanks, delivered: false });
    return json({ ok: false, message: "We could not send your request. Please try again shortly." }, 502);
  }

  return json({ ...thanks, delivered: true });
}
