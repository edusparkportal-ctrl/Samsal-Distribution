# Supabase setup (Version 3)

Version 3 stores content, staff accounts, enquiries and business records in a Supabase project
(PostgreSQL + Auth + Storage). Until the variables below are set, the public website still works
from its built-in content and `/admin` shows a "not configured" page.

## 1. Create the project
1. Create a project at supabase.com (choose a region close to Kenya if offered; note the database password).
2. **Project Settings > API**: copy the **Project URL**, the **anon / publishable key** and the **service_role key**.

## 2. Apply the database migrations (in order)
Run each file in `supabase/migrations/` in the SQL editor, or with the Supabase CLI (`supabase link` then `supabase db push`):

| File | Contents |
| --- | --- |
| `..01_foundation.sql` | profiles, roles, permissions, helper functions (`has_permission`, `can`, ...), safety triggers |
| `..02_cms.sql` | company info, staff, social, homepage, media index, catalogue, services, industries, SEO |
| `..03_crm_quotations.sql` | customers, enquiries, notes, status history, quotations |
| `..04_procurement_inventory_tenders.sql` | suppliers, supplier quotes, purchase orders, inventory, sales orders, deliveries, tenders |
| `..05_audit_rls.sql` | audit log, Row Level Security policies, module switches |
| `..06_storage.sql` | `public-media` and `private-docs` buckets and their policies |
| `..07_reference_data.sql` | roles, permissions, modules, units |
| `..08_quotation_guards.sql` | issued quotations are frozen |
| `..09_private_doc_index.sql` | private document index policies |

Never edit an applied migration; add a new numbered file instead.

## 3. Load the starting content
Run `supabase/seed.sql` in the SQL editor. It copies the website's current text (company, services, industries,
categories, products, process steps, values) into the database and is safe to run twice. It contains **no**
phone numbers, email addresses, addresses, social links, staff, prices or testimonials: add real ones in `/admin`.
(Regenerate it after editing `src/lib/content/static.ts` with `npm run db:seed:generate`.)

## 4. Authentication settings
**Authentication > URL Configuration**
- Site URL: your production URL, e.g. `https://samsal.co.ke`
- Redirect URLs: add `https://samsal.co.ke/auth/confirm`, the same for your Vercel preview domain if you use one,
  and `http://localhost:3000/auth/confirm` for development.

**Authentication > Email Templates** (Invite user and Reset password): change the link to
`{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite` (and `&type=recovery` for password reset).

**Authentication > Providers > Email**: disable "Allow new users to sign up". Staff are invited from `/admin/settings/users`;
nobody can register themselves. (Even if sign-up were left on, a new account has no role and no access.)

**Authentication > Settings**: set a minimum password length of at least 10 and consider enabling leaked-password protection.
Add SMTP (for example Resend) under Authentication > SMTP so invitation emails are reliable.

## 5. Create the first Super Administrator
1. **Authentication > Users > Add user** with your email and a strong password (tick "Auto confirm").
2. In the SQL editor run: `select public.bootstrap_super_admin('you@example.com');`
3. Sign in at `/admin/login`. From then on invite everyone else from **Settings > Users**.

## 6. Environment variables
Set in `.env.local` and in Vercel (see `.env.example`):

| Variable | Notes |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public; only allows what Row Level Security allows |
| `SUPABASE_SERVICE_ROLE_KEY` | **secret, server only.** Bypasses all security rules. Used only to save website enquiries and invite staff. Never prefix with `NEXT_PUBLIC_`, never commit it. |

If the service role key was ever exposed, rotate it in Supabase (Project Settings > API) and update Vercel.

## 7. Storage
The migrations create two buckets: `public-media` (website images and public downloads; 5 MB; JPG/PNG/WebP/PDF; no SVG) and
`private-docs` (supplier, PO, tender, delivery and quotation documents; 10 MB; never public; opened through 60-second signed links).
Uploads go straight from the browser to Storage and are then re-checked on the server (size and real file type).

## 8. Backups and operations
- Free projects have no point-in-time recovery. Before relying on this for real records, use a plan with daily backups, or schedule your own `pg_dump`.
- Free projects pause after a week of inactivity; the public website keeps working from its built-in content while the database is paused, but `/admin` and enquiry saving do not.
- Check **Database > Advisors** after any schema change.
