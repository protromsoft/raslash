begin;

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

drop policy if exists "Checked-in users read unblocked messages" on public.messages;
create policy "Checked-in users read messages" on public.messages
  for select to authenticated
  using (private.has_active_checkin(place_id) or (select public.is_admin()));

drop table if exists public.message_reports;
drop table if exists public.user_blocks;

commit;
