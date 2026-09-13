-- RevenueCat validates both production and sandbox StoreKit/Play Billing
-- transactions. Store builds use production transactions, while TestFlight,
-- App Review and internal purchase tests use sandbox transactions. Both are
-- trusted server-side signals; clients still cannot write entitlement rows.

-- Cover the two foreign keys used by cascade deletes and joins. The existing
-- user/date indexes do not start with either of these columns.
create index if not exists check_in_usage_check_in_id_idx
  on public.check_in_usage (check_in_id);
create index if not exists check_in_usage_place_id_idx
  on public.check_in_usage (place_id);

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
      and e.environment in ('production', 'sandbox')
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
      and e.environment in ('production', 'sandbox')
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
