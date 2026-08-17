-- =======================================================
-- PHASE 1: VIBES & SPARKS FOUNDATION
-- Run this in your Supabase SQL Editor
-- =======================================================

-- 1. UPDATE USERS TABLE (VIBES)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS current_vibe text,
ADD COLUMN IF NOT EXISTS open_to text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS dating_enabled boolean DEFAULT false;

-- 2. CREATE SPARKS TABLE
CREATE TABLE IF NOT EXISTS sparks (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    sender_id text REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    receiver_id text REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    spark_type text NOT NULL,
    custom_message text,
    status text DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'ignored')),
    created_at timestamptz DEFAULT now(),
    expires_at timestamptz DEFAULT (now() + interval '7 days'),
    responded_at timestamptz
    
    -- We will create a unique index for pending sparks below
);

-- Prevent someone from spamming the same person with multiple pending sparks
CREATE UNIQUE INDEX IF NOT EXISTS unique_pending_spark 
ON sparks (sender_id, receiver_id) 
WHERE status = 'pending';

-- 3. CREATE CONNECTIONS TABLE
CREATE TABLE IF NOT EXISTS connections (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user1_id text REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    user2_id text REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    created_at timestamptz DEFAULT now(),
    
    -- Ensure user1_id is always less than user2_id to prevent duplicates like (A,B) and (B,A)
    CONSTRAINT user1_less_than_user2 CHECK (user1_id < user2_id),
    CONSTRAINT unique_connection UNIQUE (user1_id, user2_id)
);

-- =======================================================
-- RLS POLICIES
-- =======================================================

-- Enable RLS
ALTER TABLE sparks ENABLE ROW LEVEL SECURITY;
ALTER TABLE connections ENABLE ROW LEVEL SECURITY;

-- SPARKS POLICIES
-- Users can see sparks they sent or received
CREATE POLICY "Users can view their own sparks"
ON sparks FOR SELECT
USING (auth.uid()::text = sender_id OR auth.uid()::text = receiver_id);

-- Users can insert sparks they send
CREATE POLICY "Users can send sparks"
ON sparks FOR INSERT
WITH CHECK (auth.uid()::text = sender_id);

-- Users can update sparks they RECEIVED (to accept/ignore)
CREATE POLICY "Users can update received sparks"
ON sparks FOR UPDATE
USING (auth.uid()::text = receiver_id);

-- CONNECTIONS POLICIES
-- Users can view their own connections
CREATE POLICY "Users can view their connections"
ON connections FOR SELECT
USING (auth.uid()::text = user1_id OR auth.uid()::text = user2_id);

-- Allow inserting connections (for when a spark is accepted)
-- Note: In a production app, you might want this handled by a database trigger or edge function,
-- but allowing users to insert connections involving themselves is fine for now if enforced by client logic.
CREATE POLICY "Users can create connections"
ON connections FOR INSERT
WITH CHECK (auth.uid()::text = user1_id OR auth.uid()::text = user2_id);

-- =======================================================
-- AUTO-CREATE CONNECTION TRIGGER (OPTIONAL BUT RECOMMENDED)
-- When a spark is 'accepted', automatically create a connection
-- =======================================================

CREATE OR REPLACE FUNCTION create_connection_from_spark() 
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'accepted' AND OLD.status = 'pending' THEN
        -- Insert connection, ensuring user1_id < user2_id
        INSERT INTO connections (user1_id, user2_id)
        VALUES (
            LEAST(NEW.sender_id, NEW.receiver_id), 
            GREATEST(NEW.sender_id, NEW.receiver_id)
        )
        ON CONFLICT DO NOTHING; -- Ignore if connection already exists
        
        -- Set responded_at time
        NEW.responded_at = now();
    ELSIF NEW.status = 'ignored' AND OLD.status = 'pending' THEN
        NEW.responded_at = now();
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_spark_accepted ON sparks;
CREATE TRIGGER on_spark_accepted
BEFORE UPDATE ON sparks
FOR EACH ROW
EXECUTE FUNCTION create_connection_from_spark();
