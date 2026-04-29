import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { PrimaryButton } from '../components/UI';

export default function EmailConfirmedScreen({ navigation }) {
  const { colors } = useTheme();
  const s = getStyles(colors);

  return (
    <View style={s.root}>
      <View style={s.content}>
        <View style={s.iconWrap}>
          <Ionicons name="checkmark-circle-outline" size={80} color={colors.success} />
        </View>

        <Text style={s.title}>Email Confirmed!</Text>

        <Text style={s.desc}>
          Thank you for verifying your email. You can now continue setting up your Cupid profile.
        </Text>

        <View style={s.actions}>
          <PrimaryButton
            label="Continue"
            onPress={() => navigation?.navigate('ProfileSetup')}
          />
        </View>
      </View>
    </View>
  );
}

const getStyles = (colors) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.white,
      padding: 28,
    },
    content: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    iconWrap: {
      marginBottom: 32,
    },
    title: {
      fontSize: 32,
      fontWeight: '800',
      color: colors.ink,
      marginBottom: 16,
      textAlign: 'center',
    },
    desc: {
      fontSize: 16,
      color: colors.stone,
      textAlign: 'center',
      lineHeight: 24,
      marginBottom: 40,
      paddingHorizontal: 16,
    },
    actions: {
      width: '100%',
      maxWidth: 300,
    },
  });