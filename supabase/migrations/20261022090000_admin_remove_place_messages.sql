-- Moderation for place chat messages and stories (photo messages).
-- Admins can hide a reported message; the row stays (with its reports) for
-- the record, but nobody else sees it any more. Idempotent.

alter table public.messages add column if not exists removed_at timestamptz;

-- Same rule as before, plus: removed messages are visible to admins only.
drop policy if exists "Checked-in users read unblocked messages" on public.messages;
create policy "Checked-in users read unblocked messages" on public.messages
  for select to authenticated
  using (
    (select public.is_admin())
    or (
      removed_at is null
      and private.has_active_checkin(place_id)
      and not exists (
        select 1 from public.user_blocks b
        where b.blocker_id = (select auth.uid()) and b.blocked_id = messages.user_id
      )
    )
  );

-- Pending place-message reports with what an admin needs to judge them.
create or replace function public.admin_place_message_reports()
returns table(
  report_id uuid,
  reason text,
  status text,
  reported_at timestamptz,
  report_count bigint,
  message_id uuid,
  place_id uuid,
  place_name text,
  author_id uuid,
  author_name text,
  body text,
  photo_path text,
  message_created_at timestamptz,
  removed_at timestamptz
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if not (select public.is_admin()) then
    raise exception 'Admin required' using errcode = '42501';
  end if;
  return query
  select distinct on (m.id)
    r.id, r.reason, r.status, r.created_at,
    (select count(*) from public.message_reports r2 where r2.message_id = m.id and r2.status = 'pending'),
    m.id, m.place_id, p.name, m.user_id, pr.first_name, m.body, m.photo_path, m.created_at, m.removed_at
  from public.message_reports r
  join public.messages m on m.id = r.message_id
  join public.places p on p.id = m.place_id
  left join public.profiles pr on pr.id = m.user_id
  where r.status = 'pending'
  order by m.id, r.created_at desc
  limit 100;
end;
$function$;

-- Hide a message and close its pending reports as actioned. The photo file is
-- deleted by the admin client through Storage (policy "Admins delete chat photos").
create or replace function public.admin_remove_place_message(target_message_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if not (select public.is_admin()) then
    raise exception 'Admin required' using errcode = '42501';
  end if;
  update public.messages set removed_at = coalesce(removed_at, now()) where id = target_message_id;
  update public.message_reports set status = 'actioned'
  where message_id = target_message_id and status = 'pending';
end;
$function$;

-- Keep a message and dismiss its pending reports.
create or replace function public.admin_dismiss_place_message_reports(target_message_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if not (select public.is_admin()) then
    raise exception 'Admin required' using errcode = '42501';
  end if;
  update public.message_reports set status = 'dismissed'
  where message_id = target_message_id and status = 'pending';
end;
$function$;

revoke all on function public.admin_place_message_reports() from public, anon;
revoke all on function public.admin_remove_place_message(uuid) from public, anon;
revoke all on function public.admin_dismiss_place_message_reports(uuid) from public, anon;
grant execute on function public.admin_place_message_reports() to authenticated;
grant execute on function public.admin_remove_place_message(uuid) to authenticated;
grant execute on function public.admin_dismiss_place_message_reports(uuid) to authenticated;
