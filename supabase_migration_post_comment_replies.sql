-- Run in Supabase SQL editor to enable threaded feed comment replies.

ALTER TABLE post_comments
  ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES post_comments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_post_comments_reply_to
  ON post_comments(reply_to_id);
