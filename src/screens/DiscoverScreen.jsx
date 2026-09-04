import { Image } from 'expo-image';
// screens/DiscoverScreen.jsx
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  PanResponder,
  TouchableOpacity,
  Dimensions,
  Alert,
  ScrollView,
  LayoutAnimation,
  UIManager,
  Platform,
  TouchableWithoutFeedback} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getVibeColor, getVibeIcon } from '../constants/vibes';
import { radius } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import { supabase } from '../supabase/client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AnimatedSparkles from '../components/AnimatedSparkles';
import SparkSheet from '../components/SparkSheet';
import { SkeletonDiscoverCard, SkeletonFeed, SkeletonSearchResult } from '../components/Skeleton';
import { SPARK_ICON } from '../constants/sparks';
import { getPlaceholderUrl } from '../utils/placeholders';

export { getVibeColor, getVibeIcon };

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ── Astrology compatibility engine ───────────────────────────────────────────
const ELEMENTS = {
  Fire: ['Aries', 'Leo', 'Sagittarius'],
  Earth: ['Taurus', 'Virgo', 'Capricorn'],
  Air: ['Gemini', 'Libra', 'Aquarius'],
  Water: ['Cancer', 'Scorpio', 'Pisces'],
};

const COMPAT = {
  Fire: { Fire: 3, Air: 3, Earth: 1, Water: 0 },
  Earth: { Earth: 3, Water: 3, Fire: 1, Air: 0 },
  Air: { Air: 3, Fire: 3, Water: 1, Earth: 0 },
  Water: { Water: 3, Earth: 3, Air: 1, Fire: 0 },
};

function getElement(sign) {
  for (const [elem, signs] of Object.entries(ELEMENTS)) {
    if (signs.includes(sign)) return elem;
  }
  return null;
}

function astrologyScore(mySign, theirSign) {
  const a = getElement(mySign);
  const b = getElement(theirSign);
  if (!a || !b) return 1;
  return COMPAT[a]?.[b] ?? 1;
}

const { width: W, height: H } = Dimensions.get('window');
const SWIPE_THRESHOLD = W * 0.28;

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function greetingForNow() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/** First name only from display name — never the @username handle. */
function firstNameFromProfile(name) {
  const raw = String(name || '').trim();
  if (!raw) return '';
  return raw.split(/\s+/)[0].replace(/^@+/, '');
}

function ActionButton({ onPress, style, children, haptic = 'light', disabled }) {
  const scale = useRef(new Animated.Value(1)).current;

  const bounce = (to) => {
    Animated.spring(scale, {
      toValue: to,
      useNativeDriver: true,
      speed: to < 1 ? 50 : 22,
      bounciness: to < 1 ? 0 : 10,
    }).start();
  };

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        onPressIn={() => !disabled && bounce(0.9)}
        onPressOut={() => bounce(1)}
        onPress={() => {
          if (disabled) return;
          if (haptic === 'medium') {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          } else {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }
          onPress?.();
        }}
        style={style}
        activeOpacity={0.92}
        disabled={disabled}
      >
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
}

function ProfileCard({
  profile,
  style,
  onDoubleTap,
  onLongPress,
  panHandlers,
  isDark,
}) {
  const { colors } = useTheme();
  const s = getStyles(colors, isDark);

  const [photoIdx, setPhotoIdx] = useState(0);
  const [cardW, setCardW] = useState(W - 32);

  const photos = profile.photo_urls?.length > 0
    ? profile.photo_urls
    : [getPlaceholderUrl(profile.name || profile.username)];
  const vibeColor = profile.current_vibe ? getVibeColor(profile.current_vibe) : colors.fog;
  const vibeIcon = profile.current_vibe ? getVibeIcon(profile.current_vibe) : null;

  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 1600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1600, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  const lastTapRef = useRef(0);
  const [showFeedback, setShowFeedback] = useState(null);
  const feedbackAnim = useRef(new Animated.Value(0)).current;

  const handlePress = (e) => {
    const x = e.nativeEvent.locationX;
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      const willBeLiked = !profile.isLiked;
      setShowFeedback(willBeLiked ? 'like' : 'unlike');

      Animated.sequence([
        Animated.spring(feedbackAnim, { toValue: 1, useNativeDriver: true, speed: 28, bounciness: 8 }),
        Animated.delay(380),
        Animated.timing(feedbackAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start(() => setShowFeedback(null));

      onDoubleTap?.();
      lastTapRef.current = 0;
    } else {
      if (x < cardW / 2) {
        setPhotoIdx((i) => Math.max(0, i - 1));
      } else {
        setPhotoIdx((i) => Math.min(photos.length - 1, i + 1));
      }
      lastTapRef.current = now;
    }
  };

  const location = [profile.city, profile.region].filter(Boolean).join(', ');
  const lastSeenLabel = !profile.hide_last_seen && profile.last_seen
    ? `Active ${timeAgo(profile.last_seen)}`
    : null;
  const clickScore = profile._compatScore ?? 0;

  return (
    <Animated.View
      {...(panHandlers || {})}
      onLayout={(e) => setCardW(e.nativeEvent.layout.width)}
      style={[s.card, style]}
    >
      <TouchableWithoutFeedback onPress={handlePress} onLongPress={onLongPress} delayLongPress={400}>
        <View style={s.cardInner}>
          {photos[photoIdx] ? (
            <Image
              source={{ uri: photos[photoIdx] }}
              style={s.cardPhoto}
              contentFit="cover"
              onError={(e) => console.warn('[Discover card photo] load failed:', photos[photoIdx], e?.error ?? e)}
            />
          ) : (
            <View style={s.cardPhotoFallback}>
              <Ionicons name="person" size={80} color={colors.stone} />
            </View>
          )}

          <LinearGradient
            colors={
              isDark
                ? ['transparent', 'rgba(12,8,10,0.18)', 'rgba(12,8,10,0.78)']
                : ['transparent', 'rgba(40,18,22,0.08)', 'rgba(28,12,16,0.55)']
            }
            locations={[0.42, 0.68, 1]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />

          {photos.length > 1 && (
            <View style={s.dotRow}>
              {photos.map((_, i) => (
                <View key={i} style={[s.dot, i === photoIdx && s.dotActive]} />
              ))}
            </View>
          )}

          {profile.isLiked ? (
            <View style={s.likedChip}>
              <Ionicons name="heart" size={12} color="#FFF" />
              <Text style={s.likedChipText}>Liked</Text>
            </View>
          ) : null}

          <View style={s.cardInfoContainer}>
            {profile.current_vibe ? (
              <Animated.View
                style={[
                  s.vibeBadge,
                  { backgroundColor: vibeColor, transform: [{ scale: pulseAnim }] },
                ]}
              >
                <Ionicons name={vibeIcon} size={13} color="#FFF" />
                <Text style={s.vibeBadgeText}>{profile.current_vibe}</Text>
              </Animated.View>
            ) : null}

            <View style={[s.introCard, isDark ? s.introCardDark : s.introCardLight]}>
              <View style={s.nameRow}>
                <Text style={[s.cardName, { color: isDark ? '#FFF' : '#2A1A1D' }]} numberOfLines={1}>
                  {profile.name || 'Cupid user'}
                </Text>
                {profile.age ? (
                  <Text style={[s.cardAge, { color: isDark ? '#D8C9CC' : '#7A6468' }]}>
                    {profile.age}
                  </Text>
                ) : null}
                {profile.is_verified || profile.verification_level === 'verified' ? (
                  <View style={[s.verifiedBadge, { backgroundColor: vibeColor !== colors.fog ? vibeColor : colors.ember }]}>
                    <Ionicons name="checkmark" size={11} color="#FFF" />
                  </View>
                ) : null}
              </View>

              {profile.username ? (
                <Text style={[s.cardUsername, { color: isDark ? '#B9A8AC' : '#8A7377' }]} numberOfLines={1}>
                  @{profile.username}
                </Text>
              ) : null}

              {(location || lastSeenLabel) ? (
                <View style={s.metaRow}>
                  {location ? (
                    <View style={s.metaItem}>
                      <Ionicons name="location-outline" size={13} color={isDark ? '#D0C0C3' : '#8A7377'} />
                      <Text style={[s.metaText, { color: isDark ? '#E6D9DB' : '#6F5B5F' }]} numberOfLines={1}>
                        {location}
                      </Text>
                    </View>
                  ) : null}
                  {lastSeenLabel ? (
                    <View style={s.metaItem}>
                      <View style={s.onlineDot} />
                      <Text style={[s.metaText, { color: isDark ? '#E6D9DB' : '#6F5B5F' }]} numberOfLines={1}>
                        {lastSeenLabel}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : null}

              {profile.bio ? (
                <Text style={[s.cardBio, { color: isDark ? '#F3EAEB' : '#4A383C' }]} numberOfLines={2}>
                  {profile.bio}
                </Text>
              ) : null}

              {clickScore >= 3 ? (
                <View style={s.compatChip}>
                  <Ionicons name="sparkles" size={12} color={colors.ember} />
                  <Text style={[s.compatText, { color: colors.ember }]}>You two might click</Text>
                </View>
              ) : null}
            </View>
          </View>

          {showFeedback && (
            <Animated.View
              style={[s.feedbackWrap, { opacity: feedbackAnim }]}
              pointerEvents="none"
            >
              <Animated.View style={[s.feedbackBubble, { transform: [{ scale: feedbackAnim }] }]}>
                <Ionicons
                  name={showFeedback === 'like' ? 'heart' : 'heart-outline'}
                  size={36}
                  color={showFeedback === 'like' ? colors.ember : colors.stone}
                />
                <Text style={s.feedbackLabel}>
                  {showFeedback === 'like' ? 'Saved a like' : 'Like removed'}
                </Text>
              </Animated.View>
            </Animated.View>
          )}
        </View>
      </TouchableWithoutFeedback>
    </Animated.View>
  );
}

export default function DiscoverScreen({ navigation, searchBadge }) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const s = getStyles(colors, isDark);

  const [profiles, setProfiles] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [myUid, setMyUid] = useState(null);
  const [mySign, setMySign] = useState('');
  const [myName, setMyName] = useState('');
  const [loading, setLoading] = useState(true);
  const [hasNewNotifications, setHasNewNotifications] = useState(false);
  const [activeTab, setActiveTab] = useState('discover');
  const [showSparkSheet, setShowSparkSheet] = useState(false);
  const [sparkTarget, setSparkTarget] = useState(null);
  const [showToast, setShowToast] = useState(true);
  const [likedProfiles, setLikedProfiles] = useState({});
  const [toggleW, setToggleW] = useState(0);

  const greeting = useMemo(() => greetingForNow(), []);
  const toggleX = useRef(new Animated.Value(0)).current;
  const sparkPulse = useRef(new Animated.Value(1)).current;
  const toastOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.timing(toastOpacity, { toValue: 0, duration: 280, useNativeDriver: true }).start(() => {
        setShowToast(false);
      });
    }, 3200);
    return () => clearTimeout(timer);
  }, [toastOpacity]);

  useEffect(() => {
    Animated.spring(toggleX, {
      toValue: activeTab === 'vibes' ? 1 : 0,
      friction: 8,
      tension: 80,
      useNativeDriver: true,
    }).start();
  }, [activeTab, toggleX]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(sparkPulse, { toValue: 1.07, duration: 1100, useNativeDriver: true }),
        Animated.timing(sparkPulse, { toValue: 1, duration: 1100, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [sparkPulse]);

  const position = useRef(new Animated.ValueXY()).current;
  const sparkParticle = useRef(new Animated.ValueXY({ x: 0, y: H })).current;
  const sparkOpacity = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const checkNotifications = async () => {
      if (!myUid) return;
      try {
        const lastViewed = await AsyncStorage.getItem('last_viewed_notifications');
        const { data: notifs } = await supabase
          .from('notifications')
          .select('created_at')
          .eq('recipient_id', myUid)
          .order('created_at', { ascending: false })
          .limit(1);

        let latestDate = 0;
        if (notifs?.length > 0) {
          latestDate = new Date(notifs[0].created_at).getTime();
        }

        if (!lastViewed) {
          setHasNewNotifications(true);
        } else {
          setHasNewNotifications(latestDate > new Date(lastViewed).getTime());
        }
      } catch (e) {
        console.log('Notification check error:', e.message);
      }
    };

    checkNotifications();
  }, [myUid]);

  const fetchProfiles = useCallback(async () => {
    setLoading(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setLoading(false);
        return;
      }

      const uid = session.user.id;
      setMyUid(uid);

      const { data: me, error: meError } = await supabase
        .from('users')
        .select('astrology_sign, name')
        .eq('id', uid)
        .maybeSingle();

      if (meError) throw meError;

      const sign = me?.astrology_sign ?? '';
      setMySign(sign);
      // Greeting uses profile first name only — never username
      setMyName(me?.name ?? '');

      const { data: pastSwipes, error: swipeError } = await supabase
        .from('swipes')
        .select('swiped_id, direction')
        .eq('swiper_id', uid)
        .neq('direction', 'pass');

      if (swipeError) throw swipeError;

      const likesMap = {};
      const swipedIds = [];
      pastSwipes?.forEach((row) => {
        swipedIds.push(row.swiped_id);
        if (row.direction === 'like' || row.direction === 'super') {
          likesMap[row.swiped_id] = true;
        }
      });
      setLikedProfiles(likesMap);

      const { data: friendships } = await supabase
        .from('friendships')
        .select('requester_id, recipient_id, status')
        .or(`requester_id.eq.${uid},recipient_id.eq.${uid}`);

      const friendIds = friendships?.filter((f) => ['accepted', 'pending', 'blocked'].includes(f.status))
        .flatMap((f) => [f.requester_id, f.recipient_id])
        .filter((id) => id !== uid) || [];

      const { data: blocks } = await supabase
        .from('blocks')
        .select('blocker_id, blocked_id')
        .or(`blocker_id.eq.${uid},blocked_id.eq.${uid}`);

      const blockIds = blocks?.flatMap((b) => [b.blocker_id, b.blocked_id]).filter((id) => id !== uid) || [];

      let reportIds = [];
      try {
        const { data: reports } = await supabase
          .from('reports')
          .select('reported_user_id')
          .eq('reporter_id', uid);
        reportIds = reports?.map((r) => r.reported_user_id) || [];
      } catch (e) {
        console.log('Reports fetch skipped or failed', e.message);
      }

      const excluded = new Set([...friendIds, ...blockIds, ...reportIds]);

      const buildQuery = () => {
        let query = supabase
          .from('users')
          .select(
            'id, name, username, age, city, region, bio, photo_urls, astrology_sign, last_seen, hide_last_seen, show_me_on_cupid, profile_complete, current_vibe, dating_enabled, open_to, vibe_set_at, is_verified, verification_level'
          )
          .neq('id', uid)
          .order('created_at', { ascending: false });

        return query;
      };

      let { data, error } = await buildQuery().limit(200);

      if (error) throw error;

      const vibeFiltered = (data ?? []).filter((p) => !excluded.has(p.id)).map((p) => {
        if (p.current_vibe && p.vibe_set_at) {
          const setAt = new Date(p.vibe_set_at).getTime();
          const now = Date.now();
          if (now - setAt > 24 * 60 * 60 * 1000) {
            p.current_vibe = null;
          }
        }
        return p;
      });

      const scored = vibeFiltered
        .map((p) => ({
          ...p,
          _compatScore: astrologyScore(sign, p.astrology_sign),
        }))
        .sort((a, b) => {
          if (b._compatScore !== a._compatScore) {
            return b._compatScore - a._compatScore;
          }
          const aTime = a.last_seen ? new Date(a.last_seen).getTime() : 0;
          const bTime = b.last_seen ? new Date(b.last_seen).getTime() : 0;
          return bTime - aTime;
        });

      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setProfiles(scored);
      setCurrentIdx(0);
      position.setValue({ x: 0, y: 0 });
    } catch (e) {
      Alert.alert('Discover error', e.message);
    } finally {
      setLoading(false);
    }
  }, [position]);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  const rotate = position.x.interpolate({
    inputRange: [-W / 2, 0, W / 2],
    outputRange: ['-8deg', '0deg', '8deg'],
  });

  const nextCardScale = position.x.interpolate({
    inputRange: [-W, 0, W],
    outputRange: [1, 0.96, 1],
    extrapolate: 'clamp',
  });

  const handleDoubleTap = async () => {
    const current = profiles[currentIdx];
    if (!myUid || !current) return;

    const isCurrentlyLiked = likedProfiles[current.id];

    if (isCurrentlyLiked) {
      setLikedProfiles((prev) => ({ ...prev, [current.id]: false }));
      try {
        await supabase.from('swipes').delete().match({ swiper_id: myUid, swiped_id: current.id });
      } catch (e) {
        console.log('Unlike error:', e.message);
      }
    } else {
      setLikedProfiles((prev) => ({ ...prev, [current.id]: true }));
      recordSwipe('like');
    }
  };

  const recordSwipe = async (direction) => {
    const current = profiles[currentIdx];
    if (!myUid || !current) return;

    try {
      const dbDirection = direction;
      const { error: swipeError } = await supabase.from('swipes').upsert(
        {
          swiper_id: myUid,
          swiped_id: current.id,
          direction: dbDirection,
          created_at: new Date().toISOString(),
        },
        {
          onConflict: 'swiper_id,swiped_id',
        }
      );

      if (swipeError) throw swipeError;

      if (direction === 'like' || direction === 'super') {
        const { data: myData } = await supabase.from('users').select('name').eq('id', myUid).single();

        const { error: notifError } = await supabase
          .from('notifications')
          .insert([
            {
              recipient_id: current.id,
              sender_id: myUid,
              type: 'like',
              title: 'New Like!',
              message: `${myData?.name || 'Someone'} liked your profile.`,
            },
          ]);

        if (notifError) console.log(notifError.message);
      }
    } catch (e) {
      console.log('Swipe error:', e.message);
    }
  };

  const nextCard = (toX, toY = 0, direction = null) => {
    if (direction) {
      recordSwipe(direction);
    }

    Animated.timing(position, {
      toValue: { x: toX, y: toY },
      duration: 250,
      useNativeDriver: false,
    }).start(() => {
      position.setValue({ x: 0, y: 0 });
      setCurrentIdx((i) => i + 1);
    });
  };

  const nextCardRef = useRef(nextCard);
  nextCardRef.current = nextCard;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.1,
      onPanResponderGrant: () => {
        Haptics.selectionAsync();
      },
      onPanResponderMove: Animated.event(
        [null, { dx: position.x, dy: position.y }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: (_, g) => {
        if (Math.abs(g.dx) > SWIPE_THRESHOLD) {
          nextCardRef.current(g.dx > 0 ? W * 1.5 : -W * 1.5, g.dy, null);
        } else {
          Animated.spring(position, {
            toValue: { x: 0, y: 0 },
            friction: 6,
            useNativeDriver: false,
          }).start();
        }
      },
    })
  ).current;

  const playSparkBurst = () => {
    sparkParticle.setValue({ x: 0, y: H * 0.35 });
    sparkOpacity.setValue(1);

    Animated.sequence([
      Animated.parallel([
        Animated.timing(sparkParticle, { toValue: { x: 0, y: -H * 0.1 }, duration: 400, useNativeDriver: false }),
        Animated.timing(sparkOpacity, { toValue: 0, duration: 450, useNativeDriver: false }),
      ]),
      Animated.sequence([
        Animated.timing(cardScale, { toValue: 1.05, duration: 150, useNativeDriver: false }),
        Animated.timing(cardScale, { toValue: 1, duration: 150, useNativeDriver: false }),
      ]),
    ]).start();
  };

  const handleOpenSpark = () => {
    if (!profiles[currentIdx]) return;
    setShowSparkSheet(true);
  };

  const handleBlock = async (profileToBlock) => {
    if (!profileToBlock || !myUid) return;
    try {
      await supabase.from('blocks').insert({ blocker_id: myUid, blocked_id: profileToBlock.id });
      nextCard(-W * 1.5, 0, 'pass');
    } catch (e) {
      console.log('Block error', e);
    }
  };

  const handleReport = async (profileToReport) => {
    if (!profileToReport || !myUid) return;
    try {
      await supabase.from('reports').insert({
        reporter_id: myUid,
        reported_user_id: profileToReport.id,
        reason: 'Inappropriate content',
      });
      nextCard(-W * 1.5, 0, 'pass');
    } catch (e) {
      console.log('Report error', e);
    }
  };

  const profile = profiles[currentIdx];
  const nextProfile = profiles[currentIdx + 1];
  const remaining = Math.max(0, profiles.length - currentIdx);
  const firstName = useMemo(() => firstNameFromProfile(myName), [myName]);

  const handleLongPress = () => {
    if (!profile) return;
    Alert.alert('Profile Options', '', [
      { text: 'View Profile', onPress: () => navigation?.navigate('UserProfile', { userId: profile.id }) },
      { text: 'Send Spark', onPress: handleOpenSpark },
      { text: 'Pass', onPress: () => nextCard(-W * 1.5, 0, 'pass') },
      {
        text: 'Report User',
        style: 'destructive',
        onPress: () => {
          Alert.alert('Report User', `Are you sure you want to report ${profile.name || 'this user'}?`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Report', style: 'destructive', onPress: () => handleReport(profile) },
          ]);
        },
      },
      {
        text: 'Block User',
        style: 'destructive',
        onPress: () => {
          Alert.alert('Block User', `Are you sure you want to block ${profile.name || 'this user'}?`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Block', style: 'destructive', onPress: () => handleBlock(profile) },
          ]);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  useEffect(() => {
    if (!loading && profiles.length > 0 && currentIdx >= profiles.length) {
      fetchProfiles();
    }
  }, [loading, profiles.length, currentIdx, fetchProfiles]);

  const headerPadTop = (insets.top > 0 ? insets.top : Platform.OS === 'android' ? 36 : 20) + 6;
  const vibePeople = profiles.filter((p) => p.current_vibe);

  const subtitle = loading
    ? 'Looking around…'
    : remaining > 0
      ? `${remaining} ${remaining === 1 ? 'person' : 'people'} to say hi to`
      : 'That’s everyone for now';

  return (
    <View style={s.root}>
      <LinearGradient
        colors={
          isDark
            ? ['#1A0E12', colors.snow, '#100C12']
            : ['#FFF7F3', '#FBE4DC', '#FFF6F1']
        }
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <SparkSheet
        visible={showSparkSheet}
        onClose={() => { setShowSparkSheet(false); setSparkTarget(null); }}
        receiverId={sparkTarget?.id || profile?.id}
        receiverName={sparkTarget?.name || profile?.name || 'them'}
        onSent={() => {
          if (sparkTarget) {
            setSparkTarget(null);
            playSparkBurst();
          } else {
            playSparkBurst();
            setTimeout(() => nextCard(W * 1.5, 0, 'spark'), 600);
          }
        }}
      />

      <View style={[s.header, { paddingTop: headerPadTop }]}>
        <View style={s.headerCopy}>
          <Text style={s.greeting} numberOfLines={1}>
            {greeting}{firstName ? `, ${firstName}` : ''}
          </Text>
          <Text style={s.subtitle} numberOfLines={1}>{subtitle}</Text>
        </View>

        <View style={s.headerRight}>
          <TouchableOpacity
            style={s.headerBtn}
            onPress={() => navigation?.navigate('Search')}
          >
            <Ionicons name="search" size={18} color={colors.graphite} />
            {searchBadge > 0 && <View style={[s.notificationDot, { backgroundColor: colors.ember }]} />}
          </TouchableOpacity>

          <TouchableOpacity style={s.headerBtn} onPress={fetchProfiles}>
            <Ionicons name="refresh-outline" size={18} color={colors.graphite} />
          </TouchableOpacity>

          <TouchableOpacity
            style={s.headerBtn}
            onPress={() => navigation?.navigate('Notifications')}
          >
            <Ionicons name="notifications-outline" size={18} color={colors.graphite} />
            {hasNewNotifications && <View style={s.notificationDot} />}
          </TouchableOpacity>
        </View>
      </View>

      {showToast && activeTab === 'discover' && (
        <Animated.View style={[s.toast, { opacity: toastOpacity }]}>
          <Ionicons name="sparkles" size={13} color="#FFF" />
          <Text style={s.toastText}>Swipe to browse · Double-tap to like</Text>
        </Animated.View>
      )}

      <View style={s.tabToggleContainer}>
        <View
          style={s.tabToggle}
          onLayout={(e) => setToggleW(e.nativeEvent.layout.width)}
        >
          {toggleW > 0 && (
            <Animated.View
              style={[
                s.tabTogglePill,
                {
                  width: (toggleW - 8) / 2,
                  backgroundColor: colors.ember,
                  transform: [{
                    translateX: toggleX.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, (toggleW - 8) / 2],
                    }),
                  }],
                },
              ]}
            />
          )}
          <TouchableOpacity
            style={s.tabToggleBtn}
            onPress={() => setActiveTab('discover')}
            activeOpacity={0.85}
          >
            <Ionicons
              name="people"
              size={16}
              color={activeTab === 'discover' ? '#FFF' : colors.graphite}
            />
            <Text style={[s.tabToggleText, activeTab === 'discover' && s.tabToggleTextActive]}>
              People
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.tabToggleBtn}
            onPress={() => setActiveTab('vibes')}
            activeOpacity={0.85}
          >
            <Ionicons
              name="flash"
              size={16}
              color={activeTab === 'vibes' ? '#FFF' : colors.graphite}
            />
            <Text style={[s.tabToggleText, activeTab === 'vibes' && s.tabToggleTextActive]}>
              Vibes
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {activeTab === 'discover' ? (
        <>
          <View style={s.stack}>
            {loading ? (
              <SkeletonDiscoverCard />
            ) : !profile ? (
              <View style={s.emptyState}>
                <AnimatedSparkles size={48} color={colors.ember} />
                <Text style={s.emptyTitle}>That’s everyone for now</Text>
                <Text style={s.emptySub}>
                  New people show up as they join.{'\n'}Search is always there if you have someone in mind.
                </Text>
                <TouchableOpacity style={s.refreshBtn} onPress={fetchProfiles}>
                  <Text style={s.refreshText}>Look again</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {nextProfile && (
                  <ProfileCard
                    profile={nextProfile}
                    isDark={isDark}
                    style={[
                      s.cardAbsolute,
                      s.cardBehind,
                      { transform: [{ scale: nextCardScale }] },
                    ]}
                  />
                )}

                <ProfileCard
                  profile={{ ...profile, isLiked: likedProfiles[profile.id] }}
                  isDark={isDark}
                  panHandlers={panResponder.panHandlers}
                  onDoubleTap={handleDoubleTap}
                  onLongPress={handleLongPress}
                  style={[
                    s.cardAbsolute,
                    {
                      transform: [...position.getTranslateTransform(), { rotate }, { scale: cardScale }],
                    },
                  ]}
                />
              </>
            )}
          </View>

          <Animated.View
            style={[s.sparkParticle, { opacity: sparkOpacity, transform: sparkParticle.getTranslateTransform() }]}
            pointerEvents="none"
          >
            <Ionicons name={SPARK_ICON} size={56} color="#F9C22E" />
          </Animated.View>

          {profile && !loading && (
            <View style={s.actions}>
              <ActionButton
                style={[s.actionBtn, s.sideBtn]}
                onPress={() => {
                  position.setValue({ x: 0, y: 0 });
                  setCurrentIdx((i) => Math.max(0, i - 1));
                }}
              >
                <Ionicons name="arrow-undo" size={18} color={colors.stone} />
              </ActionButton>

              <ActionButton
                style={[s.actionBtn, s.sideBtn]}
                onPress={() => nextCard(-W * 1.5, 0, null)}
              >
                <Ionicons name="play-skip-forward" size={18} color={colors.graphite} />
              </ActionButton>

              <Animated.View style={{ transform: [{ scale: sparkPulse }] }}>
                <ActionButton
                  style={[s.actionBtn, s.sparkBtn]}
                  haptic="medium"
                  onPress={handleOpenSpark}
                >
                  <Ionicons name={SPARK_ICON} size={30} color="#FFF" />
                </ActionButton>
              </Animated.View>

              <ActionButton
                style={[s.actionBtn, s.sideBtn]}
                onPress={() => profile && navigation?.navigate('UserProfile', { userId: profile.id })}
              >
                <Ionicons name="person-outline" size={18} color={colors.graphite} />
              </ActionButton>
            </View>
          )}
        </>
      ) : (
        <ScrollView
          style={s.vibesList}
          contentContainerStyle={s.vibesContent}
          showsVerticalScrollIndicator={false}
        >
          {loading ? (
            <SkeletonFeed itemCount={4} ItemComponent={SkeletonSearchResult} />
          ) : vibePeople.length === 0 ? (
            <View style={s.emptyState}>
              <Ionicons name="flash-outline" size={48} color={colors.fog} style={{ marginBottom: 16 }} />
              <Text style={s.emptyTitle}>Quiet on vibes</Text>
              <Text style={s.emptySub}>Nobody nearby has an active vibe right now. Check back in a bit.</Text>
            </View>
          ) : (
            vibePeople.map((p) => {
              const vibeColor = getVibeColor(p.current_vibe);
              return (
                <TouchableOpacity
                  key={p.id}
                  style={s.vibeRow}
                  activeOpacity={0.82}
                  onPress={() => navigation?.navigate('UserProfile', { userId: p.id })}
                >
                  <View style={s.vibeRowAvWrap}>
                    <View style={[s.vibeRowAvRing, { borderColor: vibeColor }]}>
                      <Image
                        source={{ uri: p.photo_urls?.[0] || getPlaceholderUrl(p.name) }}
                        style={s.vibeRowAv}
                      />
                    </View>
                    <View style={[s.vibeRowBadge, { backgroundColor: vibeColor, borderColor: isDark ? colors.snow : '#FFF7F3' }]}>
                      <Ionicons name={getVibeIcon(p.current_vibe)} size={11} color="#FFF" />
                    </View>
                  </View>
                  <View style={s.vibeRowInfo}>
                    <Text style={s.vibeRowName}>{p.name}</Text>
                    <Text style={[s.vibeRowVibeText, { color: vibeColor }]} numberOfLines={1}>
                      {p.current_vibe}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={s.vibeRowSparkBtn}
                    onPress={() => { setSparkTarget(p); setShowSparkSheet(true); }}
                  >
                    <Ionicons name={SPARK_ICON} size={18} color={colors.ember} />
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}

const getStyles = (colors, isDark) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: isDark ? colors.snow : '#FFF7F3',
    },

    header: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingBottom: 10,
      gap: 12,
    },
    headerCopy: {
      flex: 1,
    },
    greeting: {
      fontSize: 22,
      fontWeight: '700',
      color: colors.ink,
      letterSpacing: -0.6,
    },
    subtitle: {
      marginTop: 2,
      fontSize: 13,
      fontWeight: '500',
      color: colors.stone,
    },
    toast: {
      backgroundColor: 'rgba(42, 22, 26, 0.82)',
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      alignSelf: 'center',
      position: 'absolute',
      top: 108,
      zIndex: 100,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    toastText: {
      color: '#fff',
      fontWeight: '600',
      fontSize: 12.5,
    },
    headerRight: {
      flexDirection: 'row',
      gap: 8,
    },
    headerBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.78)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255, 214, 204, 0.9)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    notificationDot: {
      position: 'absolute',
      top: 8,
      right: 9,
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: '#FF9500',
      borderWidth: 1,
      borderColor: isDark ? colors.snow : '#FFF',
    },

    stack: {
      flex: 1,
      marginHorizontal: 16,
      marginTop: 4,
      position: 'relative',
    },
    cardAbsolute: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
    },
    cardBehind: {
      opacity: 0.55,
    },
    card: {
      flex: 1,
      borderRadius: 28,
      backgroundColor: isDark ? colors.white : '#F3E6E1',
      shadowColor: isDark ? '#000' : '#C45C4A',
      shadowOffset: { width: 0, height: 14 },
      shadowOpacity: isDark ? 0.45 : 0.18,
      shadowRadius: 22,
      elevation: 8,
    },
    cardInner: {
      flex: 1,
      width: '100%',
      height: '100%',
      borderRadius: 28,
      overflow: 'hidden',
    },
    cardPhoto: {
      ...StyleSheet.absoluteFillObject,
      width: '100%',
      height: '100%',
    },
    cardPhotoFallback: {
      flex: 1,
      backgroundColor: colors.fog,
      alignItems: 'center',
      justifyContent: 'center',
    },

    dotRow: {
      position: 'absolute',
      top: 12,
      left: 14,
      right: 14,
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 5,
      zIndex: 10,
    },
    dot: {
      height: 3,
      flex: 1,
      maxWidth: 36,
      borderRadius: 2,
      backgroundColor: 'rgba(255,255,255,0.32)',
    },
    dotActive: {
      backgroundColor: 'rgba(255,255,255,0.95)',
    },
    likedChip: {
      position: 'absolute',
      top: 18,
      right: 14,
      zIndex: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: 'rgba(255,77,109,0.92)',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: radius.full,
    },
    likedChipText: {
      color: '#FFF',
      fontSize: 11,
      fontWeight: '700',
    },

    cardInfoContainer: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      padding: 12,
      zIndex: 10,
    },
    introCard: {
      borderRadius: 22,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    introCardLight: {
      backgroundColor: 'rgba(255, 248, 245, 0.94)',
    },
    introCardDark: {
      backgroundColor: 'rgba(18, 14, 18, 0.82)',
    },
    vibeBadge: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 5,
      paddingHorizontal: 10,
      borderRadius: radius.full,
      gap: 5,
      marginBottom: 8,
      marginLeft: 4,
    },
    vibeBadgeText: {
      color: '#FFF',
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 0.2,
    },
    nameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    cardName: {
      fontSize: 24,
      fontWeight: '800',
      letterSpacing: -0.5,
      maxWidth: '72%',
    },
    cardAge: {
      fontSize: 20,
      fontWeight: '600',
    },
    cardUsername: {
      fontSize: 13,
      fontWeight: '600',
      marginTop: 1,
    },
    verifiedBadge: {
      width: 18,
      height: 18,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 10,
      marginTop: 8,
    },
    metaItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      maxWidth: '70%',
    },
    metaText: {
      fontSize: 13,
      flexShrink: 1,
    },
    onlineDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: '#20C997',
    },
    cardBio: {
      fontSize: 14,
      lineHeight: 20,
      marginTop: 8,
    },
    compatChip: {
      marginTop: 10,
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: 'rgba(255,77,109,0.12)',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: radius.full,
    },
    compatText: {
      fontSize: 12,
      fontWeight: '700',
    },
    feedbackWrap: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
    },
    feedbackBubble: {
      backgroundColor: 'rgba(255,248,245,0.94)',
      paddingHorizontal: 18,
      paddingVertical: 14,
      borderRadius: 22,
      alignItems: 'center',
      gap: 6,
    },
    feedbackLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: '#4A383C',
    },

    sparkParticle: {
      position: 'absolute',
      alignSelf: 'center',
      zIndex: 200,
    },

    actions: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 14,
      paddingTop: 10,
      paddingBottom: 10,
    },
    actionBtn: {
      borderRadius: radius.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sideBtn: {
      width: 48,
      height: 48,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.86)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255, 214, 204, 0.95)',
    },
    sparkBtn: {
      width: 64,
      height: 64,
      backgroundColor: colors.ember,
      shadowColor: colors.ember,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.45,
      shadowRadius: 12,
      elevation: 8,
    },

    emptyState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 32,
      gap: 10,
    },
    emptyTitle: {
      fontSize: 22,
      fontWeight: '700',
      color: colors.ink,
      textAlign: 'center',
      letterSpacing: -0.4,
    },
    emptySub: {
      fontSize: 15,
      color: colors.stone,
      textAlign: 'center',
      lineHeight: 22,
    },
    refreshBtn: {
      marginTop: 8,
      backgroundColor: colors.ember,
      borderRadius: radius.full,
      paddingVertical: 12,
      paddingHorizontal: 28,
    },
    refreshText: {
      color: '#FFF',
      fontWeight: '700',
      fontSize: 15,
    },
    tabToggleContainer: {
      paddingHorizontal: 16,
      marginBottom: 10,
      zIndex: 10,
    },
    tabToggle: {
      flexDirection: 'row',
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.7)',
      borderRadius: radius.full,
      padding: 4,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255, 214, 204, 0.9)',
      overflow: 'hidden',
    },
    tabTogglePill: {
      position: 'absolute',
      top: 4,
      left: 4,
      bottom: 4,
      borderRadius: radius.full,
    },
    tabToggleBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 8,
      borderRadius: radius.full,
      gap: 6,
      zIndex: 1,
    },
    tabToggleText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.graphite,
    },
    tabToggleTextActive: {
      color: '#FFF',
    },
    vibesList: {
      flex: 1,
    },
    vibesContent: {
      paddingBottom: 24,
      paddingTop: 4,
    },
    vibeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: 16,
      marginBottom: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 14,
      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.86)',
      borderRadius: 20,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255, 214, 204, 0.8)',
    },
    vibeRowAvWrap: {
      width: 56,
      height: 56,
    },
    vibeRowAvRing: {
      width: '100%',
      height: '100%',
      borderRadius: 28,
      padding: 2,
      borderWidth: 2,
      justifyContent: 'center',
      alignItems: 'center',
    },
    vibeRowAv: {
      width: '100%',
      height: '100%',
      borderRadius: 24,
    },
    vibeRowBadge: {
      position: 'absolute',
      bottom: -2,
      right: -2,
      borderRadius: 11,
      padding: 4,
      borderWidth: 2,
    },
    vibeRowInfo: {
      flex: 1,
      justifyContent: 'center',
    },
    vibeRowName: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.ink,
      marginBottom: 3,
    },
    vibeRowVibeText: {
      fontSize: 13,
      fontWeight: '600',
    },
    vibeRowSparkBtn: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(255,77,109,0.12)' : 'rgba(255,77,109,0.1)',
    },
  });
