-- =======================================================
-- PHASE 14: VOICE NOTE WAVEFORMS
-- Run this in your Supabase SQL Editor
-- =======================================================

-- Store the captured amplitude peaks (array of ~40 integers, 0–100) for voice
-- notes so the recipient sees the real waveform instead of a placeholder.
ALTER TABLE friend_messages
ADD COLUMN IF NOT EXISTS waveform jsonb;
