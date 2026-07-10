-- Runs Naver Calendar ICS sync from Supabase Cron every 10 minutes.
-- Required Vercel env:
--   NAVER_CALENDAR_ICS_URL or NAVER_CALENDAR_ICS_URLS
-- Optional Vercel env:
--   NAVER_CALENDAR_SYNC_SECRET
--
-- If NAVER_CALENDAR_SYNC_SECRET is set, add the Authorization header below.

create extension if not exists pg_net;
create extension if not exists pg_cron;

select cron.unschedule('nunuanu-naver-calendar-sync-every-10-minutes')
where exists (
  select 1
  from cron.job
  where jobname = 'nunuanu-naver-calendar-sync-every-10-minutes'
);

select cron.schedule(
  'nunuanu-naver-calendar-sync-every-10-minutes',
  '*/10 * * * *',
  $$
  select
    net.http_post(
      url := 'https://nununanu-app.vercel.app/api/naver-calendar-sync',
      headers := jsonb_build_object(
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'source', 'supabase-cron',
        'queued_at', now()
      ),
      timeout_milliseconds := 25000
    ) as request_id;
  $$
);
