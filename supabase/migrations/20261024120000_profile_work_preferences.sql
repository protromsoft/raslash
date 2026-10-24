-- Onboarding answers (goals, work style, venue priorities, working times) as
-- keys chosen from fixed lists in the app. The app weights the "En iyi puan"
-- order with the priorities. Idempotent.

alter table public.profiles add column if not exists work_preferences jsonb not null default '{}'::jsonb;
alter table public.profiles drop constraint if exists profiles_work_preferences_check;
alter table public.profiles add constraint profiles_work_preferences_check
  check (jsonb_typeof(work_preferences) = 'object' and octet_length(work_preferences::text) <= 2000);
