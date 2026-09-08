-- City catalogue and server-authoritative daily check-in access.
-- One free check-in is granted per Europe/Istanbul calendar day. Active Pro
-- entitlements and the App Review account have unlimited access.

create table if not exists public.cities (
  slug text primary key,
  name text not null unique,
  center_latitude double precision not null,
  center_longitude double precision not null,
  latitude_delta double precision not null default 0.18 check (latitude_delta > 0),
  longitude_delta double precision not null default 0.18 check (longitude_delta > 0),
  sort_order smallint not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint cities_slug_format check (slug = lower(slug) and slug ~ '^[a-z0-9-]+$')
);

insert into public.cities
  (slug, name, center_latitude, center_longitude, latitude_delta, longitude_delta, sort_order)
values
  ('istanbul', 'İstanbul', 41.0082, 28.9784, 0.30, 0.30, 10),
  ('ankara', 'Ankara', 39.9334, 32.8597, 0.24, 0.24, 20),
  ('izmir', 'İzmir', 38.4237, 27.1428, 0.24, 0.24, 30)
on conflict (slug) do update set
  name = excluded.name,
  center_latitude = excluded.center_latitude,
  center_longitude = excluded.center_longitude,
  latitude_delta = excluded.latitude_delta,
  longitude_delta = excluded.longitude_delta,
  sort_order = excluded.sort_order;

alter table public.cities enable row level security;
drop policy if exists "Active cities are readable" on public.cities;
create policy "Active cities are readable" on public.cities
  for select to anon, authenticated
  using (is_active = true);
revoke all on public.cities from anon, authenticated;
grant select on public.cities to anon, authenticated;

alter table public.places add column if not exists city_slug text;
update public.places
set city_slug = case
  when lower(coalesce(city, '')) in ('ankara') then 'ankara'
  when lower(coalesce(city, '')) in ('izmir', 'i̇zmir') then 'izmir'
  else 'istanbul'
end
where city_slug is null;
alter table public.places alter column city_slug set default 'istanbul';
alter table public.places alter column city_slug set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'places_city_slug_fkey'
      and conrelid = 'public.places'::regclass
  ) then
    alter table public.places
      add constraint places_city_slug_fkey
      foreign key (city_slug) references public.cities(slug);
  end if;
end $$;

create index if not exists places_approved_city_idx
  on public.places (city_slug, name)
  where status = 'approved';

-- Subscription state is written only by a trusted RevenueCat webhook/Edge
-- Function. It deliberately lives outside the exposed public schema.
create table if not exists private.subscription_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  entitlement_id text not null default 'pro',
  is_active boolean not null default false,
  expires_at timestamptz,
  store text,
  environment text not null default 'production'
    check (environment in ('production', 'sandbox')),
  revenuecat_event_id text unique,
  updated_at timestamptz not null default now()
);
revoke all on private.subscription_entitlements from public, anon, authenticated;
grant select, insert, update, delete on private.subscription_entitlements to service_role;

create or replace function private.sync_subscription_entitlement(
  target_user_id uuid,
  target_entitlement_id text,
  target_is_active boolean,
  target_expires_at timestamptz,
  target_store text,
  target_environment text,
  target_event_id text
)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into private.subscription_entitlements (
    user_id, entitlement_id, is_active, expires_at, store, environment,
    revenuecat_event_id, updated_at
  ) values (
    target_user_id, target_entitlement_id, target_is_active, target_expires_at,
    target_store, target_environment, target_event_id, now()
  )
  on conflict (user_id) do update set
    entitlement_id = excluded.entitlement_id,
    is_active = excluded.is_active,
    expires_at = excluded.expires_at,
    store = excluded.store,
    environment = excluded.environment,
    revenuecat_event_id = excluded.revenuecat_event_id,
    updated_at = excluded.updated_at;
$$;
revoke all on function private.sync_subscription_entitlement(uuid, text, boolean, timestamptz, text, text, text)
  from public, anon, authenticated;
grant execute on function private.sync_subscription_entitlement(uuid, text, boolean, timestamptz, text, text, text)
  to service_role;

create or replace function public.sync_revenuecat_entitlement(
  target_user_id uuid,
  target_entitlement_id text,
  target_is_active boolean,
  target_expires_at timestamptz,
  target_store text,
  target_environment text,
  target_event_id text
)
returns void
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.sync_subscription_entitlement(
    target_user_id, target_entitlement_id, target_is_active, target_expires_at,
    target_store, target_environment, target_event_id
  );
$$;
revoke all on function public.sync_revenuecat_entitlement(uuid, text, boolean, timestamptz, text, text, text)
  from public, anon, authenticated;
grant execute on function public.sync_revenuecat_entitlement(uuid, text, boolean, timestamptz, text, text, text)
  to service_role;

create table if not exists public.check_in_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  place_id uuid not null references public.places(id) on delete cascade,
  check_in_id uuid not null references public.check_ins(id) on delete cascade,
  usage_date date not null,
  access_kind text not null check (access_kind in ('free', 'pro', 'app_review')),
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create unique index if not exists check_in_usage_one_free_daily_idx
  on public.check_in_usage (user_id, usage_date)
  where access_kind = 'free';
create index if not exists check_in_usage_user_date_idx
  on public.check_in_usage (user_id, usage_date desc);

alter table public.check_in_usage enable row level security;
drop policy if exists "Users read own check-in usage" on public.check_in_usage;
create policy "Users read own check-in usage" on public.check_in_usage
  for select to authenticated
  using ((select auth.uid()) = user_id);
revoke all on public.check_in_usage from anon, authenticated;
grant select on public.check_in_usage to authenticated;

-- Existing data could contain more than one active row for a user. Keep the
-- newest before enforcing the invariant used by the atomic RPC below.
with ranked as (
  select id, row_number() over (
    partition by user_id order by checked_in_at desc, id desc
  ) as position
  from public.check_ins
  where is_active = true
)
update public.check_ins as c
set is_active = false,
    checked_out_at = coalesce(c.checked_out_at, now())
from ranked
where c.id = ranked.id and ranked.position > 1;

create unique index if not exists check_ins_one_active_per_user_idx
  on public.check_ins (user_id)
  where is_active = true;

create or replace function private.perform_check_in(
  target_place_id uuid,
  request_id uuid
)
returns table (
  check_in_id uuid,
  decision text,
  free_remaining smallint
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  today_in_turkey date := (timezone('Europe/Istanbul', now()))::date;
  existing_check_in_id uuid;
  existing_usage public.check_in_usage%rowtype;
  has_pro boolean := false;
  has_review_access boolean := false;
  used_free boolean := false;
  access_kind_value text;
  new_check_in_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if request_id is null then
    raise exception 'idempotency_key is required' using errcode = '22004';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(current_user_id::text, 0));

  select u.* into existing_usage
  from public.check_in_usage u
  where u.user_id = current_user_id
    and u.idempotency_key = request_id;
  if found then
    return query select
      existing_usage.check_in_id,
      'already_processed'::text,
      (case when existing_usage.access_kind = 'free' then 0 else 1 end)::smallint;
    return;
  end if;

  if not exists (
    select 1 from public.places p
    where p.id = target_place_id and p.status = 'approved'
  ) then
    raise exception 'Approved place not found' using errcode = '22023';
  end if;

  select c.id into existing_check_in_id
  from public.check_ins c
  where c.user_id = current_user_id
    and c.place_id = target_place_id
    and c.is_active = true
  limit 1;
  if existing_check_in_id is not null then
    select exists (
      select 1 from public.check_in_usage u
      where u.user_id = current_user_id
        and u.usage_date = today_in_turkey
        and u.access_kind = 'free'
    ) into used_free;
    return query select existing_check_in_id, 'already_active'::text,
      (case when used_free then 0 else 1 end)::smallint;
    return;
  end if;

  select exists (
    select 1 from private.subscription_entitlements e
    where e.user_id = current_user_id
      and e.entitlement_id = 'pro'
      and e.is_active = true
      and e.environment = 'production'
      and (e.expires_at is null or e.expires_at > now())
  ) into has_pro;

  has_review_access := coalesce(
    (select auth.jwt() -> 'app_metadata' ->> 'app_review_access') = 'true',
    false
  );

  select exists (
    select 1 from public.check_in_usage u
    where u.user_id = current_user_id
      and u.usage_date = today_in_turkey
      and u.access_kind = 'free'
  ) into used_free;

  if not has_pro and not has_review_access and used_free then
    return query select null::uuid, 'paywall_required'::text, 0::smallint;
    return;
  end if;

  access_kind_value := case
    when has_review_access then 'app_review'
    when has_pro then 'pro'
    else 'free'
  end;

  update public.check_ins
  set is_active = false, checked_out_at = coalesce(checked_out_at, now())
  where user_id = current_user_id and is_active = true;

  insert into public.check_ins (place_id, user_id, is_active)
  values (target_place_id, current_user_id, true)
  returning id into new_check_in_id;

  insert into public.check_in_usage (
    user_id, place_id, check_in_id, usage_date, access_kind, idempotency_key
  ) values (
    current_user_id, target_place_id, new_check_in_id,
    today_in_turkey, access_kind_value, request_id
  );

  return query select new_check_in_id, 'allowed'::text,
    (case when access_kind_value = 'free' then 0 else 1 end)::smallint;
end;
$$;

revoke all on function private.perform_check_in(uuid, uuid) from public, anon;
grant execute on function private.perform_check_in(uuid, uuid) to authenticated, service_role;

create or replace function public.attempt_check_in(
  target_place_id uuid,
  idempotency_key uuid
)
returns table (
  check_in_id uuid,
  decision text,
  free_remaining smallint
)
language sql
volatile
security invoker
set search_path = ''
as $$
  select * from private.perform_check_in(target_place_id, idempotency_key);
$$;
revoke all on function public.attempt_check_in(uuid, uuid) from public, anon;
grant execute on function public.attempt_check_in(uuid, uuid) to authenticated;

create or replace function private.read_check_in_access()
returns table (
  free_remaining smallint,
  has_unlimited boolean,
  access_tier text,
  resets_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  today_in_turkey date := (timezone('Europe/Istanbul', now()))::date;
  used_free boolean := false;
  has_pro boolean := false;
  has_review_access boolean := false;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select exists (
    select 1 from public.check_in_usage u
    where u.user_id = current_user_id
      and u.usage_date = today_in_turkey
      and u.access_kind = 'free'
  ) into used_free;

  select exists (
    select 1 from private.subscription_entitlements e
    where e.user_id = current_user_id
      and e.entitlement_id = 'pro'
      and e.is_active = true
      and e.environment = 'production'
      and (e.expires_at is null or e.expires_at > now())
  ) into has_pro;

  has_review_access := coalesce(
    (select auth.jwt() -> 'app_metadata' ->> 'app_review_access') = 'true',
    false
  );

  return query select
    (case when used_free then 0 else 1 end)::smallint,
    (has_pro or has_review_access),
    (case when has_review_access then 'app_review' when has_pro then 'pro' else 'free' end)::text,
    ((today_in_turkey + 1)::timestamp at time zone 'Europe/Istanbul');
end;
$$;
revoke all on function private.read_check_in_access() from public, anon;
grant execute on function private.read_check_in_access() to authenticated, service_role;

create or replace function public.get_check_in_access()
returns table (
  free_remaining smallint,
  has_unlimited boolean,
  access_tier text,
  resets_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.read_check_in_access();
$$;
revoke all on function public.get_check_in_access() from public, anon;
grant execute on function public.get_check_in_access() to authenticated;

create or replace function private.perform_check_out(target_place_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  changed integer;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  update public.check_ins
  set is_active = false, checked_out_at = coalesce(checked_out_at, now())
  where user_id = current_user_id
    and place_id = target_place_id
    and is_active = true;
  get diagnostics changed = row_count;
  return changed > 0;
end;
$$;
revoke all on function private.perform_check_out(uuid) from public, anon;
grant execute on function private.perform_check_out(uuid) to authenticated, service_role;

create or replace function public.end_check_in(target_place_id uuid)
returns boolean
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.perform_check_out(target_place_id);
$$;
revoke all on function public.end_check_in(uuid) from public, anon;
grant execute on function public.end_check_in(uuid) to authenticated;

-- Direct writes stay temporarily available for the already-reviewed 1.0 app.
-- Apply supabase/rollout/enforce_checkin_rpc_only.sql only after the credits
-- build is the minimum supported version; otherwise 1.0 check-ins would break.
