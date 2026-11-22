/** M-Pesa (Daraja) tests against a SIMULATED Safaricom. No network. Run: npm run test:mpesa */
import assert from "node:assert/strict";
import { callbackUrl, darajaPassword, darajaTimestamp, getToken, mpesaConfig, parseCallback, processCallback, reconcile, stkPush, stkQuery, tokenMatches, type Complete, type FetchLike } from "@/lib/mpesa/daraja";
import { buildInvoicePdf } from "@/lib/invoice-pdf";
import { invoiceStatus, parseShillings, quoteStatus } from "@/lib/portal/format";

let passed = 0;
const failures: string[] = [];
const queue: { name: string; fn: () => Promise<void> | void }[] = [];
const t = (name: string, fn: () => Promise<void> | void) => queue.push({ name, fn });

const ENV = { MPESA_ENV: "sandbox", MPESA_CONSUMER_KEY: "key", MPESA_CONSUMER_SECRET: "secret", MPESA_SHORTCODE: "174379", MPESA_PASSKEY: "passkey", MPESA_CALLBACK_TOKEN: "abcdefghijklmnopqrstuvwxyz012345" };
const cfg = mpesaConfig(ENV)!;

/** A tiny fake Safaricom: remembers requests and lets a test decide how a checkout ends. */
function safaricom(opts: { queryResult?: (checkout: string) => { ResultCode: string; ResultDesc: string } | null; rejectPush?: boolean; badAuth?: boolean } = {}) {
  const calls: { url: string; body: any; auth?: string }[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
  const f: FetchLike = async (url, init) => {
    const body = init?.body ? JSON.parse(init.body) : null;
    calls.push({ url, body, auth: init?.headers?.Authorization });
    const ok = (j: unknown) => ({ ok: true, status: 200, json: async () => j });
    if (url.includes("/oauth/v1/generate")) return opts.badAuth ? { ok: false, status: 400, json: async () => ({}) } : ok({ access_token: "tok123", expires_in: "3599" });
    if (init?.headers?.Authorization !== "Bearer tok123") return { ok: false, status: 401, json: async () => ({ errorCode: "401.003.01" }) };
    if (url.endsWith("/mpesa/stkpush/v1/processrequest")) return opts.rejectPush ? ok({ ResponseCode: "1", ResponseDescription: "no" }) : ok({ MerchantRequestID: "MR-1", CheckoutRequestID: "ws_CO_TEST1", ResponseCode: "0", ResponseDescription: "Success" });
    if (url.endsWith("/mpesa/stkpushquery/v1/query")) {
      const r = opts.queryResult ? opts.queryResult(body.CheckoutRequestID) : { ResultCode: "0", ResultDesc: "The service request is processed successfully." };
      return r ? ok(r) : { ok: false, status: 500, json: async () => ({ errorCode: "500.001.1001", errorMessage: "The transaction is being processed" }) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  return { f, calls };
}

/** In-memory stand-in for the database function: applies a result once, like mpesa_complete. */
function fakeDb(amount = 5000) {
  const state = { status: "pending", credited: 0, receipts: new Set<string>(), log: [] as string[] };
  const complete: Complete = async (checkout, code, _d, receipt, amt) => {
    if (checkout !== "ws_CO_TEST1") return "unknown";
    if (state.status !== "pending") return state.status;
    if (code !== 0) return (state.status = code === 1032 ? "cancelled" : "failed");
    if (!receipt || state.receipts.has(receipt) || amt !== amount) return (state.status = "needs_review");
    state.receipts.add(receipt); state.credited += amt; return (state.status = "succeeded");
  };
  return { state, complete };
}
const callbackBody = (over: Record<string, unknown> = {}, items?: unknown[]) => ({ Body: { stkCallback: { MerchantRequestID: "MR-1", CheckoutRequestID: "ws_CO_TEST1", ResultCode: 0, ResultDesc: "The service request is processed successfully.",
  CallbackMetadata: { Item: items ?? [{ Name: "Amount", Value: 5000 }, { Name: "MpesaReceiptNumber", Value: "QWE12RTY34" }, { Name: "TransactionDate", Value: 20261121120000 }, { Name: "PhoneNumber", Value: 254712345678 }] }, ...over } } });

t("configuration is off unless every value is present and sane", () => {
  assert.ok(cfg); assert.equal(cfg.baseUrl, "https://sandbox.safaricom.co.ke"); assert.equal(cfg.partyB, "174379");
  assert.equal(mpesaConfig({}), null);
  for (const k of Object.keys(ENV)) if (k !== "MPESA_ENV") assert.equal(mpesaConfig({ ...ENV, [k]: "" }), null, `missing ${k}`);
  assert.equal(mpesaConfig({ ...ENV, MPESA_CALLBACK_TOKEN: "short" }), null);
  assert.equal(mpesaConfig({ ...ENV, MPESA_CALLBACK_TOKEN: "has spaces and is long enough to pass"}), null);
  assert.equal(mpesaConfig({ ...ENV, MPESA_SHORTCODE: "12ab" }), null);
  assert.equal(mpesaConfig({ ...ENV, MPESA_ENV: "production" })!.baseUrl, "https://api.safaricom.co.ke");
  assert.equal(mpesaConfig({ ...ENV, MPESA_ENV: "PRODUCTION " })!.baseUrl, "https://api.safaricom.co.ke");
  assert.equal(mpesaConfig({ ...ENV, MPESA_TRANSACTION_TYPE: "CustomerBuyGoodsOnline", MPESA_PARTY_B: "654321" })!.partyB, "654321");
});
t("timestamp is Nairobi time in Daraja format and the password is base64(shortcode+passkey+timestamp)", () => {
  assert.equal(darajaTimestamp(new Date("2026-11-21T09:05:07Z")), "20261121120507");
  assert.equal(darajaTimestamp(new Date("2026-12-31T21:30:00Z")), "20270101003000");
  assert.equal(darajaPassword("174379", "pk", "20261121120507"), Buffer.from("174379pk20261121120507").toString("base64"));
});
t("callback token comparison is exact", () => {
  assert.ok(tokenMatches(ENV.MPESA_CALLBACK_TOKEN, ENV.MPESA_CALLBACK_TOKEN));
  assert.ok(!tokenMatches(ENV.MPESA_CALLBACK_TOKEN + "x", ENV.MPESA_CALLBACK_TOKEN)); assert.ok(!tokenMatches("", ENV.MPESA_CALLBACK_TOKEN)); assert.ok(!tokenMatches("abc", ENV.MPESA_CALLBACK_TOKEN));
});
t("callback URL is https on our site with the token in the path", () => { assert.equal(callbackUrl("https://samsal.co.ke/", "tok"), "https://samsal.co.ke/api/mpesa/callback/tok"); });
t("token request uses basic auth and fails safely", async () => {
  const s = safaricom(); assert.equal(await getToken(cfg, s.f), "tok123");
  assert.equal(s.calls[0].auth, `Basic ${Buffer.from("key:secret").toString("base64")}`);
  await assert.rejects(() => getToken(cfg, safaricom({ badAuth: true }).f), /sign-in failed/);
});
t("STK push sends the right request and returns the checkout id", async () => {
  const s = safaricom();
  const r = await stkPush(cfg, { amount: 5000, phone: "254712345678", accountRef: "INV-2026-00012-LONG", description: "Invoice INV-2026-00012", callbackUrl: callbackUrl("https://samsal.co.ke", cfg.callbackToken) }, s.f, new Date("2026-11-21T09:05:07Z"));
  assert.deepEqual(r, { merchantRequestId: "MR-1", checkoutRequestId: "ws_CO_TEST1" });
  const b = s.calls[1].body;
  assert.equal(b.BusinessShortCode, "174379"); assert.equal(b.Amount, 5000); assert.equal(b.PartyA, "254712345678"); assert.equal(b.PhoneNumber, "254712345678"); assert.equal(b.PartyB, "174379");
  assert.equal(b.TransactionType, "CustomerPayBillOnline"); assert.equal(b.Timestamp, "20261121120507"); assert.equal(b.Password, darajaPassword("174379", "passkey", "20261121120507"));
  assert.equal(b.AccountReference.length, 12); assert.ok(b.TransactionDesc.length <= 13); assert.equal(b.CallBackURL, `https://samsal.co.ke/api/mpesa/callback/${cfg.callbackToken}`);
  assert.equal(s.calls[1].auth, "Bearer tok123");
});
t("STK push refuses bad input before calling Safaricom", async () => {
  const s = safaricom(); const base = { amount: 100, phone: "254712345678", accountRef: "A", description: "B", callbackUrl: "https://x.test/cb" };
  await assert.rejects(() => stkPush(cfg, { ...base, phone: "0712345678" }, s.f), /phone/i);
  await assert.rejects(() => stkPush(cfg, { ...base, amount: 0 }, s.f), /amount/i);
  await assert.rejects(() => stkPush(cfg, { ...base, amount: 10.5 }, s.f), /amount/i);
  await assert.rejects(() => stkPush(cfg, { ...base, amount: 250001 }, s.f), /amount/i);
  await assert.rejects(() => stkPush(cfg, { ...base, callbackUrl: "http://x.test/cb" }, s.f), /https/);
  assert.equal(s.calls.length, 0);
});
t("a push Safaricom rejects raises a safe error", async () => {
  await assert.rejects(() => stkPush(cfg, { amount: 100, phone: "254712345678", accountRef: "A", description: "B", callbackUrl: "https://x.test/cb" }, safaricom({ rejectPush: true }).f), /did not accept/);
});
t("STK query returns the result code, or null while still processing", async () => {
  assert.deepEqual(await stkQuery(cfg, "ws_CO_TEST1", safaricom().f), { resultCode: 0, description: "The service request is processed successfully." });
  assert.equal((await stkQuery(cfg, "x", safaricom({ queryResult: () => ({ ResultCode: "1032", ResultDesc: "Request cancelled by user" }) }).f))!.resultCode, 1032);
  assert.equal(await stkQuery(cfg, "x", safaricom({ queryResult: () => null }).f), null);
});
t("parseCallback reads a success and a failure, and rejects junk", () => {
  const ok = parseCallback(callbackBody())!;
  assert.deepEqual([ok.checkoutRequestId, ok.resultCode, ok.receipt, ok.amount, ok.phone], ["ws_CO_TEST1", 0, "QWE12RTY34", 5000, "254712345678"]);
  const fail = parseCallback({ Body: { stkCallback: { CheckoutRequestID: "ws_CO_TEST1", MerchantRequestID: "m", ResultCode: 1032, ResultDesc: "Request cancelled by user" } } })!;
  assert.equal(fail.resultCode, 1032); assert.equal(fail.receipt, null); assert.equal(fail.amount, null);
  for (const bad of [null, undefined, "x", 1, {}, { Body: {} }, { Body: { stkCallback: {} } }, { Body: { stkCallback: { CheckoutRequestID: "a b", ResultCode: 0 } } }, { Body: { stkCallback: { CheckoutRequestID: "ws_CO_TEST1", ResultCode: "x" } } }, { Body: { stkCallback: { CheckoutRequestID: "../../etc", ResultCode: 0 } } }])
    assert.equal(parseCallback(bad), null, JSON.stringify(bad));
});
t("a genuine success is confirmed with Safaricom, then applied once", async () => {
  const s = safaricom(); const db = fakeDb();
  assert.equal(await processCallback(callbackBody(), { cfg, fetch: s.f, complete: db.complete }), "succeeded");
  assert.equal(db.state.credited, 5000);
  assert.ok(s.calls.some((c) => c.url.endsWith("/stkpushquery/v1/query")), "confirmed through STK Query");
});
t("a repeated callback never pays twice", async () => {
  const s = safaricom(); const db = fakeDb();
  for (let i = 0; i < 3; i++) await processCallback(callbackBody(), { cfg, fetch: s.f, complete: db.complete });
  assert.equal(db.state.credited, 5000);
});
t("a forged success is ignored when Safaricom does not confirm it", async () => {
  const db = fakeDb();
  for (const q of [() => ({ ResultCode: "1032", ResultDesc: "cancelled" }), () => ({ ResultCode: "1", ResultDesc: "insufficient" }), () => null]) {
    assert.equal(await processCallback(callbackBody(), { cfg, fetch: safaricom({ queryResult: q }).f, complete: db.complete }), "ignored");
  }
  assert.equal(db.state.credited, 0); assert.equal(db.state.status, "pending");
});
t("a forged success for an unknown checkout credits nothing", async () => {
  const db = fakeDb();
  assert.equal(await processCallback(callbackBody({ CheckoutRequestID: "ws_CO_NOPE" }), { cfg, fetch: safaricom().f, complete: db.complete }), "unknown");
  assert.equal(db.state.credited, 0);
});
t("a different amount goes to review instead of being applied", async () => {
  const db = fakeDb(5000);
  assert.equal(await processCallback(callbackBody({}, [{ Name: "Amount", Value: 4000 }, { Name: "MpesaReceiptNumber", Value: "QWE12RTY34" }]), { cfg, fetch: safaricom().f, complete: db.complete }), "needs_review");
  assert.equal(db.state.credited, 0);
});
t("a callback without a receipt number goes to review", async () => {
  const db = fakeDb();
  assert.equal(await processCallback(callbackBody({}, [{ Name: "Amount", Value: 5000 }]), { cfg, fetch: safaricom().f, complete: db.complete }), "needs_review");
  assert.equal(db.state.credited, 0);
});
t("a failed or cancelled payment is recorded without needing confirmation", async () => {
  const s = safaricom(); const db = fakeDb();
  const cancelled = { Body: { stkCallback: { MerchantRequestID: "MR-1", CheckoutRequestID: "ws_CO_TEST1", ResultCode: 1032, ResultDesc: "Request cancelled by user" } } };
  assert.equal(await processCallback(cancelled, { cfg, fetch: s.f, complete: db.complete }), "cancelled");
  assert.equal(s.calls.length, 0);
});
t("junk input and Safaricom outages never throw", async () => {
  const db = fakeDb();
  assert.equal(await processCallback("not json", { cfg, fetch: safaricom().f, complete: db.complete }), "ignored");
  assert.equal(await processCallback(callbackBody(), { cfg, fetch: async () => { throw new Error("network down"); }, complete: db.complete }), "ignored");
  assert.equal(await processCallback(callbackBody(), { cfg, fetch: safaricom().f, complete: async () => { throw new Error("db down"); } }), "ignored");
});
t("reconcile settles a lost callback: failures end the request, a success is held for a person (no receipt)", async () => {
  const db = fakeDb();
  assert.equal(await reconcile("ws_CO_TEST1", { cfg, fetch: safaricom({ queryResult: () => ({ ResultCode: "1032", ResultDesc: "cancelled" }) }).f, complete: db.complete }), "cancelled");
  const db2 = fakeDb();
  assert.equal(await reconcile("ws_CO_TEST1", { cfg, fetch: safaricom().f, complete: db2.complete }), "needs_review");
  assert.equal(db2.state.credited, 0);
  assert.equal(await reconcile("ws_CO_TEST1", { cfg, fetch: safaricom({ queryResult: () => null }).f, complete: fakeDb().complete }), null);
});
t("shillings input is whole numbers within the M-Pesa limit", () => {
  assert.equal(parseShillings("5,000"), 5000); assert.equal(parseShillings("1999.6"), 2000); assert.equal(parseShillings(" 250000 "), 250000);
  for (const bad of ["0", "-5", "abc", "", "250001", "0.2", "Infinity"]) assert.equal(parseShillings(bad), null, bad);
  assert.equal(parseShillings(null), null);
});
t("invoice and quotation labels", () => {
  assert.equal(invoiceStatus("issued").label, "Unpaid"); assert.equal(invoiceStatus("issued", true).label, "Overdue"); assert.equal(invoiceStatus("paid", true).label, "Paid"); assert.equal(invoiceStatus("zzz").tone, "grey");
  assert.equal(quoteStatus("sent").label, "Awaiting your answer"); assert.equal(quoteStatus("odd").tone, "grey");
});
t("invoice PDF is a valid PDF with the amounts, and survives hostile text", () => {
  const base = { number: "INV-2026-00012", status: "partially_paid", currency: "KES", issueDate: "2026-11-01", dueDate: "2026-12-01", taxRatePercent: 16, orderNumber: "SO-1",
    company: { legalName: "SAMSAL Supply & Distribution Limited", address: "Nairobi", city: null, country: "Kenya", registrationDetails: null, taxPin: null, phone: null, email: null },
    customer: { company: "Alpha (Traders) \\ Ltd", contact: "Ann", email: null, phone: null, location: null },
    lines: [{ description: "Rice 50kg ✓ (bag) \\ test", quantity: 10, unitPrice: 1000 }], payments: [{ paidOn: "2026-11-05", amount: 5000, method: "mpesa", reference: "QWE12RTY34" }], notes: null, paymentInstructions: "M-Pesa Paybill 123456" };
  const pdf = buildInvoicePdf(base).toString("latin1");
  assert.ok(pdf.startsWith("%PDF-1.4") && pdf.trimEnd().endsWith("%%EOF"));
  assert.ok(pdf.includes("11,600.00") && pdf.includes("6,600.00") && pdf.includes("INV-2026-00012"), "total 11,600, balance 6,600");
  assert.ok(buildInvoicePdf({ ...base, status: "paid", payments: [{ paidOn: "2026-11-05", amount: 11600, method: "bank", reference: null }] }).toString("latin1").includes("INVOICE - PAID"));
  assert.ok(buildInvoicePdf({ ...base, lines: Array.from({ length: 80 }, (_, i) => ({ description: `Item ${i}`, quantity: 1, unitPrice: 1 })) }).toString("latin1").includes("Page 2 of"), "long invoices paginate");
});

(async () => {
  for (const { name, fn } of queue) { try { await fn(); passed++; } catch (e) { failures.push(`${name}: ${(e as Error).message.split("\n")[0]}`); } }
  if (failures.length) { console.error(`M-PESA TESTS FAILED (${failures.length}):\n - ${failures.join("\n - ")}`); process.exit(1); }
  console.log(`M-Pesa tests: ${passed} passed`);
})();
