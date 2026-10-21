-- Members can delete a photo from their own story. The file is removed through
-- Storage by the owner; the message row is hidden with removed_at (the same
-- mechanism admins use), so reports and history stay intact. Idempotent.

drop policy if exists "Members delete own chat photos" on storage.objects;
create policy "Members delete own chat photos" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'chat-photos'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

create or replace function public.remove_own_story_photo(target_message_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  update public.messages
  set removed_at = coalesce(removed_at, now())
  where id = target_message_id
    and user_id = current_user_id
    and photo_path is not null;
  if not found then
    raise exception 'Story photo not found' using errcode = '22023';
  end if;
end;
$function$;

revoke all on function public.remove_own_story_photo(uuid) from public, anon;
grant execute on function public.remove_own_story_photo(uuid) to authenticated;
