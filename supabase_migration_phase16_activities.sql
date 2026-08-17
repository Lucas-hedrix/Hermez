-- Phase 16: Activity Engine

-- 1. Activities Table
CREATE TABLE IF NOT EXISTS activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL, -- e.g., 'truth_or_dare', 'this_or_that'
  creator_id text REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending', -- 'pending', 'active', 'completed', 'cancelled'
  visibility text NOT NULL DEFAULT 'private', -- 'private', 'friends', 'public'
  metadata jsonb DEFAULT '{}'::jsonb, -- configuration, current round, scores
  created_at timestamp with time zone DEFAULT now(),
  expires_at timestamp with time zone,
  updated_at timestamp with time zone DEFAULT now()
);

-- 2. Activity Participants Table
CREATE TABLE IF NOT EXISTS activity_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid REFERENCES activities(id) ON DELETE CASCADE,
  user_id text REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'invited', -- 'invited', 'accepted', 'declined'
  score int DEFAULT 0,
  joined_at timestamp with time zone DEFAULT now(),
  UNIQUE(activity_id, user_id)
);

-- 3. Activity Events Table
CREATE TABLE IF NOT EXISTS activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid REFERENCES activities(id) ON DELETE CASCADE,
  user_id text REFERENCES users(id) ON DELETE CASCADE,
  event_type text NOT NULL, -- e.g., 'prompt', 'answer', 'reaction'
  payload jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_events ENABLE ROW LEVEL SECURITY;

-- Activities policies
CREATE POLICY "Users can view activities they are part of or are public/friends"
  ON activities FOR SELECT
  USING (
    visibility = 'public'
    OR creator_id = auth.uid()::text
    OR id IN (SELECT activity_id FROM activity_participants WHERE user_id = auth.uid()::text)
  );

CREATE POLICY "Users can create activities"
  ON activities FOR INSERT
  WITH CHECK (auth.uid()::text = creator_id);

CREATE POLICY "Activity creators can update their activities"
  ON activities FOR UPDATE
  USING (creator_id = auth.uid()::text);

-- Activity Participants policies (simplified to avoid recursion)
-- Users can view participants for activities they created or participate in
CREATE POLICY "Users can view participants for their activities"
  ON activity_participants FOR SELECT
  USING (
    -- If I'm the activity creator
    activity_id IN (SELECT id FROM activities WHERE creator_id = auth.uid()::text)
    -- Or if I'm a participant in this activity
    OR user_id = auth.uid()::text
  );

CREATE POLICY "Users can update their own participant status"
  ON activity_participants FOR UPDATE
  USING (user_id = auth.uid()::text);

CREATE POLICY "Creators can add participants"
  ON activity_participants FOR INSERT
  WITH CHECK (
    activity_id IN (SELECT id FROM activities WHERE creator_id = auth.uid()::text)
    OR user_id = auth.uid()::text
  );

-- Activity Events policies
CREATE POLICY "Participants can view activity events"
  ON activity_events FOR SELECT
  USING (
    activity_id IN (
      SELECT activity_id FROM activity_participants WHERE user_id = auth.uid()::text UNION
      SELECT id FROM activities WHERE creator_id = auth.uid()::text
    )
  );

CREATE POLICY "Participants can insert activity events"
  ON activity_events FOR INSERT
  WITH CHECK (
    activity_id IN (
      SELECT activity_id FROM activity_participants WHERE user_id = auth.uid()::text AND status = 'accepted' UNION
      SELECT id FROM activities WHERE creator_id = auth.uid()::text
    )
  );

-- Enable real-time for activities and activity_events
ALTER PUBLICATION supabase_realtime ADD TABLE activities;
ALTER PUBLICATION supabase_realtime ADD TABLE activity_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE activity_events;