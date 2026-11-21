/** Unit tests for the customer portal's pure helpers. Run: npm run test:portal */
import assert from "node:assert/strict";
import { CART_ISSUES, availability, formatDate, formatMoney, formatQty, orderStatus, parseQty, productImage } from "@/lib/portal/format";
import { KRA_PIN_RE, parseRegistration, passwordProblem } from "@/lib/portal/validation";
import { safeNext, safePortalNext } from "@/lib/auth/safe-redirect";

let passed = 0;
const failures: string[] = [];
function t(name: string, fn: () => void) { try { fn(); passed++; } catch (e) { failures.push(`${name}: ${(e as Error).message.split("\n")[0]}`); } }
const form = (o: Record<string, string>) => { const f = new FormData(); Object.entries(o).forEach(([k, v]) => f.set(k, v)); return f; };
const good = { company_name: "Alpha Traders Ltd", contact_name: "Ann Wanjiru", email: "Ann@Alpha.CO.KE ", phone: "0712 345 678", kra_pin: "a123456789b", location: "Nairobi", terms: "on" };

t("money formats KES with two decimals", () => { assert.match(formatMoney(1234.5), /^KES 1,234\.50$/); assert.equal(formatMoney(null), "-"); assert.equal(formatMoney("abc"), "-"); });
t("quantities drop trailing zeros", () => { assert.equal(formatQty(10), "10"); assert.equal(formatQty("2.500"), "2.5"); assert.equal(formatQty(undefined), "-"); });
t("dates use Nairobi time and survive bad input", () => { assert.match(formatDate("2026-11-20"), /20 Nov 2026/); assert.equal(formatDate("nonsense"), "-"); assert.equal(formatDate(null), "-"); });
t("order statuses map to labels and unknowns are safe", () => { assert.equal(orderStatus("submitted").label, "Received"); assert.equal(orderStatus("weird").tone, "grey"); });
t("availability falls back to 'on request'", () => { assert.equal(availability("in_stock").label, "In stock"); assert.equal(availability("???").label, "Availability on request"); assert.equal(availability(null).tone, "grey"); });
t("every cart issue has a message", () => { for (const k of ["unavailable", "no_price", "below_minimum", "step", "exceeds_stock"]) assert.ok(CART_ISSUES[k]); });
t("parseQty accepts sane numbers only", () => {
  assert.equal(parseQty("10"), 10); assert.equal(parseQty(" 2.5 "), 2.5); assert.equal(parseQty("0"), 0);
  for (const bad of ["-1", "abc", "", "1e9", "Infinity", "NaN", "1000001"]) assert.equal(parseQty(bad), null, bad);
  assert.equal(parseQty(null), null);
});
t("product images only come from the public bucket or a local fallback", () => {
  assert.equal(productImage("a/b c.jpg", null, "https://x.supabase.co"), "https://x.supabase.co/storage/v1/object/public/public-media/a/b%20c.jpg");
  assert.equal(productImage(null, "/images/x.svg", "https://x.supabase.co"), "/images/x.svg");
  assert.equal(productImage(null, "https://evil.example/x.png", "https://x.supabase.co"), null);
  assert.equal(productImage(null, "//evil.example/x.png", undefined), null);
});

t("registration accepts and normalises a good application", () => {
  const r = parseRegistration(form(good));
  assert.ok(r.ok); if (r.ok) { assert.equal(r.data.email, "ann@alpha.co.ke"); assert.equal(r.data.kraPin, "A123456789B"); assert.equal(r.data.companyName, "Alpha Traders Ltd"); }
});
t("registration rejects bad input", () => {
  for (const [k, v] of [["company_name", "A"], ["contact_name", " "], ["email", "not-an-email"], ["phone", "12"], ["kra_pin", "12345"], ["terms", ""]] as const) {
    assert.equal(parseRegistration(form({ ...good, [k]: v })).ok, false, k);
  }
});
t("registration keeps the PIN and location optional", () => { assert.ok(parseRegistration(form({ ...good, kra_pin: "", location: "" })).ok); });
t("registration strips control characters and caps length", () => {
  const r = parseRegistration(form({ ...good, company_name: "Evil\u0000Co" + "x".repeat(400) }));
  assert.ok(r.ok); if (r.ok) { assert.ok(!r.data.companyName.includes("\u0000")); assert.ok(r.data.companyName.length <= 160); }
});
t("KRA PIN pattern", () => { assert.ok(KRA_PIN_RE.test("P051234567Z")); assert.ok(!KRA_PIN_RE.test("051234567ZZ")); });
t("password rules", () => {
  assert.ok(passwordProblem("short1"));
  assert.ok(passwordProblem("onlyletterslong"));
  assert.ok(passwordProblem("1234567890123"));
  assert.ok(passwordProblem("ann.wanjiru2026x", "ann.wanjiru@alpha.co.ke"));
  assert.ok(passwordProblem("Password12345"));
  assert.equal(passwordProblem("Maize&Rice-4471", "ann@alpha.co.ke"), null);
});

t("safePortalNext only allows portal paths", () => {
  assert.equal(safePortalNext("/portal/orders/abc"), "/portal/orders/abc");
  assert.equal(safePortalNext("/portal"), "/portal");
  for (const bad of ["/admin", "//evil.com", "/portal/../admin", "https://evil.com", "/portalx", "/portal\\evil", "/portal/a\u0000b", "javascript:alert(1)", "", null, undefined]) {
    assert.equal(safePortalNext(bad as string), "/portal", String(bad));
  }
  assert.equal(safePortalNext("//evil.com"), "/portal");
  assert.equal(safePortalNext("/admin"), "/portal");
  assert.equal(safePortalNext("https://evil.com"), "/portal");
  assert.equal(safePortalNext("/portalx"), "/portal");
});
t("safeNext (staff) still rejects portal paths", () => { assert.equal(safeNext("/portal/orders"), "/admin"); assert.equal(safeNext("/admin/crm"), "/admin/crm"); });

if (failures.length) { console.error(`\n${failures.length} FAILED:\n  - ${failures.join("\n  - ")}\n(${passed} passed)`); process.exit(1); }
console.log(`PORTAL UNIT TESTS PASSED (${passed})`);
