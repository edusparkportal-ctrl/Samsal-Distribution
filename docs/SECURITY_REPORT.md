# Security hardening report

SAMSAL Supply & Distribution platform · branch `version-3` · 20 November 2026
Status: **ready for review. Not deployed to production.** Nothing here reads, prints or changes a production secret.

## 1. Summary

Ten work items were requested. All are implemented and tested locally. Highlights:

- MFA (TOTP) is enforced **in the database**, so a bypassed page cannot skip it.
- Rate limiting, CAPTCHA and form tokens now **fail closed** in production.
- Nonce-based CSP on /admin, static CSP on the public site, HSTS and a full header set.
- Two real exposures were fixed: the module list was readable by anonymous visitors, and several admin exports/restricted-document routes did not require step-up.
- Automated checks (static audit, unit tests, DB policy tests, dependency audit, CodeQL, secret scan), a security dashboard, a daily live monitor and a weekly backup-restore drill were added.

## 2. Findings and fixes

| # | Area | Finding | Severity | Fix |
|---|---|---|---|---|
| 1 | RLS | `modules_read` allowed anonymous reads of the module list | Medium | Policy now `to authenticated using (is_staff())` |
| 2 | Authorisation | Money/role changes had no recent-MFA requirement | High | `guard_mfa` triggers on payroll runs, bills, expense claims, approval decisions, profile role/active, roles, role_permissions, modules |
| 3 | Authentication | No MFA for administrators | High | Supabase TOTP, `roles.require_mfa`, session gate (aal2), enrol/verify pages, reset by another Super Administrator |
| 4 | Rate limiting | Per-instance memory limiter only; silent pass on failure | High | Shared Upstash Redis limiter, 1.5 s timeout, `closed` (public forms) or `degraded` (sign-in) failure modes, memory only outside production |
| 5 | CAPTCHA | Missing key = check skipped | High | `verifyTurnstile` returns an explicit reason; production without config returns 503; only `success === true` passes |
| 6 | Form token | Missing secret = skipped; replayable | Medium | Production without secret = 503; single use via Redis `SET NX EX`; crypto random |
| 7 | Headers | No CSP/HSTS | Medium | CSP, HSTS (2 years), nosniff, frame, referrer, permissions, COOP/CORP; `CSP_REPORT_ONLY` rollout switch; `/api/csp-report` |
| 8 | Exports | CSV exports lacked step-up and logging | Medium | `requireStepUp`, `export_data` event |
| 9 | Restricted documents | Open route relied on RLS only; delete lacked staff/MFA check | Medium | `requireStaff()` + MFA (also in `restricted_doc_open`) |
| 10 | Quote API | No size check; open on missing controls | Medium | Content-length required (411), 503 when controls missing, replay rejected |
| 11 | Auth links | `/auth/confirm` accepted any type | Low | Allow-list `invite|recovery|email`, rate limit, logging |
| 12 | Redirects | `safeNext` allowed control characters | Low | Control characters rejected |
| 13 | Cookies | Cookie attributes inherited | Low | SameSite=Lax, Secure in production |
| 14 | Monitoring | No security event trail | Medium | `security_events`, `security_log`, `security_posture()`, dashboard, daily rule |

## 3. Coverage of the ten items

1. **Auth, authorisation, RLS audit.** Every table created by a migration has RLS (89 checked), no anonymous writes, SECURITY DEFINER functions have a pinned search_path and none are executable by anon beyond an allow-list, views are invoker, storage policies verified. Every server action (80) and admin route (11) checks the caller (rule R1/R2).
2. **MFA.** See section 2 (#2, #3). Default roles requiring MFA: super admin, director, HR, payroll, finance, accountant, procurement manager. Fail closed: if the migration is not applied the admin shows "security setup" instead of opening.
3. **Redis rate limiting.** Namespaced hashed keys, timeouts, explicit failure behaviour, 44 unit tests including a fake Redis outage.
4. **Fail-closed CAPTCHA/token.** Section 2 (#5, #6, #10). The quote form also shows a notice instead of a broken form.
5. **CSP/HSTS/headers.** Section 2 (#7). Single source of truth `src/lib/security/csp.mjs`.
6. **Route/action/upload/document review.** Static audit rules R1–R10 plus manual review. Uploads go through existing type/size validation and RLS-protected buckets; private documents are never public buckets (tested).
7. **Dependency scanning.** Dependabot (npm + Actions), `npm audit --omit=dev --audit-level=high`, CodeQL, secret-pattern scan, `.npmrc`/`.nvmrc`. **No `package-lock.json` exists yet**: this environment has no network, so it could not be generated. The workflow warns until you run `npm install` and commit it.
8. **Security tests.** DB suites: RLS 239 checks, HR/Finance/approvals/security 333 checks, seed tests; all pass. They cover session assurance (aal1/aal2/stale), fresh-MFA guards, role flag rules, anonymous access, restricted files, structural and storage properties.
9. **Monitoring and backups.** Dashboard, daily automation rule, daily live probe (headers, /admin not public, /api/health, TLS expiry), weekly restore drill.
10. **Preserve functionality, test, report.** See section 4.

## 4. Test evidence (run 20 Nov 2026)

| Suite | Result |
|---|---|
| Database RLS suite | 239 passed, 0 failed |
| Database HR/Finance/approvals/security suite | 333 passed, 0 failed |
| Seed idempotence + seed tests | passed |
| `tests/security.test.ts` | 44 passed |
| `scripts/security-audit.mjs` | passed (mutation-tested: planted violations are caught) |
| Syntax check | 206 files, 0 errors |
| Existing engine / logic / media / ops / auth-registry suites | 174 / 53 / 33 / 135 / 22 passed |
| Workflows and package.json | YAML/JSON parse OK |

## 5. Limitations (please read)

- This sandbox has no network and no `node_modules`, so `tsc`, `next build` and the suites that import Next (API route, content loader, PDF) could **not** be run here. The Vercel preview build of `version-3` is the real type check; review it before approving.
- The nonce CSP flow, the async `Flash` component and the MFA pages were not exercised in a browser. Use `CSP_REPORT_ONLY=1` for the first deploy.
- Public pages keep `script-src 'unsafe-inline'` (needed for static caching and Turnstile). The admin area does not.
- Session cookies are not HttpOnly because the browser client reads them for storage uploads.
- Resetting a user's MFA does not terminate an already-aal2 session.
- New migrations are **not applied live** because the migration pipeline's `SUPABASE_DB_PASSWORD` secret is wrong; this is unchanged.
- Legal drafts and payroll statutory settings still need adviser review.

## 6. Deployment prerequisites and order

See `docs/DEPLOYMENT.md`, "Security hardening release". In short: fix the DB password secret, enable Supabase TOTP, keep two Super Administrators, set the five public-form env vars, apply the migration before or with the app, deploy with CSP report-only, then enrol MFA and run the monitor. Rolling back the app is safe at any time; the migration is additive.

## 7. Recommended follow-ups

Commit `package-lock.json`; change the previously exposed admin password; consider Supabase PITR; review HSTS preload once all subdomains are HTTPS; move to HttpOnly cookies if browser-side storage uploads are replaced by signed upload URLs.
