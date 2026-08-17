-- =======================================================
-- PHASE 8: CIRCLE MEMBERS RLS POLICIES
-- Run this in your Supabase SQL Editor
-- =======================================================

-- 1. Enable Owners and Moderators to update member roles
CREATE POLICY "Circle owners can update member roles"
ON circle_members FOR UPDATE
USING (
  -- Can only update if the updater is the owner of the circle
  EXISTS (
    SELECT 1 FROM circles c
    WHERE c.id = circle_members.circle_id
    AND c.owner_id = auth.uid()::text
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM circles c
    WHERE c.id = circle_members.circle_id
    AND c.owner_id = auth.uid()::text
  )
);

-- 2. Enable Owners and Moderators to delete members
CREATE POLICY "Circle owners can remove members"
ON circle_members FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM circles c
    WHERE c.id = circle_members.circle_id
    AND c.owner_id = auth.uid()::text
  )
);

-- 3. Allow users to leave the circle
CREATE POLICY "Users can remove themselves"
ON circle_members FOR DELETE
USING (auth.uid()::text = user_id);
