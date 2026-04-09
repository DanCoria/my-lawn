-- ============================================================
-- My Lawn — User Profiles Schema
-- Run this in your Supabase SQL editor
-- ============================================================

-- User profiles: stores grass type and onboarding state per user
create table if not exists user_profiles (
  id uuid primary key references auth.users on delete cascade,
  grass_type text not null default 'bermuda',
  display_name text,
  onboarding_completed boolean not null default false,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Index
create index if not exists user_profiles_grass_type_idx on user_profiles(grass_type);

-- Row Level Security
alter table user_profiles enable row level security;

create policy "Users can view their own profile"
  on user_profiles for select
  using (auth.uid() = id);

create policy "Users can insert their own profile"
  on user_profiles for insert
  with check (auth.uid() = id);

create policy "Users can update their own profile"
  on user_profiles for update
  using (auth.uid() = id);

-- Auto-update updated_at timestamp
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger user_profiles_updated_at
  before update on user_profiles
  for each row
  execute function update_updated_at_column();
