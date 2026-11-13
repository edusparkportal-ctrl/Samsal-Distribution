-- =====================================================================
-- 0002 CMS: company, staff, social, homepage, media, catalogue, services,
-- industries, announcements, SEO. All public-facing content lives here.
-- =====================================================================

-- Units of measurement (shared by catalogue, inventory, quotations, POs)
create table public.units (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique check (code ~ '^[a-z0-9_]{1,20}$'),
  name        text not null,
  abbreviation text not null,
  created_at  timestamptz not null default now()
);

-- Media library (files live in Storage; this table is the index)
create table public.media_assets (
  id            uuid primary key default gen_random_uuid(),
  bucket        text not null check (bucket in ('public-media','private-docs')),
  storage_path  text not null,
  file_name     text not null check (length(file_name) between 1 and 200),
  title         text,
  alt_text      text,
  description   text,
  folder        text not null default 'general' check (folder ~ '^[a-z0-9_-]{1,40}$'),
  mime_type     text not null,
  size_bytes    bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  width         integer,
  height        integer,
  uploaded_by   uuid references public.profiles(id) on delete set null,
  deleted_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (bucket, storage_path)
);
create index media_folder_idx on public.media_assets(folder) where deleted_at is null;

-- Company information (singleton row, id = 1)
create table public.company_settings (
  id                    smallint primary key default 1 check (id = 1),
  registered_name       text not null,
  brand_name            text not null,
  tagline               text,
  description           text,
  mission               text,
  vision                text,
  address_line          text,
  city                  text,
  country               text,
  business_hours        text,
  service_coverage      text,
  logo_media_id         uuid references public.media_assets(id) on delete set null,
  footer_text           text,
  quotation_prefix      text not null default 'SAM-Q' check (quotation_prefix ~ '^[A-Z0-9-]{1,12}$'),
  quotation_terms       text,
  quotation_validity_days integer not null default 14 check (quotation_validity_days between 1 and 365),
  currency              text not null default 'KES' check (currency ~ '^[A-Z]{3}$'),
  registration_details  text,           -- shown on quotations only if filled in by an admin
  tax_pin               text,           -- never invented; blank until supplied
  updated_by            uuid references public.profiles(id) on delete set null,
  updated_at            timestamptz not null default now()
);

create table public.company_values (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (length(title) between 1 and 80),
  description text,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Telephone numbers / emails / WhatsApp
create table public.contact_channels (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('phone','email','whatsapp')),
  label       text not null check (length(label) between 1 and 60),
  value       text not null check (length(value) between 3 and 120),
  is_public   boolean not null default true,
  is_primary  boolean not null default false,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index contact_primary_per_kind on public.contact_channels(kind) where is_primary and is_active;

-- Management / staff directory
create table public.staff_members (
  id            uuid primary key default gen_random_uuid(),
  full_name     text not null check (length(full_name) between 2 and 120),
  position      text not null,
  department    text,
  biography     text,
  photo_media_id uuid references public.media_assets(id) on delete set null,
  email         text,                    -- only shown publicly when show_email is true (approved)
  show_email    boolean not null default false,
  linkedin_url  text check (linkedin_url is null or linkedin_url ~ '^https://([a-z0-9-]+\.)?linkedin\.com/'),
  sort_order    integer not null default 0,
  is_active     boolean not null default true,
  deleted_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index staff_order_idx on public.staff_members(sort_order) where deleted_at is null;

-- Social media accounts (no URL is hardcoded in components)
create table public.social_links (
  id               uuid primary key default gen_random_uuid(),
  platform         text not null check (length(platform) between 1 and 40),
  url              text not null check (url ~ '^https://'),
  enabled          boolean not null default true,
  show_in_header   boolean not null default false,
  show_in_footer   boolean not null default true,
  show_on_contact  boolean not null default true,
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Homepage content (singleton row, id = 1)
create table public.homepage_settings (
  id                  smallint primary key default 1 check (id = 1),
  headline            text not null,
  subheadline         text,
  hero_media_id       uuid references public.media_assets(id) on delete set null,
  primary_cta_label   text,
  primary_cta_href    text check (primary_cta_href is null or primary_cta_href ~ '^(/|https://)'),
  secondary_cta_label text,
  secondary_cta_href  text check (secondary_cta_href is null or secondary_cta_href ~ '^(/|https://)'),
  services_heading    text,
  industries_heading  text,
  products_heading    text,
  updated_by          uuid references public.profiles(id) on delete set null,
  updated_at          timestamptz not null default now()
);

create table public.announcements (
  id          uuid primary key default gen_random_uuid(),
  message     text not null check (length(message) between 1 and 300),
  link_href   text check (link_href is null or link_href ~ '^(/|https://)'),
  starts_at   timestamptz,
  ends_at     timestamptz,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

-- Catalogue
create table public.product_categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,60}$'),
  name        text not null,
  description text,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.products (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,80}$'),
  name          text not null check (length(name) between 2 and 160),
  category_id   uuid references public.product_categories(id) on delete set null,
  summary       text,
  description   text,
  photo_media_id uuid references public.media_assets(id) on delete set null,
  fallback_image text,                 -- path under /public used until a photo is uploaded
  unit_id       uuid references public.units(id) on delete set null,
  status        text not null default 'draft' check (status in ('draft','published','archived')),
  is_featured   boolean not null default false,
  sort_order    integer not null default 0,
  created_by    uuid references public.profiles(id) on delete set null,
  deleted_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index products_status_idx on public.products(status) where deleted_at is null;
create index products_category_idx on public.products(category_id);

create table public.product_specifications (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  label       text not null check (length(label) between 1 and 80),
  value       text not null check (length(value) between 1 and 300),
  sort_order  integer not null default 0
);
create index product_specs_product_idx on public.product_specifications(product_id);

create table public.product_variants (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  sku         text unique check (sku is null or length(sku) between 1 and 60),
  name        text not null,
  unit_id     uuid references public.units(id) on delete set null,
  reorder_level numeric(14,3) check (reorder_level is null or reorder_level >= 0),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index product_variants_product_idx on public.product_variants(product_id);

-- Services & industries
create table public.services (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,60}$'),
  title       text not null,
  summary     text,
  description text,
  icon        text,                    -- name from the fixed icon set, never raw markup
  is_featured boolean not null default false,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.service_points (
  id          uuid primary key default gen_random_uuid(),
  service_id  uuid not null references public.services(id) on delete cascade,
  text        text not null check (length(text) between 1 and 300),
  sort_order  integer not null default 0
);
create index service_points_service_idx on public.service_points(service_id);

create table public.industries (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,60}$'),
  title       text not null,
  summary     text,
  description text,
  icon        text,
  is_featured boolean not null default false,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Featured product sets are driven by products.is_featured; these two tables are not needed.

-- SEO per page
create table public.seo_pages (
  path             text primary key check (path ~ '^/([a-z0-9/-]*)$'),
  title            text check (title is null or length(title) <= 70),
  description      text check (description is null or length(description) <= 170),
  og_image_media_id uuid references public.media_assets(id) on delete set null,
  canonical_url    text check (canonical_url is null or canonical_url ~ '^https://'),
  noindex          boolean not null default false,
  updated_at       timestamptz not null default now()
);

-- updated_at triggers
do $$
declare t text;
begin
  foreach t in array array[
    'media_assets','company_values','contact_channels','staff_members','social_links',
    'announcements','product_categories','products','product_variants','services','industries','company_settings','homepage_settings','seo_pages'
  ] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_updated', t);
  end loop;
end $$;
