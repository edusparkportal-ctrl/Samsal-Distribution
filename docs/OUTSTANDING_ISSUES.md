# Outstanding issues and honest limits (Version 3)

## Not verified in the build environment
- **`next build` and TypeScript compilation have not been run** (no npm registry access). Source files were checked for syntax and the logic was run with stubs for Next.js/React/Supabase. Expect to fix a few type or import errors on the first Vercel build. No `package-lock.json` exists yet.
- **No live Supabase project was used.** The SQL (migrations, RLS, triggers, seed) was tested on a local PostgreSQL 16 with a minimal stand-in for Supabase's `auth`/`storage` schemas (about 130 policy and trigger checks plus seed checks). Not exercised against the real service: Supabase Auth flows (invite, reset, sessions), Storage uploads and signed URLs, PostgREST embedded selects such as `customer:customers(...)`, and `auth.uid()` behaviour under the real API. Test these first: sign in, upload an image, save a product, submit an enquiry, download a private document.
- Admin pages were not exercised in a browser.

## Known gaps
- Supabase password-reset and invite emails need the template change in `SUPABASE_SETUP.md`.
- Quotations are not emailed from the system and there is no customer-facing online acceptance; decisions are recorded by staff.
- Purchase receipts and deliveries do not yet create stock movements automatically; record them in Stock movements.
- Storage locations (bins/shelves) exist in the database but have no screen.
- Variant-level product pricing, invoices and payments are not implemented (prices are not published on the site by design).
- Staff photos are optional; public staff pages are not generated (the management list is shown on the About page when staff are added).
- The cache is refreshed on every admin save; direct edits made in the Supabase dashboard can take up to 60 seconds to appear.
- Enquiry CSV export and reports are limited to 5,000 rows.
- Rate limiting falls back to per-instance memory without Upstash.
- Legal pages are drafts. Registration numbers, tax PIN, addresses, contact details and social links are intentionally blank until supplied.
- Data retention periods and a data-subject request process still need to be decided with a qualified adviser (Kenya Data Protection Act).
- The default Super Administrator bootstrap is a manual SQL step by design.
