-- =======================================================
-- SPARK → FRIENDSHIP: accepted sparks become real friends
-- Run in Supabase SQL Editor
-- =======================================================
-- Fixes the split between "connections" (from sparks) and
-- "friendships" (Messages list / friend chat). Accepting a
-- spark now also creates (or upgrades) an accepted friendship.
-- =======================================================

CREATE OR REPLACE FUNCTION create_connection_from_spark()
RETURNS TRIGGER AS $$
DECLARE
  v_requester text;
  v_recipient text;
BEGIN
  IF NEW.status = 'accepted' AND OLD.status = 'pending' THEN
    -- 1) Connection row (canonical unordered pair)
    INSERT INTO connections (user1_id, user2_id)
    VALUES (
      LEAST(NEW.sender_id, NEW.receiver_id),
      GREATEST(NEW.sender_id, NEW.receiver_id)
    )
    ON CONFLICT DO NOTHING;

    -- 2) Friendship so Messages / friend chat work
    -- Prefer existing row either direction; otherwise insert accepted.
    UPDATE friendships
    SET status = 'accepted'
    WHERE status IS DISTINCT FROM 'blocked'
      AND status IS DISTINCT FROM 'accepted'
      AND (
        (requester_id = NEW.sender_id AND recipient_id = NEW.receiver_id)
        OR (requester_id = NEW.receiver_id AND recipient_id = NEW.sender_id)
      );

    IF NOT FOUND THEN
      -- Only insert if no friendship exists (including blocked/accepted)
      IF NOT EXISTS (
        SELECT 1 FROM friendships f
        WHERE (f.requester_id = NEW.sender_id AND f.recipient_id = NEW.receiver_id)
           OR (f.requester_id = NEW.receiver_id AND f.recipient_id = NEW.sender_id)
      ) THEN
        INSERT INTO friendships (requester_id, recipient_id, status)
        VALUES (NEW.sender_id, NEW.receiver_id, 'accepted');
      END IF;
    END IF;

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

-- Backfill: accepted sparks missing a friendship
INSERT INTO friendships (requester_id, recipient_id, status)
SELECT DISTINCT ON (
  LEAST(s.sender_id, s.receiver_id), 
  GREATEST(s.sender_id, s.receiver_id)
)
  s.sender_id, s.receiver_id, 'accepted'
FROM sparks s
WHERE s.status = 'accepted'
  AND NOT EXISTS (
    SELECT 1 FROM friendships f
    WHERE (f.requester_id = s.sender_id AND f.recipient_id = s.receiver_id)
       OR (f.requester_id = s.receiver_id AND f.recipient_id = s.sender_id)
  )
ON CONFLICT DO NOTHING;

-- Upgrade pending friend requests where an accepted spark already exists
UPDATE friendships f
SET status = 'accepted'
FROM sparks s
WHERE s.status = 'accepted'
  AND f.status = 'pending'
  AND (
    (f.requester_id = s.sender_id AND f.recipient_id = s.receiver_id)
    OR (f.requester_id = s.receiver_id AND f.recipient_id = s.sender_id)
  );
