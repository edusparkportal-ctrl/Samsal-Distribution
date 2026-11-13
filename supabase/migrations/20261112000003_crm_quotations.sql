-- =====================================================================
-- 0003 CRM & QUOTATIONS: customers, enquiries, notes, quotations, decisions
-- Website visitors can only INSERT enquiries through the server API
-- (service role); they never read this data.
-- =====================================================================

create table public.customers (
  id            uuid primary key default gen_random_uuid(),
  company_name  text,
  contact_name  text not null check (length(contact_name) between 1 and 120),
  email         text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone         text,
  location      text,
  deleted_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index customers_email_company_idx on public.customers (lower(email), coalesce(lower(company_name), ''));
create index customers_search_idx on public.customers using gin (to_tsvector('simple', coalesce(company_name,'') || ' ' || contact_name || ' ' || email));

create sequence public.enquiry_ref_seq start 1001;

create table public.enquiries (
  id               uuid primary key default gen_random_uuid(),
  reference        text not null unique default ('ENQ-' || nextval('public.enquiry_ref_seq')),
  customer_id      uuid references public.customers(id) on delete set null,
  category_id      uuid references public.product_categories(id) on delete set null,
  product_id       uuid references public.products(id) on delete set null,
  product_text     text not null check (length(product_text) between 1 and 2000),
  quantity_text    text,
  delivery_location text,
  required_by      date,
  message          text check (message is null or length(message) <= 4000),
  source           text not null default 'website' check (source in ('website','phone','email','walk_in','tender','other')),
  status           text not null default 'new' check (status in
                     ('new','under_review','sourcing','quotation_prepared','sent','accepted','declined','completed')),
  assigned_to      uuid references public.profiles(id) on delete set null,
  follow_up_date   date,
  attachment_name  text,          -- name only; the file itself is emailed, not stored
  consent_recorded boolean not null default false,
  deleted_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index enquiries_status_idx on public.enquiries(status) where deleted_at is null;
create index enquiries_assigned_idx on public.enquiries(assigned_to);
create index enquiries_followup_idx on public.enquiries(follow_up_date) where deleted_at is null;
create index enquiries_customer_idx on public.enquiries(customer_id);

create table public.enquiry_notes (
  id          uuid primary key default gen_random_uuid(),
  enquiry_id  uuid not null references public.enquiries(id) on delete cascade,
  author_id   uuid references public.profiles(id) on delete set null,
  body        text not null check (length(body) between 1 and 4000),
  created_at  timestamptz not null default now()
);
create index enquiry_notes_enquiry_idx on public.enquiry_notes(enquiry_id);

create table public.enquiry_status_history (
  id          uuid primary key default gen_random_uuid(),
  enquiry_id  uuid not null references public.enquiries(id) on delete cascade,
  from_status text,
  to_status   text not null,
  changed_by  uuid references public.profiles(id) on delete set null,
  changed_at  timestamptz not null default now()
);
create index enquiry_history_enquiry_idx on public.enquiry_status_history(enquiry_id);

create or replace function public.log_enquiry_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or old.status is distinct from new.status then
    insert into public.enquiry_status_history(enquiry_id, from_status, to_status, changed_by)
    values (new.id, case when tg_op = 'UPDATE' then old.status end, new.status, auth.uid());
  end if;
  return new;
end;
$$;
create trigger enquiries_status_log after insert or update on public.enquiries
  for each row execute function public.log_enquiry_status();

-- Quotations
create sequence public.quotation_no_seq start 1001;

create table public.quotations (
  id             uuid primary key default gen_random_uuid(),
  number         text not null unique,
  enquiry_id     uuid references public.enquiries(id) on delete set null,
  customer_id    uuid references public.customers(id) on delete set null,
  status         text not null default 'draft' check (status in ('draft','sent','accepted','declined','expired','cancelled')),
  currency       text not null default 'KES' check (currency ~ '^[A-Z]{3}$'),
  issue_date     date not null default current_date,
  valid_until    date,
  delivery_terms text,
  payment_terms  text,
  notes          text,
  tax_rate_percent numeric(5,2) not null default 0 check (tax_rate_percent between 0 and 100),
  decision       text check (decision in ('accepted','declined')),
  decision_at    timestamptz,
  decision_note  text,
  decision_by    uuid references public.profiles(id) on delete set null,
  prepared_by    uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (valid_until is null or valid_until >= issue_date)
);
create index quotations_enquiry_idx on public.quotations(enquiry_id);
create index quotations_status_idx on public.quotations(status);

create or replace function public.next_quotation_number()
returns text language plpgsql security definer set search_path = public as $$
declare prefix text;
begin
  select quotation_prefix into prefix from public.company_settings where id = 1;
  return coalesce(prefix, 'SAM-Q') || '-' || to_char(now() at time zone 'Africa/Nairobi', 'YYYY') || '-' || lpad(nextval('public.quotation_no_seq')::text, 5, '0');
end;
$$;
revoke all on function public.next_quotation_number() from public, anon;

create table public.quotation_items (
  id            uuid primary key default gen_random_uuid(),
  quotation_id  uuid not null references public.quotations(id) on delete cascade,
  line_no       integer not null check (line_no > 0),
  product_id    uuid references public.products(id) on delete set null,
  description   text not null check (length(description) between 1 and 500),
  quantity      numeric(14,3) not null check (quantity > 0),
  unit_id       uuid references public.units(id) on delete set null,
  unit_price    numeric(14,2) not null check (unit_price >= 0),
  unique (quotation_id, line_no)
);

-- Totals are computed, never trusted from the client.
create or replace view public.quotation_totals with (security_invoker = true) as
select q.id as quotation_id,
       coalesce(sum(round(i.quantity * i.unit_price, 2)), 0)::numeric(16,2) as subtotal,
       round(coalesce(sum(round(i.quantity * i.unit_price, 2)), 0) * q.tax_rate_percent / 100, 2)::numeric(16,2) as tax,
       (coalesce(sum(round(i.quantity * i.unit_price, 2)), 0)
         + round(coalesce(sum(round(i.quantity * i.unit_price, 2)), 0) * q.tax_rate_percent / 100, 2))::numeric(16,2) as total
from public.quotations q
left join public.quotation_items i on i.quotation_id = q.id
group by q.id, q.tax_rate_percent;

do $$
declare t text;
begin
  foreach t in array array['customers','enquiries','quotations'] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_updated', t);
  end loop;
end $$;
