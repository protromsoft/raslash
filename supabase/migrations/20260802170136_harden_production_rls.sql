-- Applied to production as migration version 20260802170136.
begin;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

-- Remove the temporary policies that bypassed ownership and admin checks.
drop policy if exists "Google sync insert places" on public.places;
drop policy if exists "Google sync update places" on public.places;
drop policy if exists "User pending insert mvp" on public.places;
drop policy if exists "Pending places readable mvp" on public.places;
drop policy if exists "Pending places update mvp" on public.places;
drop policy if exists "Admin delete places mvp" on public.places;
drop policy if exists "Notifications insert mvp" on public.notifications;
drop policy if exists "Notifications read mvp" on public.notifications;
drop policy if exists "Ratings insert mvp" on public.ratings;
drop policy if exists "Ratings delete mvp" on public.ratings;
drop policy if exists "Presence read mvp" on public.map_presence;
drop policy if exists "Presence upsert own mvp" on public.map_presence;
drop policy if exists "Presence update own mvp" on public.map_presence;

-- Harden helper and Auth trigger functions.
create or replace function public.is_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select p.is_admin from public.profiles p where p.id = (select auth.uid())),
    false
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to postgres, supabase_auth_admin, service_role;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;

-- A private policy helper: users may access a place chat only while checked in.
create or replace function private.has_active_checkin(target_place_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.check_ins c
      where c.user_id = (select auth.uid())
        and c.place_id = target_place_id
        and c.is_active = true
    );
$$;
revoke all on function private.has_active_checkin(uuid) from public, anon;
grant execute on function private.has_active_checkin(uuid) to authenticated, service_role;

-- Privileged implementations live outside the exposed API schema. Public
-- wrappers below are SECURITY INVOKER and return only bounded, display-safe data.
create or replace function private.get_public_profiles(profile_ids uuid[])
returns table (
  id uuid,
  first_name text,
  last_name text,
  avatar_url text
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.first_name, p.last_name, p.avatar_url
  from public.profiles p
  where (select auth.uid()) is not null
    and p.id = any(profile_ids);
$$;
revoke all on function private.get_public_profiles(uuid[]) from public, anon;
grant execute on function private.get_public_profiles(uuid[]) to authenticated, service_role;

create or replace function public.get_public_profiles(profile_ids uuid[])
returns table (
  id uuid,
  first_name text,
  last_name text,
  avatar_url text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.get_public_profiles(profile_ids);
$$;
revoke all on function public.get_public_profiles(uuid[]) from public, anon;
grant execute on function public.get_public_profiles(uuid[]) to authenticated, service_role;

-- Active people are visible only to another active person in that place.
create or replace function private.get_active_people(target_place_id uuid)
returns table (
  id uuid,
  first_name text,
  last_name text,
  avatar_url text
)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct p.id, p.first_name, p.last_name, p.avatar_url
  from public.check_ins c
  join public.profiles p on p.id = c.user_id
  where private.has_active_checkin(target_place_id)
    and c.place_id = target_place_id
    and c.is_active = true;
$$;
revoke all on function private.get_active_people(uuid) from public, anon;
grant execute on function private.get_active_people(uuid) to authenticated, service_role;

create or replace function public.get_active_people(target_place_id uuid)
returns table (
  id uuid,
  first_name text,
  last_name text,
  avatar_url text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.get_active_people(target_place_id);
$$;
revoke all on function public.get_active_people(uuid) from public, anon;
grant execute on function public.get_active_people(uuid) to authenticated, service_role;

-- Expose only an aggregate count, never other users' exact coordinates.
create or replace function private.count_active_presence(
  min_lat double precision,
  max_lat double precision,
  min_lng double precision,
  max_lng double precision,
  since_at timestamptz
)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (select auth.uid()) is null then 0::bigint
    when min_lat > max_lat or min_lng > max_lng then 0::bigint
    else (
      select count(*)
      from public.map_presence mp
      where mp.updated_at >= since_at
        and mp.latitude between min_lat and max_lat
        and mp.longitude between min_lng and max_lng
    )
  end;
$$;
revoke all on function private.count_active_presence(double precision, double precision, double precision, double precision, timestamptz) from public, anon;
grant execute on function private.count_active_presence(double precision, double precision, double precision, double precision, timestamptz) to authenticated, service_role;

create or replace function public.count_active_presence(
  min_lat double precision,
  max_lat double precision,
  min_lng double precision,
  max_lng double precision,
  since_at timestamptz
)
returns bigint
language sql
stable
security invoker
set search_path = ''
as $$
  select private.count_active_presence(min_lat, max_lat, min_lng, max_lng, since_at);
$$;
revoke all on function public.count_active_presence(double precision, double precision, double precision, double precision, timestamptz) from public, anon;
grant execute on function public.count_active_presence(double precision, double precision, double precision, double precision, timestamptz) to authenticated, service_role;

-- Profiles: authenticated users can read/update only their row. Column grants
-- prevent clients from ever writing is_admin or created_at.
drop policy if exists "Profiles readable" on public.profiles;
drop policy if exists "Users insert own profile" on public.profiles;
drop policy if exists "Users update own profile" on public.profiles;
create policy "Users read own profile" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);
create policy "Users insert own profile" on public.profiles
  for insert to authenticated
  with check ((select auth.uid()) = id and is_admin = false);
create policy "Users update own profile" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant insert (id, first_name, last_name, age, profession, gender, bio, avatar_url, linkedin, instagram, onboarding_completed)
  on public.profiles to authenticated;
grant update (first_name, last_name, age, profession, gender, bio, avatar_url, linkedin, instagram, onboarding_completed)
  on public.profiles to authenticated;

-- Places: public catalogue; pending rows belong to their submitter; moderation
-- and Google sync require a database admin profile.
drop policy if exists "Approved places public" on public.places;
drop policy if exists "Users submit places" on public.places;
drop policy if exists "Admins update places" on public.places;
drop policy if exists "Admins delete places" on public.places;
create policy "Approved places public" on public.places
  for select to anon
  using (status = 'approved');
create policy "Authenticated places access" on public.places
  for select to authenticated
  using (
    status = 'approved'
    or created_by = (select auth.uid())
    or (select public.is_admin())
  );
create policy "Users submit pending places" on public.places
  for insert to authenticated
  with check (
    (source = 'user' and status = 'pending' and created_by = (select auth.uid()))
    or (select public.is_admin())
  );
create policy "Admins update places" on public.places
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "Admins delete places" on public.places
  for delete to authenticated
  using ((select public.is_admin()));

revoke all on public.places from anon, authenticated;
grant select on public.places to anon, authenticated;
grant insert, update, delete on public.places to authenticated;

-- Ratings: public read, authenticated ownership on insert, admin-only delete.
drop policy if exists "Ratings public read" on public.ratings;
drop policy if exists "Users rate" on public.ratings;
drop policy if exists "Admins delete ratings" on public.ratings;
create policy "Ratings public read" on public.ratings
  for select to anon, authenticated using (true);
create policy "Users rate" on public.ratings
  for insert to authenticated
  with check ((select auth.uid()) = user_id or (select public.is_admin()));
create policy "Admins delete ratings" on public.ratings
  for delete to authenticated
  using ((select public.is_admin()));

revoke all on public.ratings from anon, authenticated;
grant select on public.ratings to anon, authenticated;
grant insert, delete on public.ratings to authenticated;

-- Check-ins are private. Other active people are exposed through the bounded RPC.
drop policy if exists "Check-ins readable" on public.check_ins;
drop policy if exists "Users manage own check-ins" on public.check_ins;
drop policy if exists "Users update own check-ins" on public.check_ins;
create policy "Users read own check-ins" on public.check_ins
  for select to authenticated
  using ((select auth.uid()) = user_id or (select public.is_admin()));
create policy "Users create own check-ins" on public.check_ins
  for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users update own check-ins" on public.check_ins
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.check_ins from anon, authenticated;
grant select, insert, update on public.check_ins to authenticated;

-- Messages require an active check-in at the same place.
drop policy if exists "Messages readable" on public.messages;
drop policy if exists "Users send messages" on public.messages;
create policy "Checked-in users read messages" on public.messages
  for select to authenticated
  using (private.has_active_checkin(place_id) or (select public.is_admin()));
create policy "Checked-in users send messages" on public.messages
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and private.has_active_checkin(place_id)
  );

revoke all on public.messages from anon, authenticated;
grant select, insert on public.messages to authenticated;

-- Notifications are per-user; admins may create system notifications.
drop policy if exists "Users read own notifications" on public.notifications;
drop policy if exists "Admins insert notifications" on public.notifications;
drop policy if exists "Users update own notifications" on public.notifications;
create policy "Users read own notifications" on public.notifications
  for select to authenticated
  using ((select auth.uid()) = user_id or (select public.is_admin()));
create policy "Users insert own notifications" on public.notifications
  for insert to authenticated
  with check ((select auth.uid()) = user_id or (select public.is_admin()));
create policy "Users update own notifications" on public.notifications
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.notifications from anon, authenticated;
grant select, insert, update on public.notifications to authenticated;

-- Presence rows are private to their owner; aggregate counts use the RPC above.
create policy "Users read own presence" on public.map_presence
  for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users insert own presence" on public.map_presence
  for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users update own presence" on public.map_presence
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.map_presence from anon, authenticated;
grant select, insert, update on public.map_presence to authenticated;

-- Public bucket URLs remain readable, but object listing is limited to owner.
drop policy if exists "Avatar images are publicly accessible" on storage.objects;
drop policy if exists "Users can upload their own avatar" on storage.objects;
drop policy if exists "Users can update their own avatar" on storage.objects;
drop policy if exists "Users can delete their own avatar" on storage.objects;
create policy "Users can read their own avatar object" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'avatars'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );
create policy "Users can upload their own avatar" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );
create policy "Users can update their own avatar" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'avatars'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );
create policy "Users can delete their own avatar" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

commit;
