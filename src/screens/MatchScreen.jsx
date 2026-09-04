import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Animated, Dimensions} from 'react-native';
import { radius } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import { supabase } from '../supabase/client';
import { getPlaceholderUrl } from '../utils/placeholders';

const { width: W, height: H } = Dimensions.get('window');

// Live confetti dot component
function Dot({ color, startX, startY, delay }) {
  const translateY = useRef(new Animated.Value(startY - 50)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: H + 50, duration: 2500 + Math.random() * 1500, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  return <Animated.View style={[confettiStyles.dot, { backgroundColor: color, left: startX, opacity, transform: [{ translateY }] }]} />;
}
const confettiStyles = StyleSheet.create({ dot: { position: 'absolute', width: 10, height: 10, borderRadius: 5 } });

export default function MatchScreen({ route, navigation }) {
  const { colors, shadow, isDark } = useTheme();
  const s = getStyles(colors, shadow, isDark);
  
  const otherUser = route?.params?.otherUser || { name: 'Someone', photo_urls: [] };
  const [myPhoto, setMyPhoto] = useState(null);
  const [myName, setMyName] = useState(null);

  const scale = useRef(new Animated.Value(0)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;

  // Generate random confetti drops
  const confettiPieces = useRef(Array.from({ length: 30 }).map((_, i) => ({
    id: i,
    color: [colors.ember, colors.gold, '#4CAF50', '#9B59B6', '#FF9800'][Math.floor(Math.random() * 5)],
    startX: Math.random() * W,
    startY: -(Math.random() * 200),
    delay: Math.random() * 1000
  }))).current;

  useEffect(() => {
    // Fetch my photo
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data } = await supabase.from('users').select('name, photo_urls').eq('id', session.user.id).single();
        if (data?.photo_urls?.length > 0) setMyPhoto(data.photo_urls[0]);
        if (data?.name) setMyName(data.name);
      }
    })();

    Animated.parallel([
      Animated.spring(scale, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }),
      Animated.timing(fadeIn, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <View style={s.root}>
      {/* Live Confetti */}
      {confettiPieces.map(c => <Dot key={c.id} color={c.color} startX={c.startX} startY={c.startY} delay={c.delay} />)}

      <Animated.View style={[s.content, { opacity: fadeIn }]}>
        <Text style={s.sparkIcon}>✦</Text>

        <Text style={s.headline}>It's a{'\n'}Spark!</Text>
        <Text style={s.sub}>You and {otherUser.name} liked each other</Text>

        {/* Avatar pair */}
        <Animated.View style={[s.avatarPair, { transform: [{ scale }] }]}>
          <View style={[s.avatarWrap, s.avatarLeft]}>
            <View style={[s.avatar, { backgroundColor: colors.fog, overflow: 'hidden' }]}>
              {myPhoto ? <Image source={{ uri: myPhoto }} style={[StyleSheet.absoluteFillObject, {width: "100%", height: "100%"}] } /> : <Image source={{ uri: getPlaceholderUrl(myName) }} style={[StyleSheet.absoluteFillObject, {width: "100%", height: "100%"}] } />}
            </View>
            <View style={s.avatarRing} />
          </View>

          <View style={s.heartBadge}>
            <Text style={s.heartIcon}>❤</Text>
          </View>

          <View style={[s.avatarWrap, s.avatarRight]}>
            <View style={[s.avatar, { backgroundColor: colors.fog, overflow: 'hidden' }]}>
              {otherUser.photo_urls?.[0] ? <Image source={{ uri: otherUser.photo_urls[0] }} style={[StyleSheet.absoluteFillObject, {width: "100%", height: "100%"}] } /> : <Image source={{ uri: getPlaceholderUrl(otherUser.name) }} style={[StyleSheet.absoluteFillObject, {width: "100%", height: "100%"}] } />}
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
            onPress={() => navigation?.navigate('Matches')}
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

import { Ionicons } from '@expo/vector-icons';
const getStyles = (colors, shadow, isDark) => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0F0D0D',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    overflow: 'hidden'
  },
  content: { alignItems: 'center', width: '100%', zIndex: 10 },

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
    borderWidth: 3, borderColor: '#0F0D0D',
  },
  avatarEmoji: { fontSize: 36, color: colors.ink, fontWeight: '700' },
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
