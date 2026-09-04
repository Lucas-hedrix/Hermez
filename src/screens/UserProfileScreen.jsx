import { Image } from 'expo-image';
// screens/UserProfileScreen.jsx — read-only view of another user's profile
import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Dimensions, ActivityIndicator, Alert} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radius } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import { supabase } from '../supabase/client';
import AnimatedSparkles from '../components/AnimatedSparkles';
import SparkSheet from '../components/SparkSheet';
import { SkeletonFeed, SkeletonProfileCard, SkeletonPost, SkeletonScreen } from '../components/Skeleton';
import {
  getSparkBetween,
  getFriendshipBetween,
  resolveFriendshipForChat,
} from '../services/sparks';
import { SPARK_ICON } from '../constants/sparks';
import { getVibeColor, getVibeIcon, isVibeExpired } from '../constants/vibes';
import { getInterestsByIds } from '../constants/interests';
import { getPlaceholderUrl } from '../utils/placeholders';
import GlassButton from '../components/GlassButton';

const { width: W } = Dimensions.get('window');
const PHOTO_SIZE = (W - 48 - 8) / 3;
const COVER_HEIGHT = 216;
const AVATAR_SIZE = 104;

// Literal white for text/icons on colored CTAs (theme `colors.white` is a card surface in dark mode).
const ON_ACCENT = '#FFFFFF';

export default function UserProfileScreen({ navigation, route }) {
  const { colors, shadow, isDark } = useTheme();
  const s = getStyles(colors, shadow, isDark);
  const { userId } = route.params;

  const [user, setUser]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [posts, setPosts]         = useState([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [matchesCount, setMatchesCount] = useState(0);
  const [myUid, setMyUid] = useState(null);
  const [sparkState, setSparkState] = useState(null);
  const [friendship, setFriendship] = useState(null);
  const [showSparkSheet, setShowSparkSheet] = useState(false);
  const [openingChat, setOpeningChat] = useState(false);

  const loadProfile = useCallback(async () => {
    try {
      const { data } = await supabase.from('users').select('*').eq('id', userId).single();
      if (data) {
        if (!Array.isArray(data.photo_urls)) data.photo_urls = [];
        if (!Array.isArray(data.tags))       data.tags = [];
        setUser(data);
      }
    } catch (e) {
      console.log('UserProfileScreen error:', e);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const loadPostsAndMatches = useCallback(async () => {
    setPostsLoading(true);
    try {
      const { data: postsData } = await supabase.from('posts')
        .select('*')
        .eq('user_id', userId)
        .is('circle_id', null)
        .order('created_at', { ascending: false })
        .limit(6);
      setPosts(postsData ?? []);

      const { count } = await supabase.from('friendships').select('id', { count: 'exact', head: true })
        .eq('status', 'accepted').or(`requester_id.eq.${userId},recipient_id.eq.${userId}`);
      setMatchesCount(count ?? 0);
    } catch (e) {
      console.log('posts/matches error:', e);
    } finally {
      setPostsLoading(false);
    }
  }, [userId]);

  const loadConnectionState = useCallback(async () => {
    if (!myUid || !userId || myUid === userId) return;
    try {
      const [spark, friend] = await Promise.all([
        getSparkBetween(myUid, userId),
        getFriendshipBetween(myUid, userId),
      ]);
      setSparkState(spark);
      setFriendship(friend);

      // Legacy: accepted spark but no friendship — create it so they show as friends.
      if (spark?.status === 'accepted' && friend?.status !== 'accepted' && friend?.status !== 'blocked') {
        const resolved = await resolveFriendshipForChat(myUid, userId);
        if (resolved) setFriendship(resolved);
      }
    } catch (e) {
      console.log('loadConnectionState:', e.message);
    }
  }, [myUid, userId]);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) setMyUid(session.user.id);
    })();
  }, []);

  useEffect(() => { loadProfile(); }, [loadProfile]);
  useEffect(() => { loadPostsAndMatches(); }, [loadPostsAndMatches]);
  useEffect(() => { loadConnectionState(); }, [loadConnectionState, showSparkSheet]);

  const isConnected =
    friendship?.status === 'accepted' ||
    sparkState?.status === 'accepted';

  const openMessage = async () => {
    if (!myUid || !user || openingChat) return;
    setOpeningChat(true);
    try {
      const f = await resolveFriendshipForChat(myUid, userId);
      if (!f) {
        Alert.alert(
          'Not connected yet',
          'Accept a spark or friend request first to message each other.'
        );
        return;
      }
      setFriendship(f);
      navigation?.navigate('FriendChat', {
        friendship: f,
        otherUser: user,
        myUid,
      });
    } catch (e) {
      Alert.alert('Could not open chat', e.message);
    } finally {
      setOpeningChat(false);
    }
  };

  if (loading) {
    return (
      <SkeletonScreen><SkeletonProfileCard style={{ paddingTop: 60 }} /></SkeletonScreen>
    );
  }

  if (!user) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.snow, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.ash} style={{ marginBottom: 12 }} />
        <Text style={{ fontSize: 18, fontWeight: '700', color: colors.ink, marginBottom: 8 }}>Profile not found</Text>
        <TouchableOpacity onPress={() => navigation?.goBack()} style={{ marginTop: 16, backgroundColor: colors.ember, borderRadius: 999, paddingVertical: 12, paddingHorizontal: 28 }}>
          <Text style={{ color: ON_ACCENT, fontWeight: '600' }}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const photoUrls = user.photo_urls      ?? [];
  const coverUrl  = user.cover_photo_url ?? photoUrls[0] ?? getPlaceholderUrl(user.name || user.username);
  const tags      = user.tags            ?? [];
  const hobbies   = user.hobbies         ?? [];
  const sign      = user.astrology_sign  ?? '';
  const region    = user.region          ?? '';
  let currentVibe = user.current_vibe ?? '';
  if (currentVibe && user.vibe_set_at && isVibeExpired(user.vibe_set_at)) {
    currentVibe = '';
  }
  const isSelf = myUid === userId;

  const renderConnectionCta = () => {
    if (isSelf || !myUid) return null;

    // Fully connected (friendship and/or accepted spark) → Message
    if (isConnected) {
      return (
        <View style={s.ctaBlock}>
          <View style={s.friendsBadge}>
            <Ionicons name="people" size={14} color={colors.ember} />
            <Text style={s.friendsBadgeText}>
              {friendship?.status === 'accepted' && sparkState?.status === 'accepted'
                ? 'Friends · Connected via Spark'
                : sparkState?.status === 'accepted'
                  ? 'Connected via Spark'
                  : 'Friends'}
            </Text>
          </View>
          <TouchableOpacity
            style={s.solidCta}
            onPress={openMessage}
            disabled={openingChat}
            activeOpacity={0.85}
          >
            {openingChat ? (
              <ActivityIndicator color={ON_ACCENT} />
            ) : (
              <>
                <Ionicons name="chatbubbles" size={20} color={ON_ACCENT} />
                <Text style={s.solidCtaText}>Message</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      );
    }

    if (sparkState?.status === 'pending' && sparkState.sender_id === myUid) {
      return (
        <View style={s.sparkStatusPill}>
          <Ionicons name="time-outline" size={16} color={colors.stone} />
          <Text style={s.sparkStatusText}>Spark sent — waiting for reply</Text>
        </View>
      );
    }

    if (sparkState?.status === 'pending' && sparkState.receiver_id === myUid) {
      return (
        <TouchableOpacity
          style={s.solidCta}
          onPress={() => {
            navigation?.goBack();
            setTimeout(() => navigation?.openSparksInbox?.(), 150);
          }}
          activeOpacity={0.85}
        >
          <Ionicons name={SPARK_ICON} size={20} color={ON_ACCENT} />
          <Text style={s.solidCtaText}>Reply to their spark</Text>
        </TouchableOpacity>
      );
    }

    if (friendship?.status === 'pending' && friendship.requester_id === myUid) {
      return (
        <View style={s.sparkStatusPill}>
          <Ionicons name="time-outline" size={16} color={colors.stone} />
          <Text style={s.sparkStatusText}>Friend request sent</Text>
        </View>
      );
    }

    if (friendship?.status === 'pending' && friendship.recipient_id === myUid) {
      return (
        <TouchableOpacity
          style={s.solidCta}
          onPress={async () => {
            try {
              const { data, error } = await supabase
                .from('friendships')
                .update({ status: 'accepted' })
                .eq('id', friendship.id)
                .select()
                .maybeSingle();
              if (error) throw error;
              setFriendship(data ?? { ...friendship, status: 'accepted' });
            } catch (e) {
              Alert.alert('Error', e.message);
            }
          }}
          activeOpacity={0.85}
        >
          <Ionicons name="checkmark" size={20} color={ON_ACCENT} />
          <Text style={s.solidCtaText}>Accept friend request</Text>
        </TouchableOpacity>
      );
    }

    // Not connected — send spark (primary casual path)
    return (
      <GlassButton
        title="Send a Spark"
        icon={<Ionicons name={SPARK_ICON} size={20} color={colors.ember} />}
        onPress={() => setShowSparkSheet(true)}
        style={s.sparkCta}
        tint="dark"
        color={colors.ember}
        glassColor={colors.ember}
      />
    );
  };

  return (
    <View style={s.root}>
      <SparkSheet
        visible={showSparkSheet}
        onClose={() => setShowSparkSheet(false)}
        receiverId={userId}
        receiverName={user.name}
        onSent={() => {
          loadConnectionState();
        }}
      />
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation?.goBack()}>
          <Ionicons name="chevron-back" size={22} color={colors.graphite} />
        </TouchableOpacity>
        <Text style={s.title} numberOfLines={1}>{user.name}</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Profile card — full profile for everyone; friends get Message CTA */}
        <View style={[s.profileCard, shadow.card]}>
          <View style={[s.mainPhoto, { backgroundColor: '#FFF0ED' }]}>
            <Image source={{ uri: coverUrl }} style={[StyleSheet.absoluteFillObject, {width: "100%", height: "100%"}] } contentFit="cover" />
            <View style={s.mainPhotoOverlay} pointerEvents="none" />
          </View>

          <View style={s.cardInfo}>
            <View style={s.avatarWrap}>
              <Image source={{ uri: photoUrls[0] || getPlaceholderUrl(user.name || user.username) }} style={s.avatar} />
              <View style={s.avatarVerifiedBadge}>
                <Ionicons name="checkmark" size={13} color={ON_ACCENT} />
              </View>
            </View>
            <View style={s.nameRow}>
              <Text style={s.name}>{user.name}</Text>
              {!!user.username && <Text style={s.username}>@{user.username}</Text>}
            </View>
            {region ? (
              <View style={s.locationRow}>
                <Ionicons name="globe-outline" size={13} color={colors.stone} />
                <Text style={s.location}>Based in {region}</Text>
              </View>
            ) : null}
            {sign ? (
              <View style={s.locationRow}>
                <Ionicons name="star-outline" size={13} color={colors.stone} />
                <Text style={s.location}>{sign}</Text>
              </View>
            ) : null}
            {currentVibe ? (
              <View style={[s.vibePill, { borderColor: getVibeColor(currentVibe) + '55' }]}>
                <Ionicons name={getVibeIcon(currentVibe)} size={13} color={getVibeColor(currentVibe)} />
                <Text style={[s.vibePillText, { color: getVibeColor(currentVibe) }]}>{currentVibe}</Text>
              </View>
            ) : null}
            <Text style={s.bio}>{user.bio || 'No bio yet.'}</Text>

            {renderConnectionCta()}

            {/* Photo grid */}
            {photoUrls.length > 0 && (
              <>
                <Text style={s.sectionLabel}>Photos</Text>
                <View style={s.photoGrid}>
                  {photoUrls.map((uri, i) => (
                    <View key={i} style={[s.photoThumb, { backgroundColor: '#FFF0ED' }]}>
                      <Image source={{ uri }} style={[StyleSheet.absoluteFillObject, {width: "100%", height: "100%"}] } contentFit="cover" />
                      {i === 0 && <View style={s.mainBadge}><Text style={s.mainBadgeText}>Main</Text></View>}
                    </View>
                  ))}
                </View>
              </>
            )}

            {/* Hobbies */}
            {hobbies.length > 0 && (
              <>
                <Text style={s.sectionLabel}>Hobbies</Text>
                <View style={s.tagRow}>
                  {getInterestsByIds(hobbies).map(item => (
                    <View key={item.id} style={[s.tag, { borderColor: item.color + '55', backgroundColor: item.color + '14' }]}>
                      <Ionicons name={item.icon} size={13} color={item.color} style={{ marginRight: 4 }} />
                      <Text style={[s.tagText, { color: item.color }]}>{item.label}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}

            {/* Tags / interests */}
            {tags.length > 0 && (
              <>
                <Text style={s.sectionLabel}>Interests</Text>
                <View style={s.tagRow}>
                  {tags.map(t => (
                    <View key={t} style={s.tag}>
                      <Ionicons name="sparkles" size={12} color={colors.ember} style={{ marginRight: 4 }} />
                      <Text style={s.tagText}>{t}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}
          </View>
        </View>

        {/* Stats */}
        <View style={s.statsRow}>
          {[
            { label: 'Profile views', value: '---', icon: 'eye-outline' },
            { label: 'Likes received', value: '---',  icon: 'heart-outline' },
            { label: 'Friends',        value: matchesCount.toString(), icon: 'people-outline' },
          ].map(stat => (
            <View key={stat.label} style={s.statCard}>
              <Ionicons name={stat.icon} size={20} color={colors.ember} />
              <Text style={s.statValue}>{stat.value}</Text>
              <Text style={s.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* Recent Posts */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>Recent Posts</Text>
          </View>

          {postsLoading ? (
            <SkeletonFeed itemCount={3} ItemComponent={SkeletonPost} style={{ paddingHorizontal: 16 }} />
          ) : posts.length === 0 ? (
            <View style={s.emptyPosts}>
              <Ionicons name="images-outline" size={32} color={colors.ash} style={{ marginBottom: 8 }} />
              <Text style={s.emptyPostsText}>No posts yet</Text>
            </View>
          ) : (
            <View style={s.postGrid}>
              {posts.map(post => (
                <View key={post.id} style={s.postCard}>
                  {post.image_url
                    ? <Image source={{ uri: post.image_url }} style={s.postImage} contentFit="cover" />
                    : null}
                  {post.caption ? (
                    <View style={[s.postCaption, !post.image_url && s.postCaptionOnly]}>
                      <Text style={s.postCaptionText} numberOfLines={3}>{post.caption}</Text>
                    </View>
                  ) : null}
                  <Text style={s.postDate}>
                    {new Date(post.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const getStyles = (colors, shadow, isDark) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.snow },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 22, paddingTop: 56, paddingBottom: 16,
  },
  title: { fontSize: 24, fontWeight: '800', color: colors.ink, letterSpacing: -0.5, flex: 1, textAlign: 'center' },
  backBtn: {
    width: 38, height: 38, borderRadius: 12, backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.fog, alignItems: 'center', justifyContent: 'center',
  },

  profileCard: {
    marginHorizontal: 16, borderRadius: radius.xl, overflow: 'hidden',
    backgroundColor: colors.white, marginBottom: 16,
  },
  mainPhoto: {
    height: COVER_HEIGHT, alignItems: 'center', justifyContent: 'center', position: 'relative',
  },
  mainPhotoOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 80,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },

  cardInfo: { padding: 18, paddingTop: 0 },
  avatarWrap: { width: AVATAR_SIZE, height: AVATAR_SIZE, marginTop: -Math.round(AVATAR_SIZE * 0.35), marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  avatar: { width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2, borderWidth: 4, borderColor: colors.white, backgroundColor: colors.fog },
  avatarVerifiedBadge: { position: 'absolute', right: 0, bottom: 2, width: 27, height: 27, borderRadius: 14, backgroundColor: '#3B82F6', borderWidth: 3, borderColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  nameRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' },
  name:     { fontSize: 26, fontWeight: '700', color: colors.ink, letterSpacing: -0.5 },
  username: { fontSize: 16, fontWeight: '500', color: colors.ash, marginLeft: 2 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 10 },
  location: { fontSize: 13, color: colors.stone },
  bio:      { fontSize: 14, color: colors.graphite, lineHeight: 21, marginBottom: 18 },

  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: colors.stone,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10,
  },

  photoGrid: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 18 },
  photoThumb: {
    width: PHOTO_SIZE, height: PHOTO_SIZE * 1.3,
    borderRadius: radius.md, overflow: 'hidden', position: 'relative',
    alignItems: 'center', justifyContent: 'center',
  },
  mainBadge: {
    position: 'absolute', bottom: 6, left: 6, backgroundColor: colors.ember,
    borderRadius: radius.full, paddingHorizontal: 6, paddingVertical: 2,
  },
  mainBadgeText: { color: ON_ACCENT, fontSize: 9, fontWeight: '700' },

  tagRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
  tag:       { paddingVertical: 6, paddingHorizontal: 14, borderRadius: radius.full, backgroundColor: colors.emberLight },
  tagText:   { fontSize: 13, color: colors.ember, fontWeight: '500' },

  vibePill: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6,
    paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.full,
    borderWidth: 1, marginBottom: 12, backgroundColor: colors.emberLight,
  },
  vibePillText: { fontSize: 12, fontWeight: '800' },
  ctaBlock: { marginBottom: 16, gap: 10 },
  friendsBadge: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6,
    paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.full,
    backgroundColor: colors.emberLight, borderWidth: 1, borderColor: colors.ember + '40',
  },
  friendsBadgeText: { fontSize: 12, fontWeight: '700', color: colors.ember },
  solidCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: radius.full,
    backgroundColor: colors.ember,
    // Visible in both light and dark mode (not glass-on-dark)
    borderWidth: 1,
    borderColor: colors.ember,
  },
  solidCtaText: { color: ON_ACCENT, fontSize: 16, fontWeight: '800' },
  sparkCta: { borderRadius: radius.full, overflow: 'hidden', marginBottom: 16 },
  sparkStatusPill: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, paddingHorizontal: 16, borderRadius: radius.full,
    borderWidth: 1, borderColor: colors.fog, marginBottom: 16, backgroundColor: isDark ? colors.fog : colors.snow,
  },
  sparkStatusText: { fontSize: 14, fontWeight: '600', color: colors.stone },

  statsRow: { flexDirection: 'row', gap: 10, marginHorizontal: 16, marginBottom: 16 },
  statCard: {
    flex: 1, backgroundColor: colors.white, borderRadius: radius.lg,
    padding: 14, alignItems: 'center', gap: 4,
    borderWidth: 1, borderColor: colors.fog,
  },
  statValue: { fontSize: 22, fontWeight: '800', color: colors.ink },
  statLabel: { fontSize: 10, color: colors.ash, textAlign: 'center' },

  section:       { marginHorizontal: 16, marginBottom: 16 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle:  { fontSize: 18, fontWeight: '700', color: colors.ink },

  emptyPosts:      { backgroundColor: colors.white, borderRadius: radius.lg, padding: 28, alignItems: 'center', borderWidth: 1, borderColor: colors.fog },
  emptyPostsText:  { fontSize: 15, color: colors.stone, marginBottom: 12 },

  postGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  postCard: {
    width: (W - 32 - 10) / 2, borderRadius: radius.lg, overflow: 'hidden',
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.fog, minHeight: 120,
  },
  postImage:        { width: '100%', maxHeight: W * 0.4, minHeight: 100, resizeMode: 'contain' },
  postCaption:      { padding: 10 },
  postCaptionOnly:  { minHeight: 100, justifyContent: 'center' },
  postCaptionText:  { fontSize: 13, color: colors.graphite, lineHeight: 19 },
  postDate:         { fontSize: 10, color: colors.ash, paddingHorizontal: 10, paddingBottom: 8 },
});
