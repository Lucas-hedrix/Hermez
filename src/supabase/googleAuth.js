// src/supabase/googleAuth.js
// Supabase OAuth for Google.
//
// Two distinct flows, branched on platform:
//
//   1. NATIVE (Android / iOS app)
//      Opens the system browser via expo-web-browser. The browser
//      follows the OAuth dance, then redirects back to
//      `cupid://google-auth`. expo-web-browser detects the redirect
//      in the same tab and resolves the promise. The user lands
//      back in the app; onAuthStateChange in AppNavigator fires.
//
//   2. WEB (PWA in a browser)
//      The browser does a full-page navigation to the OAuth URL.
//      Supabase handles the redirect itself — when the browser
//      comes back to our PWA origin, the Supabase client re-hydrates
//      the session from the URL fragment (detectSessionInUrl: true
//      on web). We do NOT use expo-web-browser here because:
//        - it tries to open a popup, which iOS Safari aggressively
//          blocks, AND
//        - the session tokens end up in the popup's localStorage,
//          not the opener's, so the main app never sees them.
//
//      The cost of the web flow is a full-page reload on the way
//      back, but that's fine for a PWA and is the same trade-off
//      every Supabase web app makes.
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';
import { supabase } from './client';

// Tell the system browser (iOS) to hand control back to the app once
// the OAuth dance finishes. No-op on web.
WebBrowser.maybeCompleteAuthSession();

export async function signInWithGoogle() {
  // Native app redirect: a deep link back into the app.
  // Web redirect: the PWA origin (the same page) with the auth code
  // in the query string, which Supabase will exchange automatically.
  const redirectTo =
    Platform.OS === 'web'
      ? `${window.location.origin}/`
      : Linking.createURL('google-auth');

  if (Platform.OS === 'web') {
    // Web: full-page redirect. Supabase will land us back on the PWA
    // origin with the session in the URL fragment, and onAuthStateChange
    // in AppNavigator will pick it up.
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        // Default (false) is correct on web — we want Supabase to
        // assign window.location itself.
      },
    });
    if (error) throw error;
    if (data?.url) {
      window.location.assign(data.url);
    }
    return { success: true };
  }

  // ── Native flow (Android / iOS app) ────────────────────────────────────
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: true, // we handle the browser ourselves below
    },
  });

  if (error) throw error;
  if (!data?.url) throw new Error('No OAuth URL returned from Supabase');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

  if (result.type === 'cancel' || result.type === 'dismiss') {
    return { success: false, cancelled: true };
  }

  return { success: true };
}
