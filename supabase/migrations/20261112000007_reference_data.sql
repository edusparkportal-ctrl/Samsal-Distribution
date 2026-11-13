-- =====================================================================
-- 0007 REFERENCE DATA: permissions, initial roles, module registry, units
-- Required for the platform to function. Contains no business facts.
-- Adding a module later = new migration inserting into modules/permissions.
-- =====================================================================

insert into public.permissions (key, module, description) values
  ('content.manage',   'website',     'Edit company info, homepage, staff directory, social links, services, industries, announcements, SEO'),
  ('products.manage',  'website',     'Create, edit, archive products, categories and specifications'),
  ('media.view',       'website',     'View the media library and private documents list'),
  ('media.manage',     'website',     'Upload, replace and delete files in the media library'),
  ('users.manage',     'users',       'Invite staff, assign roles, activate or deactivate accounts'),
  ('roles.manage',     'users',       'Create roles and assign permissions (Super Administrator)'),
  ('settings.manage',  'settings',    'Enable or disable platform modules'),
  ('enquiries.view',   'crm',         'View customers and enquiries'),
  ('enquiries.manage', 'crm',         'Update, assign and annotate enquiries'),
  ('enquiries.export', 'crm',         'Export enquiry data to CSV'),
  ('quotations.view',  'quotations',  'View quotations'),
  ('quotations.manage','quotations',  'Create, edit and issue quotations; record customer decisions'),
  ('suppliers.view',   'suppliers',   'View suppliers'),
  ('suppliers.manage', 'suppliers',   'Create and edit suppliers'),
  ('purchasing.view',  'procurement', 'View supplier quotes and purchase orders'),
  ('purchasing.manage','procurement', 'Create and edit supplier quotes and purchase orders'),
  ('purchasing.approve','procurement','Approve purchase orders'),
  ('inventory.view',   'inventory',   'View warehouses, stock and movements'),
  ('inventory.manage', 'inventory',   'Record stock movements and manage warehouses'),
  ('orders.view',      'orders',      'View sales orders and deliveries'),
  ('orders.manage',    'orders',      'Create and edit sales orders and deliveries'),
  ('tenders.view',     'tenders',     'View tenders'),
  ('tenders.manage',   'tenders',     'Create and edit tenders'),
  ('audit.view',       'audit',       'View the activity log'),
  ('reports.view',     'reports',     'View and export business reports');

insert into public.roles (key, name, description, is_system, is_super) values
  ('super_admin',         'Super Administrator', 'Full access, including users, roles and module settings.', true,  true),
  ('director',            'Director',            'Oversight: read access to all business modules, activity log and reports; approves purchase orders and manages tenders and quotations.', false, false),
  ('procurement_manager', 'Procurement Manager', 'Suppliers, supplier quotes and purchase orders; read access to enquiries, quotations and stock.', false, false),
  ('sales_manager',       'Sales Manager',       'Enquiries (CRM), quotations, sales orders and deliveries; reports.', false, false),
  ('inventory_manager',   'Inventory Manager',   'Warehouses, stock movements and balances; read access to orders and purchasing.', false, false),
  ('content_editor',      'Content Editor',      'Website content, products and media library.', false, false);

-- Role -> permission matrix (the Super Administrator can change this in the admin panel)
insert into public.role_permissions (role_id, permission_key)
select r.id, p.perm
from public.roles r
join (values
  ('director','enquiries.view'),('director','enquiries.export'),('director','quotations.view'),('director','quotations.manage'),
  ('director','suppliers.view'),('director','purchasing.view'),('director','purchasing.approve'),('director','inventory.view'),
  ('director','orders.view'),('director','tenders.view'),('director','tenders.manage'),('director','audit.view'),
  ('director','reports.view'),('director','media.view'),
  ('procurement_manager','suppliers.view'),('procurement_manager','suppliers.manage'),('procurement_manager','purchasing.view'),
  ('procurement_manager','purchasing.manage'),('procurement_manager','enquiries.view'),('procurement_manager','quotations.view'),
  ('procurement_manager','inventory.view'),('procurement_manager','tenders.view'),('procurement_manager','media.view'),
  ('procurement_manager','media.manage'),
  ('sales_manager','enquiries.view'),('sales_manager','enquiries.manage'),('sales_manager','enquiries.export'),
  ('sales_manager','quotations.view'),('sales_manager','quotations.manage'),('sales_manager','orders.view'),
  ('sales_manager','orders.manage'),('sales_manager','reports.view'),('sales_manager','media.view'),
  ('inventory_manager','inventory.view'),('inventory_manager','inventory.manage'),('inventory_manager','orders.view'),
  ('inventory_manager','purchasing.view'),
  ('content_editor','content.manage'),('content_editor','products.manage'),('content_editor','media.view'),
  ('content_editor','media.manage')
) as p(role_key, perm) on p.role_key = r.key;

-- Module registry. Business modules beyond the core site are switchable.
-- Inventory, orders and tenders ship DISABLED: the business does not yet assume a warehouse or stock.
insert into public.modules (key, name, description, is_core, enabled, sort_order) values
  ('website',     'Website CMS',              'Company info, homepage, products, services, media, SEO.',        true,  true,  10),
  ('crm',         'Customers & Enquiries',    'Website enquiries, customers, notes, follow-ups.',               false, true,  20),
  ('quotations',  'Quotations',               'Prepare and issue PDF quotations; record decisions.',            false, true,  30),
  ('suppliers',   'Suppliers',                'Supplier records and documents.',                                false, true,  40),
  ('procurement', 'Procurement',              'Supplier quotes and purchase orders.',                           false, true,  50),
  ('inventory',   'Inventory',                'Warehouses, stock movements and balances.',                      false, false, 60),
  ('orders',      'Sales Orders & Deliveries','Sales orders and delivery records.',                             false, false, 70),
  ('tenders',     'Tenders',                  'Tender opportunities and bid tracking.',                         false, false, 80),
  ('reports',     'Reports',                  'Business reports and CSV exports.',                              false, true,  90),
  ('audit',       'Activity Log',             'Audit trail of administrative actions.',                         true,  true,  100);

insert into public.units (code, name, abbreviation) values
  ('piece','Piece','pc'), ('box','Box','box'), ('carton','Carton','ctn'), ('pack','Pack','pk'),
  ('dozen','Dozen','doz'), ('pair','Pair','pr'), ('set','Set','set'), ('roll','Roll','roll'),
  ('ream','Ream','ream'), ('kg','Kilogram','kg'), ('g','Gram','g'), ('tonne','Tonne','t'),
  ('litre','Litre','L'), ('ml','Millilitre','ml'), ('metre','Metre','m'), ('bag','Bag','bag');
