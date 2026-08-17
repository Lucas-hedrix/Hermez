-- supabase_migration_phase10.sql
-- Add tracking and privacy columns

-- Users table updates
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS hide_last_seen BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS show_me_on_cupid BOOLEAN DEFAULT TRUE;

-- Posts table updates
ALTER TABLE public.posts
ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'public' CHECK (visibility IN ('public', 'friends'));

-- Update existing users to be visible on Cupid
UPDATE public.users SET show_me_on_cupid = TRUE WHERE show_me_on_cupid IS NULL;
UPDATE public.users SET hide_last_seen = FALSE WHERE hide_last_seen IS NULL;

-- Update existing posts to be public
UPDATE public.posts SET visibility = 'public' WHERE visibility IS NULL;
