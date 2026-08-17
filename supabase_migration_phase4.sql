-- =======================================================
-- PHASE 4: CIRCLES & COMMUNITIES FOUNDATION
-- Run this in your Supabase SQL Editor
-- =======================================================

-- 1. CREATE CIRCLES TABLE
CREATE TABLE IF NOT EXISTS circles (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    name text NOT NULL,
    description text,
    cover_image_url text,
    category text DEFAULT 'General',
    privacy text DEFAULT 'public' CHECK (privacy IN ('public', 'private', 'invite_only', 'campus_only')),
    location text,
    owner_id text REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    rules text[] DEFAULT '{}',
    created_at timestamptz DEFAULT now()
);

-- 2. CREATE CIRCLE MEMBERS TABLE
CREATE TABLE IF NOT EXISTS circle_members (
    user_id text REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    circle_id uuid REFERENCES circles(id) ON DELETE CASCADE NOT NULL,
    role text DEFAULT 'member' CHECK (role IN ('member', 'moderator', 'admin', 'owner')),
    joined_at timestamptz DEFAULT now(),
    PRIMARY KEY (user_id, circle_id)
);

-- 3. UPDATE POSTS TABLE FOR CIRCLES
ALTER TABLE posts 
ADD COLUMN IF NOT EXISTS circle_id uuid REFERENCES circles(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS status text DEFAULT 'active' CHECK (status IN ('active', 'hidden', 'removed', 'flagged')),
ADD COLUMN IF NOT EXISTS is_pinned boolean DEFAULT false;

-- 4. CREATE COMMENTS TABLE
CREATE TABLE IF NOT EXISTS comments (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id uuid REFERENCES posts(id) ON DELETE CASCADE NOT NULL,
    user_id text REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    body text NOT NULL,
    created_at timestamptz DEFAULT now()
);

-- 5. CREATE POST REACTIONS TABLE
CREATE TABLE IF NOT EXISTS post_reactions (
    post_id uuid REFERENCES posts(id) ON DELETE CASCADE NOT NULL,
    user_id text REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    reaction_type text NOT NULL,
    created_at timestamptz DEFAULT now(),
    PRIMARY KEY (post_id, user_id, reaction_type)
);

-- =======================================================
-- RLS POLICIES
-- =======================================================

-- Enable RLS
ALTER TABLE circles ENABLE ROW LEVEL SECURITY;
ALTER TABLE circle_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_reactions ENABLE ROW LEVEL SECURITY;

-- CIRCLES POLICIES
-- Anyone can view public circles
CREATE POLICY "Public circles are viewable by everyone"
ON circles FOR SELECT
USING (privacy = 'public' OR auth.uid()::text IN (SELECT user_id FROM circle_members WHERE circle_id = circles.id));

-- Users can create circles
CREATE POLICY "Users can create circles"
ON circles FOR INSERT
WITH CHECK (auth.uid()::text = owner_id);

-- Owners/moderators can update circles (cover photo, etc.)
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

-- CIRCLE MEMBERS POLICIES
CREATE POLICY "Members are viewable by everyone"
ON circle_members FOR SELECT
USING (true);

CREATE POLICY "Users can join public circles"
ON circle_members FOR INSERT
WITH CHECK (
  auth.uid()::text = user_id AND 
  (SELECT privacy FROM circles WHERE id = circle_id) = 'public'
);

-- COMMENTS POLICIES
CREATE POLICY "Comments are viewable by everyone"
ON comments FOR SELECT USING (true);

CREATE POLICY "Users can post comments"
ON comments FOR INSERT WITH CHECK (auth.uid()::text = user_id);

-- POST REACTIONS POLICIES
CREATE POLICY "Reactions are viewable by everyone"
ON post_reactions FOR SELECT USING (true);

CREATE POLICY "Users can react to posts"
ON post_reactions FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can remove their reactions"
ON post_reactions FOR DELETE USING (auth.uid()::text = user_id);
