-- =======================================================
-- PHASE 15: FEED REDESIGN — POST TYPES & POST SPARKS
-- Run this in your Supabase SQL Editor
-- Non-destructive: safe to run on a live posts table.
-- =======================================================

-- 1. POST TYPES
-- Visually-distinct content types for the feed:
--   thought · moment · question · challenge · hot_take · vibe
-- No CHECK constraint so future activity-driven types can be added
-- without another migration.
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS post_type text DEFAULT 'thought';

-- Backfill legacy rows: photo posts read as Moments, everything else a Thought.
UPDATE posts
  SET post_type = CASE WHEN image_url IS NOT NULL THEN 'moment' ELSE 'thought' END
  WHERE post_type IS NULL;

-- 2. POST SPARKS
-- Post-level Sparks reuse the existing post_reactions table
-- (post_id, user_id, reaction_type) with reaction_type = 'spark'.
-- That table + its RLS (view all / insert own / delete own) already exist
-- from supabase_migration_phase4.sql — no new table or policies needed.
-- Index the spark reactions so per-post counts stay fast.
CREATE INDEX IF NOT EXISTS idx_post_reactions_spark
  ON post_reactions (post_id)
  WHERE reaction_type = 'spark';
