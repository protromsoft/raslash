-- Venue photos are a Pro feature: only Pro members (and admins / App Review
-- access) can send or view chat and review photos. Enforced here, not only in
-- the app, so a modified client cannot bypass it. Idempotent.

-- 1. Who has photo access ------------------------------------------------------
create or replace function private.has_photo_access()
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select (select auth.uid()) is not null and (
    exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin = true)
    or exists (
      select 1 from private.subscription_entitlements e
      where e.user_id = (select auth.uid())
        and e.entitlement_id = 'pro'
        and e.is_active = true
        and e.environment in ('production', 'sandbox')
        and (e.expires_at is null or e.expires_at > now())
    )
    or coalesce((select auth.jwt() -> 'app_metadata' ->> 'app_review_access') = 'true', false)
  );
$function$;

revoke all on function private.has_photo_access() from public, anon;
grant execute on function private.has_photo_access() to authenticated;

-- 2. Review photos are no longer public -----------------------------------------
update storage.buckets set public = false where id = 'review-photos';

-- 3. Storage policies ---------------------------------------------------------
drop policy if exists "Chat photos upload while checked in" on storage.objects;
create policy "Chat photos upload while checked in" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'chat-photos'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and private.has_active_checkin(((storage.foldername(name))[1])::uuid)
    and private.has_photo_access()
  );

drop policy if exists "Chat photos readable while checked in" on storage.objects;
create policy "Chat photos readable while checked in" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'chat-photos'
    and (
      (select public.is_admin())
      or (private.has_active_checkin(((storage.foldername(name))[1])::uuid) and private.has_photo_access())
    )
  );

drop policy if exists "Review photos upload own folder" on storage.objects;
create policy "Review photos upload own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'review-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and private.has_photo_access()
  );

drop policy if exists "Review photos readable with Pro" on storage.objects;
create policy "Review photos readable with Pro" on storage.objects
  for select to authenticated
  using (bucket_id = 'review-photos' and private.has_photo_access());

-- 4. A rating may only carry a photo for members with photo access -------------
drop policy if exists "Users rate" on public.ratings;
create policy "Users rate" on public.ratings
  for insert to authenticated
  with check (
    (((select auth.uid()) = user_id) or (select public.is_admin()))
    and (photo_path is null or private.has_photo_access())
  );

-- 5. Photo messages need Pro (text messages are unchanged) --------------------
-- Wraps the existing sender: a photo from a member without access returns the
-- decision 'pro_required' before any quota is used.
create or replace function public.send_place_message(
  target_place_id uuid,
  message_body text,
  request_id uuid,
  message_photo_path text default null
)
returns table(message_id uuid, message_created_at timestamptz, decision text, messages_remaining integer, has_unlimited boolean)
language plpgsql
set search_path to ''
as $function$
begin
  if nullif(btrim(coalesce(message_photo_path, '')), '') is not null and not private.has_photo_access() then
    return query select null::uuid, null::timestamptz, 'pro_required'::text, 0, false;
    return;
  end if;
  return query select * from private.send_place_message(target_place_id, message_body, request_id, message_photo_path);
end;
$function$;

revoke all on function public.send_place_message(uuid, text, uuid, text) from public, anon;
grant execute on function public.send_place_message(uuid, text, uuid, text) to authenticated;
