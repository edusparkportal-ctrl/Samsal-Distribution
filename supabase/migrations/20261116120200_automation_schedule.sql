-- =====================================================================
-- 0014 AUTOMATION SCHEDULER
-- Runs public.run_automations() every 5 minutes with pg_cron. Each rule decides for itself whether it
-- is due, so the tick rate only sets the finest possible schedule.
--
-- Kept in its own migration and fully guarded: if pg_cron is not available (for example in the local
-- test database) nothing is scheduled and the rest of the system is unaffected. Administrators can
-- still use "Run now" in the Automation Control Centre.
-- =====================================================================
do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron is not available: automations will only run when started from the Control Centre';
    return;
  end if;
  begin
    create extension if not exists pg_cron with schema pg_catalog;
    if exists (select 1 from cron.job where jobname = 'samsal-automations') then
      perform cron.unschedule('samsal-automations');
    end if;
    perform cron.schedule('samsal-automations', '*/5 * * * *', 'select public.run_automations()');
  exception when others then
    raise notice 'Could not schedule automations with pg_cron (%). Use Run now, or enable pg_cron and re-run this migration.', sqlerrm;
  end;
end $$;
