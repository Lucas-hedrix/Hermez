// utils/pendingReferral.js
// Captures a referral code from a deep link and persists it across
// the auth flow so we can attach it to a brand-new user at signup.
//
// Lifecycle:
//   1. App is opened via cupid://r/CODE (or https://cupid.app/r/CODE?ref=CODE)
//   2. AppNavigator parses the URL and calls setPendingRef(code)
//   3. RegisterScreen (or Google OAuth path) reads it via getPendingRef(),
//      attaches it to the new user as `referred_by`, and calls clearPendingRef()

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@cupid_pending_ref';

export async function setPendingRef(code) {
  if (!code) return;
  const cleaned = String(code).trim().toUpperCase();
  if (!cleaned) return;
  try {
    await AsyncStorage.setItem(KEY, cleaned);
  } catch (e) {
    // Non-fatal; log so we can spot the issue in the wild
    console.log('[pendingReferral] setPendingRef failed:', e?.message);
  }
}

export async function getPendingRef() {
  try {
    return await AsyncStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export async function clearPendingRef() {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch (e) {
    console.log('[pendingReferral] clearPendingRef failed:', e?.message);
  }
}
