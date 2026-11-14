-- =====================================================================
-- 0009 PRIVATE DOCUMENT INDEX
-- Staff who may attach documents to a supplier / PO / tender / delivery / quotation need to index the
-- file in media_assets without holding the website "media.manage" permission. These policies are
-- limited to the private-docs bucket; the public media library rules are unchanged.
-- =====================================================================

create policy media_private_read on public.media_assets for select to authenticated
  using (bucket = 'private-docs' and deleted_at is null and public.can_read_private_docs());

create policy media_private_ins on public.media_assets for insert to authenticated
  with check (bucket = 'private-docs' and uploaded_by = auth.uid() and public.can_write_private_docs());

create policy media_private_upd on public.media_assets for update to authenticated
  using (bucket = 'private-docs' and public.can_write_private_docs())
  with check (bucket = 'private-docs' and public.can_write_private_docs());
