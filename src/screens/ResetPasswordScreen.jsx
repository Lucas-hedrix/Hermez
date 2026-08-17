// screens/ResetPasswordScreen.jsx
import { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Alert, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { InputField, PrimaryButton } from '../components/UI';
import { supabase } from '../supabase/client';

export default function ResetPasswordScreen({ navigation }) {
  const { colors, shadow, isDark } = useTheme();
  const s = getStyles(colors, shadow, isDark);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleUpdatePassword = async () => {
    if (password.length < 6) {
      Alert.alert('Weak password', 'Password must be at least 6 characters.');
      return;
    }

    try {
      setLoading(true);
      const { error } = await supabase.auth.updateUser({ password });
      
      if (error) throw error;
      
      Alert.alert('Success', 'Your password has been updated.', [
        { text: 'OK', onPress: () => navigation?.navigate('MainTabs') }
      ]);
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        
        <TouchableOpacity style={s.backBtn} onPress={() => navigation?.goBack()}>
          <Ionicons name="chevron-back" size={20} color={colors.graphite} />
        </TouchableOpacity>

        <View style={s.headerWrap}>
          <Text style={s.logo}>✦ Cupid</Text>
          <Text style={s.title}>New Password</Text>
          <Text style={s.sub}>Enter your new password below.</Text>
        </View>

        <View style={s.form}>
          <InputField
            label="New Password"
            value={password}
            onChangeText={setPassword}
            placeholder="At least 6 characters"
            secureTextEntry
          />
          <PrimaryButton label="Update Password" onPress={handleUpdatePassword} loading={loading} style={s.btn} />
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
  title: { fontSize: 36, color: colors.ink, lineHeight: 42, letterSpacing: -1, marginBottom: 10, fontFamily: 'serif' },
  sub:   { fontSize: 16, color: colors.stone },
  form:  { gap: 16 },
  btn:   { marginTop: 8 },
});
