-- =======================================================
-- PHASE 7: CIRCLE JOIN QUESTIONS AND REQUESTS--
-- =======================================================

-- 1. Add join_questions column to circles table
ALTER TABLE circles ADD COLUMN IF NOT EXISTS join_questions jsonb DEFAULT '[]'::jsonb;

-- 2. Create circle_join_requests table
CREATE TABLE IF NOT EXISTS circle_join_requests (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    circle_id uuid REFERENCES circles(id) ON DELETE CASCADE NOT NULL,
    user_id text REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    answers jsonb DEFAULT '{}'::jsonb,
    status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at timestamptz DEFAULT now(),
    UNIQUE(circle_id, user_id)
);

-- 3. RLS Policies for circle_join_requests
ALTER TABLE circle_join_requests ENABLE ROW LEVEL SECURITY;

-- Users can view their own join requests
CREATE POLICY "Users can view their own join requests"
ON circle_join_requests FOR SELECT
USING (auth.uid()::text = user_id);

-- Owners and mods can view join requests for their circles
CREATE POLICY "Owners and mods can view join requests"
ON circle_join_requests FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM circles c WHERE c.id = circle_join_requests.circle_id AND c.owner_id = auth.uid()::text
  ) OR EXISTS (
    SELECT 1 FROM circle_members cm WHERE cm.circle_id = circle_join_requests.circle_id AND cm.user_id = auth.uid()::text AND cm.role IN ('owner', 'moderator')
  )
);

-- Users can create a join request
CREATE POLICY "Users can insert join requests"
ON circle_join_requests FOR INSERT
WITH CHECK (auth.uid()::text = user_id);

-- Owners and mods can approve/reject requests
CREATE POLICY "Owners and mods can update join requests"
ON circle_join_requests FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM circles c WHERE c.id = circle_join_requests.circle_id AND c.owner_id = auth.uid()::text
  ) OR EXISTS (
    SELECT 1 FROM circle_members cm WHERE cm.circle_id = circle_join_requests.circle_id AND cm.user_id = auth.uid()::text AND cm.role IN ('owner', 'moderator')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM circles c WHERE c.id = circle_join_requests.circle_id AND c.owner_id = auth.uid()::text
  ) OR EXISTS (
    SELECT 1 FROM circle_members cm WHERE cm.circle_id = circle_join_requests.circle_id AND cm.user_id = auth.uid()::text AND cm.role IN ('owner', 'moderator')
  )
);
