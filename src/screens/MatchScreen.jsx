// screens/MatchScreen.jsx
// Shown as a modal overlay when a mutual like occurs
import { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Animated, Dimensions,
} from 'react-native';
import { radius, colors } from '../theme';
import { useTheme } from '../theme/ThemeContext';

const { width: W } = Dimensions.get('window');

// Simple confetti dot component
function Dot({ color, style }) {
  return <View style={[confettiStyles.dot, { backgroundColor: color }, style]} />;
}
const confettiStyles = StyleSheet.create({ dot: { position: 'absolute', width: 8, height: 8, borderRadius: 4 } });

const CONFETTI = [
  { color: colors.ember, top: '10%', left: '10%' },
  { color: colors.gold, top: '15%', left: '70%' },
  { color: '#4CAF50', top: '20%', left: '40%' },
  { color: colors.ember, top: '5%', left: '55%' },
  { color: colors.gold, top: '8%', left: '25%' },
  { color: '#9B59B6', top: '12%', left: '85%' },
  { color: colors.ember, top: '25%', left: '5%' },
  { color: colors.gold, top: '18%', left: '90%' },
];

export default function MatchScreen({ route, navigation }) {
  const { colors, shadow, isDark } = useTheme();
  const s = getStyles(colors, shadow, isDark);
  // In production: const { match, otherUser } = route.params;
  const otherUser = { name: 'Amara', age: 25, emoji: '🌸', bg: '#FFE8D6' };
  const myEmoji = '😊';

  const scale = useRef(new Animated.Value(0)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }),
      Animated.timing(fadeIn, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <View style={s.root}>
      {/* Confetti */}
      {CONFETTI.map((c, i) => <Dot key={i} color={c.color} style={{ top: c.top, left: c.left, width: 10 + (i % 3) * 4, height: 10 + (i % 3) * 4, borderRadius: 3 }} />)}

      <Animated.View style={[s.content, { opacity: fadeIn }]}>
        {/* Spark icon */}
        <Text style={s.sparkIcon}>✦</Text>

        <Text style={s.headline}>It's a{'\n'}Spark!</Text>
        <Text style={s.sub}>You and {otherUser.name} liked each other</Text>

        {/* Avatar pair */}
        <Animated.View style={[s.avatarPair, { transform: [{ scale }] }]}>
          <View style={[s.avatarWrap, s.avatarLeft]}>
            <View style={[s.avatar, { backgroundColor: '#FFF0ED' }]}>
              <Text style={s.avatarEmoji}>{myEmoji}</Text>
            </View>
            <View style={s.avatarRing} />
          </View>

          <View style={s.heartBadge}>
            <Text style={s.heartIcon}>❤</Text>
          </View>

          <View style={[s.avatarWrap, s.avatarRight]}>
            <View style={[s.avatar, { backgroundColor: otherUser.bg }]}>
              <Text style={s.avatarEmoji}>{otherUser.emoji}</Text>
            </View>
            <View style={s.avatarRing} />
          </View>
        </Animated.View>

        {/* Names */}
        <Text style={s.names}>You & {otherUser.name}</Text>

        {/* CTAs */}
        <View style={s.actions}>
          <TouchableOpacity
            style={s.btnMessage}
            onPress={() => navigation?.navigate('FriendChat', { matchId: matchData?.id || '123', otherUser })}
            activeOpacity={0.88}
          >
            <Text style={s.btnMessageText}>Send a message 💬</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={s.btnKeep}
            onPress={() => navigation?.navigate('MainTabs')}
            activeOpacity={0.7}
          >
            <Text style={s.btnKeepText}>Keep swiping</Text>
          </TouchableOpacity>
        </View>

        {/* Compatibility note */}
        <View style={s.compatRow}>
          <Text style={s.compatStar}>★★★★★</Text>
          <Text style={s.compatText}>Great match based on your preferences</Text>
        </View>
      </Animated.View>
    </View>
  );
}

const AVG = 90;

const getStyles = (colors, shadow, isDark) => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0F0D0D',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  content: { alignItems: 'center', width: '100%' },

  sparkIcon: { fontSize: 36, color: colors.ember, marginBottom: 16 },
  headline: {
    fontSize: 64,
    fontFamily: 'serif',
    color: colors.white,
    textAlign: 'center',
    lineHeight: 68,
    letterSpacing: -2,
    marginBottom: 12,
  },
  sub: { fontSize: 16, color: 'rgba(255,255,255,0.6)', textAlign: 'center', marginBottom: 40 },

  avatarPair: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, position: 'relative' },
  avatarWrap: { position: 'relative' },
  avatarLeft: { zIndex: 1, marginRight: -20 },
  avatarRight: { zIndex: 1, marginLeft: -20 },
  avatar: {
    width: AVG, height: AVG, borderRadius: AVG / 2,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: colors.ink,
  },
  avatarEmoji: { fontSize: 44 },
  avatarRing: {
    position: 'absolute', inset: -4,
    borderWidth: 2, borderColor: colors.ember + '50',
    borderRadius: AVG / 2 + 4,
  },
  heartBadge: {
    zIndex: 10, width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.ember,
    alignItems: 'center', justifyContent: 'center',
    marginTop: -24, position: 'relative',
    shadowColor: colors.ember, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.6, shadowRadius: 10,
  },
  heartIcon: { color: colors.white, fontSize: 18 },

  names: { fontSize: 20, fontWeight: '600', color: colors.white, marginBottom: 36 },

  actions: { width: '100%', gap: 12, marginBottom: 28 },
  btnMessage: {
    backgroundColor: colors.ember, borderRadius: radius.full,
    paddingVertical: 17, alignItems: 'center',
    shadowColor: colors.ember, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.45, shadowRadius: 14,
  },
  btnMessageText: { color: colors.white, fontSize: 16, fontWeight: '700' },
  btnKeep: {
    borderRadius: radius.full, paddingVertical: 15, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  btnKeepText: { color: 'rgba(255,255,255,0.7)', fontSize: 15, fontWeight: '500' },

  compatRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  compatStar: { color: colors.gold, fontSize: 12, letterSpacing: 2 },
  compatText: { fontSize: 12, color: 'rgba(255,255,255,0.4)' },
});
