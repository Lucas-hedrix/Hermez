// screens/DiscoverScreen.jsx
import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  PanResponder,
  TouchableOpacity,
  Image,
  Dimensions,
  Alert,
  ScrollView,
  LayoutAnimation,
  UIManager,
  Platform,
  TouchableWithoutFeedback,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { VIBES, getVibeColor, getVibeIcon } from '../constants/vibes';
import { radius } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import { supabase } from '../supabase/client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AnimatedSparkles from '../components/AnimatedSparkles';
import SparkSheet from '../components/SparkSheet';
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
const SWIPE_THRESHOLD = W * 0.3;

function timeAgo(dateStr) {
  if (!dateStr) return '';

  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);

  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;

  return `${Math.floor(diff / 86400)}d ago`;
}

function ProfileCard({
  profile,
  style,
  onDoubleTap,
  onLongPress,
  likeOpacity,
  passOpacity,
  superOpacity,
  cardScale = 1,
}) {
  const { colors, shadow, isDark } = useTheme();
  const s = getStyles(colors, shadow, isDark);

  const [photoIdx, setPhotoIdx] = useState(0);

  const photos = profile.photo_urls?.length > 0 ? profile.photo_urls : [getPlaceholderUrl(profile.name || profile.username)];
  const vibeColor = profile.current_vibe ? getVibeColor(profile.current_vibe) : colors.fog;
  const vibeIcon = profile.current_vibe ? getVibeIcon(profile.current_vibe) : null;

  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.1, duration: 1500, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1500, useNativeDriver: true })
      ])
    ).start();
  }, [pulseAnim]);

  const lastTapRef = useRef(0);
  const [showFeedback, setShowFeedback] = useState(null);
  const feedbackAnim = useRef(new Animated.Value(0)).current;

  const handlePress = (e) => {
    const x = e.nativeEvent.locationX;
    const cardWidth = Dimensions.get('window').width - 32; // Approx card width

    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      const willBeLiked = !profile.isLiked;
      setShowFeedback(willBeLiked ? 'like' : 'unlike');
      
      Animated.sequence([
        Animated.spring(feedbackAnim, { toValue: 1, useNativeDriver: true }),
        Animated.delay(400),
        Animated.timing(feedbackAnim, { toValue: 0, duration: 200, useNativeDriver: true })
      ]).start(() => {
        setShowFeedback(null);
      });
      onDoubleTap?.();
      lastTapRef.current = 0;
    } else {
      if (x < cardWidth / 2) {
        setPhotoIdx((i) => Math.max(0, i - 1));
      } else {
        setPhotoIdx((i) => Math.min(photos.length - 1, i + 1));
      }
      lastTapRef.current = now;
    }
  };

  return (
    <Animated.View
      style={[
        s.card,
        style,
        shadow.card,
        {
          shadowColor: vibeColor,
          borderColor: vibeColor,
          borderWidth: profile.current_vibe ? 1 : 0,
        },
      ]}
    >
      <TouchableWithoutFeedback
        onPress={handlePress}
        onLongPress={onLongPress}
        delayLongPress={400}
      >
        <View style={{ flex: 1, width: '100%', height: '100%' }}>
          <View style={StyleSheet.absoluteFill}>
          {photos[photoIdx] ? (
            <Image
              source={{ uri: photos[photoIdx] }}
              style={[StyleSheet.absoluteFillObject, { resizeMode: 'cover' }]}
              resizeMode="cover"
            />
          ) : (
            <View
              style={{
                flex: 1,
                backgroundColor: colors.fog,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="person" size={80} color={colors.stone} />
            </View>
          )}
        </View>

        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0.9)']}
          locations={[0.5, 0.75, 1]}
          style={StyleSheet.absoluteFill}
        />

        {photos.length > 1 && (
          <View style={s.dotRow}>
            {photos.map((_, i) => (
              <View key={i} style={[s.dot, i === photoIdx && s.dotActive]} />
            ))}
          </View>
        )}

        <View style={s.cardInfoContainer}>
          {profile.current_vibe && (
            <Animated.View
              style={[
                s.vibeBadge,
                {
                  shadowColor: vibeColor,
                  transform: [{ scale: pulseAnim }],
                },
              ]}
            >
              <Ionicons name={vibeIcon} size={14} color="#FFF" />
              <Text style={s.vibeBadgeText}>{profile.current_vibe}</Text>
            </Animated.View>
          )}

          <BlurView intensity={30} tint="dark" style={s.glassOverlay}>
            <View>
              <View style={s.nameRow}>
                <Text style={s.cardName} numberOfLines={1}>
                  {profile.name || 'Cupid user'}
                </Text>

                {profile.age ? <Text style={s.cardAge}>{profile.age}</Text> : null}

                {profile.is_verified || profile.verification_level === 'verified' ? (
                  <View style={[s.verifiedBadge, { backgroundColor: vibeColor }]}>
                    <Ionicons name="checkmark" size={11} color="#FFF" />
                  </View>
                ) : null}
              </View>

              {profile.username ? (
                <Text style={s.cardUsername} numberOfLines={1}>
                  @{profile.username}
                </Text>
              ) : null}
            </View>

            {profile.region || profile.city ? (
              <View style={s.locationRow}>
                <Ionicons name="globe-outline" size={13} color="#DDD" />

                <Text style={s.locationText} numberOfLines={1}>
                  {[profile.city, profile.region].filter(Boolean).join(', ')}
                </Text>
              </View>
            ) : null}

            {profile.bio ? (
              <Text style={s.cardBio} numberOfLines={2}>
                {profile.bio}
              </Text>
            ) : null}
          </BlurView>
        </View>

        {showFeedback && (
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              {
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(0,0,0,0.3)',
                zIndex: 100,
                opacity: feedbackAnim,
              },
            ]}
            pointerEvents="none"
          >
            <Animated.View style={{ transform: [{ scale: feedbackAnim }] }}>
              <Ionicons
                name={showFeedback === 'like' ? 'heart' : 'heart-dislike'}
                size={120}
                color={showFeedback === 'like' ? colors.danger || '#FF3B30' : colors.stone}
                style={{
                  shadowColor:
                    showFeedback === 'like' ? colors.danger || '#FF3B30' : colors.stone,
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.9,
                  shadowRadius: 30,
                  elevation: 15,
                }}
              />
            </Animated.View>
          </Animated.View>
        )}

        {likeOpacity && (
          <Animated.View style={[s.indicator, s.likeInd, { opacity: likeOpacity }]}>
            <Text style={s.likeText}>LIKE</Text>
          </Animated.View>
        )}

        {passOpacity && (
          <Animated.View style={[s.indicator, s.passInd, { opacity: passOpacity }]}>
            <Text style={s.passText}>NOPE</Text>
          </Animated.View>
        )}

        {superOpacity && (
          <Animated.View style={[s.indicator, s.superInd, { opacity: superOpacity }]}>
            <Text style={s.superText}>SUPER</Text>
          </Animated.View>
        )}
        </View>
      </TouchableWithoutFeedback>
    </Animated.View>
  );
}

export default function DiscoverScreen({ navigation, searchBadge }) {
  const { colors, shadow, isDark } = useTheme();
  const s = getStyles(colors, shadow, isDark);

  const [profiles, setProfiles] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [myUid, setMyUid] = useState(null);
  const [mySign, setMySign] = useState('');
  const [loading, setLoading] = useState(true);
  const [hasNewNotifications, setHasNewNotifications] = useState(false);
  const [activeTab, setActiveTab] = useState('discover');
  const [showSparkSheet, setShowSparkSheet] = useState(false);
  const [sparkTarget, setSparkTarget] = useState(null);
  const [showToast, setShowToast] = useState(true);
  const [likedProfiles, setLikedProfiles] = useState({});

  useEffect(() => {
    const timer = setTimeout(() => setShowToast(false), 3000);
    return () => clearTimeout(timer);
  }, []);

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
        .select('astrology_sign')
        .eq('id', uid)
        .maybeSingle();

      if (meError) throw meError;

      const sign = me?.astrology_sign ?? '';
      setMySign(sign);

      const { data: pastSwipes, error: swipeError } = await supabase
        .from('swipes')
        .select('swiped_id, direction')
        .eq('swiper_id', uid)
        .neq('direction', 'pass');

      if (swipeError) throw swipeError;

      const likesMap = {};
      const swipedIds = [];
      pastSwipes?.forEach(s => {
        swipedIds.push(s.swiped_id);
        if (s.direction === 'like' || s.direction === 'super') {
          likesMap[s.swiped_id] = true;
        }
      });
      setLikedProfiles(likesMap);

      const { data: friendships } = await supabase
        .from('friendships')
        .select('requester_id, recipient_id, status')
        .or(`requester_id.eq.${uid},recipient_id.eq.${uid}`);

      const friendIds = friendships?.filter(f => ['accepted', 'pending', 'blocked'].includes(f.status))
        .flatMap(f => [f.requester_id, f.recipient_id])
        .filter(id => id !== uid) || [];

      const { data: blocks } = await supabase
        .from('blocks')
        .select('blocker_id, blocked_id')
        .or(`blocker_id.eq.${uid},blocked_id.eq.${uid}`);
      
      const blockIds = blocks?.flatMap(b => [b.blocker_id, b.blocked_id]).filter(id => id !== uid) || [];

      let reportIds = [];
      try {
        const { data: reports } = await supabase
          .from('reports')
          .select('reported_user_id')
          .eq('reporter_id', uid);
        reportIds = reports?.map(r => r.reported_user_id) || [];
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

      console.log('--- DISCOVER ENGINE STATS ---');
      console.log(`Fetched from Supabase: ${data?.length || 0} users`);
      console.log(`Excluded total: ${excluded.size}`);
      console.log(`Friends excluded: ${friendIds.length}`);
      console.log(`Blocks excluded: ${blockIds.length}`);
      console.log(`Reports excluded: ${reportIds.length}`);
      console.log(`(Swipes tracked but NOT excluded: ${swipedIds.length})`);

      const vibeFiltered = (data ?? []).filter(p => !excluded.has(p.id)).map(p => {
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
    } catch (e) {
      Alert.alert('Discover error', e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  const rotate = position.x.interpolate({
    inputRange: [-W / 2, 0, W / 2],
    outputRange: ['-12deg', '0deg', '12deg'],
  });

  const likeOpacity = position.x.interpolate({
    inputRange: [0, W / 4],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const passOpacity = position.x.interpolate({
    inputRange: [-W / 4, 0],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const superOpacity = position.y.interpolate({
    inputRange: [-H / 5, 0],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const handleDoubleTap = async () => {
    const profile = profiles[currentIdx];
    if (!myUid || !profile) return;

    const isCurrentlyLiked = likedProfiles[profile.id];
    
    if (isCurrentlyLiked) {
      // Unlike
      setLikedProfiles(prev => ({ ...prev, [profile.id]: false }));
      try {
        await supabase.from('swipes').delete().match({ swiper_id: myUid, swiped_id: profile.id });
      } catch (e) {
        console.log('Unlike error:', e.message);
      }
    } else {
      // Like
      setLikedProfiles(prev => ({ ...prev, [profile.id]: true }));
      recordSwipe('like');
    }
  };

  const recordSwipe = async (direction) => {
    const profile = profiles[currentIdx];

    if (!myUid || !profile) return;

    try {
      const dbDirection = direction;
      const { error: swipeError } = await supabase.from('swipes').upsert(
        {
          swiper_id: myUid,
          swiped_id: profile.id,
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
              recipient_id: profile.id,
              sender_id: myUid,
              type: 'like',
              title: 'New Like!',
              message: `${myData?.name || 'Someone'} liked your profile.`,
            }
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

  const handleMessage = async () => {
    const profile = profiles[currentIdx];
    // ... logic remains standard ...
  };

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
      await supabase.from('reports').insert({ reporter_id: myUid, reported_user_id: profileToReport.id, reason: 'Inappropriate content' });
      nextCard(-W * 1.5, 0, 'pass');
    } catch (e) {
      console.log('Report error', e);
    }
  };

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
            { text: 'Report', style: 'destructive', onPress: () => handleReport(profile) }
          ]);
        }
      },
      { 
        text: 'Block User', 
        style: 'destructive',
        onPress: () => {
          Alert.alert('Block User', `Are you sure you want to block ${profile.name || 'this user'}?`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Block', style: 'destructive', onPress: () => handleBlock(profile) }
          ]);
        }
      },
      { text: 'Cancel', style: 'cancel' }
    ]);
  };

  const profile = profiles[currentIdx];
  const nextProfile = profiles[currentIdx + 1];

  // Auto-spin the discovery wheel when the visible deck reaches the end.
  useEffect(() => {
    if (!loading && profiles.length > 0 && currentIdx >= profiles.length) {
      fetchProfiles();
    }
  }, [loading, profiles.length, currentIdx, fetchProfiles]);

  return (
    <View style={s.root}>
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
      <View style={s.header}>
        <View style={s.logoWrap}>
          <Ionicons name="sparkles" size={20} color={colors.ember} style={{ marginRight: 6 }} />
          <Text style={s.logo}>Cupid</Text>
        </View>

        <View style={s.headerRight}>
          <TouchableOpacity 
            style={s.headerBtn} 
            onPress={() => navigation?.navigate('Search')}
          >
            <Ionicons name="search" size={20} color={colors.graphite} />
            {searchBadge > 0 && <View style={[s.notificationDot, { backgroundColor: colors.ember }]} />}
          </TouchableOpacity>

          <TouchableOpacity style={s.headerBtn} onPress={fetchProfiles}>
            <Ionicons name="refresh-outline" size={20} color={colors.graphite} />
          </TouchableOpacity>

          <TouchableOpacity
            style={s.headerBtn}
            onPress={() => navigation?.navigate('Notifications')}
          >
            <Ionicons
              name="notifications-outline"
              size={20}
              color={colors.graphite}
            />
            {hasNewNotifications && <View style={s.notificationDot} />}
          </TouchableOpacity>
        </View>
      </View>
      
      {showToast && activeTab === 'discover' && (
        <Animated.View style={s.toast}>
          <Text style={s.toastText}>Double-tap to Like. Long-press for options.</Text>
        </Animated.View>
      )}

      <View style={s.tabToggleContainer}>
        <View style={s.tabToggle}>
          <TouchableOpacity 
            style={[s.tabToggleBtn, activeTab === 'discover' && s.tabToggleBtnActive]} 
            onPress={() => setActiveTab('discover')}
          >
            <Ionicons name="people" size={18} color={activeTab === 'discover' ? colors.white : colors.graphite} />
            <Text style={[s.tabToggleText, activeTab === 'discover' && s.tabToggleTextActive]}>Discover</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[s.tabToggleBtn, activeTab === 'vibes' && s.tabToggleBtnActive]} 
            onPress={() => setActiveTab('vibes')}
          >
            <Ionicons name="flash" size={18} color={activeTab === 'vibes' ? colors.white : colors.graphite} />
            <Text style={[s.tabToggleText, activeTab === 'vibes' && s.tabToggleTextActive]}>Vibes</Text>
          </TouchableOpacity>
        </View>
      </View>

      {activeTab === 'discover' ? (
        <>
          <View style={s.stack}>
            {loading ? (
              <View style={s.emptyState}>
                <AnimatedSparkles size={48} color={colors.ember} />
                <Text style={s.emptySub}>Finding your vibe...</Text>
              </View>
            ) : !profile ? (
              <View style={s.emptyState}>
                <AnimatedSparkles size={48} color={colors.ember} />
                <Text style={s.emptyTitle}>You've seen everyone!</Text>
                <Text style={s.emptySub}>
                  New profiles appear as more people join.{'\n'}You can also use
                  Search to find registered users.
                </Text>

                <TouchableOpacity style={s.refreshBtn} onPress={fetchProfiles}>
                  <Text style={s.refreshText}>Refresh</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {nextProfile && (
                  <ProfileCard
                    profile={nextProfile}
                    style={[s.cardAbsolute, s.cardBehind]}
                  />
                )}

                <ProfileCard
                  profile={{...profile, isLiked: likedProfiles[profile.id]}}
                  style={[
                    s.cardAbsolute,
                    {
                      transform: [...position.getTranslateTransform(), { rotate }, { scale: cardScale }],
                    },
                  ]}
                  onDoubleTap={handleDoubleTap}
                  onLongPress={handleLongPress}
                  likeOpacity={likeOpacity}
                  passOpacity={passOpacity}
                  superOpacity={superOpacity}
                />
              </>
            )}
          </View>

          <Animated.View style={[s.sparkParticle, { opacity: sparkOpacity, transform: sparkParticle.getTranslateTransform() }]} pointerEvents="none">
            <Ionicons name={SPARK_ICON} size={56} color="#F9C22E" />
          </Animated.View>

          {profile && !loading && (
            <View style={s.actions}>
              <TouchableOpacity
                style={[s.actionBtn, s.rewindBtn]}
                onPress={() => setCurrentIdx((i) => Math.max(0, i - 1))}
              >
                <Ionicons name="arrow-undo" size={18} color={colors.stone} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.actionBtn, s.passBtn]}
                onPress={() => nextCard(-W * 1.5, 0, null)}
              >
                <Ionicons name="arrow-redo" size={18} color={colors.danger || '#FF3B30'} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.actionBtn, s.sparkBtn]}
                onPress={handleOpenSpark}
              >
                <Ionicons name={SPARK_ICON} size={34} color={colors.white} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.actionBtn, s.messageBtn]}
                onPress={() => profile && navigation?.navigate('UserProfile', { userId: profile.id })}
              >
                <Ionicons name="person-outline" size={20} color={colors.stone} />
              </TouchableOpacity>
            </View>
          )}
        </>
      ) : (
        <ScrollView style={s.vibesList} contentContainerStyle={{ paddingBottom: 100, paddingTop: 10 }}>
          {loading ? (
            <View style={s.emptyState}>
              <AnimatedSparkles size={48} color={colors.ember} />
              <Text style={s.emptySub}>Finding active vibes...</Text>
            </View>
          ) : profiles.filter(p => p.current_vibe).length === 0 ? (
            <View style={s.emptyState}>
              <Ionicons name="flash-outline" size={48} color={colors.fog} style={{marginBottom: 16}} />
              <Text style={s.emptyTitle}>No active vibes</Text>
              <Text style={s.emptySub}>None of the users nearby have an active vibe.</Text>
            </View>
          ) : (
            profiles.filter(p => p.current_vibe).map(p => {
              const vibeColor = getVibeColor(p.current_vibe);
              return (
                <TouchableOpacity 
                  key={p.id} 
                  style={s.vibeRow} 
                  activeOpacity={0.8}
                  onPress={() => navigation?.navigate('UserProfile', { userId: p.id })}
                >
                  <View style={s.vibeRowAvWrap}>
                    <View style={[s.vibeRowAvRing, { backgroundColor: colors.emberLight }]}>
                      <Image source={{ uri: p.photo_urls?.[0] || getPlaceholderUrl(p.name) }} style={s.vibeRowAv} />
                      <View style={[s.vibeRowBadge, { shadowColor: vibeColor, borderColor: colors.snow }]}>
                        <Ionicons name={getVibeIcon(p.current_vibe)} size={12} color={vibeColor} />
                      </View>
                    </View>
                  </View>
                  <View style={s.vibeRowInfo}>
                    <Text style={s.vibeRowName}>{p.name}</Text>
                    <Text style={[s.vibeRowVibeText, { color: vibeColor }]} numberOfLines={1}>{p.current_vibe}</Text>
                  </View>
                  <TouchableOpacity 
                    style={[s.vibeRowSparkBtn, { backgroundColor: colors.snow, shadowColor: colors.ember }]} 
                    onPress={() => { setSparkTarget(p); setShowSparkSheet(true); }}
                  >
                    <Ionicons name={SPARK_ICON} size={20} color={colors.ember} />
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

const CARD_H = H * 0.6;

const getStyles = (colors, shadow, isDark) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.snow,
    },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 22,
      paddingTop: 54,
      paddingBottom: 8,
    },
    toast: {
      backgroundColor: 'rgba(0,0,0,0.7)',
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 20,
      alignSelf: 'center',
      position: 'absolute',
      top: 100,
      zIndex: 100,
    },
    toastText: {
      color: '#fff',
      fontWeight: '600',
      fontSize: 13,
    },
    logo: {
      fontSize: 22,
      color: colors.ember,
      fontWeight: '700',
      letterSpacing: -0.5,
    },
    logoWrap: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    headerRight: {
      flexDirection: 'row',
      gap: 8,
    },
    headerBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.white,
      borderWidth: 1,
      borderColor: colors.fog,
      alignItems: 'center',
      justifyContent: 'center',
    },
    notificationDot: {
      position: 'absolute',
      top: 8,
      right: 10,
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: '#FF9500',
      borderWidth: 1,
      borderColor: colors.white,
    },
    
    vibeSelector: {
      paddingBottom: 10,
    },
    vibeScroll: {
      paddingHorizontal: 16,
      gap: 10,
    },
    vibePill: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 8,
      paddingHorizontal: 16,
      backgroundColor: colors.white,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: colors.fog,
      gap: 6,
    },
    vibePillActive: {
      backgroundColor: colors.ember,
      borderColor: colors.ember,
    },
    vibeIcon: {
      fontSize: 14,
    },
    vibeText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.graphite,
    },
    vibeTextActive: {
      color: colors.white,
    },

    stack: {
      flex: 1,
      marginHorizontal: 16,
      marginTop: 8,
      position: 'relative',
    },
    cardAbsolute: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
    },
    cardBehind: {
      transform: [{ scale: 0.96 }, { translateY: 12 }],
    },

    card: {
      height: CARD_H,
      borderRadius: 32,
      overflow: 'hidden',
      backgroundColor: colors.white,
    },

    dotRow: {
      position: 'absolute',
      top: 10,
      left: 0,
      right: 0,
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 5,
      paddingHorizontal: 16,
      zIndex: 10,
    },
    dot: {
      height: 3,
      flex: 1,
      maxWidth: 40,
      borderRadius: 2,
      backgroundColor: 'rgba(255,255,255,0.3)',
    },
    dotActive: {
      backgroundColor: 'rgba(255,255,255,1)',
    },

    photoNavLeft: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: '40%',
      zIndex: 5,
    },
    photoNavRight: {
      position: 'absolute',
      right: 0,
      top: 0,
      bottom: 0,
      width: '40%',
      zIndex: 5,
    },

    cardInfoContainer: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      padding: 16,
      zIndex: 10,
    },
    glassOverlay: {
      borderRadius: 24,
      padding: 20,
      overflow: 'hidden',
    },
    vibeBadge: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(0,0,0,0.6)',
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: radius.full,
      gap: 6,
      marginBottom: -12,
      marginLeft: 16,
      zIndex: 20,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.2)',
      elevation: 5,
    },
    vibeBadgeText: {
      color: '#FFF',
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 0.5,
    },

    nameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    cardName: {
      fontSize: 28,
      fontWeight: '800',
      color: '#FFF',
      letterSpacing: -0.5,
      maxWidth: '70%',
    },
    cardAge: {
      fontSize: 22,
      fontWeight: '600',
      color: '#CCC',
    },
    cardUsername: {
      fontSize: 14,
      fontWeight: '600',
      color: '#AAA',
      marginTop: 2,
    },
    verifiedBadge: {
      width: 20,
      height: 20,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    locationRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 8,
    },
    locationText: {
      fontSize: 14,
      color: '#DDD',
      flexShrink: 1,
    },
    cardBio: {
      fontSize: 15,
      color: '#EEE',
      lineHeight: 22,
      marginTop: 12,
    },

    indicator: {
      position: 'absolute',
      top: 32,
      padding: 8,
      borderRadius: radius.md,
      borderWidth: 3,
      zIndex: 100,
    },
    likeInd: {
      left: 20,
      borderColor: colors.success,
      transform: [{ rotate: '-15deg' }],
    },
    likeText: {
      color: colors.success,
      fontSize: 22,
      fontWeight: '800',
      letterSpacing: 1.5,
    },
    passInd: {
      right: 20,
      borderColor: colors.danger,
      transform: [{ rotate: '15deg' }],
    },
    passText: {
      color: colors.danger,
      fontSize: 22,
      fontWeight: '800',
      letterSpacing: 1.5,
    },
    superInd: {
      alignSelf: 'center',
      left: W / 2 - 60,
      top: 40,
      borderColor: colors.gold,
      transform: [{ rotate: '-5deg' }],
    },
    superText: {
      color: colors.gold,
      fontSize: 22,
      fontWeight: '800',
      letterSpacing: 1.5,
    },

    sparkParticle: {
      position: 'absolute',
      alignSelf: 'center',
      zIndex: 200,
      textShadowColor: 'rgba(249, 194, 46, 0.8)',
      textShadowOffset: { width: 0, height: 0 },
      textShadowRadius: 20,
    },

    actions: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 16,
      paddingTop: 16,
      paddingBottom: Platform.OS === 'ios' ? 120 : 100,
    },
    actionBtn: {
      borderRadius: radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.fog,
    },
    rewindBtn: {
      width: 48,
      height: 48,
    },
    passBtn: {
      width: 48,
      height: 48,
    },
    sparkBtn: {
      width: 76,
      height: 76,
      backgroundColor: colors.ember,
      shadowColor: colors.ember,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.8,
      shadowRadius: 15,
      elevation: 8,
    },
    messageBtn: {
      width: 48,
      height: 48,
    },

    emptyState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 32,
      gap: 12,
    },
    emptyTitle: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.ink,
      textAlign: 'center',
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
      paddingHorizontal: 32,
    },
    refreshText: {
      color: colors.white,
      fontWeight: '600',
      fontSize: 15,
    },
    tabToggleContainer: {
      paddingHorizontal: 16,
      marginBottom: 12,
      zIndex: 10,
    },
    tabToggle: {
      flexDirection: 'row',
      backgroundColor: 'rgba(0,0,0,0.05)',
      borderRadius: radius.full,
      padding: 4,
    },
    tabToggleBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 8,
      borderRadius: radius.full,
      gap: 6,
    },
    tabToggleBtnActive: {
      backgroundColor: colors.ember,
    },
    tabToggleText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.graphite,
    },
    tabToggleTextActive: {
      color: colors.white,
    },
    vibesList: {
      flex: 1,
    },
    vibeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 12,
      gap: 16,
      backgroundColor: colors.snow,
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(0,0,0,0.03)',
    },
    vibeRowAvWrap: {
      width: 56,
      height: 56,
      borderRadius: 28,
    },
    vibeRowAvRing: {
      width: '100%',
      height: '100%',
      borderRadius: 28,
      padding: 3,
      justifyContent: 'center',
      alignItems: 'center',
    },
    vibeRowAv: {
      width: '100%',
      height: '100%',
      borderRadius: 25,
    },
    vibeRowBadge: {
      position: 'absolute',
      bottom: -2,
      right: -2,
      backgroundColor: colors.white,
      borderRadius: 12,
      padding: 2,
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
      marginBottom: 4,
    },
    vibeRowVibeText: {
      fontSize: 13,
      fontWeight: '600',
    },
    vibeRowSparkBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: 'rgba(0,0,0,0.05)',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 2,
    },
  });