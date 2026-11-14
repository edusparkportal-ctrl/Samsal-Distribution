-- =====================================================================
-- 0008 QUOTATION GUARDS
-- Once a quotation has left draft, its lines and commercial terms are frozen so the PDF the customer
-- received always matches the record. A mistake is corrected by cancelling and issuing a new quotation.
-- =====================================================================

create or replace function public.guard_quotation_items()
returns trigger language plpgsql security definer set search_path = public as $$
declare qid uuid; st text;
begin
  qid := case when tg_op = 'DELETE' then old.quotation_id else new.quotation_id end;
  select status into st from public.quotations where id = qid;
  if st is not null and st <> 'draft' then
    raise exception 'This quotation is no longer a draft, so its lines cannot be changed. Cancel it and prepare a new one.' using errcode = 'P0001';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
create trigger quotation_items_guard before insert or update or delete on public.quotation_items
  for each row execute function public.guard_quotation_items();

create or replace function public.guard_quotation_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status <> 'draft' then
    if new.number is distinct from old.number or new.currency is distinct from old.currency
       or new.tax_rate_percent is distinct from old.tax_rate_percent or new.issue_date is distinct from old.issue_date
       or new.customer_id is distinct from old.customer_id or new.delivery_terms is distinct from old.delivery_terms
       or new.payment_terms is distinct from old.payment_terms or new.notes is distinct from old.notes
       or new.valid_until is distinct from old.valid_until then
      raise exception 'This quotation has been issued, so its terms can no longer be changed.' using errcode = 'P0001';
    end if;
  end if;
  if old.status in ('accepted','declined','cancelled','expired') and new.status is distinct from old.status then
    raise exception 'A % quotation cannot change status.', old.status using errcode = 'P0001';
  end if;
  if new.status = 'draft' and old.status <> 'draft' then
    raise exception 'A quotation cannot go back to draft.' using errcode = 'P0001';
  end if;
  if new.status in ('accepted','declined') and old.status is distinct from new.status then
    new.decision := new.status; new.decision_at := coalesce(new.decision_at, now()); new.decision_by := coalesce(new.decision_by, auth.uid());
  end if;
  return new;
end;
$$;
create trigger quotations_guard before update on public.quotations
  for each row execute function public.guard_quotation_update();
