-- Profile fields for avatar + bio + onboarding flag. Safe to re-run.

alter table public.profiles
  add column if not exists bio text,
  add column if not exists avatar_url text,
  add column if not exists onboarding_completed boolean not null default false;

update public.profiles
set onboarding_completed = true
where onboarding_completed = false
  and coalesce(nullif(trim(first_name), ''), null) is not null;
