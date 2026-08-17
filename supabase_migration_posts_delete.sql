-- Allow post author, circle owner, and circle moderators to delete posts.
-- Run in Supabase SQL Editor.

ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can delete own or moderated circle posts" ON posts;

CREATE POLICY "Users can delete own or moderated circle posts"
ON posts FOR DELETE
USING (
  auth.uid()::text = user_id
  OR EXISTS (
    SELECT 1 FROM circles c
    WHERE c.id = posts.circle_id
      AND c.owner_id = auth.uid()::text
  )
  OR EXISTS (
    SELECT 1 FROM circle_members cm
    WHERE cm.circle_id = posts.circle_id
      AND cm.user_id = auth.uid()::text
      AND cm.role IN ('owner', 'moderator')
  )
);
