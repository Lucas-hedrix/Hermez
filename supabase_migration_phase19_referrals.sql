-- =======================================================
-- PHASE 19: REFERRAL CAMPAIGN
-- "Earn ₦100 per friend" — 1 week launch
-- =======================================================
-- Run this in your Supabase SQL Editor before publishing the
-- referral feature. All changes are additive and safe to run on
-- a populated database.
-- =======================================================

-- 1. Add columns to users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS referral_code         text UNIQUE,
  ADD COLUMN IF NOT EXISTS referred_by           text REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS wallet_balance_ngn    bigint DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS last_referral_shown_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);
CREATE INDEX IF NOT EXISTS idx_users_referred_by   ON users(referred_by);

-- 2. Referrals table: one row per (referrer, referred) pair
CREATE TABLE IF NOT EXISTS referrals (
    id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    referrer_id   text REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    referred_id   text REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'completed', 'rejected')),
    reward_ngn    bigint NOT NULL DEFAULT 100,
    created_at    timestamptz DEFAULT now(),
    completed_at  timestamptz,
    UNIQUE(referrer_id, referred_id),
    CHECK (referrer_id <> referred_id)
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer        ON referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referred        ON referrals(referred_id);
CREATE INDEX IF NOT EXISTS idx_referrals_completed_at    ON referrals(completed_at) WHERE status = 'completed';

-- 3. Wallet ledger: append-only credit/debit history
CREATE TABLE IF NOT EXISTS wallet_credits (
    id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id      text REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    amount_ngn   bigint NOT NULL,                     -- positive credit, negative debit
    source       text NOT NULL,                       -- 'referral', 'signup_bonus', 'manual', etc.
    description  text,
    reference_id uuid,                                -- e.g., referrals.id when source='referral'
    created_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wallet_credits_user ON wallet_credits(user_id, created_at DESC);

-- 4. RLS
ALTER TABLE referrals      ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_credits ENABLE ROW LEVEL SECURITY;

-- Users can see their own referrals (as referrer or referred)
CREATE POLICY "Users can view own referrals"
  ON referrals FOR SELECT
  USING (auth.uid()::text = referrer_id OR auth.uid()::text = referred_id);

-- Users can see their own wallet ledger
CREATE POLICY "Users can view own wallet credits"
  ON wallet_credits FOR SELECT
  USING (auth.uid()::text = user_id);

-- No INSERT/UPDATE policies for users — only SECURITY DEFINER functions
-- (complete_referral, get_or_create_referral_code) write to these tables.
-- This prevents users from forging referrals or crediting their own wallets.

-- 5. RPC: get_or_create_referral_code — backfill-style, idempotent
CREATE OR REPLACE FUNCTION get_or_create_referral_code(p_user_id text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_code text;
BEGIN
  -- Lock the row to prevent races on concurrent calls
  SELECT referral_code INTO v_code
    FROM users
   WHERE id = p_user_id
   FOR UPDATE;

  IF v_code IS NOT NULL THEN
    RETURN v_code;
  END IF;

  -- Generate 8-char uppercase hex code, retry on collision
  LOOP
    v_code := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM users WHERE referral_code = v_code);
  END LOOP;

  UPDATE users SET referral_code = v_code WHERE id = p_user_id;
  RETURN v_code;
END;
$$;
GRANT EXECUTE ON FUNCTION get_or_create_referral_code(text) TO authenticated;

-- 6. RPC: complete_referral — fires when the new user finishes their profile
-- Returns jsonb: { ok, reason?, new_balance?, daily_count?, status? }
CREATE OR REPLACE FUNCTION complete_referral(p_referred_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_referrer_id text;
  v_status      text;
  v_daily_count int;
  v_new_balance bigint;
BEGIN
  -- 1. Self-referral block (defense in depth; CHECK constraint is the primary guard)
  IF p_referred_id = auth.uid()::text THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'self_referral');
  END IF;

  -- 2. Lock the referred user's row to read referrer atomically
  SELECT referred_by INTO v_referrer_id
    FROM users
   WHERE id = p_referred_id
   FOR UPDATE;

  IF v_referrer_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_referrer');
  END IF;

  IF v_referrer_id = p_referred_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'self_referral');
  END IF;

  -- 3. Profile must be complete + has at least one photo
  IF NOT EXISTS (
    SELECT 1 FROM users
     WHERE id = p_referred_id
       AND profile_complete = true
       AND photo_urls IS NOT NULL
       AND array_length(photo_urls, 1) >= 1
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'profile_incomplete');
  END IF;

  -- 4. Upsert referral row. If a row already exists, return its current state.
  INSERT INTO referrals (referrer_id, referred_id, status, completed_at)
       VALUES (v_referrer_id, p_referred_id, 'pending', now())
  ON CONFLICT (referrer_id, referred_id) DO NOTHING
  RETURNING status INTO v_status;

  IF v_status IS NULL THEN
    -- Row already existed
    SELECT status INTO v_status FROM referrals
     WHERE referrer_id = v_referrer_id AND referred_id = p_referred_id;
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'already_recorded',
      'status', v_status
    );
  END IF;

  -- 5. Daily cap: 3 completed referrals per UTC day
  SELECT count(*) INTO v_daily_count
    FROM referrals
   WHERE referrer_id = v_referrer_id
     AND status = 'completed'
     AND completed_at >= date_trunc('day', now() AT TIME ZONE 'UTC');

  IF v_daily_count >= 3 THEN
    UPDATE referrals
       SET status = 'rejected', completed_at = now()
     WHERE referrer_id = v_referrer_id AND referred_id = p_referred_id;
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'daily_cap_hit',
      'daily_count', v_daily_count
    );
  END IF;

  -- 6. Mark completed and credit
  UPDATE referrals
     SET status = 'completed', completed_at = now()
   WHERE referrer_id = v_referrer_id AND referred_id = p_referred_id;

  INSERT INTO wallet_credits (user_id, amount_ngn, source, description, reference_id)
       VALUES (
         v_referrer_id,
         100,
         'referral',
         'Referral reward: a friend completed their profile',
         (SELECT id FROM referrals
           WHERE referrer_id = v_referrer_id AND referred_id = p_referred_id)
       );

  UPDATE users
     SET wallet_balance_ngn = COALESCE(wallet_balance_ngn, 0) + 100
   WHERE id = v_referrer_id
  RETURNING wallet_balance_ngn INTO v_new_balance;

  RETURN jsonb_build_object(
    'ok', true,
    'new_balance', v_new_balance,
    'daily_count', v_daily_count + 1
  );
END;
$$;
GRANT EXECUTE ON FUNCTION complete_referral(text) TO authenticated;

-- 7. RPC: get_referral_stats — daily + lifetime counters
CREATE OR REPLACE FUNCTION get_referral_stats(p_user_id text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT jsonb_build_object(
    'today_count', (
      SELECT count(*)::int FROM referrals
       WHERE referrer_id = p_user_id
         AND status = 'completed'
         AND completed_at >= date_trunc('day', now() AT TIME ZONE 'UTC')
    ),
    'lifetime_count', (
      SELECT count(*)::int FROM referrals
       WHERE referrer_id = p_user_id AND status = 'completed'
    ),
    'lifetime_earnings', COALESCE((
      SELECT wallet_balance_ngn FROM users WHERE id = p_user_id
    ), 0),
    'pending_count', (
      SELECT count(*)::int FROM referrals
       WHERE referrer_id = p_user_id AND status = 'pending'
    )
  );
$$;
GRANT EXECUTE ON FUNCTION get_referral_stats(text) TO authenticated;
