// screens/RegisterScreen.jsx
import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  KeyboardAvoidingView, Platform, ScrollView, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radius } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import { InputField, PrimaryButton } from '../components/UI';
import { supabase } from '../supabase/client';
import { detectRegion } from '../supabase/storage';

export default function RegisterScreen({ navigation }) {
  const { colors, shadow, isDark } = useTheme();
  const s = getStyles(colors, shadow, isDark);

  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

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

      // 1. Check username first
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

      // 2. Check email before Supabase sends another verification email
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

      // 3. Detect region
      const region = await detectRegion();

      // 4. Create auth account
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

      // 5. Insert profile row
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
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

        <TouchableOpacity style={s.backBtn} onPress={() => navigation?.goBack()}>
          <Ionicons name="chevron-back" size={20} color={colors.graphite} />
        </TouchableOpacity>

        <View style={s.headerWrap}>
          <Text style={s.logo}>✦ Cupid</Text>
          <Text style={s.title}>Join{'\n'}Cupid</Text>
          <Text style={s.sub}>Free forever. No credit card.</Text>
        </View>

        <View style={s.steps}>
          {['Account', 'Profile', 'Photos'].map((step, i) => (
            <View key={step} style={s.stepItem}>
              <View style={[s.stepDot, i === 0 && s.stepDotActive]}>
                <Text style={[s.stepNum, i === 0 && s.stepNumActive]}>{i + 1}</Text>
              </View>
              <Text style={[s.stepLabel, i === 0 && s.stepLabelActive]}>{step}</Text>
            </View>
          ))}
        </View>

        <View style={s.form}>
          <InputField
            label="First name"
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            autoCapitalize="words"
          />

          <InputField
            label="Username"
            value={username}
            onChangeText={(t) => setUsername(t.replace(/[^a-zA-Z0-9_]/g, ''))}
            placeholder="e.g. john_doe"
            autoCapitalize="none"
            autoCorrect={false}
          />

          {username.length > 0 && !validateUsername(username) && (
            <Text style={s.hint}>3–20 chars · letters, numbers, underscores only</Text>
          )}

          <InputField
            label="Email address"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <InputField
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="At least 6 characters"
            secureTextEntry
          />
        </View>

        <PrimaryButton
          label="Create my account →"
          onPress={handleRegister}
          loading={loading}
          style={s.btn}
        />

        <View style={s.divider}>
          <View style={s.dividerLine} />
          <Text style={s.dividerText}>or</Text>
          <View style={s.dividerLine} />
        </View>

        <TouchableOpacity style={s.socialBtn}>
          <Text style={s.socialIcon}>G</Text>
          <Text style={s.socialText}>Continue with Google</Text>
        </TouchableOpacity>

        <View style={s.loginRow}>
          <Text style={s.loginText}>Already have an account? </Text>
          <TouchableOpacity onPress={() => navigation?.navigate('Login')}>
            <Text style={s.loginLink}>Sign in</Text>
          </TouchableOpacity>
        </View>

        <Text style={s.legal}>
          By registering you agree to our{' '}
          <Text style={s.legalLink}>Terms of Service</Text>{' '}and{' '}
          <Text style={s.legalLink}>Privacy Policy</Text>
        </Text>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const getStyles = (colors, shadow, isDark) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  scroll: { flexGrow: 1, padding: 28, paddingTop: 56, paddingBottom: 40 },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.fog,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
    alignSelf: 'flex-start',
  },
  headerWrap: { marginBottom: 28 },
  logo: { fontSize: 18, color: colors.ember, marginBottom: 20, fontWeight: '600' },
  title: {
    fontSize: 42,
    color: colors.ink,
    lineHeight: 48,
    letterSpacing: -1,
    marginBottom: 10,
    fontFamily: 'serif',
  },
  sub: { fontSize: 16, color: colors.stone },
  steps: { flexDirection: 'row', gap: 0, marginBottom: 32, alignItems: 'center' },
  stepItem: { flexDirection: 'row', alignItems: 'center', gap: 8, marginRight: 20 },
  stepDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: colors.fog,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.snow,
  },
  stepDotActive: { backgroundColor: colors.ember, borderColor: colors.ember },
  stepNum: { fontSize: 11, fontWeight: '700', color: colors.ash },
  stepNumActive: { color: colors.white },
  stepLabel: { fontSize: 12, color: colors.ash, fontWeight: '500' },
  stepLabelActive: { color: colors.ember },
  form: { marginBottom: 8 },
  hint: { fontSize: 11, color: colors.ash, marginTop: -8, marginBottom: 8, marginLeft: 4 },
  btn: { marginTop: 8 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 24 },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.fog },
  dividerText: { fontSize: 13, color: colors.ash },
  socialBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: colors.fog,
    borderRadius: radius.full,
    paddingVertical: 14,
    backgroundColor: colors.white,
  },
  socialIcon: { fontSize: 18, fontWeight: '700', color: '#4285F4' },
  socialText: { fontSize: 15, color: colors.graphite, fontWeight: '500' },
  loginRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 24, marginBottom: 16 },
  loginText: { fontSize: 14, color: colors.stone },
  loginLink: { fontSize: 14, color: colors.ember, fontWeight: '600' },
  legal: { fontSize: 11, color: colors.ash, textAlign: 'center', lineHeight: 18 },
  legalLink: { color: colors.ember },
});