-- Raslash schema (run in Supabase SQL editor)
-- Prefer Supabase over Firebase for this stack (Postgres + RLS + mobile/web shared).

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  first_name text,
  last_name text,
  age int,
  profession text,
  gender text,
  bio text,
  avatar_url text,
  linkedin text,
  instagram text,
  onboarding_completed boolean not null default false,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.places (
  id uuid primary key default gen_random_uuid(),
  google_place_id text unique,
  name text not null,
  category text,
  city text,
  latitude double precision not null,
  longitude double precision not null,
  image_url text,
  source text not null default 'google' check (source in ('google', 'user')),
  status text not null default 'approved' check (status in ('approved', 'pending', 'rejected')),
  submitted_by_name text,
  last_synced_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.ratings (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  author_name text,
  wifi numeric(2,1) not null check (wifi between 1 and 5),
  comfort numeric(2,1) not null check (comfort between 1 and 5),
  outlets numeric(2,1) not null check (outlets between 1 and 5),
  review text,
  created_at timestamptz not null default now()
);

create index if not exists ratings_place_id_idx on public.ratings(place_id);
create index if not exists places_status_idx on public.places(status);

create table if not exists public.check_ins (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  is_active boolean not null default true,
  checked_in_at timestamptz not null default now(),
  checked_out_at timestamptz
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  title text not null,
  body text not null,
  type text not null default 'system',
  place_id uuid references public.places(id) on delete set null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace view public.place_stats as
select
  p.*,
  coalesce(avg(r.wifi), 0)::numeric(3,1) as avg_wifi,
  coalesce(avg(r.comfort), 0)::numeric(3,1) as avg_comfort,
  coalesce(avg(r.outlets), 0)::numeric(3,1) as avg_outlets,
  coalesce(avg((r.wifi + r.comfort + r.outlets) / 3.0), 0)::numeric(3,1) as avg_overall,
  count(r.id)::int as review_count,
  (
    select count(*)::int from public.check_ins c
    where c.place_id = p.id and c.is_active = true
  ) as checked_in_count
from public.places p
left join public.ratings r on r.place_id = p.id
where p.status = 'approved'
group by p.id;

alter table public.profiles enable row level security;
alter table public.places enable row level security;
alter table public.ratings enable row level security;
alter table public.check_ins enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;

-- Helpers
create or replace function public.is_admin()
returns boolean language sql stable as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- Profiles
create policy "Profiles readable" on public.profiles for select using (true);
create policy "Users update own profile" on public.profiles for update using (auth.uid() = id);
create policy "Users insert own profile" on public.profiles for insert with check (auth.uid() = id);

-- Places
create policy "Approved places public" on public.places
  for select using (status = 'approved' or auth.uid() = created_by or public.is_admin());
create policy "Users submit places" on public.places
  for insert with check (auth.role() = 'authenticated' and status = 'pending');
create policy "Admins update places" on public.places
  for update using (public.is_admin());

-- Ratings
create policy "Ratings public read" on public.ratings for select using (true);
create policy "Users rate" on public.ratings
  for insert with check (auth.uid() = user_id or public.is_admin());
create policy "Admins delete ratings" on public.ratings
  for delete using (public.is_admin());

-- Check-ins / messages
create policy "Check-ins readable" on public.check_ins for select using (true);
create policy "Users manage own check-ins" on public.check_ins
  for insert with check (auth.uid() = user_id);
create policy "Users update own check-ins" on public.check_ins
  for update using (auth.uid() = user_id);

create policy "Messages readable" on public.messages for select using (true);
create policy "Users send messages" on public.messages
  for insert with check (auth.uid() = user_id);

-- Notifications
create policy "Users read own notifications" on public.notifications
  for select using (auth.uid() = user_id or public.is_admin());
create policy "Admins insert notifications" on public.notifications
  for insert with check (public.is_admin());
create policy "Users update own notifications" on public.notifications
  for update using (auth.uid() = user_id);
