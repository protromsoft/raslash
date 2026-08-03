-- Emergency rollback for 20260802170136_harden_production_rls.sql.
-- WARNING: this intentionally restores the permissive pre-hardening policies
-- captured from production on 2026-08-02. Use only to recover availability,
-- then fix forward and re-apply the hardening migration.

begin;

-- Remove hardened policies.
drop policy if exists "Users read own profile" on public.profiles;
drop policy if exists "Users insert own profile" on public.profiles;
drop policy if exists "Users update own profile" on public.profiles;
drop policy if exists "Approved places public" on public.places;
drop policy if exists "Authenticated places access" on public.places;
drop policy if exists "Users submit pending places" on public.places;
drop policy if exists "Admins update places" on public.places;
drop policy if exists "Admins delete places" on public.places;
drop policy if exists "Ratings public read" on public.ratings;
drop policy if exists "Users rate" on public.ratings;
drop policy if exists "Admins delete ratings" on public.ratings;
drop policy if exists "Users read own check-ins" on public.check_ins;
drop policy if exists "Users create own check-ins" on public.check_ins;
drop policy if exists "Users update own check-ins" on public.check_ins;
drop policy if exists "Checked-in users read messages" on public.messages;
drop policy if exists "Checked-in users send messages" on public.messages;
drop policy if exists "Users read own notifications" on public.notifications;
drop policy if exists "Users insert own notifications" on public.notifications;
drop policy if exists "Users update own notifications" on public.notifications;
drop policy if exists "Users read own presence" on public.map_presence;
drop policy if exists "Users insert own presence" on public.map_presence;
drop policy if exists "Users update own presence" on public.map_presence;
drop policy if exists "Users can read their own avatar object" on storage.objects;
drop policy if exists "Users can upload their own avatar" on storage.objects;
drop policy if exists "Users can update their own avatar" on storage.objects;
drop policy if exists "Users can delete their own avatar" on storage.objects;

-- Remove bounded RPCs and their private implementations.
drop function if exists public.get_public_profiles(uuid[]);
drop function if exists public.get_active_people(uuid);
drop function if exists public.count_active_presence(double precision, double precision, double precision, double precision, timestamptz);
drop function if exists private.get_public_profiles(uuid[]);
drop function if exists private.get_active_people(uuid);
drop function if exists private.count_active_presence(double precision, double precision, double precision, double precision, timestamptz);
drop function if exists private.has_active_checkin(uuid);
drop schema if exists private;

-- Restore the original helper and Auth trigger functions.
create or replace function public.is_admin()
returns boolean
language sql
stable
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
set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

grant execute on function public.is_admin() to public, anon, authenticated, service_role;
grant execute on function public.handle_new_user() to public, anon, authenticated, service_role;

-- Restore the original table privileges captured from production.
grant all on public.profiles to anon, authenticated;
grant all on public.places to anon, authenticated;
grant all on public.ratings to anon, authenticated;
grant all on public.check_ins to anon, authenticated;
grant all on public.messages to anon, authenticated;
grant all on public.notifications to anon, authenticated;
grant all on public.map_presence to anon, authenticated;

-- Restore the original permissive policy set.
create policy "Profiles readable" on public.profiles
  for select using (true);
create policy "Users insert own profile" on public.profiles
  for insert with check ((select auth.uid()) = id);
create policy "Users update own profile" on public.profiles
  for update using ((select auth.uid()) = id);

create policy "Approved places public" on public.places
  for select using (
    status = 'approved'
    or (select auth.uid()) = created_by
    or public.is_admin()
  );
create policy "Users submit places" on public.places
  for insert with check (auth.role() = 'authenticated' and status = 'pending');
create policy "Admins update places" on public.places
  for update using (public.is_admin());
create policy "Google sync insert places" on public.places
  for insert with check (
    (source = 'google' and status = 'approved')
    or (source = 'user' and status in ('pending', 'approved'))
  );
create policy "Google sync update places" on public.places
  for update using (true) with check (true);
create policy "User pending insert mvp" on public.places
  for insert with check (source = 'user' and status = 'pending');
create policy "Pending places readable mvp" on public.places
  for select using (true);
create policy "Pending places update mvp" on public.places
  for update using (true) with check (true);
create policy "Admin delete places mvp" on public.places
  for delete using (true);

create policy "Ratings public read" on public.ratings
  for select using (true);
create policy "Users rate" on public.ratings
  for insert with check ((select auth.uid()) = user_id or public.is_admin());
create policy "Admins delete ratings" on public.ratings
  for delete using (public.is_admin());
create policy "Ratings insert mvp" on public.ratings
  for insert with check (true);
create policy "Ratings delete mvp" on public.ratings
  for delete using (true);

create policy "Check-ins readable" on public.check_ins
  for select using (true);
create policy "Users manage own check-ins" on public.check_ins
  for insert with check ((select auth.uid()) = user_id);
create policy "Users update own check-ins" on public.check_ins
  for update using ((select auth.uid()) = user_id);

create policy "Messages readable" on public.messages
  for select using (true);
create policy "Users send messages" on public.messages
  for insert with check ((select auth.uid()) = user_id);

create policy "Admins insert notifications" on public.notifications
  for insert with check (public.is_admin());
create policy "Notifications insert mvp" on public.notifications
  for insert with check (true);
create policy "Notifications read mvp" on public.notifications
  for select using (true);
create policy "Users read own notifications" on public.notifications
  for select using ((select auth.uid()) = user_id or public.is_admin());
create policy "Users update own notifications" on public.notifications
  for update using (auth.uid() = user_id);

create policy "Presence read mvp" on public.map_presence
  for select using (true);
create policy "Presence upsert own mvp" on public.map_presence
  for insert with check ((select auth.uid()) = user_id);
create policy "Presence update own mvp" on public.map_presence
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Avatar images are publicly accessible" on storage.objects
  for select using (bucket_id = 'avatars');
create policy "Users can upload their own avatar" on storage.objects
  for insert with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
create policy "Users can update their own avatar" on storage.objects
  for update using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
create policy "Users can delete their own avatar" on storage.objects
  for delete using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

commit;
