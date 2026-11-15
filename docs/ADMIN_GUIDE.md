# Administrator guide

Sign in at `/admin/login`. The menu shows only the areas your role allows. Everything below can be done without touching source code.

## Roles
| Role | Intended for |
| --- | --- |
| Super Administrator | Everything, including users, roles and module switches. The last active Super Administrator cannot be removed or demoted. |
| Director | Read access to all business modules, activity log and reports; approves purchase orders; manages quotations and tenders. |
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
