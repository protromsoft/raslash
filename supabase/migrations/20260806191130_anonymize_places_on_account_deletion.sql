begin;

-- User-submitted places are shared catalogue records. Keep the place when its
-- creator deletes their account, but remove the personal link and submitter
-- name. All private child rows continue to follow profiles(id) ON DELETE
-- CASCADE, while ratings already use ON DELETE SET NULL and are explicitly
-- removed by the account-deletion Edge Function.
alter table public.places
  drop constraint if exists places_created_by_fkey;

alter table public.places
  add constraint places_created_by_fkey
  foreign key (created_by)
  references public.profiles(id)
  on delete set null;

commit;
