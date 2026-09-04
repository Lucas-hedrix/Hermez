// utils/authRedirect.js
// Returns the right post-auth redirect URL for the current platform.
//
// Why this exists: the app has three surfaces and each one needs a different
// URL for Supabase's email verification and password reset links.
//
//   • Native app (Android/iOS)  →  cupid://email-confirmed
//      The custom scheme is declared in app.json. The OS routes the click
//      back to the app, and AppNavigator's deep-link handler picks it up.
//
//   • PWA in a normal browser  →  https://app-cupid-5292e.web.app/?confirm=1
//      A custom scheme like cupid:// DOES NOT WORK in a browser tab. If we
//      send a cupid:// redirect and the user clicks the email link, the
//      browser just sits there or shows "protocol not found" — they're
//      stuck on the VerifyEmail screen forever. So on web we send a
//      regular https URL pointing at the PWA. The PWA loads, AppNavigator's
//      handleAuthRedirect sees the access_token in the URL fragment and
//      calls supabase.auth.setSession() to complete verification.
//
// `redirectPath` is the route inside the app to land on after the auth
// completes (e.g. 'email-confirmed', 'reset-password'). On web we attach
// it as a query param so the deep link handler can route correctly.

import { Platform } from 'react-native';

export const PWA_ORIGIN = 'https://app-cupid-5292e.web.app';

export function getAuthRedirectUrl(redirectPath = 'email-confirmed') {
  if (Platform.OS === 'web') {
    // Use the hash-routed fragment to keep it stable across SPA rewrites
    // (Firebase Hosting's ** → /index.html rewrite drops the query, so
    // we pass the path on the hash side instead).
    return `${PWA_ORIGIN}/#/${redirectPath}`;
  }
  // Native app — the custom scheme.
  return `cupid://${redirectPath}`;
}

// Convenience: the exact strings we pass to Supabase.
export const EMAIL_CONFIRM_REDIRECT = getAuthRedirectUrl('email-confirmed');
export const PASSWORD_RESET_REDIRECT = getAuthRedirectUrl('reset-password');
