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

## Automatic database migrations (GitHub to Supabase)

The folder `supabase/migrations/` is the schema. Every time a change to it reaches the `main` branch, the workflow `.github/workflows/supabase-migrate.yml` runs two jobs:

1. **Test migrations** builds the whole schema on a throwaway Postgres and runs the database test suite (row-level-security and seed checks). If anything fails, nothing is applied.
2. **Apply to Supabase** links the live project and applies only the **new** migration files, in order. It first prints a dry run so the log shows exactly what is about to change.

Pull requests that touch `supabase/` run job 1 only, so a broken migration is caught before it is merged.

### One-time setup (about 5 minutes)
In GitHub open the repository, then **Settings > Secrets and variables > Actions > New repository secret**, and add two secrets:

| Secret | Where to get it |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | Supabase dashboard > your account (top right) > **Access Tokens** > Generate new token. Copy it once. |
| `SUPABASE_DB_PASSWORD` | The database password you chose when the project was created. If it is lost: Supabase dashboard > **Project Settings > Database > Reset database password**, then use the new one. |

Never paste either value into chat, code or an issue. The workflow stops with a clear message if a secret is missing.

Optional but recommended: **Settings > Environments > production > Required reviewers**, so a person must approve each database change before it is applied.

### Day-to-day rules
- **Add a new file; never edit an old one.** Create `supabase/migrations/<timestamp>_<what_it_does>.sql` whose timestamp is later than the last file (for example `20261120090000_add_supplier_ratings.sql`). The workflow fails if an already-merged migration is edited, renamed or deleted, because the live database has already run it.
- **Make changes backwards compatible** (add columns and tables; avoid dropping or renaming something the running website still uses). The website and the database deploy separately and are not updated in the same instant.
- **A migration cannot be undone automatically.** To reverse a change, add a new migration that does the opposite.
- `supabase/seed.sql` is for new empty databases only and is never run automatically.
- Check progress under the **Actions** tab. A red run means nothing was applied, or the run stopped at the failing file.
- Changes made by hand in the Supabase dashboard are not in GitHub. Make schema changes through migration files so the repository stays the single source of truth.

## Automation settings

- No extra variables are needed for in-app notifications and reminders.
- For emails (only after a sending domain is verified): `RESEND_API_KEY`, `AUTOMATION_FROM_EMAIL`, and `CRON_SECRET` (any random string of 16+ characters). `vercel.json` schedules `/api/automation/dispatch` daily; the route refuses requests without the secret.
- The 5-minute scheduler is created by migration `20261116120200_automation_schedule.sql` using pg_cron. If that migration printed a notice that pg_cron is unavailable, enable the extension in Supabase (Database > Extensions) and re-run it.
