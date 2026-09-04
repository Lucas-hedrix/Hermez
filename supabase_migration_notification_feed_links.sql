-- Deep-link notifications to feed posts and comments
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS comment_id UUID REFERENCES post_comments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_post_id ON notifications(post_id);
CREATE INDEX IF NOT EXISTS idx_notifications_comment_id ON notifications(comment_id);
