// screens/WelcomeScreen.jsx
import { View, Text, StyleSheet, Dimensions, TouchableOpacity } from 'react-native';
import { colors, radius, fonts } from '../theme';

const { width: W, height: H } = Dimensions.get('window');

// Decorative avatar cards shown on the welcome screen
const PREVIEW_CARDS = [
  { emoji: '😊', bg: '#FFE8D6', rotate: '-12deg', top: H * 0.12, left: W * 0.06 },
  { emoji: '😍', bg: '#D6EAF8', rotate: '8deg', top: H * 0.08, left: W * 0.38 },
  { emoji: '🥰', bg: '#D5F5E3', rotate: '-5deg', top: H * 0.20, left: W * 0.62 },
  { emoji: '😎', bg: '#F9EBEA', rotate: '14deg', top: H * 0.30, left: W * 0.15 },
  { emoji: '🤩', bg: '#FEF9E7', rotate: '-9deg', top: H * 0.26, left: W * 0.52 },
];

export default function WelcomeScreen({ navigation }) {
  return (
    <View style={s.root}>
      {/* Floating profile cards */}
      {PREVIEW_CARDS.map((c, i) => (
        <View
          key={i}
          style={[s.floatCard, { top: c.top, left: c.left, backgroundColor: c.bg, transform: [{ rotate: c.rotate }] }]}
        >
          <Text style={s.floatEmoji}>{c.emoji}</Text>
        </View>
      ))}

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

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.snow },

  floatCard: {
    position: 'absolute',
    width: 88,
    height: 108,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.10,
    shadowRadius: 14,
    elevation: 5,
  },
  floatEmoji: { fontSize: 42 },

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
