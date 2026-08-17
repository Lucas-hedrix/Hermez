// screens/ProfileScreen.jsx — own profile + photo management + recent posts
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Dimensions, Image, Alert, ActivityIndicator,
  Modal, RefreshControl, Animated, Platform, Share,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { radius } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import { supabase } from '../supabase/client';
import { pickAndUploadPhoto, deletePhoto } from '../supabase/storage';
import AnimatedSparkles from '../components/AnimatedSparkles';
import { PROFILE_VIBES, getVibeColor, getVibeIcon, isVibeExpired } from '../constants/vibes';
import { getInterestsByIds } from '../constants/interests';
import { getPlaceholderUrl } from '../utils/placeholders';

const { width: W } = Dimensions.get('window');
const PHOTO_SIZE = (W - 48 - 10) / 2;
const COVER_HEIGHT = 216;
const AVATAR_SIZE = 108;

export default function ProfileScreen({ navigation }) {
  const { colors, shadow, isDark } = useTheme();
  const s = getStyles(colors, shadow, isDark);
  const [user, setUser]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [uploading, setUploading] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [posts, setPosts]         = useState([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [likesCount, setLikesCount]     = useState(0);
  const [profileStats, setProfileStats] = useState({ followers: 0, following: 0, circles: 0, posts: 0 });
  const [refreshing, setRefreshing]     = useState(false);
  const [photoModal, setPhotoModal] = useState({ visible: false, index: -1, uri: null });
  const [editKey, setEditKey]       = useState(0); // bump to reload after edit
  const [savingVibe, setSavingVibe] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const avatarScale = useRef(new Animated.Value(1)).current;
  const scrollRef = useRef(null);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 520, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, friction: 9, tension: 50, useNativeDriver: true }),
    ]).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.04, duration: 2200, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 2200, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const loadProfile = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }

      let { data } = await supabase.from('users').select('*').eq('id', session.user.id).single();

      if (!data) {
        const fallback = {
          id: session.user.id,
          name: session.user.user_metadata?.name ?? session.user.email?.split('@')[0] ?? 'You',
          email: session.user.email ?? '',
          age: 18, gender: '', bio: '', city: '',
          photo_urls: [], tags: [],
          preference: 'everyone', min_age: 18, max_age: 35,
          profile_complete: false,
          show_me_on_cupid: true,
          hide_last_seen: false,
        };
        await supabase.from('users').upsert(fallback);
        data = fallback;
      }

      if (!Array.isArray(data.photo_urls)) data.photo_urls = [];
      if (!Array.isArray(data.tags))       data.tags = [];

      if (data.current_vibe && data.vibe_set_at) {
        if (isVibeExpired(data.vibe_set_at)) {
          data.current_vibe = null;
          data.vibe_set_at = null;
          // Clear it in the DB so others stop seeing it
          supabase.from('users').update({ current_vibe: null, vibe_set_at: null }).eq('id', session.user.id).then();
        }
      }

      setUser(data);
    } catch (e) {
      console.log('ProfileScreen error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadPostsAndMatches = useCallback(async () => {
    if (!user?.id) return;
    setPostsLoading(true);
    try {
      const { data: postsData } = await supabase.from('posts')
        .select('*')
        .eq('user_id', user.id)
        .is('circle_id', null)
        .order('created_at', { ascending: false })
        .limit(6);
      setPosts(postsData ?? []);

      const { count } = await supabase.from('swipes')
        .select('id', { count: 'exact', head: true })
        .eq('swiped_id', user.id)
        .in('direction', ['like', 'super']);
      setLikesCount(count ?? 0);

      const [followers, following, circles, postCount] = await Promise.all([
        supabase.from('friendships').select('id', { count: 'exact', head: true }).eq('recipient_id', user.id).eq('status', 'accepted'),
        supabase.from('friendships').select('id', { count: 'exact', head: true }).eq('requester_id', user.id).eq('status', 'accepted'),
        supabase.from('circle_members').select('circle_id', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('posts').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      ]);
      setProfileStats({
        followers: followers.count ?? 0,
        following: following.count ?? 0,
        circles: circles.count ?? 0,
        posts: postCount.count ?? 0,
      });
    } catch (e) {
      console.log('posts/likes error:', e);
    } finally {
      setPostsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { loadProfile(); }, [loadProfile]);
  useEffect(() => { loadPostsAndMatches(); }, [loadPostsAndMatches]);

  const handleRefresh = () => { setRefreshing(true); loadProfile(); };
  const handleShareProfile = async () => {
    try {
      await Share.share({
        message: `Meet ${user?.name ?? 'me'} on Cupid${user?.username ? ` (@${user.username})` : ''}.`,
      });
    } catch (e) {
      console.log('Profile share error:', e.message);
    }
  };
  const animateAvatar = () => {
    Animated.sequence([
      Animated.spring(avatarScale, { toValue: 0.94, useNativeDriver: true, speed: 30, bounciness: 5 }),
      Animated.spring(avatarScale, { toValue: 1, useNativeDriver: true, speed: 22, bounciness: 10 }),
    ]).start();
  };
  const handleSignOut = () => {
    Alert.alert(
      "Sign Out",
      "Are you sure you want to log out?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign Out",
          style: "destructive",
          onPress: async () => {
            try {
              await supabase.auth.signOut();
            } catch (e) {
              console.log('Signout error:', e.message);
            } finally {
              navigation?.navigate('Welcome');
            }
          }
        }
      ]
    );
  };

  const setVibe = async (vibeId) => {
    if (!user?.id || savingVibe) return;
    setSavingVibe(true);
    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('users')
        .update({ current_vibe: vibeId, vibe_set_at: vibeId ? now : null })
        .eq('id', user.id);
      if (error) throw error;
      setUser((u) => ({ ...u, current_vibe: vibeId, vibe_set_at: vibeId ? now : null }));
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setSavingVibe(false);
    }
  };

  // ── Photo management ──────────────────────────────────────────────────────
  const handleAddPhoto = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      setUploading(true);
      const url = await pickAndUploadPhoto(session.user.id);
      if (!url) return;
      
      const currentUrls = Array.isArray(user?.photo_urls) ? user.photo_urls.filter(Boolean) : [];
      const newUrls = [...currentUrls, url];
      
      const { error } = await supabase.from('users').update({ photo_urls: newUrls }).eq('id', session.user.id);
      if (error) throw error;
      
      setUser(u => ({ ...u, photo_urls: newUrls }));
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setUploading(false);
    }
  };

  const handleUpdateAvatar = async () => {
    if (!user?.id || avatarUploading) return;
    try {
      setAvatarUploading(true);
      const url = await pickAndUploadPhoto(user.id);
      if (!url) return;

      const currentUrls = Array.isArray(user.photo_urls) ? user.photo_urls.filter(Boolean) : [];
      const previousAvatar = currentUrls[0];
      const nextUrls = [url, ...currentUrls.slice(1)];
      const { error } = await supabase.from('users').update({ photo_urls: nextUrls }).eq('id', user.id);
      if (error) throw error;
      setUser((current) => ({ ...current, photo_urls: nextUrls }));
      if (previousAvatar && previousAvatar !== url) deletePhoto(previousAvatar);
    } catch (e) {
      Alert.alert('Could not update profile picture', e.message);
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleUpdateCover = async () => {
    if (!user?.id || coverUploading) return;
    try {
      setCoverUploading(true);
      const url = await pickAndUploadPhoto(user.id);
      if (!url) return;

      const previousCover = user.cover_photo_url;
      const { error } = await supabase.from('users').update({ cover_photo_url: url }).eq('id', user.id);
      if (error) throw error;
      setUser((current) => ({ ...current, cover_photo_url: url }));
      if (previousCover && previousCover !== url) deletePhoto(previousCover);
    } catch (e) {
      Alert.alert('Could not update cover photo', e.message);
    } finally {
      setCoverUploading(false);
    }
  };

  const handleDeletePhoto = async () => {
    const { index, uri } = photoModal;
    setPhotoModal({ visible: false, index: -1, uri: null });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      
      const currentUrls = Array.isArray(user?.photo_urls) ? user.photo_urls.filter(Boolean) : [];
      const newUrls = currentUrls.filter((_, i) => i !== index);
      
      const { error } = await supabase.from('users').update({ photo_urls: newUrls }).eq('id', session.user.id);
      if (error) throw error;
      
      setUser(u => ({ ...u, photo_urls: newUrls }));
      await deletePhoto(uri);
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  };

  const handleSetMainPhoto = async () => {
    const { index } = photoModal;
    setPhotoModal({ visible: false, index: -1, uri: null });
    if (index === 0) return;
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const currentUrls = Array.isArray(user?.photo_urls) ? user.photo_urls.filter(Boolean) : [];
      if (currentUrls.length <= index) return;
      
      const newUrls = [...currentUrls];
      const [picked] = newUrls.splice(index, 1);
      newUrls.unshift(picked);
      
      const { error } = await supabase.from('users').update({ photo_urls: newUrls }).eq('id', session.user.id);
      if (error) throw error;
      
      setUser(u => ({ ...u, photo_urls: newUrls }));
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  };

  // ── Loading / empty ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.snow, alignItems: 'center', justifyContent: 'center' }}>
        <AnimatedSparkles size={48} color={colors.ember} />
        <Text style={{ marginTop: 12, color: colors.stone, fontSize: 14 }}>Loading profile… please be patient
      </Text>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.snow, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.ash} style={{ marginBottom: 12 }} />
        <Text style={{ fontSize: 18, fontWeight: '700', color: colors.ink, marginBottom: 8 }}>Profile not found</Text>
        <Text style={{ fontSize: 14, color: colors.stone, textAlign: 'center', marginBottom: 24 }}>
          We couldn't load your profile. Try signing out and back in.
        </Text>
        <TouchableOpacity onPress={handleSignOut} style={{ backgroundColor: colors.ember, borderRadius: 999, paddingVertical: 12, paddingHorizontal: 28 }}>
          <Text style={{ color: '#fff', fontWeight: '600' }}>Sign out</Text>
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
  const currentVibe = user.current_vibe ?? '';
  const vibeColor = getVibeColor(currentVibe);

  return (
    <View style={s.root}>
      {/* Photo management modal */}
      <Modal
        visible={photoModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setPhotoModal({ visible: false, index: -1, uri: null })}
      >
        <TouchableOpacity
          style={s.modalOverlay}
          activeOpacity={1}
          onPress={() => setPhotoModal({ visible: false, index: -1, uri: null })}
        >
          <View style={s.modalSheet} onStartShouldSetResponder={() => true}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>Photo options</Text>
            {photoModal.index !== 0 && (
              <TouchableOpacity style={s.modalOption} onPress={handleSetMainPhoto}>
                <Ionicons name="star" size={20} color={colors.gold} />
                <Text style={s.modalOptionText}>Set as main photo</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={s.modalOption} onPress={handleDeletePhoto}>
              <Ionicons name="trash-outline" size={20} color={colors.danger} />
              <Text style={[s.modalOptionText, { color: colors.danger }]}>Remove photo</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.modalOption, { marginTop: 8, borderTopWidth: 1, borderColor: colors.fog }]}
              onPress={() => setPhotoModal({ visible: false, index: -1, uri: null })}
            >
              <Text style={[s.modalOptionText, { color: colors.stone, textAlign: 'center', flex: 1 }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <Animated.View style={[s.header, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        <View>
          <Text style={s.title}>Profile</Text>
          <Text style={s.subtitle}>Your space on Cupid</Text>
        </View>
        <TouchableOpacity style={s.settingsBtn} onPress={() => navigation?.navigate('Settings')}>
          <Ionicons name="settings-outline" size={19} color="#FFFFFF" />
        </TouchableOpacity>
      </Animated.View>

      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 110 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.ember} />}
      >
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
        {/* Cover and profile identity */}
        <View style={s.profileCard}>
          <View style={s.mainPhoto}>
            <Image source={{ uri: coverUrl }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
            <LinearGradient
              colors={['transparent', 'rgba(7,7,9,0.85)']}
              style={s.mainPhotoOverlay}
              pointerEvents="none"
            />
            <TouchableOpacity style={s.coverCameraButton} onPress={handleUpdateCover} disabled={coverUploading} activeOpacity={0.8}>
              {coverUploading ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="camera" size={19} color="#FFFFFF" />}
            </TouchableOpacity>
          </View>

          <View style={s.cardInfo}>
            <Animated.View style={[s.avatarWrap, { transform: [{ scale: avatarScale }] }]}>
              <TouchableOpacity activeOpacity={0.9} onPress={animateAvatar} onLongPress={() => setPhotoModal({ visible: true, index: 0, uri: photoUrls[0] })}>
                <Image source={{ uri: photoUrls[0] || getPlaceholderUrl(user.name || user.username) }} style={s.avatar} />
              </TouchableOpacity>
              <TouchableOpacity style={s.avatarCameraButton} onPress={handleUpdateAvatar} disabled={avatarUploading} activeOpacity={0.8}>
                {avatarUploading ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="camera" size={15} color="#FFFFFF" />}
              </TouchableOpacity>
            </Animated.View>
            <View style={s.nameRow}>
              <Text style={s.name}>{user.username ? `@${user.username}` : user.name}</Text>
            </View>
            {user.username ? <Text style={s.fullName}>{user.name}</Text> : null}
            <Text style={s.profileMeta}>{[user.occupation || user.job_title, region || user.city].filter(Boolean).join('  •  ') || 'Tell people where you’re from'}</Text>
            {currentVibe ? (
              <Animated.View style={[s.activeVibePill, { borderColor: vibeColor + '66', transform: [{ scale: pulseAnim }] }]}>
                <Ionicons name={getVibeIcon(currentVibe)} size={14} color={vibeColor} />
                <Text style={[s.activeVibeText, { color: vibeColor }]}>{currentVibe} vibe</Text>
              </Animated.View>
            ) : null}
            <View style={s.aboutCard}>
              <Text style={s.sectionLabel}>About</Text>
              <Text style={s.bio}>{user.bio || 'Tell people about yourself. Add the little things that make you, you.'}</Text>
              {sign ? <Text style={s.aboutCaption}>{sign}</Text> : null}
            </View>

            {/* Profile stats */}
            <View style={[s.statsRow, { marginHorizontal: 0, marginTop: 4, marginBottom: 16 }]}>
              {[
                { label: 'Followers', value: profileStats.followers.toString() },
                { label: 'Following', value: profileStats.following.toString() },
                { label: 'Circles', value: profileStats.circles.toString() },
                { label: 'Posts', value: profileStats.posts.toString() },
              ].map((stat, i) => (
                <Animated.View
                  key={stat.label}
                  style={[
                    s.statCard,
                    {
                      opacity: fadeAnim,
                      transform: [{
                        translateY: slideAnim.interpolate({
                          inputRange: [0, 24],
                          outputRange: [0, 12 + i * 6],
                        }),
                      }],
                    },
                  ]}
                >
                  <Text style={s.statValue}>{stat.value}</Text>
                  <Text style={s.statLabel}>{stat.label}</Text>
                </Animated.View>
              ))}
            </View>

            {/* Current vibe */}
            <BlurView intensity={50} tint={isDark ? 'dark' : 'light'} style={[s.vibeSection, { marginHorizontal: 0 }]}>
              <Text style={s.sectionLabel}>Your current vibe</Text>
              <Text style={s.vibeHint}>Others see this on Discover. Tap to update instantly.</Text>
              <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator={false} contentContainerStyle={s.vibeRow}>
                {PROFILE_VIBES.map((v) => {
                  const active = currentVibe === v.id;
                  const col = v.color;
                  return (
                    <TouchableOpacity
                      key={v.id}
                      style={[
                        s.vibeChip,
                        active && { backgroundColor: col + '28', borderColor: col, shadowColor: col },
                      ]}
                      onPress={() => setVibe(v.id)}
                      disabled={savingVibe}
                    >
                      <Ionicons name={v.icon} size={18} color={active ? col : colors.ash} />
                      <Text style={[s.vibeChipText, active && { color: col }]}>{v.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </BlurView>

            <View style={s.actionRow}>
              <TouchableOpacity style={s.primaryAction} onPress={() => navigation?.navigate('EditProfile')} activeOpacity={0.85}>
                <Ionicons name="create-outline" size={17} color="#FFFFFF" /><Text style={s.primaryActionText}>Edit profile</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.secondaryAction} onPress={handleShareProfile} activeOpacity={0.8}>
                <Ionicons name="share-social-outline" size={17} color={colors.ink} /><Text style={s.secondaryActionText}>Share</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.iconAction} onPress={() => scrollRef.current?.scrollToEnd({ animated: true })} activeOpacity={0.8}>
                <Ionicons name="settings-outline" size={19} color={colors.ink} />
              </TouchableOpacity>
            </View>

            {/* Hobbies */}
            {hobbies.length > 0 && (
              <>
                <Text style={s.sectionLabel}>Interests</Text>
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
                  <TouchableOpacity style={s.tagAdd}>
                    <Text style={s.tagAddText}>+ Add</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

          </View>
        </View>



        <TouchableOpacity style={s.logoutBtn} onPress={handleSignOut}>
          <Ionicons name="log-out-outline" size={18} color={colors.danger} style={{ marginRight: 8 }} />
          <Text style={s.logoutText}>Sign out</Text>
        </TouchableOpacity>

        <View style={{ height: Platform.OS === 'ios' ? 120 : 100 }} />
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const getStyles = (colors, shadow, isDark) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.snow },
  heroGlow: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 220,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 42, paddingBottom: 14, zIndex: 1,
    backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.fog,
  },
  title: { fontSize: 28, fontWeight: '800', color: colors.ink, letterSpacing: -0.8 },
  subtitle: { fontSize: 14, color: colors.stone, marginTop: 2 },
  settingsBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.ember,
    borderWidth: 1, borderColor: colors.ember, alignItems: 'center', justifyContent: 'center',
  },
  activeVibePill: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6,
    paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.full,
    borderWidth: 1, marginBottom: 12, backgroundColor: colors.emberLight,
  },
  activeVibeText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.3 },
  vibeSection: {
    marginHorizontal: 16, marginBottom: 24, borderRadius: 24,
    padding: 16, overflow: 'hidden', borderWidth: 1, borderColor: colors.fog, backgroundColor: colors.white,
  },
  vibeHint: { fontSize: 12, color: colors.stone, marginBottom: 12, lineHeight: 18 },
  vibeRow: { gap: 10, paddingRight: 8 },
  vibeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 10, paddingHorizontal: 14, borderRadius: radius.full,
    borderWidth: 1, borderColor: colors.fog, backgroundColor: colors.snow,
  },
  vibeChipText: { fontSize: 13, fontWeight: '700', color: colors.ash },

  profileCard: {
    width: '100%', alignSelf: 'stretch', marginHorizontal: 0, borderRadius: 0, overflow: 'visible',
    backgroundColor: colors.white, marginBottom: 24,
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.fog,
    shadowColor: '#000', shadowOpacity: 0.24, shadowRadius: 14, shadowOffset: { width: 0, height: 7 }, elevation: 6,
  },
  mainPhoto: {
    width: '100%', height: COVER_HEIGHT, alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden',
  },
  mainPhotoOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 100,
  },
  coverCameraButton: {
    position: 'absolute', right: 18, bottom: 16, width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.45)',
  },
  editPhotosBtn: {
    position: 'absolute', bottom: 14, right: 14,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: radius.full,
    paddingVertical: 7, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)',
  },
  editPhotosText: { color: colors.white, fontSize: 12, fontWeight: '600' },

  cardInfo: { padding: 20, paddingTop: 0 },
  avatarWrap: { width: AVATAR_SIZE, height: AVATAR_SIZE, marginTop: -Math.round(AVATAR_SIZE * 0.35), marginBottom: 14, shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 8 },
  avatar: { width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2, borderWidth: 4, borderColor: colors.snow, backgroundColor: colors.fog },
  avatarCameraButton: {
    position: 'absolute', right: -2, bottom: 0, width: 34, height: 34, borderRadius: 17,
    backgroundColor: colors.ember, borderWidth: 3, borderColor: colors.white, alignItems: 'center', justifyContent: 'center',
  },
  nameRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  name:     { fontSize: 34, fontWeight: '800', color: colors.ink, letterSpacing: -1.2, lineHeight: 40 },
  fullName: { fontSize: 16, fontWeight: '600', color: colors.graphite, marginBottom: 5 },
  profileMeta: { fontSize: 16, color: colors.stone, lineHeight: 23, marginBottom: 14 },
  verifiedBadge: {
    position: 'absolute', right: 0, bottom: 3, width: 27, height: 27, borderRadius: 14, backgroundColor: colors.ember,
    borderWidth: 3, borderColor: colors.white, alignItems: 'center', justifyContent: 'center',
  },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 10 },
  location: { fontSize: 13, color: colors.stone },
  aboutCard: { backgroundColor: colors.snow, borderRadius: 20, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: colors.fog },
  bio:      { fontSize: 17, color: colors.graphite, lineHeight: 26 },
  aboutCaption: { fontSize: 14, color: colors.stone, marginTop: 8 },

  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: colors.stone,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10,
  },

  actionRow: { flexDirection: 'row', gap: 8, marginBottom: 24 },
  primaryAction: { flex: 1, minHeight: 46, borderRadius: 23, backgroundColor: colors.ember, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 },
  primaryActionText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  secondaryAction: { minHeight: 46, borderRadius: 23, paddingHorizontal: 15, backgroundColor: colors.snow, borderWidth: 1, borderColor: colors.fog, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 },
  secondaryActionText: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  iconAction: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.snow, borderWidth: 1, borderColor: colors.fog, alignItems: 'center', justifyContent: 'center' },
  inlineSectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionHint: { color: '#71717A', fontSize: 12 },
  photoGrid: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginBottom: 24 },
  photoThumb: {
    width: PHOTO_SIZE, height: PHOTO_SIZE * 0.92,
    borderRadius: 18, overflow: 'hidden', position: 'relative', backgroundColor: colors.fog,
    alignItems: 'center', justifyContent: 'center',
  },
  photoThumbTall: { height: PHOTO_SIZE * 1.22 },
  photoEditOverlay: {
    position: 'absolute', bottom: -6, right: -6,
    backgroundColor: colors.ember, borderRadius: 12, width: 24, height: 24,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: colors.snow,
  },
  mainBadge: {
    position: 'absolute', bottom: 8, left: 8, backgroundColor: colors.ember,
    borderRadius: radius.full, paddingHorizontal: 6, paddingVertical: 2,
  },
  mainBadgeText: { color: colors.white, fontSize: 9, fontWeight: '700' },
  addPhoto: {
    width: PHOTO_SIZE, height: PHOTO_SIZE * 0.92, borderRadius: 18,
    borderWidth: 1.5, borderColor: colors.ember, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.emberLight, gap: 6,
  },
  addPhotoText: { color: colors.ember, fontSize: 13, fontWeight: '700' },

  tagRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
  tag:       { paddingVertical: 8, paddingHorizontal: 13, borderRadius: radius.full, backgroundColor: colors.emberLight, borderWidth: 1, borderColor: colors.ember },
  tagText:   { fontSize: 13, color: colors.ember, fontWeight: '600' },
  tagAdd:    { paddingVertical: 6, paddingHorizontal: 14, borderRadius: radius.full, borderWidth: 1, borderColor: colors.fog, borderStyle: 'dashed' },
  tagAddText:{ fontSize: 13, color: colors.ember },

  editBtn: { borderRadius: radius.full, overflow: 'hidden' },
  editBtnGradient: { paddingVertical: 13, alignItems: 'center' },
  editBtnText:{ color: '#fff', fontWeight: '700', fontSize: 15 },

  statsRow: { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginBottom: 24 },
  statCard: {
    flex: 1, backgroundColor: colors.snow, borderRadius: 18,
    paddingVertical: 14, paddingHorizontal: 6, alignItems: 'center', gap: 5,
    borderWidth: 1, borderColor: colors.fog,
  },
  statIconWrap: {
    width: 36, height: 36, borderRadius: 12, backgroundColor: colors.emberLight,
    alignItems: 'center', justifyContent: 'center',
  },
  statValue: { fontSize: 24, fontWeight: '800', color: colors.ink },
  statLabel: { fontSize: 11, color: colors.stone, textAlign: 'center' },

  section:       { marginHorizontal: 16, marginBottom: 24 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle:  { fontSize: 18, fontWeight: '700', color: colors.ink },
  seeAll:        { fontSize: 13, color: colors.ember, fontWeight: '700' },

  emptyPosts:      { backgroundColor: colors.white, borderRadius: 20, padding: 28, alignItems: 'center', borderWidth: 1, borderColor: colors.fog },
  emptyPostsText:  { fontSize: 15, color: colors.stone, marginBottom: 12 },
  createPostBtn:   { backgroundColor: colors.ember, borderRadius: radius.full, paddingVertical: 10, paddingHorizontal: 22 },
  createPostBtnText:{ color: colors.white, fontWeight: '600', fontSize: 14 },

  postGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  postCard: {
    width: (W - 32 - 10) / 2, borderRadius: radius.lg, overflow: 'hidden',
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.fog, minHeight: 120,
  },
  postImage:        { width: '100%', height: 140 },
  postCaption:      { padding: 10 },
  postCaptionOnly:  { minHeight: 100, justifyContent: 'center' },
  postCaptionText:  { fontSize: 13, color: colors.graphite, lineHeight: 19 },
  postDate:         { fontSize: 10, color: colors.stone, paddingHorizontal: 10, paddingBottom: 8 },

  logoutBtn:  { marginHorizontal: 16, borderRadius: 20, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', backgroundColor: colors.white, borderWidth: 1, borderColor: colors.danger + '59' },
  logoutText: { color: colors.danger, fontSize: 15, fontWeight: '500' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet:   { backgroundColor: colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 40, paddingHorizontal: 16, paddingTop: 12 },
  modalHandle:  { width: 40, height: 4, backgroundColor: colors.fog, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  modalTitle:   { fontSize: 16, fontWeight: '700', color: colors.ink, marginBottom: 16, textAlign: 'center' },
  modalOption:  { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 },
  modalOptionText: { fontSize: 16, color: colors.ink, fontWeight: '500' },
});
