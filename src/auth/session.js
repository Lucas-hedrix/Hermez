// src/auth/session.js
// Stores the Firebase Auth session in AsyncStorage so it persists across
// app restarts. The SDK can't do this in Expo Go (new arch), so we do it
// manually using the REST API tokens.

import AsyncStorage from '@react-native-async-storage/async-storage';

const FIREBASE_API_KEY = 'AIzaSyCZ7Ir4TtO7qM8K4SbN3uc18_nW8tQXr7M';
const KEY = '@cupid_session';

// ── Persist & retrieve ──────────────────────────────────────────────────────

export async function saveSession({ uid, idToken, refreshToken, name, email }) {
  await AsyncStorage.setItem(KEY, JSON.stringify({ uid, idToken, refreshToken, name, email }));
}

export async function getSession() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function clearSession() {
  await AsyncStorage.removeItem(KEY);
}

// ── Firebase Auth REST helpers ──────────────────────────────────────────────

/** Sign up with email + password. Returns { uid, idToken, refreshToken }. */
export async function signUp(email, password) {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }
  );
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return { uid: data.localId, idToken: data.idToken, refreshToken: data.refreshToken };
}

/** Sign in with email + password. Returns { uid, idToken, refreshToken }. */
export async function signIn(email, password) {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }
  );
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return { uid: data.localId, idToken: data.idToken, refreshToken: data.refreshToken };
}

/** Update Firebase Auth display name. */
export async function updateDisplayName(idToken, displayName) {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:update?key=${FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken, displayName, returnSecureToken: false }),
    }
  );
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
}
