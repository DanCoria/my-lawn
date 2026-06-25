-- ============================================================
-- My Lawn — Make lawn scan storage private
-- Run this in your Supabase SQL editor after 004
-- ============================================================

-- Store the Supabase Storage object path separately from display URLs.
-- Existing scans may only have legacy public/base64 image_url values.
alter table lawn_scans
add column if not exists storage_path text;

-- Backfill storage_path for scans that were saved with a public Supabase Storage URL.
-- Legacy base64 image_url values are intentionally left unchanged.
update lawn_scans
set storage_path = split_part(image_url, '/storage/v1/object/public/lawn-scans/', 2)
where storage_path is null
  and position('/storage/v1/object/public/lawn-scans/' in image_url) > 0;

-- Keep scan images private. The app now creates short-lived signed URLs
-- for authenticated users instead of storing public URLs.
update storage.buckets
set public = false
where id = 'lawn-scans';

-- Ensure authenticated users can read only their own scan images.
drop policy if exists "Users can view their own scan images" on storage.objects;

create policy "Users can view their own scan images"
  on storage.objects for select
  using (bucket_id = 'lawn-scans' and auth.uid()::text = (storage.foldername(name))[1]);
