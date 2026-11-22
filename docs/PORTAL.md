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
- Bulk upload and support tickets arrive in Phase 3.

---

# Phase 2: invoices, payments, M-Pesa, quotations

Migration `20261121100000_customer_portal_billing`. Same protection model as Phase 1: customers have no table rights; every read goes through a `portal_*` function that starts from the caller's own customer.

## What customers get

- **Home**: amount owed, overdue count, quotations waiting for an answer.
- **Invoices** (`/portal/invoices`): only *issued, part-paid and paid* invoices (never drafts or voids), with filters, balance, payments received and a **PDF download**.
- **Payment history** (`/portal/payments`).
- **Pay by M-Pesa** on an unpaid invoice (see below) plus the manual paybill/till and bank details staff enter.
- **Quotations** (`/portal/quotes`): request a quotation (free text or from the cart; filed as an enquiry with source *portal* for the sales team), see quotations *sent* to them, download the PDF, **accept or decline**. Only a *sent*, unexpired quotation can be answered, once.

## M-Pesa: how it works and why it is safe

1. The customer enters a phone number and amount. `portal_mpesa_prepare` checks in the database: invoice belongs to them, is issued/part-paid, in KES, amount is whole shillings <= balance and <= KES 250,000, phone is a valid Safaricom number, no request already in flight, and no more than 10 requests an hour.
2. The server sends the STK Push to Safaricom and stores the checkout id. Only the server (service role) can run `mpesa_attach_request`, `mpesa_fail_request` and `mpesa_complete`; customers cannot call them, so a customer can never mark anything paid.
3. Safaricom posts the result to `/api/mpesa/callback/<MPESA_CALLBACK_TOKEN>`. Wrong token: plain 404. A reported success is **not trusted**: the server asks Safaricom (STK Query) whether that same request succeeded before crediting.
4. `mpesa_complete` applies a result **once** (row lock; repeated callbacks change nothing; receipt numbers are unique), then records the payment, updates the invoice and posts to the finance ledger exactly like a staff-recorded receipt.
5. Anything that does not add up (different amount, invoice already settled, repeated or missing receipt) is parked as **needs review** and is *not* credited. Admin > Customer portal > **M-Pesa payments** shows these; confirm in your M-Pesa statement, then record the payment on the invoice in Finance.
6. If a callback is lost, the customer's status check asks Safaricom after 45 seconds. A confirmed success without a receipt number also goes to *needs review* (STK Query returns no receipt); a failure or cancellation just ends the request.

M-Pesa ships **OFF**. It is active only when **both** hold: all variables below are set in Vercel, **and** Admin > Customer portal > Payment settings has the M-Pesa switch on (changing those settings needs a fresh authenticator code).

| Variable | Value |
|---|---|
| `MPESA_ENV` | `sandbox` (default) or `production` |
| `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET` | from the Daraja app |
| `MPESA_SHORTCODE` | paybill number (or head-office number for a till) |
| `MPESA_PASSKEY` | Lipa Na M-Pesa Online passkey |
| `MPESA_CALLBACK_TOKEN` | a long random string (24+ letters/digits, `-` or `_`); it is part of the callback URL |
| `MPESA_TRANSACTION_TYPE` | `CustomerPayBillOnline` (default) or `CustomerBuyGoodsOnline` |
| `MPESA_PARTY_B` | till number, only for Buy Goods |

The callback URL given to Safaricom is built from `NEXT_PUBLIC_SITE_URL` (must be the public https domain). Preview deployments should use the **sandbox** and will not receive callbacks unless the preview URL is public.

### Go-live checklist (M-Pesa)

1. Complete Safaricom Daraja go-live for your paybill/till (they require the callback URL to be https and reachable).
2. Set the variables above in Vercel (Production). Never commit them.
3. Test on **sandbox** first with the Safaricom test shortcode and a small invoice; check the payment appears on the invoice and in Finance.
4. Fill in Payment settings (number, bank details, note) and switch M-Pesa on.
5. Watch *M-Pesa payments* for the first days; investigate anything in *needs review*.

## Staff

- **Payment settings**: Customer portal > Payment settings.
- **M-Pesa payments**: Customer portal > M-Pesa payments (needs `portal.view`).
- **Quotation requests** arrive in CRM > Enquiries (source *portal*). When you send a quotation to a portal customer it appears in their portal automatically; their answer is recorded on the quotation (decision, time, note).
- The "Customer portal alerts" automation (still OFF by default) also covers new quotation requests.

## Known limits (Phase 2)

- Tax shown is the invoice's tax rate; invoice numbering and issuing are unchanged (staff in Finance).
- M-Pesa pays whole shillings in KES only; invoices in other currencies show manual payment details.
- A quotation accepted online does not create an order by itself; staff turn it into an order or invoice as before.
