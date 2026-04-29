// screens/ProfileScreen.jsx — own profile + photo management + recent posts
import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Switch, Dimensions, Image, Alert, ActivityIndicator,
  Modal, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radius } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import { supabase } from '../supabase/client';
import { pickAndUploadPhoto, deletePhoto } from '../supabase/storage';

const { width: W } = Dimensions.get('window');
const PHOTO_SIZE = (W - 48 - 8) / 3;

export default function ProfileScreen({ navigation }) {
  const { colors, shadow, isDark, toggleTheme } = useTheme();
  const s = getStyles(colors, shadow, isDark);
  const [discoverable, setDiscoverable]   = useState(true);
  const [notifications, setNotifications] = useState(true);
  const [hideLastSeen,  setHideLastSeen]  = useState(false);
  const [user, setUser]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [uploading, setUploading] = useState(false);
  const [posts, setPosts]         = useState([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [matchesCount, setMatchesCount] = useState(0);
  const [refreshing, setRefreshing]     = useState(false);
  const [photoModal, setPhotoModal] = useState({ visible: false, index: -1, uri: null });
  const [editKey, setEditKey]       = useState(0); // bump to reload after edit

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

      setDiscoverable(data.show_me_on_cupid ?? true);
      setHideLastSeen(data.hide_last_seen ?? false);
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
        .select('*').eq('user_id', user.id)
        .order('created_at', { ascending: false }).limit(6);
      setPosts(postsData ?? []);

      const { count } = await supabase.from('friendships').select('id', { count: 'exact', head: true })
        .eq('status', 'accepted').or(`requester_id.eq.${user.id},recipient_id.eq.${user.id}`);
      setMatchesCount(count ?? 0);
    } catch (e) {
      console.log('posts/matches error:', e);
    } finally {
      setPostsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { loadProfile(); }, [loadProfile]);
  useEffect(() => { loadPostsAndMatches(); }, [loadPostsAndMatches]);

  const handleRefresh = () => { setRefreshing(true); loadProfile(); };
  const handleSignOut = async () => { await supabase.auth.signOut(); navigation?.navigate('Welcome'); };

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
        <Ionicons name="sparkles" size={36} color={colors.ember} />
        <Text style={{ marginTop: 12, color: colors.stone, fontSize: 14 }}>Loading profile…</Text>
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
  const tags      = user.tags            ?? [];
  const hobbies   = user.hobbies         ?? [];
  const sign      = user.astrology_sign  ?? '';
  const region    = user.region          ?? '';

  const PREF_ROWS = [
    { icon: 'compass-outline',      label: 'Discovery settings', sub: 'Age, distance, gender' },
    { icon: 'lock-closed-outline',  label: 'Privacy & safety',   sub: 'Block list, data' },
    { icon: 'help-circle-outline',  label: 'Help & support',     sub: 'FAQ, contact us' },
  ];

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

      {/* Header */}
      <View style={s.header}>
        <Text style={s.title}>Profile</Text>
        <TouchableOpacity style={s.settingsBtn} onPress={() => navigation?.navigate('Settings')}>
          <Ionicons name="settings-outline" size={20} color={colors.graphite} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.ember} />}
      >
        {/* Profile card */}
        <View style={[s.profileCard, shadow.card]}>
          <View style={[s.mainPhoto, { backgroundColor: '#FFF0ED' }]}>
            {photoUrls[0]
              ? <Image source={{ uri: photoUrls[0] }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
              : <Ionicons name="person" size={80} color={colors.ash} />}
            <TouchableOpacity style={s.editPhotosBtn} onPress={handleAddPhoto} disabled={uploading}>
              {uploading
                ? <ActivityIndicator color={colors.white} size="small" />
                : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <Ionicons name="add" size={14} color={colors.white} />
                    <Text style={s.editPhotosText}>Add photo</Text>
                  </View>
                )}
            </TouchableOpacity>
            <View style={s.mainPhotoOverlay} pointerEvents="none" />
          </View>

          <View style={s.cardInfo}>
            <View style={s.nameRow}>
              <Text style={s.name}>{user.name}</Text>
              {user.username && <Text style={s.username}>@{user.username}</Text>}
              <View style={s.verifiedBadge}>
                <Ionicons name="checkmark" size={11} color={colors.white} />
              </View>
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
            <Text style={s.bio}>{user.bio || 'Add a bio to tell people about yourself.'}</Text>

            {/* Photo grid */}
            <Text style={s.sectionLabel}>Photos</Text>
            <View style={s.photoGrid}>
              {photoUrls.map((uri, i) => (
                <TouchableOpacity
                  key={i}
                  style={[s.photoThumb, { backgroundColor: '#FFF0ED' }]}
                  onPress={() => setPhotoModal({ visible: true, index: i, uri })}
                  activeOpacity={0.8}
                >
                  <Image source={{ uri }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
                  {i === 0 && <View style={s.mainBadge}><Text style={s.mainBadgeText}>Main</Text></View>}
                  <View style={s.photoEditOverlay}>
                    <Ionicons name="pencil" size={11} color={colors.white} />
                  </View>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={s.addPhoto} onPress={handleAddPhoto} disabled={uploading}>
                {uploading
                  ? <ActivityIndicator color={colors.ember} />
                  : <Ionicons name="add" size={28} color={colors.ash} />}
              </TouchableOpacity>
            </View>

            {/* Hobbies */}
            {hobbies.length > 0 && (
              <>
                <Text style={s.sectionLabel}>Hobbies</Text>
                <View style={s.tagRow}>
                  {hobbies.map(h => (
                    <View key={h} style={s.tag}><Text style={s.tagText}>{h}</Text></View>
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
                    <View key={t} style={s.tag}><Text style={s.tagText}>{t}</Text></View>
                  ))}
                  <TouchableOpacity style={s.tagAdd}>
                    <Text style={s.tagAddText}>+ Add</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            <TouchableOpacity style={s.editBtn} onPress={() => navigation?.navigate('EditProfile')}>
              <Text style={s.editBtnText}>Edit profile</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Stats */}
        <View style={s.statsRow}>
          {[
            { label: 'Profile views', value: '0', icon: 'eye-outline' },
            { label: 'Likes received', value: '0',  icon: 'heart-outline' },
            { label: 'Matches',        value: matchesCount.toString(), icon: 'sparkles-outline' },
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
            <TouchableOpacity onPress={() => navigation?.navigate('Feed')}>
              <Text style={s.seeAll}>See all</Text>
            </TouchableOpacity>
          </View>

          {postsLoading ? (
            <ActivityIndicator color={colors.ember} style={{ marginVertical: 24 }} />
          ) : posts.length === 0 ? (
            <View style={s.emptyPosts}>
              <Ionicons name="create-outline" size={32} color={colors.ash} style={{ marginBottom: 8 }} />
              <Text style={s.emptyPostsText}>No posts yet</Text>
              <TouchableOpacity style={s.createPostBtn} onPress={() => navigation?.navigate('Feed')}>
                <Text style={s.createPostBtnText}>Create your first post</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={s.postGrid}>
              {posts.map(post => (
                <View key={post.id} style={s.postCard}>
                  {post.image_url
                    ? <Image source={{ uri: post.image_url }} style={s.postImage} resizeMode="cover" />
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

        {/* Preferences */}
        <View style={s.settingsSection}>
          <Text style={s.settingsSectionTitle}>Preferences</Text>

          <View style={s.settingRow}>
            <View style={s.settingRowLeft}>
              <View style={s.settingIconWrap}>
                <Ionicons name="flame-outline" size={18} color={colors.ember} />
              </View>
              <View>
                <Text style={s.settingLabel}>Show me on Cupid</Text>
                <Text style={s.settingSubLabel}>Others can discover your profile</Text>
              </View>
            </View>
            <Switch 
              value={discoverable} 
              onValueChange={async (val) => {
                setDiscoverable(val);
                if (user?.id) await supabase.from('users').update({ show_me_on_cupid: val }).eq('id', user.id);
              }}
              trackColor={{ false: colors.fog, true: colors.ember }} thumbColor={colors.white} />
          </View>

          <View style={s.settingRow}>
            <View style={s.settingRowLeft}>
              <View style={s.settingIconWrap}>
                <Ionicons name="eye-off-outline" size={18} color={colors.ember} />
              </View>
              <View>
                <Text style={s.settingLabel}>Hide "Last seen"</Text>
                <Text style={s.settingSubLabel}>Don't show when you were last active</Text>
              </View>
            </View>
            <Switch 
              value={hideLastSeen} 
              onValueChange={async (val) => {
                setHideLastSeen(val);
                if (user?.id) await supabase.from('users').update({ hide_last_seen: val }).eq('id', user.id);
              }}
              trackColor={{ false: colors.fog, true: colors.ember }} thumbColor={colors.white} />
          </View>

          <View style={s.settingRow}>
            <View style={s.settingRowLeft}>
              <View style={s.settingIconWrap}>
                <Ionicons name="notifications-outline" size={18} color={colors.ember} />
              </View>
              <View>
                <Text style={s.settingLabel}>Push notifications</Text>
                <Text style={s.settingSubLabel}>Matches and messages</Text>
              </View>
            </View>
            <Switch value={notifications} onValueChange={setNotifications}
              trackColor={{ false: colors.fog, true: colors.ember }} thumbColor={colors.white} />
          </View>

          <View style={s.settingRow}>
            <View style={s.settingRowLeft}>
              <View style={s.settingIconWrap}>
                <Ionicons name="moon-outline" size={18} color={colors.ember} />
              </View>
              <View>
                <Text style={s.settingLabel}>Night Mode</Text>
                <Text style={s.settingSubLabel}>Toggle dark theme</Text>
              </View>
            </View>
            <Switch value={isDark} onValueChange={toggleTheme}
              trackColor={{ false: colors.fog, true: colors.ember }} thumbColor={colors.white} />
          </View>

          {PREF_ROWS.map(item => (
            <TouchableOpacity key={item.label} style={s.settingRowBtn}>
              <View style={s.settingRowLeft}>
                <View style={s.settingIconWrap}>
                  <Ionicons name={item.icon} size={18} color={colors.ember} />
                </View>
                <View>
                  <Text style={s.settingLabel}>{item.label}</Text>
                  <Text style={s.settingSubLabel}>{item.sub}</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.ash} />
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={s.logoutBtn} onPress={handleSignOut}>
          <Ionicons name="log-out-outline" size={18} color={colors.danger} style={{ marginRight: 8 }} />
          <Text style={s.logoutText}>Sign out</Text>
        </TouchableOpacity>

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
  title: { fontSize: 32, fontWeight: '800', color: colors.ink, letterSpacing: -0.8 },
  settingsBtn: {
    width: 38, height: 38, borderRadius: 12, backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.fog, alignItems: 'center', justifyContent: 'center',
  },

  profileCard: {
    marginHorizontal: 16, borderRadius: radius.xl, overflow: 'hidden',
    backgroundColor: colors.white, marginBottom: 16,
    borderWidth: isDark ? 1 : 0, borderColor: colors.fog,
    ...(isDark ? shadow.glow : shadow.card),
  },
  mainPhoto: {
    height: 260, alignItems: 'center', justifyContent: 'center', position: 'relative',
  },
  mainPhotoOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 80,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  editPhotosBtn: {
    position: 'absolute', bottom: 14, right: 14,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: radius.full,
    paddingVertical: 7, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center',
  },
  editPhotosText: { color: colors.white, fontSize: 12, fontWeight: '600' },

  cardInfo: { padding: 18 },
  nameRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  name:     { fontSize: 26, fontWeight: '700', color: colors.ink, letterSpacing: -0.5 },
  username: { fontSize: 16, fontWeight: '500', color: colors.ash, marginLeft: 2 },
  verifiedBadge: {
    width: 22, height: 22, borderRadius: 11, backgroundColor: colors.ember,
    alignItems: 'center', justifyContent: 'center',
  },
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
  photoEditOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.32)', alignItems: 'center', paddingVertical: 5,
  },
  mainBadge: {
    position: 'absolute', bottom: 22, left: 6, backgroundColor: colors.ember,
    borderRadius: radius.full, paddingHorizontal: 6, paddingVertical: 2,
  },
  mainBadgeText: { color: colors.white, fontSize: 9, fontWeight: '700' },
  addPhoto: {
    width: PHOTO_SIZE, height: PHOTO_SIZE * 1.3, borderRadius: radius.md,
    borderWidth: 1.5, borderColor: colors.fog, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.snow,
  },

  tagRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
  tag:       { paddingVertical: 6, paddingHorizontal: 14, borderRadius: radius.full, backgroundColor: colors.emberLight },
  tagText:   { fontSize: 13, color: colors.ember, fontWeight: '500' },
  tagAdd:    { paddingVertical: 6, paddingHorizontal: 14, borderRadius: radius.full, borderWidth: 1, borderColor: colors.fog, borderStyle: 'dashed' },
  tagAddText:{ fontSize: 13, color: colors.ash },

  editBtn:    { borderWidth: 1.5, borderColor: colors.ember, borderRadius: radius.full, paddingVertical: 12, alignItems: 'center' },
  editBtnText:{ color: colors.ember, fontWeight: '600', fontSize: 15 },

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
  seeAll:        { fontSize: 13, color: colors.ember, fontWeight: '600' },

  emptyPosts:      { backgroundColor: colors.white, borderRadius: radius.lg, padding: 28, alignItems: 'center', borderWidth: 1, borderColor: colors.fog },
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
  postDate:         { fontSize: 10, color: colors.ash, paddingHorizontal: 10, paddingBottom: 8 },

  settingsSection:      { marginHorizontal: 16, backgroundColor: colors.white, borderRadius: radius.lg, overflow: 'hidden', marginBottom: 12, borderWidth: 1, borderColor: colors.fog },
  settingsSectionTitle: { fontSize: 12, fontWeight: '700', color: colors.stone, textTransform: 'uppercase', letterSpacing: 0.8, padding: 16, paddingBottom: 8 },
  settingRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: 1, borderColor: colors.fog },
  settingRowBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: 1, borderColor: colors.fog },
  settingRowLeft:{ flexDirection: 'row', alignItems: 'center', gap: 12 },
  settingIconWrap:{ width: 34, height: 34, borderRadius: 10, backgroundColor: colors.emberLight, alignItems: 'center', justifyContent: 'center' },
  settingLabel:  { fontSize: 15, color: colors.ink, fontWeight: '500', marginBottom: 2 },
  settingSubLabel:{ fontSize: 12, color: colors.ash },

  logoutBtn:  { marginHorizontal: 16, borderRadius: radius.lg, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', backgroundColor: colors.white, borderWidth: 1, borderColor: colors.fog },
  logoutText: { color: colors.danger, fontSize: 15, fontWeight: '500' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet:   { backgroundColor: colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 40, paddingHorizontal: 16, paddingTop: 12 },
  modalHandle:  { width: 40, height: 4, backgroundColor: colors.fog, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  modalTitle:   { fontSize: 16, fontWeight: '700', color: colors.ink, marginBottom: 16, textAlign: 'center' },
  modalOption:  { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 },
  modalOptionText: { fontSize: 16, color: colors.ink, fontWeight: '500' },
});
