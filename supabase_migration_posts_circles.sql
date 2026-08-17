-- Circle posts: allow members to create/read posts tied to a circle.
-- Run in Supabase SQL Editor if circle posts do not appear after sharing.

ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

-- Drop if re-running (ignore errors if missing)
DROP POLICY IF EXISTS "Users can insert own posts" ON posts;
DROP POLICY IF EXISTS "Users can view feed and circle posts" ON posts;
DROP POLICY IF EXISTS "Users can update own posts" ON posts;
DROP POLICY IF EXISTS "Users can delete own posts" ON posts;

-- Insert: own posts; circle posts only if member of that circle
CREATE POLICY "Users can insert own posts"
ON posts FOR INSERT
WITH CHECK (
  auth.uid()::text = user_id
  AND (
    circle_id IS NULL
    OR EXISTS (
      SELECT 1 FROM circle_members cm
      WHERE cm.circle_id = posts.circle_id
        AND cm.user_id = auth.uid()::text
    )
    OR EXISTS (
      SELECT 1 FROM circles c
      WHERE c.id = posts.circle_id
        AND c.owner_id = auth.uid()::text
    )
  )
);

-- Select: feed posts (no circle) + circle posts for members or public circles
CREATE POLICY "Users can view feed and circle posts"
ON posts FOR SELECT
USING (
  circle_id IS NULL
  OR EXISTS (
    SELECT 1 FROM circle_members cm
    WHERE cm.circle_id = posts.circle_id
      AND cm.user_id = auth.uid()::text
  )
  OR EXISTS (
    SELECT 1 FROM circles c
    WHERE c.id = posts.circle_id
      AND (c.privacy = 'public' OR c.owner_id = auth.uid()::text)
  )
);

CREATE POLICY "Users can update own posts"
ON posts FOR UPDATE
USING (auth.uid()::text = user_id)
WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can delete own posts"
ON posts FOR DELETE
USING (auth.uid()::text = user_id);

