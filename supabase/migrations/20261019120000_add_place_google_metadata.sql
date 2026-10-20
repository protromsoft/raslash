-- Google metadata the new place filter decides on. Stored so that the
-- reclassify script and future syncs do not need a Place Details call per row.
-- Idempotent; safe to re-run.

alter table public.places
  add column if not exists google_primary_type text,
  add column if not exists google_types text[] not null default '{}',
  add column if not exists business_status text;

comment on column public.places.google_primary_type is 'Google Places primaryType, e.g. coffee_shop';
comment on column public.places.google_types is 'Every Google Places type attached to the place';
comment on column public.places.business_status is 'Google businessStatus: OPERATIONAL, CLOSED_TEMPORARILY, CLOSED_PERMANENTLY';

-- The sync writes with the service role, so the MVP anon insert policy no
-- longer needs to admit approved Google rows; new Google rows arrive pending.
drop policy if exists "Google sync insert places" on public.places;
create policy "Google sync insert places" on public.places
  for insert
  with check (
    (source = 'google' and status = 'pending')
    or (source = 'user' and status in ('pending', 'approved'))
  );
