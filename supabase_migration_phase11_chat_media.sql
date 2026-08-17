-- =======================================================
-- PHASE 11: CHAT MEDIA
-- Run this in your Supabase SQL Editor
-- =======================================================

-- 1. UPDATE friend_messages TABLE
ALTER TABLE friend_messages
ADD COLUMN IF NOT EXISTS media_url text,
ADD COLUMN IF NOT EXISTS type text DEFAULT 'text';
