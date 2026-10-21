-- Schedules the nightly cleanup-photos Edge Function (03:00 Europe/Istanbul =
-- 00:00 UTC). Run after:
--   1. migration 20261022150000_photo_cleanup.sql is applied,
--   2. a random secret is stored in Vault as 'photo_cleanup_secret' AND set as
--      the function secret PHOTO_CLEANUP_SECRET (same value; never committed),
--   3. cleanup-photos is deployed with --no-verify-jwt.
-- Idempotent: re-running replaces the job.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid) from cron.job where jobname = 'cleanup-photos';

select cron.schedule(
  'cleanup-photos',
  '0 0 * * *',
  $job$
  select net.http_post(
    url := 'https://acvplymfplzbwhfeypfw.supabase.co/functions/v1/cleanup-photos',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cleanup-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'photo_cleanup_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $job$
);
