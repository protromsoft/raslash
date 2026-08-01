-- Lightweight map presence for "aktif çalışan" counts.
-- Safe to re-run.

create table if not exists public.map_presence (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null,
  app_state text not null default 'active' check (app_state in ('active', 'background')),
  updated_at timestamptz not null default now()
);

create index if not exists map_presence_updated_idx on public.map_presence (updated_at desc);
create index if not exists map_presence_geo_idx on public.map_presence (latitude, longitude);

alter table public.map_presence enable row level security;

drop policy if exists "Presence read mvp" on public.map_presence;
drop policy if exists "Presence upsert own mvp" on public.map_presence;
drop policy if exists "Presence update own mvp" on public.map_presence;

create policy "Presence read mvp" on public.map_presence
  for select using (true);

create policy "Presence upsert own mvp" on public.map_presence
  for insert with check (auth.uid() = user_id);

create policy "Presence update own mvp" on public.map_presence
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
