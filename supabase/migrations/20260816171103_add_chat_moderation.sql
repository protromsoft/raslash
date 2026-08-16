begin;

create table public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_cannot_block_self check (blocker_id <> blocked_id)
);

create index user_blocks_blocked_id_idx on public.user_blocks(blocked_id);

create table public.message_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  reported_user_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null default 'inappropriate_content',
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  constraint message_reports_not_self check (reporter_id <> reported_user_id),
  constraint message_reports_reason check (
    reason in ('inappropriate_content', 'harassment', 'spam', 'other')
  ),
  constraint message_reports_status check (
    status in ('pending', 'reviewed', 'actioned', 'dismissed')
  ),
  constraint message_reports_unique_report unique (reporter_id, message_id)
);

create index message_reports_message_id_idx on public.message_reports(message_id);
create index message_reports_reported_user_id_idx on public.message_reports(reported_user_id);
create index message_reports_status_created_at_idx
  on public.message_reports(status, created_at desc);

alter table public.user_blocks enable row level security;
alter table public.message_reports enable row level security;

create policy "Users read own blocks" on public.user_blocks
  for select to authenticated
  using ((select auth.uid()) = blocker_id);
create policy "Users create own blocks" on public.user_blocks
  for insert to authenticated
  with check ((select auth.uid()) = blocker_id);
create policy "Users remove own blocks" on public.user_blocks
  for delete to authenticated
  using ((select auth.uid()) = blocker_id);

create policy "Users create valid message reports" on public.message_reports
  for insert to authenticated
  with check (
    reporter_id = (select auth.uid())
    and exists (
      select 1
      from public.messages m
      where m.id = message_id
        and m.user_id = reported_user_id
        and private.has_active_checkin(m.place_id)
    )
  );
create policy "Users read own message reports" on public.message_reports
  for select to authenticated
  using (reporter_id = (select auth.uid()) or (select public.is_admin()));
create policy "Admins update message reports" on public.message_reports
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

revoke all on public.user_blocks from anon, authenticated;
grant select, insert, delete on public.user_blocks to authenticated;
revoke all on public.message_reports from anon, authenticated;
grant select, insert, update on public.message_reports to authenticated;

-- Blocking is enforced server-side for both transcript reads and Realtime rows.
drop policy if exists "Checked-in users read messages" on public.messages;
create policy "Checked-in users read unblocked messages" on public.messages
  for select to authenticated
  using (
    (select public.is_admin())
    or (
      private.has_active_checkin(place_id)
      and not exists (
        select 1
        from public.user_blocks b
        where b.blocker_id = (select auth.uid())
          and b.blocked_id = messages.user_id
      )
    )
  );

-- The active-people strip follows the same block list as the transcript.
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
    and c.is_active = true
    and not exists (
      select 1
      from public.user_blocks b
      where b.blocker_id = (select auth.uid())
        and b.blocked_id = c.user_id
    );
$$;

commit;
