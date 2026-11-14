-- =====================================================================
-- 0006 STORAGE: two buckets.
--   public-media : website images and approved public downloads (publicly readable by URL, only staff can write).
--                  SVG is deliberately NOT allowed (it can carry scripts).
--   private-docs : supplier/tender/PO documents (never public; accessed through
--                  short-lived signed URLs created server-side after a permission check)
-- Size/type limits here mirror the checks in the application.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('public-media', 'public-media', true, 5242880,
     array['image/jpeg','image/png','image/webp','application/pdf']),
  ('private-docs', 'private-docs', false, 10485760,
     array['application/pdf','image/jpeg','image/png',
           'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
           'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
           'text/csv','text/plain'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Supabase enables RLS on storage.objects already; make sure of it.
alter table storage.objects enable row level security;

create policy "public-media read" on storage.objects for select to anon, authenticated
  using (bucket_id = 'public-media');
create policy "public-media write" on storage.objects for insert to authenticated
  with check (bucket_id = 'public-media' and public.has_permission('media.manage'));
create policy "public-media update" on storage.objects for update to authenticated
  using (bucket_id = 'public-media' and public.has_permission('media.manage'))
  with check (bucket_id = 'public-media' and public.has_permission('media.manage'));
create policy "public-media delete" on storage.objects for delete to authenticated
  using (bucket_id = 'public-media' and public.has_permission('media.manage'));

-- Private documents: any staff member with a *view* permission for a document-bearing module may
-- read; writing needs the matching manage permission. (Fine-grained per-record checks are enforced
-- by record_documents RLS and by the server before it issues a signed URL.)
create or replace function public.can_read_private_docs()
returns boolean language sql stable security definer set search_path = public as $$
  select public.can('suppliers.view','suppliers') or public.can('purchasing.view','procurement')
      or public.can('tenders.view','tenders') or public.can('orders.view','orders')
      or public.can('quotations.view','quotations') or public.has_permission('media.view');
$$;
create or replace function public.can_write_private_docs()
returns boolean language sql stable security definer set search_path = public as $$
  select public.can('suppliers.manage','suppliers') or public.can('purchasing.manage','procurement')
      or public.can('tenders.manage','tenders') or public.can('orders.manage','orders')
      or public.can('quotations.manage','quotations') or public.has_permission('media.manage');
$$;
grant execute on function public.can_read_private_docs(), public.can_write_private_docs() to authenticated;

create policy "private-docs read" on storage.objects for select to authenticated
  using (bucket_id = 'private-docs' and public.can_read_private_docs());
create policy "private-docs write" on storage.objects for insert to authenticated
  with check (bucket_id = 'private-docs' and public.can_write_private_docs());
create policy "private-docs update" on storage.objects for update to authenticated
  using (bucket_id = 'private-docs' and public.can_write_private_docs())
  with check (bucket_id = 'private-docs' and public.can_write_private_docs());
create policy "private-docs delete" on storage.objects for delete to authenticated
  using (bucket_id = 'private-docs' and public.can_write_private_docs());
