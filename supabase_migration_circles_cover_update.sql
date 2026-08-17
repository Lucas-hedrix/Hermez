-- Allow circle owners and moderators to update circles (e.g. cover_image_url).
-- Run in Supabase SQL Editor if cover photos reset after leaving the circle.

CREATE POLICY "Circle owners and moderators can update circles"
ON circles FOR UPDATE
USING (
  auth.uid()::text = owner_id
  OR EXISTS (
    SELECT 1 FROM circle_members cm
    WHERE cm.circle_id = circles.id
      AND cm.user_id = auth.uid()::text
      AND cm.role IN ('owner', 'moderator')
  )
)
WITH CHECK (
  auth.uid()::text = owner_id
  OR EXISTS (
    SELECT 1 FROM circle_members cm
    WHERE cm.circle_id = circles.id
      AND cm.user_id = auth.uid()::text
      AND cm.role IN ('owner', 'moderator')
  )
);
