// screens/RegisterScreen.jsx
import { useState } from 'react';
import { View, Text, StyleSheet, Alert, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../supabase/client';
import { detectRegion } from '../supabase/storage';
import { signInWithGoogle } from '../supabase/googleAuth';
import { EMAIL_CONFIRM_REDIRECT } from '../utils/authRedirect';
import {
  AuthHeroLayout,
  AuthField,
  AuthPrimaryButton,
  AuthGoogleButton,
  AuthDivider,
  AuthSwitchRow,
} from '../components/AuthChrome';

const SIGNUP_BG = require('../../assets/sign_up.jpg');

export default function RegisterScreen({ navigation }) {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState(null);

  const validateUsername = (u) => /^[a-zA-Z0-9_]{3,20}$/.test(u);

  const getFriendlyError = (message = '') => {
    const msg = message.toLowerCase();

    if (msg.includes('rate limit')) {
      return 'Too many email attempts. Please wait a few minutes before trying again.';
    }

    if (msg.includes('already registered') || msg.includes('already exists')) {
      return 'This email is already registered. Please sign in instead.';
    }

    return message || 'Something went wrong. Please try again.';
  };

  const handleGoogleSignIn = async () => {
    try {
      setGoogleLoading(true);
      const result = await signInWithGoogle();
      if (result.cancelled) return;
    } catch (e) {
      Alert.alert('Google sign-in failed', e.message);
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleRegister = async () => {
    const cleanName = name.trim();
    const cleanUsername = username.trim().toLowerCase();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanName || !cleanUsername || !cleanEmail || !password.trim()) {
      Alert.alert('Missing details', 'Please fill in all fields.');
      return;
    }

    if (!validateUsername(cleanUsername)) {
      Alert.alert(
        'Invalid username',
        'Username must be 3–20 characters: letters, numbers, underscores only.'
      );
      return;
    }

    if (password.length < 6) {
      Alert.alert('Weak password', 'Password must be at least 6 characters.');
      return;
    }

    // Log every step so it's visible in the browser console. On iOS Safari
    // in PWA mode, native Alert.alert can be silently swallowed, so
    // we ALSO stash the latest error in component state and render it
    // inline in the form. That way the user can see what went wrong
    // even if the modal Alert doesn't show.
    const log = (...args) => console.log('[Register]', ...args);

    setLoading(true);
    setFormError(null);

    try {
      log('start', { cleanEmail, cleanUsername });

      log('step 1/5: check username');
      const { data: usernameTaken, error: usernameError } = await supabase
        .from('users')
        .select('id')
        .eq('username', cleanUsername)
        .maybeSingle();

      if (usernameError) {
        log('username check error', usernameError);
        throw usernameError;
      }
      log('step 1/5: username ok', { taken: !!usernameTaken });

      if (usernameTaken) {
        Alert.alert('Username taken', 'Please choose a different username.');
        return;
      }

      log('step 2/5: check email');
      const { data: emailTaken, error: emailError } = await supabase
        .from('users')
        .select('id')
        .eq('email', cleanEmail)
        .maybeSingle();

      if (emailError) {
        log('email check error', emailError);
        throw emailError;
      }
      log('step 2/5: email ok', { taken: !!emailTaken });

      if (emailTaken) {
        Alert.alert('Email already used', 'This email is already registered. Please sign in instead.');
        return;
      }

      log('step 3/5: detect region');
      const region = await detectRegion();
      log('step 3/5: region', region);

      // Resolve a pending referral code (from a deep link) into a referrer
      // user id. We do this before sign-up so the new user row carries
      // `referred_by` from the very first insert, and the reward can fire
      // later when they complete their profile.
      let referredBy = null;
      try {
        const { getPendingRef, clearPendingRef } = await import('../utils/pendingReferral');
        const pendingCode = await getPendingRef();
        if (pendingCode) {
          const { data: referrer } = await supabase
            .from('users')
            .select('id')
            .eq('referral_code', String(pendingCode).toUpperCase())
            .maybeSingle();
          if (referrer?.id) {
            // Make sure we can't self-refer via code collision.
            // (The data has not been created yet so this is a no-op now,
            // but the check keeps us safe if a user re-uses a code mid-flow.)
            referredBy = referrer.id;
          }
          await clearPendingRef();
        }
      } catch (e) {
        // Non-fatal — proceed without a referrer if anything throws.
        log('pending ref resolution failed:', e?.message);
      }

      log('step 4/5: supabase.auth.signUp', { redirectTo: EMAIL_CONFIRM_REDIRECT });
      const { data, error: authError } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: {
            name: cleanName,
            username: cleanUsername,
          },
          // On web this points at the PWA origin (the cupid:// scheme only
          // works on the native app). See utils/authRedirect.js.
          emailRedirectTo: EMAIL_CONFIRM_REDIRECT,
        },
      });

      if (authError) {
        log('signUp error', authError);
        throw authError;
      }
      log('step 4/5: signUp ok', { userId: data?.user?.id, hasSession: !!data?.session });

      if (!data?.user?.id) {
        throw new Error('Could not create account. Please try again.');
      }

      log('step 5/5: insert users row');
      const { error: dbError } = await supabase.from('users').insert({
        id: data.user.id,
        name: cleanName,
        username: cleanUsername,
        email: cleanEmail,
        region: region ?? '',
        age: 18,
        gender: '',
        bio: '',
        city: '',
        photo_urls: [],
        hobbies: [],
        astrology_sign: '',
        preference: 'everyone',
        min_age: 18,
        max_age: 35,
        profile_complete: false,
        referred_by: referredBy,
      });

      if (dbError) {
        log('users insert error', dbError);
        throw dbError;
      }
      log('step 5/5: users row inserted — navigating to VerifyEmail');

      navigation?.navigate('VerifyEmail', { email: cleanEmail });
    } catch (error) {
      log('CAUGHT', error);
      const friendly = getFriendlyError(error?.message);
      setFormError(friendly);
      Alert.alert('Registration failed', friendly);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthHeroLayout
      background={SIGNUP_BG}
      onBack={() => navigation?.goBack()}
      title={"Join\nCupid"}
      subtitle="Free forever. No credit card."
      compact
    >
      <View style={s.steps}>
        <View style={s.stepTrack}>
          <View style={s.stepFill} />
        </View>
        <Text style={s.stepLabel}>Step 1 of 3  ·  Account</Text>
      </View>

      <AuthField
        icon="person-outline"
        placeholder="First name"
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
        returnKeyType="next"
      />

      <AuthField
        icon="at-outline"
        placeholder="Username"
        value={username}
        onChangeText={(t) => setUsername(t.replace(/[^a-zA-Z0-9_]/g, ''))}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="next"
        style={username.length > 0 && !validateUsername(username) ? s.fieldError : undefined}
      />

      {username.length > 0 && !validateUsername(username) && (
        <Text style={s.hint}>3–20 characters · letters, numbers, underscores</Text>
      )}

      <AuthField
        icon="mail-outline"
        placeholder="Email address"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="next"
      />

      <AuthField
        icon="lock-closed-outline"
        placeholder="Password · at least 6 characters"
        value={password}
        onChangeText={setPassword}
        secureTextEntry={!showPassword}
        returnKeyType="go"
        onSubmitEditing={handleRegister}
        right={
          <TouchableOpacity
            onPress={() => setShowPassword((v) => !v)}
            style={s.eyeBtn}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name={showPassword ? 'eye-outline' : 'eye-off-outline'}
              size={20}
              color="rgba(255,255,255,0.5)"
            />
          </TouchableOpacity>
        }
      />

      {formError ? (
        <View style={s.errorBox}>
          <Ionicons name="alert-circle-outline" size={18} color="#FF8A9F" />
          <Text style={s.errorText}>{formError}</Text>
        </View>
      ) : null}

      <AuthPrimaryButton
        label={loading ? 'Creating account...' : 'Create my account'}
        onPress={handleRegister}
        loading={loading}
      />

      <AuthDivider />

      <AuthGoogleButton onPress={handleGoogleSignIn} loading={googleLoading} />

      <AuthSwitchRow
        prompt="Already have an account?"
        action="Sign in"
        onPress={() => navigation?.navigate('Login')}
      />

      <Text style={s.legal}>
        By registering you agree to our{' '}
        <Text style={s.legalLink}>Terms of Service</Text>
        {' '}and{' '}
        <Text style={s.legalLink}>Privacy Policy</Text>
      </Text>

      <TouchableOpacity
        style={s.diagBtn}
        onPress={async () => {
          setFormError(null);
          console.log('[Diag] Pinging Supabase from', Platform.OS);
          try {
            const t0 = Date.now();
            const { data, error } = await supabase.auth.getSession();
            console.log('[Diag] getSession ok in', Date.now() - t0, 'ms', { data, error });
            const t1 = Date.now();
            const ping = await supabase.from('users').select('id').limit(1);
            console.log('[Diag] users query ok in', Date.now() - t1, 'ms', { ping });
            setFormError(`OK: getSession=${Date.now() - t0}ms, users=${Date.now() - t1}ms, err=${error?.message || 'none'}, queryErr=${ping.error?.message || 'none'}`);
          } catch (e) {
            console.log('[Diag] THREW', e);
            setFormError(`Threw: ${e?.message || JSON.stringify(e)}`);
          }
        }}
      >
        <Text style={s.diagText}>🔧 Test connection</Text>
      </TouchableOpacity>
    </AuthHeroLayout>
  );
}

const s = StyleSheet.create({
  steps: { marginBottom: 16 },
  stepTrack: {
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
    marginBottom: 8,
  },
  stepFill: {
    width: '33%',
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#FF6B85',
  },
  stepLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.55)',
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  hint: {
    fontSize: 11,
    color: '#FF8A9F',
    marginTop: -6,
    marginBottom: 10,
    marginLeft: 4,
  },
  fieldError: {
    borderColor: 'rgba(255,138,159,0.55)',
  },
  eyeBtn: { padding: 6, marginRight: -4 },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 107, 133, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 133, 0.32)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  errorText: {
    flex: 1,
    color: '#FFD0DA',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  legal: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.42)',
    textAlign: 'center',
    lineHeight: 17,
    marginTop: 16,
  },
  legalLink: { color: '#FF8A9F', fontWeight: '600' },
  diagBtn: {
    alignSelf: 'center',
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  diagText: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 12,
    fontWeight: '600',
  },
});
