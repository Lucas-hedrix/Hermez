-- =======================================================
-- PHASE 13: CHAT REPLIES
-- Run this in your Supabase SQL Editor
-- =======================================================

-- 1. Add reply_to_id to friend_messages
ALTER TABLE friend_messages
ADD COLUMN IF NOT EXISTS reply_to_id uuid REFERENCES friend_messages(id) ON DELETE SET NULL;
