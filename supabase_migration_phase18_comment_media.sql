-- Run in the Supabase SQL Editor before publishing comment images or stickers.
-- GIPHY URLs are stored directly and must not be copied into Supabase Storage.

ALTER TABLE post_comments
  ADD COLUMN IF NOT EXISTS media_url text,
  ADD COLUMN IF NOT EXISTS media_type text;

-- A comment may contain only an image/sticker, so its text cannot be required.
ALTER TABLE post_comments
  ALTER COLUMN text DROP NOT NULL;

ALTER TABLE post_comments
  DROP CONSTRAINT IF EXISTS post_comments_has_content;

ALTER TABLE post_comments
  ADD CONSTRAINT post_comments_has_content CHECK (
    NULLIF(BTRIM(COALESCE(text, '')), '') IS NOT NULL
    OR media_url IS NOT NULL
  );
