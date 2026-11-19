-- =====================================================================
-- 0019 RESTRICTED DOCUMENT STORAGE for HR and Finance records
-- A separate private bucket and index, so contracts, applicant files, invoices and receipts are never visible to the
-- staff who can see supplier or tender documents. Access follows the record type:
--   employee, contract, job_applicant     -> people.docs   (module people)
--   invoice, supplier_bill                -> finance.docs  (module finance)
--   expense_claim (receipts)              -> finance.docs, and the claimant can add and read their own receipts
-- Files are only ever opened through short-lived signed links created after a permission check, and every
-- open is written to document_access_log. Payroll documents are deliberately not supported.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('restricted-docs', 'restricted-docs', false, 10485760,
        array['application/pdf','image/jpeg','image/png',
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              'text/csv','text/plain'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- mode: 'read' | 'add' | 'remove'
create or replace function public.restricted_doc_can(p_entity text, p_entity_id uuid, p_mode text)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  if p_entity in ('employee', 'contract', 'job_applicant') then
    return public.can('people.docs', 'people');
  elsif p_entity in ('invoice', 'supplier_bill') then
    return public.can('finance.docs', 'finance');
  elsif p_entity = 'expense_claim' then
    if public.can('finance.docs', 'finance') then return true; end if;
    return p_mode in ('read', 'add') and public.can('finance.claims', 'finance')
       and exists (select 1 from public.expense_claims c where c.id = p_entity_id and c.employee_id = public.my_employee_id());
  end if;
  return false;
end;
$$;

-- Folder-level check used by Storage policies (the first path segment is the record type).
create or replace function public.restricted_folder_can(p_folder text, p_mode text)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  if p_folder in ('employee', 'contract', 'job_applicant') then return public.can('people.docs', 'people');
  elsif p_folder in ('invoice', 'supplier_bill') then return public.can('finance.docs', 'finance');
  elsif p_folder = 'expense_claim' then
    return public.can('finance.docs', 'finance') or (p_mode in ('read', 'add') and public.can('finance.claims', 'finance'));
  end if;
  return false;
end;
$$;

create table public.restricted_documents (
  id           uuid primary key default gen_random_uuid(),
  entity_type  text not null check (entity_type in ('employee', 'contract', 'job_applicant', 'invoice', 'supplier_bill', 'expense_claim')),
  entity_id    uuid not null,
  label        text check (label is null or length(label) <= 120),
  storage_path text not null unique check (storage_path ~ '^[a-z_]{1,40}/[0-9]{6}/[0-9a-f-]{36}-[a-z0-9][a-z0-9._-]{0,120}$'),
  file_name    text not null check (length(file_name) between 1 and 200),
  mime_type    text not null,
  size_bytes   bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  check (split_part(storage_path, '/', 1) = entity_type)
);
create index restricted_documents_entity_idx on public.restricted_documents(entity_type, entity_id);

create table public.document_access_log (
  id         bigint generated always as identity primary key,
  doc_id     uuid,
  entity_type text,
  entity_id  uuid,
  file_name  text,
  actor_id   uuid,
  opened_at  timestamptz not null default now()
);

alter table public.restricted_documents enable row level security;
alter table public.document_access_log enable row level security;
revoke all on public.restricted_documents, public.document_access_log from anon, authenticated;
grant select, insert, delete on public.restricted_documents to authenticated;
grant select on public.document_access_log to authenticated;

create policy rdocs_read on public.restricted_documents for select to authenticated using (public.restricted_doc_can(entity_type, entity_id, 'read'));
create policy rdocs_ins on public.restricted_documents for insert to authenticated
  with check (created_by = auth.uid() and public.restricted_doc_can(entity_type, entity_id, 'add'));
create policy rdocs_del on public.restricted_documents for delete to authenticated using (public.restricted_doc_can(entity_type, entity_id, 'remove'));
create policy dal_read on public.document_access_log for select to authenticated using (public.has_permission('audit.view'));

create trigger restricted_documents_audit after insert or update or delete on public.restricted_documents for each row execute function public.audit_row('full');

-- Opening a file: permission check + access log in one step. Returns the storage path to sign.
create or replace function public.restricted_doc_open(p_id uuid)
returns table (storage_path text, file_name text) language plpgsql security definer set search_path = public as $$
declare d public.restricted_documents%rowtype;
begin
  select * into d from public.restricted_documents where id = p_id;
  if not found or not public.restricted_doc_can(d.entity_type, d.entity_id, 'read') then raise exception 'Not found'; end if;
  insert into public.document_access_log (doc_id, entity_type, entity_id, file_name, actor_id) values (d.id, d.entity_type, d.entity_id, d.file_name, auth.uid());
  return query select d.storage_path, d.file_name;
end;
$$;

-- Storage policies: only this bucket, only the people allowed for that record type.
create policy "restricted-docs read" on storage.objects for select to authenticated
  using (bucket_id = 'restricted-docs' and (public.restricted_folder_can(split_part(name, '/', 1), 'remove') or (owner = auth.uid() and public.restricted_folder_can(split_part(name, '/', 1), 'read'))));
create policy "restricted-docs write" on storage.objects for insert to authenticated
  with check (bucket_id = 'restricted-docs' and public.restricted_folder_can(split_part(name, '/', 1), 'add'));
create policy "restricted-docs delete" on storage.objects for delete to authenticated
  using (bucket_id = 'restricted-docs' and public.restricted_folder_can(split_part(name, '/', 1), 'remove'));

revoke all on function public.restricted_doc_can(text, uuid, text), public.restricted_folder_can(text, text), public.restricted_doc_open(uuid) from public, anon;
grant execute on function public.restricted_doc_can(text, uuid, text), public.restricted_folder_can(text, text), public.restricted_doc_open(uuid) to authenticated;
