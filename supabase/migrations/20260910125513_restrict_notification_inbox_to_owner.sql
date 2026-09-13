-- A broadcast creates one inbox row per recipient. Administrators must still
-- see only their own row in the mobile inbox; otherwise one broadcast appears
-- once for every user in the system.
drop policy if exists "Users read own notifications" on public.notifications;

create policy "Users read own notifications"
  on public.notifications
  for select
  to authenticated
  using ((select auth.uid()) = user_id);
