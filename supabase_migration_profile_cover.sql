-- Separate profile cover images from the primary profile picture.
-- Run this migration in the Supabase SQL editor before releasing the UI change.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS cover_photo_url text;
