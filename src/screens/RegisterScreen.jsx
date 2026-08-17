// screens/RegisterScreen.jsx
import { useState } from 'react';
import { View, Text, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../supabase/client';
import { detectRegion } from '../supabase/storage';
import { signInWithGoogle } from '../supabase/googleAuth';
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

    try {
      setLoading(true);

      const { data: usernameTaken, error: usernameError } = await supabase
        .from('users')
        .select('id')
        .eq('username', cleanUsername)
        .maybeSingle();

      if (usernameError) throw usernameError;

      if (usernameTaken) {
        Alert.alert('Username taken', 'Please choose a different username.');
        return;
      }

      const { data: emailTaken, error: emailError } = await supabase
        .from('users')
        .select('id')
        .eq('email', cleanEmail)
        .maybeSingle();

      if (emailError) throw emailError;

      if (emailTaken) {
        Alert.alert('Email already used', 'This email is already registered. Please sign in instead.');
        return;
      }

      const region = await detectRegion();

      const { data, error: authError } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: {
            name: cleanName,
            username: cleanUsername,
          },
          emailRedirectTo: 'cupid://email-confirmed',
        },
      });

      if (authError) throw authError;

      if (!data?.user?.id) {
        throw new Error('Could not create account. Please try again.');
      }

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
      });

      if (dbError) throw dbError;

      navigation?.navigate('VerifyEmail', { email: cleanEmail });
    } catch (error) {
      Alert.alert('Registration failed', getFriendlyError(error.message));
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
  legal: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.42)',
    textAlign: 'center',
    lineHeight: 17,
    marginTop: 16,
  },
  legalLink: { color: '#FF8A9F', fontWeight: '600' },
});
