/**
 * Safaricom Daraja (M-Pesa Express / STK Push) client. PURE: no database, no framework, `fetch` is injected,
 * so the whole flow is unit tested against a simulated Safaricom (tests/mpesa.test.ts).
 *
 * Environment (all server-side, none public):
 *   MPESA_ENV              "sandbox" (default) or "production"
 *   MPESA_CONSUMER_KEY / MPESA_CONSUMER_SECRET
 *   MPESA_SHORTCODE        paybill number, or the head-office number for a till
 *   MPESA_PASSKEY          Lipa Na M-Pesa online passkey
 *   MPESA_CALLBACK_TOKEN   long random string; becomes part of the callback URL path (min 24 characters)
 *   MPESA_TRANSACTION_TYPE "CustomerPayBillOnline" (default) or "CustomerBuyGoodsOnline"
 *   MPESA_PARTY_B          optional; the till number when buying goods (defaults to the shortcode)
 * The feature stays OFF unless every required value is present AND staff switch it on in the portal settings.
 */
import { createHash, timingSafeEqual } from "node:crypto";

export type MpesaConfig = {
  baseUrl: string;
  consumerKey: string;
  consumerSecret: string;
  shortcode: string;
  passkey: string;
  callbackToken: string;
  transactionType: "CustomerPayBillOnline" | "CustomerBuyGoodsOnline";
  partyB: string;
};

export type Env = Record<string, string | undefined>;
export type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

const clean = (v: string | undefined) => (v ?? "").trim();

/** Returns null (feature off) unless every required value is present and sane. */
export function mpesaConfig(env: Env = process.env): MpesaConfig | null {
  const key = clean(env.MPESA_CONSUMER_KEY), secret = clean(env.MPESA_CONSUMER_SECRET), shortcode = clean(env.MPESA_SHORTCODE);
  const passkey = clean(env.MPESA_PASSKEY), token = clean(env.MPESA_CALLBACK_TOKEN);
  if (!key || !secret || !passkey) return null;
  if (!/^\d{5,10}$/.test(shortcode)) return null;
  if (!/^[A-Za-z0-9_-]{24,128}$/.test(token)) return null;
  const type = clean(env.MPESA_TRANSACTION_TYPE) === "CustomerBuyGoodsOnline" ? "CustomerBuyGoodsOnline" : "CustomerPayBillOnline";
  const partyB = clean(env.MPESA_PARTY_B) || shortcode;
  if (!/^\d{5,10}$/.test(partyB)) return null;
  const production = clean(env.MPESA_ENV).toLowerCase() === "production";
  return { baseUrl: production ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke", consumerKey: key, consumerSecret: secret, shortcode, passkey, callbackToken: token, transactionType: type, partyB };
}

/** Daraja timestamp, YYYYMMDDHHmmss, in Nairobi time. */
export function darajaTimestamp(now = new Date()): string {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
    .formatToParts(now).reduce<Record<string, string>>((a, x) => { a[x.type] = x.value; return a; }, {});
  return `${p.year}${p.month}${p.day}${p.hour}${p.minute}${p.second}`;
}

export const darajaPassword = (shortcode: string, passkey: string, ts: string) => Buffer.from(`${shortcode}${passkey}${ts}`).toString("base64");

/** Constant-time check of the secret callback path token. */
export function tokenMatches(given: string, expected: string): boolean {
  const a = createHash("sha256").update(String(given)).digest(), b = createHash("sha256").update(String(expected)).digest();
  return timingSafeEqual(a, b);
}

async function call(f: FetchLike, url: string, init: Parameters<FetchLike>[1]) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15_000);
  try { return await f(url, { ...init, signal: ctl.signal }); } finally { clearTimeout(timer); }
}

export async function getToken(cfg: MpesaConfig, f: FetchLike): Promise<string> {
  const basic = Buffer.from(`${cfg.consumerKey}:${cfg.consumerSecret}`).toString("base64");
  const r = await call(f, `${cfg.baseUrl}/oauth/v1/generate?grant_type=client_credentials`, { method: "GET", headers: { Authorization: `Basic ${basic}` } });
  const j = (await r.json().catch(() => null)) as { access_token?: string } | null;
  if (!r.ok || !j?.access_token) throw new Error("M-Pesa sign-in failed");
  return j.access_token;
}

export type StkRequest = { amount: number; phone: string; accountRef: string; description: string; callbackUrl: string };
export type StkAccepted = { merchantRequestId: string; checkoutRequestId: string };

/** Sends the prompt to the customer's phone. Throws a customer-safe Error when Safaricom does not accept it. */
export async function stkPush(cfg: MpesaConfig, req: StkRequest, f: FetchLike, now = new Date()): Promise<StkAccepted> {
  if (!/^254[17]\d{8}$/.test(req.phone)) throw new Error("Invalid phone number");
  if (!Number.isInteger(req.amount) || req.amount < 1 || req.amount > 250000) throw new Error("Invalid amount");
  if (!req.callbackUrl.startsWith("https://")) throw new Error("The callback URL must be https");
  const token = await getToken(cfg, f);
  const ts = darajaTimestamp(now);
  const body = {
    BusinessShortCode: cfg.shortcode, Password: darajaPassword(cfg.shortcode, cfg.passkey, ts), Timestamp: ts, TransactionType: cfg.transactionType,
    Amount: req.amount, PartyA: req.phone, PartyB: cfg.partyB, PhoneNumber: req.phone, CallBackURL: req.callbackUrl,
    AccountReference: req.accountRef.slice(0, 12), TransactionDesc: req.description.slice(0, 13),
  };
  const r = await call(f, `${cfg.baseUrl}/mpesa/stkpush/v1/processrequest`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = (await r.json().catch(() => null)) as { ResponseCode?: string; MerchantRequestID?: string; CheckoutRequestID?: string } | null;
  if (!r.ok || !j || String(j.ResponseCode) !== "0" || !j.CheckoutRequestID) throw new Error("Safaricom did not accept the request");
  return { merchantRequestId: String(j.MerchantRequestID ?? ""), checkoutRequestId: String(j.CheckoutRequestID) };
}

export type StkQueryResult = { resultCode: number; description: string };

/** Asks Safaricom what happened to a request. Returns null when the answer is not available yet. */
export async function stkQuery(cfg: MpesaConfig, checkoutRequestId: string, f: FetchLike, now = new Date()): Promise<StkQueryResult | null> {
  const token = await getToken(cfg, f);
  const ts = darajaTimestamp(now);
  const r = await call(f, `${cfg.baseUrl}/mpesa/stkpushquery/v1/query`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ BusinessShortCode: cfg.shortcode, Password: darajaPassword(cfg.shortcode, cfg.passkey, ts), Timestamp: ts, CheckoutRequestID: checkoutRequestId }),
  });
  const j = (await r.json().catch(() => null)) as { ResultCode?: string | number; ResultDesc?: string; errorCode?: string } | null;
  if (!r.ok || !j || j.ResultCode === undefined || j.ResultCode === null || j.ResultCode === "") return null;   // e.g. "still being processed"
  const code = Number(j.ResultCode);
  if (!Number.isInteger(code)) return null;
  return { resultCode: code, description: String(j.ResultDesc ?? "").slice(0, 300) };
}

export type ParsedCallback = { checkoutRequestId: string; merchantRequestId: string; resultCode: number; description: string; receipt: string | null; amount: number | null; phone: string | null };

/** Reads Safaricom's callback body. Returns null for anything that is not a well-formed STK callback. */
export function parseCallback(body: unknown): ParsedCallback | null {
  const cb = (body as { Body?: { stkCallback?: Record<string, unknown> } } | null)?.Body?.stkCallback;
  if (!cb || typeof cb !== "object") return null;
  const checkout = cb.CheckoutRequestID, code = Number(cb.ResultCode);
  if (typeof checkout !== "string" || !/^[A-Za-z0-9_-]{6,80}$/.test(checkout) || !Number.isInteger(code)) return null;
  const items = (cb.CallbackMetadata as { Item?: { Name?: string; Value?: unknown }[] } | undefined)?.Item;
  const get = (n: string) => (Array.isArray(items) ? items.find((i) => i?.Name === n)?.Value : undefined);
  const amount = Number(get("Amount"));
  const receipt = get("MpesaReceiptNumber");
  const phone = get("PhoneNumber");
  return {
    checkoutRequestId: checkout, merchantRequestId: String(cb.MerchantRequestID ?? "").slice(0, 80), resultCode: code, description: String(cb.ResultDesc ?? "").slice(0, 300),
    receipt: typeof receipt === "string" ? receipt.trim().toUpperCase() : null, amount: Number.isFinite(amount) && get("Amount") !== undefined ? amount : null, phone: phone !== undefined ? String(phone) : null,
  };
}

export type Complete = (checkout: string, code: number, desc: string, receipt: string | null, amount: number | null, phone: string | null) => Promise<string>;

/**
 * Handles one callback. A "success" is NEVER trusted on its own: it is credited only after Safaricom confirms
 * the same request succeeded when we ask for it ourselves. Failures need no confirmation (they credit nothing).
 * Returns the resulting status, or "ignored" for malformed or unconfirmed input. Never throws.
 */
export async function processCallback(body: unknown, deps: { cfg: MpesaConfig; fetch: FetchLike; complete: Complete }): Promise<string> {
  const cb = parseCallback(body);
  if (!cb) return "ignored";
  try {
    if (cb.resultCode === 0) {
      const q = await stkQuery(deps.cfg, cb.checkoutRequestId, deps.fetch);
      if (!q || q.resultCode !== 0) return "ignored";   // not confirmed: leave it pending; the status check will settle it
    }
    return await deps.complete(cb.checkoutRequestId, cb.resultCode, cb.description, cb.receipt, cb.amount, cb.phone);
  } catch {
    return "ignored";
  }
}

/**
 * Settles a request whose callback never arrived. STK Query has no receipt number, so a confirmed success is
 * passed on WITHOUT one: the database parks it as "needs review" for staff instead of crediting it blind.
 */
export async function reconcile(checkoutRequestId: string, deps: { cfg: MpesaConfig; fetch: FetchLike; complete: Complete }): Promise<string | null> {
  try {
    const q = await stkQuery(deps.cfg, checkoutRequestId, deps.fetch);
    if (!q) return null;
    return await deps.complete(checkoutRequestId, q.resultCode, q.description, null, null, null);
  } catch {
    return null;
  }
}

/** A callback URL on our own site; the token is the secret. */
export const callbackUrl = (siteUrl: string, token: string) => `${siteUrl.replace(/\/$/, "")}/api/mpesa/callback/${token}`;
