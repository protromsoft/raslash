-- MVP policies so mobile/admin can sync + moderate with anon key.
-- Later: use service_role for sync + is_admin() for moderation, then drop these.
-- Safe to re-run.

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

create policy "Google sync insert places" on public.places
  for insert
  with check (
    (source = 'google' and status = 'approved')
    or (source = 'user' and status in ('pending', 'approved'))
  );

create policy "Google sync update places" on public.places
  for update
  using (true)
  with check (true);

create policy "User pending insert mvp" on public.places
  for insert
  with check (source = 'user' and status = 'pending');

create policy "Pending places readable mvp" on public.places
  for select using (true);

create policy "Pending places update mvp" on public.places
  for update using (true) with check (true);

create policy "Admin delete places mvp" on public.places
  for delete using (true);

create policy "Notifications insert mvp" on public.notifications
  for insert with check (true);

create policy "Notifications read mvp" on public.notifications
  for select using (true);

create policy "Ratings insert mvp" on public.ratings
  for insert with check (true);

create policy "Ratings delete mvp" on public.ratings
  for delete using (true);
