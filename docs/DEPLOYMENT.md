# Deploying to Vercel (Version 3)

1. Push the repository to GitHub and import it in Vercel (Framework: Next.js, default build settings).
2. **Settings > Environment Variables** (Production, and Preview if you use previews):
   - Website/email (unchanged from Version 2): `NEXT_PUBLIC_SITE_URL`, `RESEND_API_KEY`, `QUOTE_TO_EMAIL`, `QUOTE_FROM_EMAIL`, `FORM_TOKEN_SECRET`, Upstash and Turnstile variables if used.
   - Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (the last one is a normal secret variable; do not expose it to the browser).
3. Complete `docs/SUPABASE_SETUP.md` (migrations, seed, auth URLs, first Super Administrator).
4. Deploy. Then check, in this order:
   - `/` and `/products` show your content (the first request after an admin edit can take up to a minute to refresh if the cache purge is delayed).
   - `/admin/login` signs in; `/admin` shows only the modules your role allows.
   - Submit a test quote request: it should appear under **Enquiries** and reach the email address you set.
5. Images uploaded in the media library are served from your Supabase project. `next.config.mjs` allows that host automatically from `NEXT_PUBLIC_SUPABASE_URL`; if you change the project, redeploy.

## First build
Version 3 was written and tested without network access to npm or Supabase: the logic, database policies, forms, PDF and
content layer were tested offline, but a full `next build` had not been run. **Treat the first Vercel build as the real compile
test.** If it fails, the error will name a file and line; the most likely causes are type-level mismatches with the installed
`@supabase/*` or `next` versions. A `package-lock.json` is not included; run `npm install` once and commit the lockfile.

## Rollback
Vercel keeps previous deployments: promote an earlier one from the Deployments list. Database migrations are not rolled back
automatically; write a new migration to undo a schema change.
