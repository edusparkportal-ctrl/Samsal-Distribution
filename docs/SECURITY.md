# Security operations guide

How the platform is protected and what to do to run it safely. The assessment itself is in `SECURITY_REPORT.md`.

## Environment variables (set in Vercel; never commit values)

| Variable | Purpose | If missing in production |
|---|---|---|
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Shared rate limiting and single-use form tokens | Public forms refuse with 503 (fail closed); sign-in falls back to a stricter per-instance limit |
| `TURNSTILE_SECRET_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | CAPTCHA on the quote and enquiry forms | Forms show "temporarily unavailable" / API returns 503 |
| `FORM_TOKEN_SECRET` (32+ random characters) | Signs the form-opened token | Forms refuse with 503 |
| `CRON_SECRET` | Authenticates the automation dispatcher | Dispatcher returns 401 |
| `CSP_REPORT_ONLY=1` | Optional: report CSP violations without blocking | Policy is enforced |

Only the Supabase publishable key is public. The service-role key is used by reviewed server files only (audit rule R3).

## Multi-factor authentication (MFA)

- Uses Supabase TOTP (authenticator app). Enable TOTP MFA in Supabase: Authentication > Sign In / Providers > Multi-Factor.
- Roles with **Require MFA** (default: Super Administrator, Director, HR, Payroll, Finance, Accountant, Procurement Manager) cannot see data until they verify a code. People without an authenticator are sent to the set-up page at next sign-in.
- Sensitive operations need a code from the last 15 minutes: approving payroll, bills, expenses; approval decisions; changing roles, permissions, users' role or active state; enabling modules; exporting data; opening restricted documents; changing the password when MFA is enrolled. The database enforces this, not only the pages.
- Super Administrator roles always require MFA.
- **Lost device:** another Super Administrator opens Settings > Users and uses *Reset MFA* for that person (logged as a critical event). Keep at least two Super Administrators.

## Monitoring

- Admin > Security shows posture checks, MFA coverage, config status and the last 100 security events (failed sign-ins, rate-limit blocks, MFA failures, exports, resets).
- The daily automation rule *Security checks* raises an alert on regressions.
- GitHub workflows: `Security checks` (every push/PR and weekly), `CodeQL`, `Security monitor` (daily live header/health/TLS probe), `Backup recovery drill` (weekly), Dependabot (weekly).

## Backup and recovery

1. Supabase keeps daily backups (check the plan; enable Point-in-Time Recovery for production if available).
2. The weekly drill dumps the public schema, restores it into a throw-away Postgres, checks table count, RLS on every table and that settings data is present, then shreds the dump. A failed drill is a red workflow: investigate the same day.
3. Recovery: restore from the Supabase dashboard (Database > Backups), then run `supabase db push` so any newer migrations apply, then check Admin > Security.
4. Storage files are not in database backups; keep a periodic export of the private buckets.

## Incident response (short form)

1. Contain: deactivate the user (Settings > Users) and reset their MFA/password; rotate any exposed key in its provider, then update Vercel.
2. Review Admin > Security and the Activity log for the window.
3. Record what happened and what was changed.

## Headers

CSP (nonce-based on /admin, static on the public site), HSTS (2 years), nosniff, frame protection, referrer and permissions policies, COOP/CORP. HSTS `includeSubDomains` and `preload` are deliberately off: enable them only when every subdomain is HTTPS-only, since preload is hard to undo (edit `src/lib/security/csp.mjs`).

## Running the checks locally

```
npm install            # creates package-lock.json; commit it
npm run check          # types + static audit + unit tests
npm run security:deps  # dependency advisories
npm run db:test        # RLS, MFA, structural and storage tests (needs a scratch Postgres)
```
