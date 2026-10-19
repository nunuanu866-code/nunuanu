-- Runs the Web Push dispatcher from Supabase Cron.
-- Apply after 20260620_pwa_push_notifications.sql and after setting Vercel env vars.
-- Store PUSH_DISPATCH_SECRET in Supabase Vault as `push_dispatch_secret` before
-- applying this file. Never place the secret value in source control.

create extension if not exists pg_net;
create extension if not exists pg_cron;

do $$
begin
  if not exists (
    select 1
    from vault.decrypted_secrets
    where name = 'push_dispatch_secret'
      and nullif(decrypted_secret, '') is not null
  ) then
    raise exception 'Supabase Vault secret push_dispatch_secret is required';
  end if;
end
$$;

select cron.unschedule(jobid)
from cron.job
where jobname = 'nunuanu-push-dispatch-every-minute';

select cron.schedule(
  'nunuanu-push-dispatch-every-minute',
  '* * * * *',
  $dispatch$
  select
    net.http_post(
      url := 'https://nununanu-app.vercel.app/api/push-dispatch',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'push_dispatch_secret'
          limit 1
        )
      ),
      body := jsonb_build_object(
        'source', 'supabase-cron',
        'queued_at', now()
      ),
      timeout_milliseconds := 25000
    ) as request_id;
  $dispatch$
);
