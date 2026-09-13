-- Server-authoritative lifetime messaging quota and narrowly scoped admin
-- moderation RPCs. Privileged implementations remain outside the exposed
-- public schema; the public functions are SECURITY INVOKER wrappers only.
--
-- This is the additive rollout stage. Existing clients keep their legacy
-- direct INSERT path until supabase/rollout/message_quota_cutover.sql is run
-- after every supported build has switched to send_place_message().

begin;

-- Keep a monotonic lifetime counter so deleting a place or transcript cannot
-- restore free credits. Existing messages are counted during rollout.
create table if not exists private.message_usage (
  user_id uuid primary key references auth.users(id) on delete cascade,
  sent_count integer not null default 0 check (sent_count >= 0),
  updated_at timestamptz not null default now()
);

alter table private.message_usage enable row level security;
revoke all on private.message_usage from public, anon, authenticated;
grant select, insert, update on private.message_usage to service_role;

insert into private.message_usage as usage (user_id, sent_count, updated_at)
select m.user_id, count(*)::integer, now()
from public.messages m
group by m.user_id
on conflict (user_id) do update
set sent_count = greatest(usage.sent_count, excluded.sent_count),
    updated_at = now();

-- A caller-generated request id makes retries idempotent and prevents one
-- message from consuming the quota twice.
alter table public.messages
  add column if not exists client_request_id uuid;

create unique index if not exists messages_user_request_id_idx
  on public.messages (user_id, client_request_id)
  where client_request_id is not null;
create index if not exists messages_user_id_idx
  on public.messages (user_id);
create index if not exists messages_place_created_at_idx
  on public.messages (place_id, created_at desc);
create index if not exists notifications_user_created_at_idx
  on public.notifications (user_id, created_at desc);
create index if not exists notifications_created_at_idx
  on public.notifications (created_at desc);

create or replace function private.send_place_message(
  target_place_id uuid,
  message_body text,
  request_id uuid
)
returns table (
  message_id uuid,
  message_created_at timestamptz,
  decision text,
  messages_remaining integer,
  has_unlimited boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  normalized_body text := btrim(message_body);
  existing_message_id uuid;
  existing_created_at timestamptz;
  existing_place_id uuid;
  existing_body text;
  new_message_id uuid;
  new_created_at timestamptz;
  lifetime_sent_count integer := 0;
  caller_is_admin boolean := false;
  caller_has_pro boolean := false;
  caller_has_review_access boolean := false;
  caller_has_unlimited boolean := false;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if target_place_id is null or request_id is null then
    raise exception 'place_id and request_id are required' using errcode = '22004';
  end if;
  if normalized_body is null or char_length(normalized_body) = 0 then
    raise exception 'Message body is required' using errcode = '22023';
  end if;
  if char_length(normalized_body) > 500 then
    raise exception 'Message body exceeds 500 characters' using errcode = '22001';
  end if;

  -- Sends share a global rollout lock. The eventual cutover takes the
  -- exclusive form of this lock before backfilling legacy inserts, so a send
  -- cannot straddle that backfill with a stale quota decision.
  perform pg_advisory_xact_lock_shared(
    hashtextextended('message-quota-cutover', 0)
  );

  -- Serialize all sends for one user. Together with the request-id index this
  -- makes both quota consumption and retries race-safe.
  perform pg_advisory_xact_lock(
    hashtextextended('message-quota:' || current_user_id::text, 0)
  );

  select coalesce(p.is_admin, false)
  into caller_is_admin
  from public.profiles p
  where p.id = current_user_id;
  caller_is_admin := coalesce(caller_is_admin, false);

  select exists (
    select 1
    from private.subscription_entitlements e
    where e.user_id = current_user_id
      and e.entitlement_id = 'pro'
      and e.is_active = true
      and e.environment in ('production', 'sandbox')
      and (e.expires_at is null or e.expires_at > now())
  ) into caller_has_pro;

  caller_has_review_access := coalesce(
    (select auth.jwt() -> 'app_metadata' ->> 'app_review_access') = 'true',
    false
  );
  caller_has_unlimited := caller_is_admin or caller_has_pro or caller_has_review_access;

  select m.id, m.created_at, m.place_id, m.body
  into existing_message_id, existing_created_at, existing_place_id, existing_body
  from public.messages m
  where m.user_id = current_user_id
    and m.client_request_id = request_id;

  select coalesce(u.sent_count, 0)
  into lifetime_sent_count
  from private.message_usage u
  where u.user_id = current_user_id;
  lifetime_sent_count := coalesce(lifetime_sent_count, 0);

  if existing_message_id is not null then
    if existing_place_id <> target_place_id or existing_body <> normalized_body then
      raise exception 'request_id was already used with different message data'
        using errcode = '22023';
    end if;
    return query select
      existing_message_id,
      existing_created_at,
      'already_processed'::text,
      greatest(0, 15 - lifetime_sent_count),
      caller_has_unlimited;
    return;
  end if;

  if not exists (
    select 1
    from public.places p
    where p.id = target_place_id
      and p.status = 'approved'
  ) then
    raise exception 'Approved place not found' using errcode = '22023';
  end if;

  if not caller_is_admin and not exists (
    select 1
    from public.check_ins c
    where c.user_id = current_user_id
      and c.place_id = target_place_id
      and c.is_active = true
  ) then
    raise exception 'Active check-in required' using errcode = '42501';
  end if;

  if not caller_has_unlimited and lifetime_sent_count >= 15 then
    return query select
      null::uuid,
      null::timestamptz,
      'limit_reached'::text,
      0,
      false;
    return;
  end if;

  insert into public.messages (place_id, user_id, body, client_request_id)
  values (target_place_id, current_user_id, normalized_body, request_id)
  returning id, created_at into new_message_id, new_created_at;

  insert into private.message_usage as usage (user_id, sent_count, updated_at)
  values (current_user_id, 1, now())
  on conflict (user_id) do update
  set sent_count = usage.sent_count + 1,
      updated_at = now()
  returning sent_count into lifetime_sent_count;

  return query select
    new_message_id,
    new_created_at,
    'sent'::text,
    greatest(0, 15 - lifetime_sent_count),
    caller_has_unlimited;
end;
$$;

revoke all on function private.send_place_message(uuid, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.send_place_message(uuid, text, uuid)
  to authenticated;

create or replace function public.send_place_message(
  target_place_id uuid,
  message_body text,
  request_id uuid
)
returns table (
  message_id uuid,
  message_created_at timestamptz,
  decision text,
  messages_remaining integer,
  has_unlimited boolean
)
language sql
volatile
security invoker
set search_path = ''
as $$
  select *
  from private.send_place_message(target_place_id, message_body, request_id);
$$;

revoke all on function public.send_place_message(uuid, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.send_place_message(uuid, text, uuid)
  to authenticated;

create or replace function private.get_message_access()
returns table (
  messages_remaining integer,
  has_unlimited boolean,
  access_tier text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  lifetime_sent_count integer := 0;
  caller_is_admin boolean := false;
  caller_has_pro boolean := false;
  caller_has_review_access boolean := false;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select coalesce(p.is_admin, false)
  into caller_is_admin
  from public.profiles p
  where p.id = current_user_id;
  caller_is_admin := coalesce(caller_is_admin, false);

  select exists (
    select 1
    from private.subscription_entitlements e
    where e.user_id = current_user_id
      and e.entitlement_id = 'pro'
      and e.is_active = true
      and e.environment in ('production', 'sandbox')
      and (e.expires_at is null or e.expires_at > now())
  ) into caller_has_pro;

  caller_has_review_access := coalesce(
    (select auth.jwt() -> 'app_metadata' ->> 'app_review_access') = 'true',
    false
  );

  select coalesce(u.sent_count, 0)
  into lifetime_sent_count
  from private.message_usage u
  where u.user_id = current_user_id;
  lifetime_sent_count := coalesce(lifetime_sent_count, 0);

  return query select
    greatest(0, 15 - lifetime_sent_count),
    caller_is_admin or caller_has_pro or caller_has_review_access,
    case
      when caller_is_admin then 'admin'
      when caller_has_pro then 'pro'
      when caller_has_review_access then 'app_review'
      else 'free'
    end::text;
end;
$$;

revoke all on function private.get_message_access()
  from public, anon, authenticated, service_role;
grant execute on function private.get_message_access()
  to authenticated;

create or replace function public.get_message_access()
returns table (
  messages_remaining integer,
  has_unlimited boolean,
  access_tier text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.get_message_access();
$$;

revoke all on function public.get_message_access()
  from public, anon, authenticated, service_role;
grant execute on function public.get_message_access()
  to authenticated;

create or replace function private.admin_list_messages(
  page_limit integer,
  page_offset integer,
  search_query text
)
returns table (
  message_id uuid,
  place_id uuid,
  place_name text,
  user_id uuid,
  user_name text,
  body text,
  message_created_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  safe_limit integer := greatest(1, least(coalesce(page_limit, 50), 100));
  safe_offset integer := greatest(0, coalesce(page_offset, 0));
  normalized_query text := left(nullif(btrim(search_query), ''), 100);
begin
  if current_user_id is null or not coalesce(
    (select p.is_admin from public.profiles p where p.id = current_user_id),
    false
  ) then
    raise exception 'Admin required' using errcode = '42501';
  end if;

  return query
  select
    m.id,
    m.place_id,
    coalesce(pl.name, 'Silinmiş mekan'),
    m.user_id,
    coalesce(
      nullif(btrim(concat_ws(' ', pr.first_name, pr.last_name)), ''),
      'Kullanıcı'
    ),
    m.body,
    m.created_at,
    count(*) over ()
  from public.messages m
  left join public.places pl on pl.id = m.place_id
  left join public.profiles pr on pr.id = m.user_id
  where normalized_query is null
    or m.body ilike '%' || normalized_query || '%'
    or pl.name ilike '%' || normalized_query || '%'
    or concat_ws(' ', pr.first_name, pr.last_name) ilike '%' || normalized_query || '%'
  order by m.created_at desc, m.id desc
  limit safe_limit
  offset safe_offset;
end;
$$;

revoke all on function private.admin_list_messages(integer, integer, text)
  from public, anon, authenticated, service_role;
grant execute on function private.admin_list_messages(integer, integer, text)
  to authenticated;

create or replace function public.admin_list_messages(
  page_limit integer default 50,
  page_offset integer default 0,
  search_query text default null
)
returns table (
  message_id uuid,
  place_id uuid,
  place_name text,
  user_id uuid,
  user_name text,
  body text,
  message_created_at timestamptz,
  total_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select *
  from private.admin_list_messages(page_limit, page_offset, search_query);
$$;

revoke all on function public.admin_list_messages(integer, integer, text)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_list_messages(integer, integer, text)
  to authenticated;

create or replace function private.admin_list_notifications(
  page_limit integer,
  page_offset integer,
  search_query text
)
returns table (
  notification_id uuid,
  recipient_id uuid,
  recipient_name text,
  title text,
  body text,
  notification_type text,
  place_id uuid,
  place_name text,
  is_read boolean,
  notification_created_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  safe_limit integer := greatest(1, least(coalesce(page_limit, 50), 100));
  safe_offset integer := greatest(0, coalesce(page_offset, 0));
  normalized_query text := left(nullif(btrim(search_query), ''), 100);
begin
  if current_user_id is null or not coalesce(
    (select p.is_admin from public.profiles p where p.id = current_user_id),
    false
  ) then
    raise exception 'Admin required' using errcode = '42501';
  end if;

  return query
  select
    n.id,
    n.user_id,
    coalesce(
      nullif(btrim(concat_ws(' ', pr.first_name, pr.last_name)), ''),
      'Kullanıcı'
    ),
    n.title,
    n.body,
    n.type,
    n.place_id,
    pl.name,
    n.read,
    n.created_at,
    count(*) over ()
  from public.notifications n
  left join public.profiles pr on pr.id = n.user_id
  left join public.places pl on pl.id = n.place_id
  where normalized_query is null
    or n.title ilike '%' || normalized_query || '%'
    or n.body ilike '%' || normalized_query || '%'
    or concat_ws(' ', pr.first_name, pr.last_name) ilike '%' || normalized_query || '%'
  order by n.created_at desc, n.id desc
  limit safe_limit
  offset safe_offset;
end;
$$;

revoke all on function private.admin_list_notifications(integer, integer, text)
  from public, anon, authenticated, service_role;
grant execute on function private.admin_list_notifications(integer, integer, text)
  to authenticated;

create or replace function public.admin_list_notifications(
  page_limit integer default 50,
  page_offset integer default 0,
  search_query text default null
)
returns table (
  notification_id uuid,
  recipient_id uuid,
  recipient_name text,
  title text,
  body text,
  notification_type text,
  place_id uuid,
  place_name text,
  is_read boolean,
  notification_created_at timestamptz,
  total_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select *
  from private.admin_list_notifications(page_limit, page_offset, search_query);
$$;

revoke all on function public.admin_list_notifications(integer, integer, text)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_list_notifications(integer, integer, text)
  to authenticated;

create or replace function private.admin_delete_notification(
  target_notification_id uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  deleted_count integer := 0;
begin
  if current_user_id is null or not coalesce(
    (select p.is_admin from public.profiles p where p.id = current_user_id),
    false
  ) then
    raise exception 'Admin required' using errcode = '42501';
  end if;
  if target_notification_id is null then
    raise exception 'notification_id is required' using errcode = '22004';
  end if;

  delete from public.notifications n
  where n.id = target_notification_id;
  get diagnostics deleted_count = row_count;
  return deleted_count = 1;
end;
$$;

revoke all on function private.admin_delete_notification(uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.admin_delete_notification(uuid)
  to authenticated;

create or replace function public.admin_delete_notification(
  target_notification_id uuid
)
returns boolean
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.admin_delete_notification(target_notification_id);
$$;

revoke all on function public.admin_delete_notification(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_delete_notification(uuid)
  to authenticated;

commit;
