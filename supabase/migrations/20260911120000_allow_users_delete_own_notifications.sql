-- Notification history can be permanently cleared by its owner.
drop policy if exists "Users delete own notifications" on public.notifications;

create policy "Users delete own notifications"
  on public.notifications
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

grant delete on public.notifications to authenticated;
