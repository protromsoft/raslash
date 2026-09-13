-- Remote migration version: 20260909155635. Expo push tokens are private per-user data.
-- Clients may only manage their
-- own device rows; server-side notification delivery uses the service role.
create table if not exists public.push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  expo_push_token text not null check (char_length(expo_push_token) between 20 and 255),
  platform text not null check (platform in ('ios', 'android')),
  device_name text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (user_id, expo_push_token)
);

create index if not exists push_devices_enabled_user_idx
  on public.push_devices (user_id)
  where enabled;

alter table public.push_devices enable row level security;

create policy "Users read own push devices"
  on public.push_devices
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users insert own push devices"
  on public.push_devices
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users update own push devices"
  on public.push_devices
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users delete own push devices"
  on public.push_devices
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.push_devices from anon;
grant select, insert, update, delete on table public.push_devices to authenticated;
