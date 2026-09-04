import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://wexmtqqrvlnugqshvdwc.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndleG10cXFydmxudWdxc2h2ZHdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwNTAwMzUsImV4cCI6MjA5MjYyNjAzNX0.DXNxVeMG9uXAdhFdTmG_U5BNjbgVLJK_irBlTlWI7ZI';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,       // persist session across app restarts
    autoRefreshToken: true,
    persistSession: true,
    // On web, let the client pick the session out of the URL fragment
    // (Supabase's redirect lands the browser back on the PWA origin
    // with #access_token=...&refresh_token=... in the hash, and we want
    // the client to set the session automatically).
    //
    // On native, detectSessionInUrl: false is required because there's
    // no URL scheme; AppNavigator's deep-link handler sets the session
    // manually using the tokens it parses out of the URL.
    detectSessionInUrl: Platform.OS === 'web',
  },
});
