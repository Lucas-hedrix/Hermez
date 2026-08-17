// src/supabase/googleAuth.js
// Supabase OAuth via system browser (expo-web-browser).
// Works with Expo Go (uses exp:// redirect) and standalone builds (uses cupid://).
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase } from './client';

// Tells the browser tab to hand control back to the app when the OAuth
// flow is complete (iOS only — Android handles it automatically).
WebBrowser.maybeCompleteAuthSession();

/**
 * Opens a Google OAuth flow via Supabase.
 * Returns { success: true } or throws an error.
 *
 * The Supabase auth state change listener in AppNavigator handles the
 * session automatically once the browser redirects back.
 */
export async function signInWithGoogle() {
  // Build the redirect URL. In Expo Go this is the exp:// address;
  // in a standalone build it becomes cupid://google-auth.
  const redirectTo = Linking.createURL('google-auth');

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: true, // we handle the browser ourselves below
    },
  });

  if (error) throw error;
  if (!data?.url) throw new Error('No OAuth URL returned from Supabase');

  // Open the Google sign-in page in the system browser.
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

  if (result.type === 'cancel' || result.type === 'dismiss') {
    // User closed the browser without completing sign-in — not an error.
    return { success: false, cancelled: true };
  }

  // On success, Supabase redirects to redirectTo?code=xxxx or #access_token=...
  // The AppNavigator deep-link listener picks this up and exchanges the code.
  // We just return success here; navigation is handled by onAuthStateChange.
  return { success: true };
}
