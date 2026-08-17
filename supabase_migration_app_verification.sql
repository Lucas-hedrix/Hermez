-- =========================================================
-- APP VERIFICATION FIELDS FOR USERS
-- Adds is_verified and verification_level columns
-- =========================================================

ALTER TABLE users
ADD COLUMN IF NOT EXISTS is_verified boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS verification_level text DEFAULT 'none';
