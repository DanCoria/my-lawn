-- ============================================================
-- My Lawn — Initial Schema
-- Run this in your Supabase SQL editor
-- ============================================================

-- Activities table: stores all lawn activity logs
create table if not exists activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  type text not null check (type in ('mow', 'fertilize', 'pre-emergent', 'scalp', 'water', 'aerate')),
  date date not null,
  notes text,
  created_at timestamptz default now() not null
);

-- Indexes
create index if not exists activities_user_id_idx on activities(user_id);
create index if not exists activities_date_idx on activities(date desc);

-- Row Level Security
alter table activities enable row level security;

create policy "Users can view their own activities"
  on activities for select
  using (auth.uid() = user_id);

create policy "Users can insert their own activities"
  on activities for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their own activities"
  on activities for delete
  using (auth.uid() = user_id);

-- ============================================================

-- Task completions: tracks which seasonal checklist items are done
create table if not exists task_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  task_key text not null,
  completed_at timestamptz default now() not null,
  unique(user_id, task_key)
);

-- Indexes
create index if not exists task_completions_user_id_idx on task_completions(user_id);

-- Row Level Security
alter table task_completions enable row level security;

create policy "Users can view their own completions"
  on task_completions for select
  using (auth.uid() = user_id);

create policy "Users can insert their own completions"
  on task_completions for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their own completions"
  on task_completions for delete
  using (auth.uid() = user_id);
