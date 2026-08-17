-- =======================================================
-- PHASE 12: CHAT ENHANCEMENTS & BLOCKS
-- Run this in your Supabase SQL Editor
-- =======================================================

-- 1. Add deleted_by column to friend_messages for "delete for me" / "clear chat"
ALTER TABLE friend_messages
ADD COLUMN IF NOT EXISTS deleted_by text[] DEFAULT '{}';

-- 2. Create blocks table
CREATE TABLE IF NOT EXISTS blocks (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    blocker_id text REFERENCES users(id) ON DELETE CASCADE,
    blocked_id text REFERENCES users(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now(),
    UNIQUE(blocker_id, blocked_id)
);

-- Enable RLS
ALTER TABLE blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own blocks"
ON blocks FOR INSERT
WITH CHECK (auth.uid()::text = blocker_id);

CREATE POLICY "Users can view blocks they are involved in"
ON blocks FOR SELECT
USING (auth.uid()::text = blocker_id OR auth.uid()::text = blocked_id);

CREATE POLICY "Users can unblock"
ON blocks FOR DELETE
USING (auth.uid()::text = blocker_id);

-- 3. RPC for Clear Chat
CREATE OR REPLACE FUNCTION clear_chat(p_chat_id uuid, p_user_id text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE friend_messages
    SET deleted_by = array_append(deleted_by, p_user_id)
    WHERE friendship_id = p_chat_id
    AND NOT (p_user_id = ANY(deleted_by));
END;
$$;
