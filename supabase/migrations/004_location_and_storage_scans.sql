-- ============================================================
-- My Lawn — Add Location fields & update Storage
-- Run this in your Supabase SQL editor
-- ============================================================

-- Add location fields to user profiles
alter table user_profiles
add column if not exists latitude double precision,
add column if not exists longitude double precision,
add column if not exists zip_code text,
add column if not exists location_name text;

-- Update the storage bucket to be public so scan images can be read via public URL
update storage.buckets
set public = true
where id = 'lawn-scans';

-- Ensure users can view their own objects (fallback policy for private links if needed)
-- Note: because the bucket is public, anyone can read via the public link,
-- but this policy remains intact for select operations in SQL or API.
drop policy if exists "Users can view their own scan images" on storage.objects;

create policy "Users can view their own scan images"
  on storage.objects for select
  using (bucket_id = 'lawn-scans' and auth.uid()::text = (storage.foldername(name))[1]);
