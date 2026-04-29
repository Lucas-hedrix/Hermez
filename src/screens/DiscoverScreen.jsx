// screens/DiscoverScreen.jsx
import { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, Animated, PanResponder,
  TouchableOpacity, Image, Dimensions, ScrollView, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radius } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import { supabase } from '../supabase/client';

// ── Astrology compatibility engine ───────────────────────────────────────────
const ELEMENTS = {
  Fire:  ['Aries', 'Leo', 'Sagittarius'],
  Earth: ['Taurus', 'Virgo', 'Capricorn'],
  Air:   ['Gemini', 'Libra', 'Aquarius'],
  Water: ['Cancer', 'Scorpio', 'Pisces'],
};
const COMPAT = {
  Fire:  { Fire: 3, Air: 3,   Earth: 1, Water: 0 },
  Earth: { Earth: 3, Water: 3, Fire: 1,  Air: 0   },
  Air:   { Air: 3,  Fire: 3,  Water: 1, Earth: 0  },
  Water: { Water: 3, Earth: 3, Air: 1,  Fire: 0   },
};
function getElement(sign) {
  for (const [elem, signs] of Object.entries(ELEMENTS)) {
    if (signs.includes(sign)) return elem;
  }
  return null;
}
function astrologyScore(mySign, theirSign) {
  const a = getElement(mySign), b = getElement(theirSign);
  if (!a || !b) return 1;
  return COMPAT[a]?.[b] ?? 1;
}

const { width: W, height: H } = Dimensions.get('window');
const SWIPE_THRESHOLD = W * 0.3;

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function ProfileCard({ profile, style, panHandlers, likeOpacity, passOpacity, superOpacity }) {
  const { colors, shadow, isDark } = useTheme();
  const s = getStyles(colors, shadow, isDark);
  const [photoIdx, setPhotoIdx] = useState(0);
  const photos = profile.photo_urls?.length > 0 ? profile.photo_urls : [null];
  const compatScore = profile._compatScore ?? 1;

  return (
    <Animated.View style={[s.card, style, shadow.card]} {...(panHandlers || {})}>
      <View style={s.cardPhoto}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: profile.bg ?? '#FFE8D6', alignItems: 'center', justifyContent: 'center' }]}>
          {photos[photoIdx]
            ? <Image source={{ uri: photos[photoIdx] }} style={{ width: '100%', height: '100%', position: 'absolute' }} resizeMode="cover" />
            : <Ionicons name="person" size={80} color={colors.ash} />}
        </View>

        {/* Dot indicators */}
        {photos.length > 1 && (
          <View style={s.dotRow}>
            {photos.map((_, i) => (
              <View key={i} style={[s.dot, i === photoIdx && s.dotActive]} />
            ))}
          </View>
        )}

        {/* Tap zones */}
        {photos.length > 1 && (
          <>
            <TouchableOpacity style={s.photoNavLeft}  onPress={() => setPhotoIdx(i => Math.max(0, i - 1))} activeOpacity={1} />
            <TouchableOpacity style={s.photoNavRight} onPress={() => setPhotoIdx(i => Math.min(photos.length - 1, i + 1))} activeOpacity={1} />
          </>
        )}

        {/* Compatibility badge */}
        {compatScore >= 2 && (
          <View style={s.compatBadge}>
            <Text style={s.compatText}>✦ {compatScore === 3 ? 'Great match' : 'Good match'}</Text>
          </View>
        )}
      </View>

      <View style={s.cardInfo}>
        <View style={s.nameRow}>
          <Text style={s.cardName}>{profile.name}</Text>
          {profile.username && <Text style={s.cardUsername}>@{profile.username}</Text>}
          <View style={s.verifiedBadge}>
            <Ionicons name="checkmark" size={11} color={colors.white} />
          </View>
        </View>
        {profile.region && (
          <View style={s.locationRow}>
            <Ionicons name="globe-outline" size={13} color={colors.stone} />
            <Text style={s.locationText}>Based in {profile.region}</Text>
          </View>
        )}
        {profile.astrology_sign ? (
          <View style={s.locationRow}>
            <Ionicons name="star-outline" size={13} color={colors.stone} />
            <Text style={s.locationText}>{profile.astrology_sign}</Text>
          </View>
        ) : null}
        {!profile.hide_last_seen && profile.last_seen && (
          <View style={s.locationRow}>
            <Ionicons name="time-outline" size={13} color={colors.stone} />
            <Text style={s.locationText}>Active {timeAgo(profile.last_seen)}</Text>
          </View>
        )}
        {profile.bio && <Text style={s.cardBio} numberOfLines={2}>{profile.bio}</Text>}
      </View>

      {likeOpacity  && <Animated.View style={[s.indicator, s.likeInd,  { opacity: likeOpacity  }]}><Text style={s.likeText}>LIKE</Text></Animated.View>}
      {passOpacity  && <Animated.View style={[s.indicator, s.passInd,  { opacity: passOpacity  }]}><Text style={s.passText}>NOPE</Text></Animated.View>}
      {superOpacity && <Animated.View style={[s.indicator, s.superInd, { opacity: superOpacity }]}><Text style={s.superText}>SUPER</Text></Animated.View>}
    </Animated.View>
  );
}

export default function DiscoverScreen({ navigation }) {
  const { colors, shadow, isDark } = useTheme();
  const s = getStyles(colors, shadow, isDark);
  const [profiles, setProfiles] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [myUid, setMyUid]   = useState(null);
  const [mySign, setMySign] = useState('');
  const position = useRef(new Animated.ValueXY()).current;

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      setMyUid(session.user.id);

      // Fetch my sign
      const { data: me } = await supabase.from('users').select('astrology_sign').eq('id', session.user.id).single();
      const sign = me?.astrology_sign ?? '';
      setMySign(sign);

      // Fetch my past swipes
      const { data: pastSwipes } = await supabase.from('swipes').select('swiped_id').eq('swiper_id', session.user.id);
      const swipedIds = (pastSwipes || []).map(s => s.swiped_id);

      let query = supabase
        .from('users')
        .select('id, name, username, city, region, bio, photo_urls, astrology_sign, last_seen, hide_last_seen')
        .neq('id', session.user.id)
        .eq('profile_complete', true)
        .eq('show_me_on_cupid', true);

      if (swipedIds.length > 0) {
        query = query.not('id', 'in', `(${swipedIds.join(',')})`);
      }

      const { data } = await query.limit(40);

      if (data && data.length > 0) {
        // Score + sort by astrology compatibility (primary factor)
        const scored = data
          .map(p => ({ ...p, _compatScore: astrologyScore(sign, p.astrology_sign) }))
          .sort((a, b) => b._compatScore - a._compatScore);
        setProfiles(scored);
      }
    })();
  }, []);

  const rotate = position.x.interpolate({ inputRange: [-W / 2, 0, W / 2], outputRange: ['-12deg', '0deg', '12deg'] });
  const likeOpacity = position.x.interpolate({ inputRange: [0, W / 4], outputRange: [0, 1], extrapolate: 'clamp' });
  const passOpacity = position.x.interpolate({ inputRange: [-W / 4, 0], outputRange: [1, 0], extrapolate: 'clamp' });
  const superOpacity = position.y.interpolate({ inputRange: [-H / 5, 0], outputRange: [1, 0], extrapolate: 'clamp' });

  const recordSwipe = async (direction) => {
    const profile = profiles[currentIdx];
    if (!myUid || !profile) return;
    await supabase.from('swipes').upsert({ swiper_id: myUid, swiped_id: profile.id, direction });
    if (direction === 'like' || direction === 'super') {
      const { data } = await supabase
        .from('swipes').select('id')
        .eq('swiper_id', profile.id).eq('swiped_id', myUid)
        .in('direction', ['like', 'super']).maybeSingle();
      if (data) {
        await supabase.from('matches').insert({ user1_id: myUid, user2_id: profile.id });
        navigation?.navigate('Match', { otherUser: profile });
      }
    }
  };

  const nextCard = (toX, toY = 0, direction = 'pass') => {
    recordSwipe(direction);
    Animated.timing(position, { toValue: { x: toX, y: toY }, duration: 250, useNativeDriver: false }).start(() => {
      position.setValue({ x: 0, y: 0 });
      setCurrentIdx(i => i + 1);
    });
  };

  const handleMessage = async () => {
    const profile = profiles[currentIdx];
    if (!profile || !myUid) return;
    try {
      let { data } = await supabase.from('friendships').select('*')
        .or(`and(requester_id.eq.${myUid},recipient_id.eq.${profile.id}),and(requester_id.eq.${profile.id},recipient_id.eq.${myUid})`).maybeSingle();
        
      if (!data) {
        const { data: newF, error } = await supabase.from('friendships').insert({
          requester_id: myUid,
          recipient_id: profile.id,
          status: 'pending'
        }).select().single();
        if (error) throw error;
        data = newF;
      }
      
      if (data) {
        navigation?.navigate(data.status === 'accepted' ? 'Chat' : 'FriendChat', {
          friendship: data,
          otherUser: profile,
          match: data,
          myUid
        });
      }
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  };

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderMove: (_, g) => position.setValue({ x: g.dx, y: g.dy }),
    onPanResponderRelease: (_, g) => {
      if (g.dx > SWIPE_THRESHOLD) nextCard(W * 1.5, 0, 'like');
      else if (g.dx < -SWIPE_THRESHOLD) nextCard(-W * 1.5, 0, 'pass');
      else if (g.dy < -(H * 0.15)) nextCard(0, -H, 'super');
      else Animated.spring(position, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
    },
  });

  const profile     = profiles[currentIdx];
  const nextProfile = profiles[currentIdx + 1];

  return (
    <View style={s.root}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.logo}>✦ Cupid</Text>
        <View style={s.headerRight}>
          <TouchableOpacity style={s.headerBtn}>
            <Ionicons name="options-outline" size={20} color={colors.graphite} />
          </TouchableOpacity>
          <TouchableOpacity style={s.headerBtn}>
            <Ionicons name="notifications-outline" size={20} color={colors.graphite} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Card stack */}
      <View style={s.stack}>
        {!profile ? (
          <View style={s.emptyState}>
            <Ionicons name="sparkles" size={48} color={colors.ember} />
            <Text style={s.emptyTitle}>You've seen everyone!</Text>
            <Text style={s.emptySub}>New profiles appear daily.{'\n'}Check back tomorrow.</Text>
            <TouchableOpacity style={s.refreshBtn} onPress={() => setCurrentIdx(0)}>
              <Text style={s.refreshText}>Refresh</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {nextProfile && (
              <ProfileCard profile={nextProfile} style={[s.cardAbsolute, s.cardBehind]} />
            )}
            <ProfileCard
              profile={profile}
              style={[s.cardAbsolute, { transform: [...position.getTranslateTransform(), { rotate }] }]}
              panHandlers={panResponder.panHandlers}
              likeOpacity={likeOpacity}
              passOpacity={passOpacity}
              superOpacity={superOpacity}
            />
          </>
        )}
      </View>

      {/* Action buttons */}
      {profile && (
        <View style={s.actions}>
          <TouchableOpacity style={[s.actionBtn, s.rewindBtn]} onPress={() => setCurrentIdx(i => Math.max(0, i - 1))}>
            <Ionicons name="arrow-undo" size={18} color={colors.gold} />
          </TouchableOpacity>
          <TouchableOpacity style={[s.actionBtn, s.passBtn]} onPress={() => nextCard(-W * 1.5, 0, 'pass')}>
            <Ionicons name="close" size={26} color={colors.danger} />
          </TouchableOpacity>
          <TouchableOpacity style={[s.actionBtn, s.superBtn]} onPress={() => nextCard(0, -H, 'super')}>
            <Ionicons name="star" size={22} color={colors.gold} />
          </TouchableOpacity>
          <TouchableOpacity style={[s.actionBtn, s.likeBtn]} onPress={() => nextCard(W * 1.5, 0, 'like')}>
            <Ionicons name="heart" size={30} color={colors.white} />
          </TouchableOpacity>
          <TouchableOpacity style={[s.actionBtn, s.messageBtn]} onPress={handleMessage}>
            <Ionicons name="chatbubbles" size={20} color={colors.white} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const CARD_H = H * 0.60;

const getStyles = (colors, shadow, isDark) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.snow },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 22, paddingTop: 54, paddingBottom: 8,
  },
  logo: { fontSize: 22, color: colors.ember, fontWeight: '700', letterSpacing: -0.5 },
  headerRight: { flexDirection: 'row', gap: 8 },
  headerBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.fog,
    alignItems: 'center', justifyContent: 'center',
  },

  stack: { flex: 1, marginHorizontal: 16, marginTop: 8, position: 'relative' },
  cardAbsolute: { position: 'absolute', left: 0, right: 0, top: 0 },
  cardBehind: { transform: [{ scale: 0.96 }, { translateY: 12 }] },

  card: {
    height: CARD_H, borderRadius: radius.xl,
    overflow: 'hidden', backgroundColor: colors.white,
  },
  cardPhoto: {
    height: '65%', overflow: 'hidden', position: 'relative',
    backgroundColor: '#FFE8D6',
  },

  photoNavLeft:  { position: 'absolute', left: 0,  top: 0, bottom: 0, width: '40%' },
  photoNavRight: { position: 'absolute', right: 0, top: 0, bottom: 0, width: '40%' },

  dotRow: {
    position: 'absolute', top: 10, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'center', gap: 5, paddingHorizontal: 16,
  },
  dot: { height: 3, flex: 1, maxWidth: 40, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.4)' },
  dotActive: { backgroundColor: 'rgba(255,255,255,0.95)' },

  cardInfo: { padding: 18, flex: 1, justifyContent: 'space-between' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  cardName: { fontSize: 26, fontWeight: '700', color: colors.ink, letterSpacing: -0.5 },
  cardUsername: { fontSize: 16, fontWeight: '500', color: colors.ash, marginLeft: 2 },
  compatBadge: {
    position: 'absolute', bottom: 10, left: 10,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: radius.full,
    paddingVertical: 5, paddingHorizontal: 10,
    flexDirection: 'row', alignItems: 'center',
  },
  compatText: { color: '#FFD700', fontSize: 12, fontWeight: '700' },
  verifiedBadge: {
    marginLeft: 6, width: 20, height: 20, borderRadius: 10,
    backgroundColor: colors.ember, alignItems: 'center', justifyContent: 'center',
  },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  locationText: { fontSize: 13, color: colors.stone },
  cardBio: { fontSize: 14, color: colors.graphite, lineHeight: 20, marginTop: 6 },

  indicator: { position: 'absolute', top: 32, padding: 8, borderRadius: radius.md, borderWidth: 3 },
  likeInd:  { left: 20,  borderColor: colors.success, transform: [{ rotate: '-15deg' }] },
  likeText: { color: colors.success, fontSize: 22, fontWeight: '800', letterSpacing: 1.5 },
  passInd:  { right: 20, borderColor: colors.danger,  transform: [{ rotate: '15deg'  }] },
  passText: { color: colors.danger,  fontSize: 22, fontWeight: '800', letterSpacing: 1.5 },
  superInd: { alignSelf: 'center', left: W / 2 - 60, top: 40, borderColor: colors.gold, transform: [{ rotate: '-5deg' }] },
  superText:{ color: colors.gold,   fontSize: 22, fontWeight: '800', letterSpacing: 1.5 },

  actions: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    gap: 12, paddingVertical: 16, paddingBottom: 28,
  },
  actionBtn: { borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  rewindBtn: { width: 44, height: 44, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.fog },
  passBtn:   { width: 58, height: 58, backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.danger },
  superBtn:  { width: 52, height: 52, backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.gold },
  likeBtn:   { width: 70, height: 70, backgroundColor: colors.ember },
  messageBtn:{ width: 44, height: 44, backgroundColor: colors.emberLight, borderWidth: 1, borderColor: colors.ember, alignItems: 'center', justifyContent: 'center' },

  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  emptyTitle: { fontSize: 24, fontWeight: '700', color: colors.ink, textAlign: 'center' },
  emptySub:   { fontSize: 15, color: colors.stone, textAlign: 'center', lineHeight: 22 },
  refreshBtn: { marginTop: 8, backgroundColor: colors.ember, borderRadius: radius.full, paddingVertical: 12, paddingHorizontal: 32 },
  refreshText:{ color: colors.white, fontWeight: '600', fontSize: 15 },
});
