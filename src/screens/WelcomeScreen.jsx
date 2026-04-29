// screens/WelcomeScreen.jsx
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, Image } from 'react-native';
import { radius, fonts } from '../theme';
import { useTheme } from '../theme/ThemeContext';

const { width: W, height: H } = Dimensions.get('window');

export default function WelcomeScreen({ navigation }) {
  const { colors, shadow, isDark } = useTheme();
  const s = getStyles(colors, shadow, isDark);
  return (
    <View style={s.root}>
      <Image 
        source={require('../../assets/welcome_lady.png')} 
        style={{ width: W, height: H * 0.55, position: 'absolute', top: 0 }} 
        resizeMode="cover" 
      />

      {/* Gradient overlay */}
      <View style={s.overlay} />

      {/* Content */}
      <View style={s.content}>
        {/* Logo */}
        <View style={s.logoWrap}>
          <Text style={s.logoMark}>✦</Text>
          <Text style={s.logoText}>CUPID</Text>
        </View>

        <Text style={s.headline}>Find your{'\n'}someone</Text>
        <Text style={s.sub}>Real connections with real people.{'\n'}No algorithm games.</Text>

        {/* CTA buttons */}
        <View style={s.actions}>
          <TouchableOpacity style={s.btnPrimary} onPress={() => navigation?.navigate('Register')} activeOpacity={0.88}>
            <Text style={s.btnPrimaryText}>Create account</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.btnGhost} onPress={() => navigation?.navigate('Login')} activeOpacity={0.7}>
            <Text style={s.btnGhostText}>I already have an account</Text>
          </TouchableOpacity>
        </View>

        <Text style={s.legal}>By continuing you agree to our Terms & Privacy Policy</Text>
      </View>
    </View>
  );
}

const getStyles = (colors, shadow, isDark) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.snow },

  overlay: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    height: H * 0.62,
    // In production use expo-linear-gradient:
    // <LinearGradient colors={['transparent', colors.snow]} .../>
    backgroundColor: colors.snow,
    opacity: 0.97,
  },

  content: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    padding: 32,
    paddingBottom: 48,
  },

  logoWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 24 },
  logoMark: { fontSize: 22, color: colors.ember },
  logoText: { fontSize: 28, fontFamily: fonts.display, color: colors.ember, letterSpacing: -0.5 },

  headline: {
    fontSize: 52,
    fontFamily: fonts.display,
    color: colors.ink,
    lineHeight: 58,
    letterSpacing: -1.5,
    marginBottom: 14,
  },
  sub: { fontSize: 16, color: colors.stone, lineHeight: 24, marginBottom: 36 },

  actions: { gap: 12 },
  btnPrimary: {
    backgroundColor: colors.ember,
    borderRadius: radius.full,
    paddingVertical: 17,
    alignItems: 'center',
    shadowColor: colors.ember,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 6,
  },
  btnPrimaryText: { color: colors.white, fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },

  btnGhost: {
    borderRadius: radius.full,
    paddingVertical: 15,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.fog,
  },
  btnGhostText: { color: colors.stone, fontSize: 15, fontWeight: '500' },

  legal: { fontSize: 11, color: colors.ash, textAlign: 'center', marginTop: 18, lineHeight: 16 },
});
