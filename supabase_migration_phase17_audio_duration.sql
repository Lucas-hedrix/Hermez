-- =======================================================
-- PHASE 17: AUDIO DURATION FOR VOICE NOTES
-- Run this in your Supabase SQL Editor
-- =======================================================

-- Store the duration in milliseconds for voice notes so the recipient
-- sees the audio length in the chat preview.
ALTER TABLE friend_messages
ADD COLUMN IF NOT EXISTS duration integer;