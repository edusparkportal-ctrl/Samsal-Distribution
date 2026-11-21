# Customer portal

A wholesale customer area at `/portal`: catalogue with the customer's own prices and stock availability, cart, checkout,
order tracking, repeat orders. It ships **switched off** (module `portal`) and does not change the public website,
the admin area, or any existing data.

Status: **Phase 1 built** (accounts, catalogue, pricing, cart/checkout, orders, tracking, repeat order).
Phase 2 (invoices, PDF download, M-Pesa, quotation requests) and Phase 3 (bulk CSV upload, support tickets) follow.

## How it is secured

| Rule | How it is enforced |
|---|---|
| Customers see only their own data | Customers hold **no table rights**. Every row of every business table stays staff-only under RLS. The portal reads and writes only through `portal_*` database functions, each of which starts from `portal_customer_id()` (the customer linked to the caller's own *approved* account). A customer cannot name another customer. |
| Prices, minimums, stock and totals are server-side | The browser sends "product, quantity". `portal_create_order` recomputes the price (customer price, else discount, else list), checks minimum and pack step, checks stock, caps order size and rate, and ignores anything else. |
| Approval | Self-registration creates only a **pending** application. Staff (permission `portal.manage`, fresh authenticator code) link it to a customer record. |
| Sign-up stays closed | Public sign-up in Supabase stays OFF. Registration is a server action (CAPTCHA + fail-closed rate limits) that sends an **invitation email**; the link proves the mailbox and lets the person choose a password. The answer is always the same, so emails cannot be enumerated. |
| Switch | `portal_customer_id()` also requires the module to be enabled, so turning the module off is a real stop. |
| Double submits | Checkout carries a one-time key; a retry returns the first order. |
| Audit | Account decisions and price changes are written to the activity log (account changes log field names only). |

Static audit rule **R11** fails the build if portal code reads any table other than the caller's own application row, or calls any function that is not `portal_*`.

## Turning it on (do in this order)

1. Apply migration `20261120100000_customer_portal` (the pipeline does this on merge to `main`).
2. Supabase > Authentication > Email Templates > **Invite user**: link must be `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite` (already the staff setup). Public sign-up stays disabled.
3. Vercel needs the existing public-form variables (`TURNSTILE_SECRET_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, Upstash Redis). Without them registration shows "temporarily unavailable" in production.
4. Admin > Customer portal > **List prices**: set a price for each product customers may order (a product without a price shows "Price on request"). Add **Customer prices** where needed.
5. Make sure stock is recorded (Inventory). A product with no stock movements shows "Availability on request" and can still be ordered; a product with movements is blocked when a customer asks for more than is in stock.
6. Admin > Settings > Modules: switch **Customer portal** on.
7. Optional: Admin > Automations > "Customer portal alerts" tells the sales team about applications and online orders.

Existing customers: they apply through the portal, or staff can ask them to. Approving links the login to the **existing** customer record (choose it in the dropdown), so history is preserved.

## Day to day

- **Accounts**: Admin > Customer portal > Accounts: approve, reject, suspend, reactivate.
- **Orders**: online orders arrive as *Submitted* in Sales orders. Confirm them as usual; each status change adds a line to the customer's tracking timeline. Deliveries add "Delivery scheduled / Out for delivery / Delivered" automatically (driver and vehicle details are never shown).
- **Tracking updates**: Admin > Customer portal > Tracking updates for extra messages. Untick "show to customer" for internal notes.
- A customer can cancel an order only while it is *Submitted*.

## Known limits (Phase 1)

- Stock is checked when the order is placed but not reserved; staff confirm each order, so two customers ordering the last items at the same moment is resolved at confirmation.
- Prices exclude VAT; the invoice states the final amount.
- Customers cannot edit company details or add colleagues themselves; staff link additional logins to the same customer.
- Customers do not use MFA in this phase.
- No payments, invoices, quotations, bulk upload or tickets yet (later phases).
