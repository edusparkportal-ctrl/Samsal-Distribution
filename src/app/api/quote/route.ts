import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import {
  escapeHtml,
  safeFilename,
  sanitiseValues,
  validate,
  validateFile,
  type FormKind,
  type FormValues,
} from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIN_FILL_MS = 3000; // humans take longer than 3s to fill a form
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

function json(body: Record<string, unknown>, status = 200, headers?: Record<string, string>) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

function clientIp(req: Request) {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "unknown").trim();
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

  const rl = rateLimit(`quote:${ip}`);
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
  // 1. Honeypot: real users never see or fill this field.
  if (String(form.get("website") ?? "") !== "") {
    return json({ ok: true, message: "Thank you." }); // silently drop bots
  }
  // 2. Timing: bots submit instantly.
  const startedAt = Number(form.get("startedAt"));
  const age = Date.now() - startedAt;
  if (!Number.isFinite(startedAt) || age < MIN_FILL_MS || age > MAX_AGE_MS) {
    return json({ ok: false, message: "Please take a moment to review the form and submit again." }, 400);
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

  const fileEntry = form.get("attachment");
  const file = fileEntry instanceof File && fileEntry.size > 0 ? fileEntry : null;
  if (kind === "quote") {
    const fileError = validateFile(file);
    if (fileError) errors.file = fileError;
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

  const attachment = kind === "quote" ? file : null;
  const { subject, html, text } = buildEmail(kind, values, attachment ? safeFilename(attachment.name) : null);

  if (!apiKey || to.length === 0) {
    if (process.env.NODE_ENV !== "production") {
      // Development convenience: show what would have been sent.
      console.log("\n[quote api] Email not configured - would have sent:\n", subject, "\n", text, "\n");
      return json({ ok: true, message: "Thank you. (Development mode: email delivery is not configured.)" });
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

  try {
    const payload: Record<string, unknown> = {
      from,
      to,
      reply_to: values.email,
      subject,
      html,
      text,
    };
    if (attachment) {
      const buf = Buffer.from(await attachment.arrayBuffer());
      payload.attachments = [{ filename: safeFilename(attachment.name), content: buf.toString("base64") }];
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
  } catch (err) {
    console.error("[quote api] Delivery failed", err);
    return json({ ok: false, message: "We could not send your request. Please try again shortly." }, 502);
  }

  // Nothing is stored: the enquiry exists only in the delivered email.
  return json({
    ok: true,
    message:
      kind === "quote"
        ? "Thank you. Your quotation request has been received and we will respond by email or telephone."
        : "Thank you. Your enquiry has been received and we will be in touch.",
  });
}
