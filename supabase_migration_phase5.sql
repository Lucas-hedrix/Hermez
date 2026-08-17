-- Migration: Add open_to and vibe_set_at columns for Vibes features

-- 1. Add open_to (array of text) for multi-select vibes
ALTER TABLE users ADD COLUMN IF NOT EXISTS open_to text[] DEFAULT '{}';

-- 2. Add vibe_set_at (timestamptz) to track 24-hour expiry
ALTER TABLE users ADD COLUMN IF NOT EXISTS vibe_set_at timestamptz;
