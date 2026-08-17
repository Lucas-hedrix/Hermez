  // screens/LoginScreen.jsx — email or username login
  import React, { useState } from 'react';
  import { Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
  import { Ionicons } from '@expo/vector-icons';
  import { supabase } from '../supabase/client';
  import { signInWithGoogle } from '../supabase/googleAuth';
  import {
    AuthHeroLayout,
    AuthField,
    AuthPrimaryButton,
    AuthGoogleButton,
    AuthDivider,
    AuthSwitchRow,
  } from '../components/AuthChrome';

  const LOGIN_BG = require('../../assets/login.jpg');

  export default function LoginScreen({ navigation }) {
    const [identifier, setIdentifier] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

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

    const handleLogin = async () => {
      if (!identifier.trim() || !password.trim()) {
        Alert.alert('Missing details', 'Please enter your email (or username) and password.');
        return;
      }
      try {
        setLoading(true);
        let email = identifier.trim();

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

        const signInPromise = supabase.auth.signInWithPassword({ email, password });
        let timeoutId;
        const timeoutPromise = new Promise((_, reject) => {
          timeoutId = setTimeout(
            () => reject(new Error('Sign in request timed out after 30 seconds. Check connection.')),
            30000
          );
        });

        const { error } = await Promise.race([signInPromise, timeoutPromise]);
        clearTimeout(timeoutId);
        if (error) throw error;
        navigation?.navigate('MainTabs');
      } catch (error) {
        Alert.alert('Sign in failed', error.message);
      } finally {
        setLoading(false);
      }
    };

    const handleForgotPassword = async () => {
      let email = identifier.trim();
      if (!email) {
        Alert.alert('Email required', 'Please enter your email or username above to reset your password.');
        return;
      }
      try {
        setLoading(true);
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
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: 'cupid://reset-password',
        });
        if (error) throw error;
        Alert.alert('Reset link sent', `A password reset link has been sent to ${email}`);
      } catch (error) {
        Alert.alert('Reset failed', error.message);
      } finally {
        setLoading(false);
      }
    };

    return (
      <AuthHeroLayout
        background={LOGIN_BG}
        onBack={() => navigation?.goBack()}
        title="Welcome back"
        subtitle="Pick up the conversation where you left off."
      >
        <AuthField
          icon="mail-outline"
          placeholder="Email or username"
          value={identifier}
          onChangeText={setIdentifier}
          keyboardType={identifier.includes('@') ? 'email-address' : 'default'}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="next"
        />

        <AuthField
          icon="lock-closed-outline"
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword}
          returnKeyType="go"
          onSubmitEditing={handleLogin}
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

        <TouchableOpacity onPress={handleForgotPassword} style={s.forgotWrap} activeOpacity={0.7}>
          <Text style={s.forgotText}>Forgot password?</Text>
        </TouchableOpacity>

        <AuthPrimaryButton label={loading ? 'Signing in...' : 'Sign In'} onPress={handleLogin} loading={loading} />

        <AuthDivider />

        <AuthGoogleButton onPress={handleGoogleSignIn} loading={googleLoading} />

        <AuthSwitchRow
          prompt="New here?"
          action="Create an account"
          onPress={() => navigation?.navigate('Register')}
        />
      </AuthHeroLayout>
    );
  }

  const s = StyleSheet.create({
    eyeBtn: { padding: 6, marginRight: -4 },
    forgotWrap: { alignSelf: 'flex-end', marginBottom: 14, marginTop: -2 },
    forgotText: { color: '#FF8A9F', fontSize: 13, fontWeight: '700' },
  });
