// utils/referrals.js
// Client-side wrappers for the referral campaign. All side effects
// happen via Supabase RPCs (defined in supabase_migration_phase19_referrals.sql)
// so the user can't forge credits or skip the daily cap.

import { supabase } from '../supabase/client';

// ── Code generation ─────────────────────────────────────────────────────

/**
 * Build a shareable link for a referral code.
 *
 * Topology:
 *   - gethermez.tech          → marketing site (the "Download the APK" landing page)
 *   - app-cupid-5292e.web.app → the PWA (the actual app, where signup happens)
 *   - cupid://r/CODE          → app deep link (Android custom URL scheme)
 *
 * The share URL must point at the PWA, NOT the marketing site — the
 * deep-link capture lives in the PWA's `AppNavigator` and is what
 * stores the pending ref for signup. If the user lands on the
 * marketing site, the ref is silently dropped.
 *
 * To make the URL robust, we use a `/r/CODE` path segment on the PWA
 * domain (NOT a query string). The PWA's Firebase Hosting config
 * has a `**` → `/index.html` rewrite, so any path resolves to the
 * SPA, and `AppNavigator` reads `window.location.pathname` /
 * `window.location.search` to extract the code.
 */
export const REFERRAL_WEB_HOST = 'https://app-cupid-5292e.web.app';
export const REFERRAL_APP_SCHEME = 'cupid://r/';

export function buildReferralLink(code) {
  if (!code) return null;
  const upper = String(code).toUpperCase();
  return {
    web: `${REFERRAL_WEB_HOST}/r/${upper}`,
    webWithQuery: `${REFERRAL_WEB_HOST}/?ref=${upper}`, // alternate form; both captured
    app: `${REFERRAL_APP_SCHEME}${upper}`,
    code: upper,
  };
}

/**
 * Returns the user's referral code, generating one on the server if
 * they don't have one yet. Safe to call repeatedly — the server
 * function is idempotent.
 */
export async function getOrCreateMyReferralCode(userId) {
  if (!userId) return null;
  const { data, error } = await supabase.rpc('get_or_create_referral_code', {
    p_user_id: userId,
  });
  if (error) {
    console.log('[referrals] getOrCreateMyReferralCode error:', error.message);
    return null;
  }
  return data;
}

// ── Reward firing ───────────────────────────────────────────────────────

/**
 * Called by ProfileSetupScreen after a successful profile save.
 * If the user was referred, the server credits the referrer's wallet
 * and returns the result. If not (self-referral, daily cap hit,
 * already credited, no referrer), the call is a no-op on the wallet
 * and we return a structured result so the UI can choose to celebrate
 * or stay silent.
 *
 * @param {string} referredUserId - the user who just completed their profile
 * @returns {Promise<{ok: boolean, reason?: string, new_balance?: number, daily_count?: number}>}
 */
export async function tryCompleteReferral(referredUserId) {
  if (!referredUserId) return { ok: false, reason: 'no_user' };
  try {
    const { data, error } = await supabase.rpc('complete_referral', {
      p_referred_id: referredUserId,
    });
    if (error) {
      console.log('[referrals] tryCompleteReferral error:', error.message);
      return { ok: false, reason: 'rpc_error' };
    }
    return data || { ok: false, reason: 'no_response' };
  } catch (e) {
    console.log('[referrals] tryCompleteReferral threw:', e?.message);
    return { ok: false, reason: 'exception' };
  }
}

// ── Stats + recent activity ─────────────────────────────────────────────

/**
 * Returns the user's referral stats: today's count (UTC),
 * lifetime completed count, lifetime earnings, and pending count.
 */
export async function getReferralStats(userId) {
  if (!userId) {
    return { today_count: 0, lifetime_count: 0, lifetime_earnings: 0, pending_count: 0 };
  }
  try {
    const { data, error } = await supabase.rpc('get_referral_stats', {
      p_user_id: userId,
    });
    if (error) {
      console.log('[referrals] getReferralStats error:', error.message);
      return { today_count: 0, lifetime_count: 0, lifetime_earnings: 0, pending_count: 0 };
    }
    return (
      data || { today_count: 0, lifetime_count: 0, lifetime_earnings: 0, pending_count: 0 }
    );
  } catch {
    return { today_count: 0, lifetime_count: 0, lifetime_earnings: 0, pending_count: 0 };
  }
}

/**
 * Fetch the most recent referrals the user has sent, joined with the
 * referred user's basic profile fields. Used by the recent-referrals
 * list on the Referrals screen.
 */
export async function getRecentReferrals(userId, limit = 10) {
  if (!userId) return [];
  try {
    const { data, error } = await supabase
      .from('referrals')
      .select(
        `
        id,
        status,
        reward_ngn,
        created_at,
        completed_at,
        referred:referred_id ( id, name, username, photo_urls )
      `
      )
      .eq('referrer_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) {
      console.log('[referrals] getRecentReferrals error:', error.message);
      return [];
    }
    return data || [];
  } catch {
    return [];
  }
}

// ── Display helpers ─────────────────────────────────────────────────────

export function formatNaira(amount) {
  if (amount == null) return '₦0';
  // Naira is typically displayed without decimals for whole amounts.
  // If the value is fractional (shouldn't happen in v1), show it.
  const n = Number(amount);
  if (!Number.isFinite(n)) return '₦0';
  const whole = Math.trunc(n);
  const formatted = whole.toLocaleString('en-NG');
  return `₦${formatted}`;
}
