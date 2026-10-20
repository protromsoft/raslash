-- CLI-created migration; filename aligned to the verified remote application version.
-- Additive, opt-in social discovery. No existing user is made discoverable.
-- Only venue coordinates are returned. Private conversations are not included
-- in the existing administrator's public venue-message browser.
create schema if not exists private;

create table private.social_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  map_visible boolean not null default false,
  allow_dm_requests boolean not null default false,
  updated_at timestamptz not null default now()
);
create table private.direct_threads (
  id uuid primary key default gen_random_uuid(),
  user_low uuid not null references public.profiles(id) on delete cascade,
  user_high uuid not null references public.profiles(id) on delete cascade,
  requested_by uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  low_read_at timestamptz,
  high_read_at timestamptz,
  unique (user_low, user_high),
  check (user_low < user_high),
  check (requested_by in (user_low, user_high))
);
create index direct_threads_high_recent on private.direct_threads(user_high, last_message_at desc, id);
create index direct_threads_low_recent on private.direct_threads(user_low, last_message_at desc, id);
create index direct_threads_requester on private.direct_threads(requested_by, created_at desc);
create table private.direct_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references private.direct_threads(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 500),
  request_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (sender_id, request_id)
);
create index direct_messages_thread_page on private.direct_messages(thread_id, created_at desc, id desc);
create index direct_messages_sender_recent on private.direct_messages(sender_id, created_at desc);
create table private.direct_message_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  message_id uuid not null references private.direct_messages(id) on delete cascade,
  reported_user_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (reason in ('inappropriate_content', 'harassment', 'spam', 'other')),
  status text not null default 'pending' check (status in ('pending', 'reviewed', 'actioned', 'dismissed')),
  created_at timestamptz not null default now(),
  unique (reporter_id, message_id)
);
create index direct_reports_message on private.direct_message_reports(message_id);
create index direct_reports_reported_user on private.direct_message_reports(reported_user_id);
alter table private.social_preferences enable row level security;
alter table private.direct_threads enable row level security;
alter table private.direct_messages enable row level security;
alter table private.direct_message_reports enable row level security;
revoke all on private.social_preferences, private.direct_threads,
  private.direct_messages, private.direct_message_reports from public, anon, authenticated;

-- Internal helper: never executable by API roles. Caller is the guarded RPC.
create function private.social_people(p_city text default null)
returns table(id uuid, first_name text, avatar_url text, bio text, profession text,
  place_id uuid, place_name text, city text, latitude double precision,
  longitude double precision, allow_dm_requests boolean)
language sql stable security invoker set search_path = '' as $$
  select pr.id, coalesce(nullif(pr.first_name, ''), 'RASLASH üyesi'), pr.avatar_url,
    pr.bio, pr.profession, pl.id, pl.name, pl.city, pl.latitude, pl.longitude, pref.allow_dm_requests
  from private.social_preferences pref
  join public.profiles pr on pr.id = pref.user_id
  join lateral (
    select c.place_id from public.check_ins c
    where c.user_id = pr.id and c.is_active
      and c.checked_in_at > now() - interval '3 hours'
    order by c.checked_in_at desc, c.id desc limit 1
  ) ci on true
  join public.places pl on pl.id = ci.place_id and pl.status = 'approved'
  where pref.map_visible and auth.uid() is not null
    and pl.latitude between -90 and 90 and pl.longitude between -180 and 180
    and (p_city is null or pl.city_slug = p_city)
    and not exists (select 1 from public.user_blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = pr.id)
         or (b.blocker_id = pr.id and b.blocked_id = auth.uid()));
$$;
revoke all on function private.social_people(text) from public, anon, authenticated;

create function private.social_action(p_action text, p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_other uuid;
  v_low uuid;
  v_high uuid;
  v_thread private.direct_threads%rowtype;
  v_message private.direct_messages%rowtype;
  v_preferences private.social_preferences%rowtype;
  v_request uuid;
  v_body text;
  v_data jsonb;
  v_rows jsonb;
  v_unlimited boolean;
  v_remaining integer;
  v_count integer;
  v_time timestamptz;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'profile_required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text) > 12000 then
    raise exception 'invalid_request';
  end if;

  if p_action = 'preferences' then
    select * into v_preferences from private.social_preferences where user_id = v_uid;
    return jsonb_build_object('map_visible', coalesce(v_preferences.map_visible, false),
      'allow_dm_requests', coalesce(v_preferences.allow_dm_requests, false));
  elsif p_action = 'set_preferences' then
    if jsonb_typeof(p_payload->'map_visible') is distinct from 'boolean'
      or jsonb_typeof(p_payload->'allow_dm_requests') is distinct from 'boolean' then
      raise exception 'invalid_preferences';
    end if;
    insert into private.social_preferences(user_id, map_visible, allow_dm_requests)
      values(v_uid, (p_payload->>'map_visible')::boolean, (p_payload->>'allow_dm_requests')::boolean)
      on conflict(user_id) do update set map_visible = excluded.map_visible,
        allow_dm_requests = excluded.allow_dm_requests, updated_at = now();
    return jsonb_build_object('ok', true);
  elsif p_action = 'discover' then
    if coalesce(p_payload->>'city', '') not in ('istanbul', 'ankara', 'izmir') then
      raise exception 'invalid_city';
    end if;
    select coalesce(jsonb_agg(to_jsonb(p) order by p.id), '[]'::jsonb) into v_rows
    from (select * from private.social_people(p_payload->>'city')
      where id > coalesce((p_payload->>'after')::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
      order by id limit 51) p;
    return jsonb_build_object('people', v_rows);
  elsif p_action = 'blocks' then
    select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) into v_rows from (
      select pr.id, pr.first_name, pr.avatar_url from public.user_blocks b
      join public.profiles pr on pr.id = b.blocked_id where b.blocker_id = v_uid
      order by b.created_at desc limit 200
    ) p;
    return jsonb_build_object('people', v_rows);
  elsif p_action = 'inbox' then
    select coalesce(jsonb_agg(to_jsonb(p) order by p.last_message_at desc, p.id desc), '[]'::jsonb)
    into v_rows from (
      select t.id, t.status, t.requested_by, t.last_message_at,
        pr.id as peer_id, pr.first_name, pr.avatar_url,
        coalesce((select count(*) from private.direct_messages m where m.thread_id = t.id
          and m.sender_id <> v_uid and m.created_at > coalesce(
            case when t.user_low = v_uid then t.low_read_at else t.high_read_at end, '-infinity'::timestamptz)), 0) as unread,
        (select m.body from private.direct_messages m where m.thread_id = t.id
          order by m.created_at desc, m.id desc limit 1) as preview
      from private.direct_threads t
      join public.profiles pr on pr.id = case when t.user_low = v_uid then t.user_high else t.user_low end
      where v_uid in (t.user_low, t.user_high) and t.status <> 'declined'
        and not exists(select 1 from public.user_blocks b where
          (b.blocker_id = v_uid and b.blocked_id = pr.id) or (b.blocker_id = pr.id and b.blocked_id = v_uid))
        and (p_payload->>'before_time' is null or (t.last_message_at, t.id) <
          ((p_payload->>'before_time')::timestamptz, (p_payload->>'before_id')::uuid))
      order by t.last_message_at desc, t.id desc limit 51
    ) p;
    return jsonb_build_object('threads', v_rows);
  elsif p_action in ('admin_reports', 'resolve_report') then
    if not exists(select 1 from public.profiles where id = v_uid and is_admin) then
      raise exception 'access_denied' using errcode = '42501';
    end if;
    if p_action = 'resolve_report' then
      if coalesce(p_payload->>'status', '') not in ('reviewed', 'dismissed') then
        raise exception 'invalid_report_status';
      end if;
      update private.direct_message_reports set status = p_payload->>'status'
        where id = (p_payload->>'report_id')::uuid;
      if not found then raise exception 'report_unavailable'; end if;
      return jsonb_build_object('ok', true);
    end if;
    -- Only explicitly reported content, never an unrestricted DM browser.
    select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) into v_rows from (
      select r.id, r.reporter_id, r.reported_user_id, r.reason, r.status, r.created_at,
        m.body from private.direct_message_reports r
      join private.direct_messages m on m.id = r.message_id
      order by r.created_at desc limit 100
    ) r;
    return jsonb_build_object('reports', v_rows);
  end if;

  -- All pair mutations/read authorization use the same pair lock. A completed
  -- block cannot race a new message or be bypassed via an idempotency retry.
  if p_action in ('profile', 'block', 'unblock', 'send') and p_payload->>'peer_id' is not null then
    v_other := (p_payload->>'peer_id')::uuid;
  else
    select * into v_thread from private.direct_threads where id = (p_payload->>'thread_id')::uuid;
    if v_thread.id is null or v_uid not in (v_thread.user_low, v_thread.user_high) then
      raise exception 'conversation_unavailable' using errcode = '42501';
    end if;
    v_other := case when v_thread.user_low = v_uid then v_thread.user_high else v_thread.user_low end;
  end if;
  if v_other is null or v_other = v_uid then raise exception 'invalid_recipient'; end if;
  v_low := least(v_uid, v_other); v_high := greatest(v_uid, v_other);
  if p_action = 'send' then
    perform pg_advisory_xact_lock_shared(hashtextextended('message-quota-cutover', 0));
    perform pg_advisory_xact_lock(hashtextextended('message-quota:' || v_uid::text, 0));
  end if;
  perform pg_advisory_xact_lock(hashtextextended('dm-pair:' || v_low::text || ':' || v_high::text, 0));

  if p_action = 'block' then
    -- IDs alone must not allow enumerating or interacting with private users.
    if not exists(select 1 from private.social_people() where id = v_other)
      and not exists(select 1 from private.direct_threads where user_low = v_low and user_high = v_high)
      and not exists(select 1 from public.user_blocks where blocker_id = v_uid and blocked_id = v_other) then
      raise exception 'person_unavailable' using errcode = '42501';
    end if;
    insert into public.user_blocks(blocker_id, blocked_id) values(v_uid, v_other)
      on conflict do nothing;
    return jsonb_build_object('ok', true);
  elsif p_action = 'unblock' then
    delete from public.user_blocks where blocker_id = v_uid and blocked_id = v_other;
    return jsonb_build_object('ok', true);
  end if;
  if exists(select 1 from public.user_blocks where
    (blocker_id = v_uid and blocked_id = v_other) or (blocker_id = v_other and blocked_id = v_uid)) then
    raise exception 'conversation_unavailable' using errcode = '42501';
  end if;
  select * into v_thread from private.direct_threads where user_low = v_low and user_high = v_high for update;

  if p_action = 'profile' then
    select to_jsonb(p) into v_data from private.social_people() p where id = v_other;
    if v_data is null and v_thread.id is not null and v_thread.status <> 'declined' then
      select jsonb_build_object('id', id, 'first_name', first_name, 'avatar_url', avatar_url,
        'bio', bio, 'profession', profession, 'allow_dm_requests', false)
        into v_data from public.profiles where id = v_other;
    end if;
    if v_data is null then raise exception 'person_unavailable' using errcode = '42501'; end if;
    return jsonb_build_object('person', v_data, 'thread_id', v_thread.id, 'status', v_thread.status);
  elsif p_action = 'respond' then
    if v_thread.id is null or v_thread.status <> 'pending' or v_thread.requested_by = v_uid
      or coalesce(p_payload->>'response', '') not in ('accepted', 'declined') then
      raise exception 'invalid_response' using errcode = '42501';
    end if;
    update private.direct_threads set status = p_payload->>'response' where id = v_thread.id;
    return jsonb_build_object('ok', true);
  elsif p_action = 'read' then
    if v_thread.id is null or v_thread.status = 'declined' then
      raise exception 'conversation_unavailable' using errcode = '42501';
    end if;
    select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at desc, m.id desc), '[]'::jsonb) into v_rows from (
      select id, sender_id, body, created_at from private.direct_messages where thread_id = v_thread.id
        and (p_payload->>'before_time' is null or (created_at, id) <
          ((p_payload->>'before_time')::timestamptz, (p_payload->>'before_id')::uuid))
      order by created_at desc, id desc limit 51
    ) m;
    if p_payload->>'before_time' is null then
      update private.direct_threads set
        low_read_at = case when user_low = v_uid then clock_timestamp() else low_read_at end,
        high_read_at = case when user_high = v_uid then clock_timestamp() else high_read_at end
        where id = v_thread.id;
    end if;
    select jsonb_build_object('id', id, 'first_name', first_name, 'avatar_url', avatar_url)
      into v_data from public.profiles where id = v_other;
    return jsonb_build_object('thread_id', v_thread.id, 'status', v_thread.status,
      'requested_by', v_thread.requested_by, 'peer', v_data, 'messages', v_rows);
  elsif p_action = 'report' then
    select * into v_message from private.direct_messages
      where id = (p_payload->>'message_id')::uuid and thread_id = v_thread.id and sender_id = v_other;
    if v_message.id is null then raise exception 'message_unavailable' using errcode = '42501'; end if;
    insert into private.direct_message_reports(reporter_id, reported_user_id, message_id, reason)
      values(v_uid, v_other, v_message.id, p_payload->>'reason') on conflict do nothing;
    return jsonb_build_object('ok', true);
  elsif p_action <> 'send' then
    raise exception 'invalid_action';
  end if;

  v_request := (p_payload->>'request_id')::uuid;
  v_body := btrim(p_payload->>'body');
  if v_request is null or v_body is null or char_length(v_body) not between 1 and 500
    or v_body !~ '[^[:space:]]' then raise exception 'invalid_message'; end if;
  -- Server-side rejection supplements UI checks; do not log rejected content.
  if v_body ~* '\m(orospu|sikeyim|sikerim|amk|piç|fuck|bitch|nigga|nigger)\M' then
    raise exception 'inappropriate_content';
  end if;
  select * into v_message from private.direct_messages where sender_id = v_uid and request_id = v_request;
  if v_message.id is not null then
    if v_thread.id is null or v_message.thread_id <> v_thread.id or v_message.body <> v_body then
      raise exception 'request_conflict';
    end if;
    return jsonb_build_object('thread_id', v_thread.id, 'message_id', v_message.id, 'replayed', true);
  end if;
  if v_thread.id is not null and v_thread.status <> 'accepted' then
    raise exception 'request_not_accepted';
  end if;
  if v_thread.id is null then
    -- Serialize permission revocation with first-request creation.
    perform 1 from private.social_preferences where user_id = v_other for share;
    if not exists(select 1 from private.social_people() where id = v_other and allow_dm_requests) then
      raise exception 'requests_closed' using errcode = '42501';
    end if;
    select count(*) into v_count from private.direct_threads where requested_by = v_uid
      and created_at > now() - interval '24 hours';
    if v_count >= 5 then raise exception 'request_rate_limit'; end if;
  end if;
  select count(*) into v_count from private.direct_messages where sender_id = v_uid
    and created_at > now() - interval '1 minute';
  if v_count >= 20 then raise exception 'message_rate_limit'; end if;
  select has_unlimited, messages_remaining into v_unlimited, v_remaining from private.get_message_access();
  if not coalesce(v_unlimited, false) and coalesce(v_remaining, 0) <= 0 then
    raise exception 'message_limit_reached';
  end if;
  if v_thread.id is null then
    insert into private.direct_threads(user_low, user_high, requested_by)
      values(v_low, v_high, v_uid) returning * into v_thread;
  end if;
  insert into private.direct_messages(thread_id, sender_id, body, request_id)
    values(v_thread.id, v_uid, v_body, v_request) returning * into v_message;
  insert into private.message_usage(user_id, sent_count, updated_at) values(v_uid, 1, now())
    on conflict(user_id) do update set sent_count = private.message_usage.sent_count + 1, updated_at = now();
  update private.direct_threads set last_message_at = v_message.created_at,
    low_read_at = case when user_low = v_uid then v_message.created_at else low_read_at end,
    high_read_at = case when user_high = v_uid then v_message.created_at else high_read_at end
    where id = v_thread.id;
  return jsonb_build_object('thread_id', v_thread.id, 'message_id', v_message.id, 'replayed', false);
end;
$$;
revoke all on function private.social_action(text, jsonb) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.social_action(text, jsonb) to authenticated;
create function public.social_action(p_action text, p_payload jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.social_action(p_action, p_payload);
$$;
revoke all on function public.social_action(text, jsonb) from public, anon;
grant execute on function public.social_action(text, jsonb) to authenticated;
comment on function public.social_action(text, jsonb) is
  'Authenticated opt-in venue-level discovery and private message requests. No precise GPS or emails.';
