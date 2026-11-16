-- Harmless migration used to prove that GitHub -> Supabase automation works end to end.
-- It only attaches a description to a table; no data or structure changes.
comment on table public.hr_requisitions is 'Client staffing requests (HR Outsourcing module). Internal only; never published on the website.';
