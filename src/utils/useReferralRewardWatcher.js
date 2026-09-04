// utils/useReferralRewardWatcher.js
// Hook that, when the user reaches MainTabs, queries their wallet_credits
// for any new referral credits they haven't been shown yet, and exposes
// a state to drive the ReferralRewardModal.
//
// The "shown" cursor is `users.last_referral_shown_at` — a timestamptz.
// On mount we look for source='referral' credits newer than that cursor.
// The component that renders the modal is responsible for calling
// `markShown(creditId)` once the user dismisses, which advances the cursor.

import { useEffect, useRef, useState, useCallback } from 'react';
import { AppState } from 'react-native';
import { supabase } from '../supabase/client';

export function useReferralRewardWatcher(userId) {
  const [pending, setPending] = useState(null); // single credit object or null
  const [loading, setLoading] = useState(false);
  const inflight = useRef(false);

  const fetchNewCredits = useCallback(async () => {
    if (!userId || inflight.current) return;
    inflight.current = true;
    setLoading(true);
    try {
      // 1. Read cursor + wallet balance
      const { data: userRow, error: userErr } = await supabase
        .from('users')
        .select('last_referral_shown_at')
        .eq('id', userId)
        .maybeSingle();
      if (userErr) {
        console.log('[useReferralRewardWatcher] user fetch error:', userErr.message);
        return;
      }
      const cursor = userRow?.last_referral_shown_at || null;

      // 2. Find the oldest unseen referral credit (FIFO so we celebrate
      // them in the order they happened, not the latest first).
      let query = supabase
        .from('wallet_credits')
        .select('id, amount_ngn, created_at, description')
        .eq('user_id', userId)
        .eq('source', 'referral')
        .order('created_at', { ascending: true })
        .limit(1);
      if (cursor) query = query.gt('created_at', cursor);
      const { data, error } = await query;
      if (error) {
        console.log('[useReferralRewardWatcher] credits fetch error:', error.message);
        return;
      }
      if (data && data[0]) {
        setPending(data[0]);
      } else {
        setPending(null);
      }
    } finally {
      inflight.current = false;
      setLoading(false);
    }
  }, [userId]);

  // Re-check when the app foregrounds (in case a credit arrived while
  // the app was in the background, e.g. the user just sent a spark and
  // a friend completed their profile minutes later).
  useEffect(() => {
    if (!userId) return undefined;
    fetchNewCredits();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') fetchNewCredits();
    });
    return () => sub.remove();
  }, [userId, fetchNewCredits]);

  const markShown = useCallback(
    async (credit) => {
      if (!credit) {
        setPending(null);
        return;
      }
      // Advance the cursor to the credit's timestamp so we don't re-show it.
      // (A millisecond nudge avoids floating-point equality issues with
      // second-precision timestamps.)
      const ts = credit.created_at;
      try {
        await supabase
          .from('users')
          .update({ last_referral_shown_at: ts })
          .eq('id', userId);
      } catch (e) {
        console.log('[useReferralRewardWatcher] markShown update failed:', e?.message);
      }
      setPending(null);
      // Re-check immediately in case there are more credits queued up.
      setTimeout(() => fetchNewCredits(), 50);
    },
    [userId, fetchNewCredits]
  );

  return { pending, loading, markShown, refresh: fetchNewCredits };
}
