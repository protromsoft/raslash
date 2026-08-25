-- Applied idempotently to production through SQL Editor on 2026-08-25.
begin;

alter table public.profiles
  add column if not exists onboarding_completed boolean not null default false;

-- Existing users who already completed the name step must not be sent back to
-- onboarding when the server-side flag becomes authoritative.
update public.profiles
set onboarding_completed = true
where onboarding_completed = false
  and nullif(trim(first_name), '') is not null;

-- The profiles table uses column-level write grants. Adding the column alone
-- would leave authenticated users unable to persist this flag through the API.
grant insert (onboarding_completed) on public.profiles to authenticated;
grant update (onboarding_completed) on public.profiles to authenticated;

commit;
