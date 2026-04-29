import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { PrimaryButton, GhostButton } from '../components/UI';
import { supabase } from '../supabase/client';

export default function VerifyEmailScreen({ navigation, route }) {
  const { colors, shadow, isDark } = useTheme();
  const s = getStyles(colors, shadow, isDark);

  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [email, setEmail] = useState(route?.params?.email || '');

  useEffect(() => {
    if (!email) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user?.email) {
          setEmail(session.user.email);
        }
      });
    }
  }, [email]);

  useEffect(() => {
    if (cooldown <= 0) return;

    const timer = setInterval(() => {
      setCooldown((prev) => Math.max(prev - 1, 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [cooldown]);

  const getFriendlyError = (message = '') => {
    const msg = message.toLowerCase();

    if (msg.includes('rate limit')) {
      return 'Too many email attempts. Please wait a few minutes before requesting another link.';
    }

    return message || 'Something went wrong. Please try again.';
  };

const handleCheckStatus = async () => {
  setLoading(true);

  try {
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error) throw error;

    if (user?.email_confirmed_at) {
      Alert.alert('Success', 'Your email has been verified!', [
        {
          text: 'Continue',
          onPress: () => navigation?.navigate('ProfileSetup'),
        },
      ]);
    } else {
      Alert.alert(
        'Not verified',
        'We still have not verified your email. Please check your inbox and click the verification link.'
      );
    }
  } catch (e) {
    Alert.alert('Error', getFriendlyError(e.message));
  } finally {
    setLoading(false);
  }
};

  const handleResend = async () => {
    if (!email || cooldown > 0 || resending) return;

    setResending(true);

    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim().toLowerCase(),
        options: {
          emailRedirectTo: 'cupid://email-confirmed',
        },
      });

      if (error) throw error;

      setCooldown(60);
      Alert.alert('Email sent', 'We have sent another verification link to your email.');
    } catch (e) {
      Alert.alert('Error', getFriendlyError(e.message));
    } finally {
      setResending(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigation?.replace('Welcome');
  };

  const resendLabel =
    cooldown > 0
      ? `Resend again in ${cooldown}s`
      : resending
        ? 'Sending...'
        : 'Resend email link';

  return (
    <View style={s.root}>
      <View style={s.content}>
        <View style={s.iconWrap}>
          <Ionicons name="mail-unread-outline" size={64} color={colors.ember} />
        </View>

        <Text style={s.title}>Verify your email</Text>

        <Text style={s.subtitle}>
          We've sent a verification link to{'\n'}
          <Text style={s.email}>{email}</Text>
        </Text>

        <Text style={s.desc}>
          Please check your inbox and click the link to verify your account so you can continue using Cupid.
        </Text>

        <View style={s.actions}>
          <PrimaryButton
            label="I've verified my email"
            onPress={handleCheckStatus}
            loading={loading}
          />

          <GhostButton
            label={resendLabel}
            onPress={handleResend}
            disabled={cooldown > 0 || resending}
            style={{ marginTop: 12, borderWidth: 0, opacity: cooldown > 0 ? 0.5 : 1 }}
          />
        </View>
      </View>

      <TouchableOpacity style={s.logoutBtn} onPress={handleSignOut}>
        <Text style={s.logoutText}>Use a different account</Text>
      </TouchableOpacity>
    </View>
  );
}

const getStyles = (colors, shadow, isDark) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white, padding: 28 },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  iconWrap: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.emberLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.ink,
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: colors.graphite,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 16,
  },
  email: { fontWeight: '700', color: colors.ink },
  desc: {
    fontSize: 14,
    color: colors.stone,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 40,
    paddingHorizontal: 16,
  },
  actions: { width: '100%', maxWidth: 300 },
  logoutBtn: { padding: 16, alignItems: 'center', marginBottom: 20 },
  logoutText: { color: colors.stone, fontSize: 14, fontWeight: '500' },
});