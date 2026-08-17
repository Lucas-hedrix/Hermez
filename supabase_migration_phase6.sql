-- =======================================================
-- PHASE 6: POST DELETION FIXES
-- Run this in your Supabase SQL Editor
-- This adds missing ON DELETE CASCADE constraints so posts can be deleted
-- =======================================================

-- 1. Fix post_comments foreign key
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'post_comments') THEN
    ALTER TABLE post_comments DROP CONSTRAINT IF EXISTS post_comments_post_id_fkey;
    ALTER TABLE post_comments ADD CONSTRAINT post_comments_post_id_fkey FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 2. Fix comment_likes foreign key
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'comment_likes') THEN
    ALTER TABLE comment_likes DROP CONSTRAINT IF EXISTS comment_likes_comment_id_fkey;
    ALTER TABLE comment_likes ADD CONSTRAINT comment_likes_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES post_comments(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 3. Fix post_likes foreign key (if it exists)
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'post_likes') THEN
    ALTER TABLE post_likes DROP CONSTRAINT IF EXISTS post_likes_post_id_fkey;
    ALTER TABLE post_likes ADD CONSTRAINT post_likes_post_id_fkey FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE;
  END IF;
END $$;
