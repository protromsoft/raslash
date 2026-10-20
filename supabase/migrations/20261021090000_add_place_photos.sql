-- Live venue photos: camera shots shared in a place chat, and one optional
-- photo on a rating. Idempotent; safe to re-run.
--
-- Storage paths
--   chat-photos   (private)  <place_id>/<user_id>/<uuid>.jpg
--                 readable only by members with an active check-in at that
--                 place (same rule as the chat itself) and by admins.
--   review-photos (public)   <user_id>/<uuid>.jpg
--                 shown next to the rating on the place page.

-- 1. Buckets -----------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('chat-photos', 'chat-photos', false, 5242880, array['image/jpeg']),
  ('review-photos', 'review-photos', true, 5242880, array['image/jpeg'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- 2. Storage policies --------------------------------------------------------
drop policy if exists "Chat photos upload while checked in" on storage.objects;
create policy "Chat photos upload while checked in" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'chat-photos'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and private.has_active_checkin(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "Chat photos readable while checked in" on storage.objects;
create policy "Chat photos readable while checked in" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'chat-photos'
    and (
      (select public.is_admin())
      or private.has_active_checkin(((storage.foldername(name))[1])::uuid)
    )
  );

drop policy if exists "Admins delete chat photos" on storage.objects;
create policy "Admins delete chat photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'chat-photos' and (select public.is_admin()));

drop policy if exists "Review photos upload own folder" on storage.objects;
create policy "Review photos upload own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'review-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Admins delete review photos" on storage.objects;
create policy "Admins delete review photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'review-photos' and (select public.is_admin()));

-- 3. Columns -----------------------------------------------------------------
alter table public.messages add column if not exists photo_path text;
alter table public.ratings add column if not exists photo_path text;

alter table public.messages drop constraint if exists messages_photo_path_check;
alter table public.messages add constraint messages_photo_path_check
  check (photo_path is null or photo_path like place_id::text || '/' || user_id::text || '/%');

alter table public.ratings drop constraint if exists ratings_photo_path_check;
alter table public.ratings add constraint ratings_photo_path_check
  check (photo_path is null or photo_path like user_id::text || '/%');

-- 4. Sending a photo message -------------------------------------------------
-- Same quota, check-in and idempotency rules as text; a photo message may have
-- an empty caption. The 3-argument version is replaced by one with a default,
-- so clients that do not send a photo keep calling it unchanged.
drop function if exists public.send_place_message(uuid, text, uuid);
drop function if exists private.send_place_message(uuid, text, uuid);

create or replace function private.send_place_message(
  target_place_id uuid,
  message_body text,
  request_id uuid,
  message_photo_path text default null
)
returns table(message_id uuid, message_created_at timestamptz, decision text, messages_remaining integer, has_unlimited boolean)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  current_user_id uuid := (select auth.uid());
  normalized_body text := btrim(coalesce(message_body, ''));
  normalized_photo text := nullif(btrim(coalesce(message_photo_path, '')), '');
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
  if char_length(normalized_body) = 0 and normalized_photo is null then
    raise exception 'Message body is required' using errcode = '22023';
  end if;
  if char_length(normalized_body) > 500 then
    raise exception 'Message body exceeds 500 characters' using errcode = '22001';
  end if;
  if normalized_photo is not null
    and normalized_photo not like target_place_id::text || '/' || current_user_id::text || '/%' then
    raise exception 'Photo path does not belong to this message' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock_shared(hashtextextended('message-quota-cutover', 0));
  perform pg_advisory_xact_lock(hashtextextended('message-quota:' || current_user_id::text, 0));

  select coalesce(p.is_admin, false) into caller_is_admin
  from public.profiles p where p.id = current_user_id;
  caller_is_admin := coalesce(caller_is_admin, false);

  select exists (
    select 1 from private.subscription_entitlements e
    where e.user_id = current_user_id
      and e.entitlement_id = 'pro'
      and e.is_active = true
      and e.environment in ('production', 'sandbox')
      and (e.expires_at is null or e.expires_at > now())
  ) into caller_has_pro;

  caller_has_review_access := coalesce(
    (select auth.jwt() -> 'app_metadata' ->> 'app_review_access') = 'true', false);
  caller_has_unlimited := caller_is_admin or caller_has_pro or caller_has_review_access;

  select m.id, m.created_at, m.place_id, m.body
  into existing_message_id, existing_created_at, existing_place_id, existing_body
  from public.messages m
  where m.user_id = current_user_id and m.client_request_id = request_id;

  select coalesce(u.sent_count, 0) into lifetime_sent_count
  from private.message_usage u where u.user_id = current_user_id;
  lifetime_sent_count := coalesce(lifetime_sent_count, 0);

  if existing_message_id is not null then
    if existing_place_id <> target_place_id or existing_body <> normalized_body then
      raise exception 'request_id was already used with different message data' using errcode = '22023';
    end if;
    return query select existing_message_id, existing_created_at, 'already_processed'::text,
      greatest(0, 15 - lifetime_sent_count), caller_has_unlimited;
    return;
  end if;

  if not exists (
    select 1 from public.places p where p.id = target_place_id and p.status = 'approved'
  ) then
    raise exception 'Approved place not found' using errcode = '22023';
  end if;

  if not caller_is_admin and not exists (
    select 1 from public.check_ins c
    where c.user_id = current_user_id and c.place_id = target_place_id and c.is_active = true
  ) then
    raise exception 'Active check-in required' using errcode = '42501';
  end if;

  if not caller_has_unlimited and lifetime_sent_count >= 15 then
    return query select null::uuid, null::timestamptz, 'limit_reached'::text, 0, false;
    return;
  end if;

  insert into public.messages (place_id, user_id, body, client_request_id, photo_path)
  values (target_place_id, current_user_id, normalized_body, request_id, normalized_photo)
  returning id, created_at into new_message_id, new_created_at;

  insert into private.message_usage as usage (user_id, sent_count, updated_at)
  values (current_user_id, 1, now())
  on conflict (user_id) do update
  set sent_count = usage.sent_count + 1, updated_at = now()
  returning sent_count into lifetime_sent_count;

  return query select new_message_id, new_created_at, 'sent'::text,
    greatest(0, 15 - lifetime_sent_count), caller_has_unlimited;
end;
$function$;

create or replace function public.send_place_message(
  target_place_id uuid,
  message_body text,
  request_id uuid,
  message_photo_path text default null
)
returns table(message_id uuid, message_created_at timestamptz, decision text, messages_remaining integer, has_unlimited boolean)
language sql
set search_path to ''
as $function$
  select * from private.send_place_message(target_place_id, message_body, request_id, message_photo_path);
$function$;

-- Same grants as the 3-argument versions: the public wrapper runs as the
-- caller, so authenticated also needs execute on the definer function.
revoke all on function private.send_place_message(uuid, text, uuid, text) from public, anon;
revoke all on function public.send_place_message(uuid, text, uuid, text) from public, anon;
grant execute on function private.send_place_message(uuid, text, uuid, text) to authenticated;
grant execute on function public.send_place_message(uuid, text, uuid, text) to authenticated;
