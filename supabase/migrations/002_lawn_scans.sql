-- ============================================================
-- My Lawn — Lawn Scans Schema
-- Run this in your Supabase SQL editor
-- ============================================================

-- Lawn scans: AI diagnosis results with image storage reference
create table if not exists lawn_scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  image_url text not null,
  diagnosis jsonb not null,
  created_at timestamptz default now() not null
);

-- Index
create index if not exists lawn_scans_user_id_idx on lawn_scans(user_id);
create index if not exists lawn_scans_created_at_idx on lawn_scans(created_at desc);

-- Row Level Security
alter table lawn_scans enable row level security;

create policy "Users can view their own scans"
  on lawn_scans for select
  using (auth.uid() = user_id);

create policy "Users can insert their own scans"
  on lawn_scans for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their own scans"
  on lawn_scans for delete
  using (auth.uid() = user_id);

-- ============================================================
-- Supabase Storage bucket for lawn scan images
-- Run this too (or create the bucket manually in the dashboard)
-- ============================================================

insert into storage.buckets (id, name, public)
values ('lawn-scans', 'lawn-scans', false)
on conflict (id) do nothing;

create policy "Users can upload their own scan images"
  on storage.objects for insert
  with check (bucket_id = 'lawn-scans' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Users can view their own scan images"
  on storage.objects for select
  using (bucket_id = 'lawn-scans' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Users can delete their own scan images"
  on storage.objects for delete
  using (bucket_id = 'lawn-scans' and auth.uid()::text = (storage.foldername(name))[1]);
