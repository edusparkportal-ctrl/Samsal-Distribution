# Administrator guide

Sign in at `/admin/login`. The menu shows only the areas your role allows. Everything below can be done without touching source code.

## Roles
| Role | Intended for |
| --- | --- |
| Super Administrator | Everything, including users, roles and module switches. The last active Super Administrator cannot be removed or demoted. |
| HR Manager | Runs the HR Outsourcing module (staffing requests, candidates, placements); read access to enquiries. Has no access while the module is off. |
| Director | Read access to all business modules (including HR Outsourcing when it is on), activity log and reports; approves purchase orders; manages quotations and tenders. |
| Procurement Manager | Suppliers, supplier quotes and purchase orders (cannot approve; approval needs the approve permission, which the Director has). |
| Sales Manager | Enquiries, customers, quotations, sales orders and deliveries. |
| Inventory Manager | Warehouses, stock items, stock movements and balances. |
| Content Editor | Website content, products and the media library only. |

Roles and their permissions can be changed by a Super Administrator in **Settings > Roles**. The menu hides things you cannot use,
but the database enforces permissions regardless.

## Website content (Website menu)
- **Company information**: names, tagline, description, mission, vision, address, hours, quotation settings. Leave a field empty to hide it; nothing is invented.
- **Contact details**: telephones, emails, WhatsApp. WhatsApp buttons appear only when a WhatsApp number exists. Mark one primary per type.
- **Social accounts**: add a profile URL (https only) and choose header, footer and contact-page placement. Nothing appears until you add it.
- **Management team**: add people, order them, upload a photo. Emails show publicly only if you tick "Show email".
- **Homepage**: headline (the last sentence is highlighted), subheading, buttons, hero image, section headings. Featured products and services are ticked on their own records.
- **Products, categories, services, industries, how it works, core values, downloads**: add, edit, reorder (up/down), hide, or delete. Draft products are not shown publicly.
- **Announcements**: a banner across the site, optionally with start and end times (Nairobi time).
- **SEO**: override a page's title, description, sharing image, canonical address, or ask search engines not to index it.
- **Media library**: upload JPG, PNG, WebP (and PDF for downloads) up to 5 MB. SVG is not accepted. A file still used on the site cannot be deleted. Replacing a file updates it everywhere.
Changes appear on the public site within about a minute (usually immediately).

## Enquiries and customers
Website quote requests and messages arrive in **Enquiries** (and by email). Open one to change its status, assign it, set a follow-up date and add notes.
Use **Log an enquiry** for phone or walk-in requests. Statuses: New, Under review, Sourcing, Quotation prepared, Quotation sent, Accepted, Declined, Completed.
Export to CSV needs the export permission. Customer details are not copied into the activity log.

## Quotations
**Prepare quotation** from an enquiry (or **Quotations > New**). Enter lines as `description | quantity | unit price | unit`, set the tax rate, validity and terms,
and **Download PDF**. Totals are calculated by the system. Company registration and tax PIN print only if you entered them in Company information.
The system does not email quotations: send the PDF yourself, then mark the quotation **Sent**. Record **Accepted** or **Declined** with a note.
Once sent, a quotation is locked; to change it, cancel it and prepare a new one.

## Suppliers, procurement, inventory, orders, tenders
- Enable or disable these modules in **Settings > Modules**. Inventory, orders and tenders are off until switched on.
- **Suppliers**: contact details and categories supplied. **Supplier quotes**: prices received. **Purchase orders**: lines as `description | quantity | unit price`.
  Approval needs the approve permission and cannot be done by the creator.
- **Inventory**: add a warehouse and stock items, then record receipts. Issues and transfers out are stored as negative automatically. Movements cannot be edited; fix mistakes with an adjustment and a reason. **Balances** are calculated from movements and flag items at or below their reorder level.
- **Sales orders and deliveries**: record orders, then scheduled/delivered deliveries with driver, vehicle and who received the goods.
- **Tenders**: deadline, eligibility, estimated value, bid status, outcome, responsible person.
- **Documents**: on supplier, supplier quote, purchase order, tender, delivery and quotation pages you can attach private files (PDF, JPG, PNG, DOCX, XLSX, CSV, TXT up to 10 MB). They open through short-lived secure links.

## Users and security
- **Settings > Users**: invite staff by email, assign a role, deactivate (never share logins). Only a Super Administrator can change roles; the database prevents changing your own privileges and prevents removing the last Super Administrator.
- Use long, unique passwords. Deactivate leavers the same day.
- **Activity log** shows who changed what and when; entries cannot be altered.
- **Reports**: counts and CSV exports.

## Legal pages
The Privacy Policy and Terms are drafts and are marked for review by a qualified Kenyan adviser before they are relied on. They are hidden from search engines until `legal.reviewed` is set to `true` in `src/config/site.ts` after that review.

## HR Outsourcing (a separate business line, off by default)
SAMSAL's HR outsourcing service is built and ready but **switched off**. While it is off, the menu does not show it and the database refuses every read and write on its data, even for a Super Administrator.

**Switching it on:** sign in as a Super Administrator, open **Settings > Modules** and turn on **HR Outsourcing**. No code change or redeploy is needed. Then give people the **HR Manager** role (or the `hr.view` / `hr.manage` permissions) in **Settings > Users**. Switching it off again stops access immediately; nothing is deleted.

**Before you switch it on, settle these with a qualified Kenyan adviser** (this system does not decide them for you):
- Registration or licensing required to run a recruitment or placement agency, and for managed staffing where SAMSAL becomes the employer.
- Employer obligations if SAMSAL employs people: contracts, PAYE, NSSF, SHIF, housing levy, insurance.
- Data protection: registration as a data controller or processor, a privacy notice for candidates, how long candidate details are kept, and how erasure requests are handled.
- Working capital: wages are normally paid before the client pays.

**What it contains**
- **Staffing requests**: a client's request for staff (role, number needed, location, start date, status). The arrangement is either *placement* (we introduce, the client employs) or *managed staffing* (we employ).
- **Candidates**: people available for placement. Only minimal details are stored. Do **not** record ID numbers, KRA PINs, bank details, dates of birth, health information or CV files. Tick "consent" only once the candidate has agreed, and enter the date. Set a "review or delete by" date.
- **Placements**: a candidate put forward for a request, from proposed to interview, offer, active and ended.

**Good to know**
- All HR records are internal. Nothing from this module appears on the public website.
- Staff archive records from the admin. Permanent deletion (for example to honour an erasure request) is reserved for the Super Administrator.
- The activity log records that a candidate record changed and which fields, but never the personal details themselves.
- To advertise the service publicly, add it yourself under **Website > Services** once the legal steps are complete. That is a separate, deliberate step so that nothing goes public by accident.

## Legal documents (Terms and Conditions, Privacy Policy)
Downloadable drafts are in `public/legal/` (PDF and Word) and linked from the website's **Terms** and **Privacy** pages. They are drafts for review by a qualified Kenyan adviser: every item SAMSAL still has to supply is highlighted in yellow in the files, and nothing in them is assumed.

- **To change them:** edit the Markdown in `docs/legal/` (or have the adviser edit the Word file and copy the changes back), then run `python3 scripts/build-legal-docs.py` (needs Python with `python-docx`, and LibreOffice) and commit the regenerated files.
- **When the adviser approves them:** delete the "Drafting notes" section and the draft banner text, update the website pages to match, set `legal.reviewed` to `true` in `src/config/site.ts`, fill in the company number, address and data-protection registration there, and regenerate the files. Until then the draft files are kept out of search results.

## Automation (Control Centre)

Open **Automation > Control Centre**. Each automation can be switched on or off, scheduled and tuned there. Everything works on your real records; nothing is sample data.

| Automation | What it does | Needs |
|---|---|---|
| Assign new enquiries | Gives each new enquiry to the staff member (with the "manage enquiries" permission) who has the fewest open ones | Customers module |
| Alert staff to new enquiries | Bell notification to the assignee and enquiry managers | Customers module |
| Acknowledge enquiries by email | Emails the customer their reference | Email switched on |
| Unanswered enquiry and follow-up reminders | Reminds the assignee after N hours, and on the follow-up date | Customers module |
| Chase quotations | Reminds the preparer when a sent quotation has no decision, before it expires, and when it has expired | Quotations module |
| Compare supplier quotes | Ranks valid quotes for the same enquiry and item by landed cost per unit and names the best value | Procurement module |
| Purchase order notices | Tells approvers a PO needs approval; after approval prompts procurement to send it (and emails the supplier if email is on) | Procurement module |
| Tender checklists and deadline reminders | Builds a document checklist for each tender; reminds at 7, 3 and 1 days (editable) and once if the deadline passes | Tenders module |
| Low-stock, delivery notices | Alerts when stock reaches its reorder level; notifies order staff and, if email is on, the customer | Inventory / Orders modules |
| Daily summary | Morning summary of counts for administrators | none |

Notes
- **Email is off by default.** It needs a verified sending domain. Until then everything still works through the bell in the top bar and nothing is queued. When you have a domain: verify it in Resend, set `RESEND_API_KEY`, `AUTOMATION_FROM_EMAIL` and `CRON_SECRET` in Vercel, then switch email on in the Control Centre.
- Automations for a module that is switched off simply wait; switching the module on activates them.
- **Run log** shows every run, errors included. A failing scheduled automation retries after 5, 10, 20 minutes and so on, and administrators are notified once a day per problem. **Email outbox** shows queued emails with attempts and a Retry button.
- Duplicates are prevented: the same alert is never sent to the same person twice.
- Stock is never changed automatically. Recording stock movements stays a deliberate action by inventory staff; the automation only watches the balances.
- The tender checklist template (Tenders > Document checklists) is a generic starting point, not a statement of what any tender requires. Check each tender document.
- Scheduling runs inside the database (every 5 minutes through pg_cron). If it is ever unavailable, use **Run now**; a daily backup run also happens through Vercel Cron.
