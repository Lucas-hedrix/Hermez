// screens/LoginScreen.jsx — email or username login
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

export default function LoginScreen({ navigation }) {
  const { colors, shadow, isDark } = useTheme();
  const s = getStyles(colors, shadow, isDark);
  const [identifier, setIdentifier] = useState(''); // email OR username
  const [password,   setPassword]   = useState('');
  const [loading,    setLoading]    = useState(false);

  const handleLogin = async () => {
    if (!identifier.trim() || !password.trim()) {
      Alert.alert('Missing details', 'Please enter your email (or username) and password.');
      return;
    }
    try {
      setLoading(true);

      let email = identifier.trim();

      // If it doesn't look like an email, treat it as a username → look up email
      if (!email.includes('@')) {
        const { data: profile, error: lookupErr } = await supabase
          .from('users')
          .select('email')
          .eq('username', email.toLowerCase())
          .maybeSingle();

        if (lookupErr || !profile) {
          Alert.alert('User not found', 'No account found with that username.');
          return;
        }
        email = profile.email;
      }

      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      navigation?.navigate('MainTabs');
    } catch (error) {
      Alert.alert('Sign in failed', error.message);
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
          <Text style={s.title}>Welcome{'\n'}back</Text>
          <Text style={s.sub}>Sign in to continue</Text>
        </View>

        <View style={s.form}>
          <InputField
            label="Email or username"
            value={identifier}
            onChangeText={setIdentifier}
            placeholder="you@example.com or @username"
            keyboardType={identifier.includes('@') ? 'email-address' : 'default'}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <InputField
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="Your password"
            secureTextEntry
          />
          <TouchableOpacity style={s.forgotWrap}>
            <Text style={s.forgot}>Forgot password?</Text>
          </TouchableOpacity>
          <PrimaryButton label="Sign in" onPress={handleLogin} loading={loading} style={s.btn} />
        </View>

        <View style={s.divider}>
          <View style={s.dividerLine} />
          <Text style={s.dividerText}>or</Text>
          <View style={s.dividerLine} />
        </View>

        <TouchableOpacity style={s.socialBtn}>
          <Text style={s.socialIcon}>G</Text>
          <Text style={s.socialText}>Continue with Google</Text>
        </TouchableOpacity>

        <View style={s.registerRow}>
          <Text style={s.registerText}>Don't have an account? </Text>
          <TouchableOpacity onPress={() => navigation?.navigate('Register')}>
            <Text style={s.registerLink}>Create one</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const getStyles = (colors, shadow, isDark) => StyleSheet.create({
  root:   { flex: 1, backgroundColor: colors.white },
  scroll: { flexGrow: 1, padding: 28, paddingTop: 56 },
  backBtn:{ width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.fog, alignItems: 'center', justifyContent: 'center', marginBottom: 32, alignSelf: 'flex-start' },
  headerWrap: { marginBottom: 36 },
  logo:  { fontSize: 18, color: colors.ember, marginBottom: 20, fontWeight: '600' },
  title: { fontSize: 42, color: colors.ink, lineHeight: 48, letterSpacing: -1, marginBottom: 10, fontFamily: 'serif' },
  sub:   { fontSize: 16, color: colors.stone },
  form:  { gap: 4 },
  forgotWrap: { alignSelf: 'flex-end', marginBottom: 24, marginTop: -8 },
  forgot:     { fontSize: 13, color: colors.ember, fontWeight: '500' },
  btn:        { marginTop: 4 },
  divider:     { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 28 },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.fog },
  dividerText: { fontSize: 13, color: colors.ash },
  socialBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderWidth: 1, borderColor: colors.fog, borderRadius: radius.full, paddingVertical: 14, backgroundColor: colors.white },
  socialIcon:  { fontSize: 18, fontWeight: '700', color: '#4285F4' },
  socialText:  { fontSize: 15, color: colors.graphite, fontWeight: '500' },
  registerRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 28 },
  registerText:{ fontSize: 14, color: colors.stone },
  registerLink:{ fontSize: 14, color: colors.ember, fontWeight: '600' },
});
