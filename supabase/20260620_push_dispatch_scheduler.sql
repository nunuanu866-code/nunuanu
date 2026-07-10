-- Runs the Web Push dispatcher from Supabase Cron.
-- Apply after 20260620_pwa_push_notifications.sql and after setting Vercel env vars.
-- PUSH_DISPATCH_SECRET is already registered in Vercel production.

create extension if not exists pg_net;
create extension if not exists pg_cron;

select cron.schedule(
  'nunuanu-push-dispatch-every-minute',
  '* * * * *',
  $$
  select
    net.http_post(
      url := 'https://nununanu-app.vercel.app/api/push-dispatch',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer 6418074f5e1512600f9578ea90564b85e79429dcd8036293642c80ebcdb2d288'
      ),
      body := jsonb_build_object(
        'source', 'supabase-cron',
        'queued_at', now()
      ),
      timeout_milliseconds := 25000
    ) as request_id;
  $$
);
