-- Run AFTER migrations + seed.sql on a scratch database. Verifies the seed reproduces the existing
-- site content and invents nothing.
do $$
declare n int;
begin
  select count(*) into n from public.product_categories; assert n = 4, 'categories: ' || n;
  select count(*) into n from public.products where status = 'published'; assert n = 21, 'products: ' || n;
  select count(*) into n from public.products where category_id is null; assert n = 0, 'orphan products';
  select count(*) into n from public.services; assert n = 6, 'services: ' || n;
  select count(*) into n from public.industries; assert n = 6, 'industries: ' || n;
  select count(*) into n from public.process_steps; assert n = 5, 'process steps: ' || n;
  select count(*) into n from public.site_documents where media_id is not null; assert n = 0, 'documents must have no file until approved';
  -- nothing invented
  select count(*) into n from public.contact_channels; assert n = 0, 'no contact details are seeded';
  select count(*) into n from public.social_links; assert n = 0, 'no social accounts are seeded';
  select count(*) into n from public.staff_members; assert n = 0, 'no staff are seeded';
  select count(*) into n from public.company_values; assert n = 6, 'the six existing About-page values are seeded: ' || n;
  select count(*) into n from public.company_settings
    where mission is not null and vision is not null and address_line is null and registration_details is null and tax_pin is null and business_hours is null;
  assert n = 1, 'mission/vision are the existing About copy; address/registration/PIN/hours must be empty';
  select count(*) into n from public.products where packaging is not null; assert n = 0, 'no pack sizes invented';
  select count(*) into n from public.product_specifications where value not in ('Specified per order','Supplied by you','Provided after sourcing'); assert n = 0, 'no specification values invented';
  -- modules ship with inventory/orders/tenders off
  select count(*) into n from public.modules where key in ('inventory','orders','tenders') and enabled; assert n = 0, 'inventory/orders/tenders must start disabled';
  raise notice 'SEED TESTS PASSED';
end $$;
