// screens/UserProfileScreen.jsx — read-only view of another user's profile
import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Dimensions, Image, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, shadow } from '../theme';
import { supabase } from '../supabase/client';

const { width: W } = Dimensions.get('window');
const PHOTO_SIZE = (W - 48 - 8) / 3;

export default function UserProfileScreen({ navigation, route }) {
  const { userId } = route.params;

  const [user, setUser]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [posts, setPosts]         = useState([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [matchesCount, setMatchesCount] = useState(0);

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
      // Only show public/friends posts? Assumes feed logic handles permissions. 
      // For now, fetch latest 6 posts like the personal profile does.
      const { data: postsData } = await supabase.from('posts')
        .select('*').eq('user_id', userId)
        .order('created_at', { ascending: false }).limit(6);
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

  useEffect(() => { loadProfile(); }, [loadProfile]);
  useEffect(() => { loadPostsAndMatches(); }, [loadPostsAndMatches]);

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
        <TouchableOpacity onPress={() => navigation?.goBack()} style={{ marginTop: 16, backgroundColor: colors.ember, borderRadius: 999, paddingVertical: 12, paddingHorizontal: 28 }}>
          <Text style={{ color: '#fff', fontWeight: '600' }}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const photoUrls = user.photo_urls      ?? [];
  const tags      = user.tags            ?? [];
  const hobbies   = user.hobbies         ?? [];
  const sign      = user.astrology_sign  ?? '';
  const region    = user.region          ?? '';

  return (
    <View style={s.root}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation?.goBack()}>
          <Ionicons name="chevron-back" size={22} color={colors.graphite} />
        </TouchableOpacity>
        <Text style={s.title}>{user.name}</Text>
        <View style={{ width: 38 }} /> {/* spacer */}
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Profile card */}
        <View style={[s.profileCard, shadow.card]}>
          <View style={[s.mainPhoto, { backgroundColor: '#FFF0ED' }]}>
            {photoUrls[0]
              ? <Image source={{ uri: photoUrls[0] }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
              : <Ionicons name="person" size={80} color={colors.ash} />}
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
            <Text style={s.bio}>{user.bio || 'No bio yet.'}</Text>

            {/* Photo grid */}
            {photoUrls.length > 0 && (
              <>
                <Text style={s.sectionLabel}>Photos</Text>
                <View style={s.photoGrid}>
                  {photoUrls.map((uri, i) => (
                    <View key={i} style={[s.photoThumb, { backgroundColor: '#FFF0ED' }]}>
                      <Image source={{ uri }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
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
          </View>

          {postsLoading ? (
            <ActivityIndicator color={colors.ember} style={{ marginVertical: 24 }} />
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

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.snow },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 22, paddingTop: 56, paddingBottom: 16,
  },
  title: { fontSize: 24, fontWeight: '800', color: colors.ink, letterSpacing: -0.5 },
  backBtn: {
    width: 38, height: 38, borderRadius: 12, backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.fog, alignItems: 'center', justifyContent: 'center',
  },

  profileCard: {
    marginHorizontal: 16, borderRadius: radius.xl, overflow: 'hidden',
    backgroundColor: colors.white, marginBottom: 16,
  },
  mainPhoto: {
    height: 260, alignItems: 'center', justifyContent: 'center', position: 'relative',
  },
  mainPhotoOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 80,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },

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
  mainBadge: {
    position: 'absolute', bottom: 6, left: 6, backgroundColor: colors.ember,
    borderRadius: radius.full, paddingHorizontal: 6, paddingVertical: 2,
  },
  mainBadgeText: { color: colors.white, fontSize: 9, fontWeight: '700' },

  tagRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
  tag:       { paddingVertical: 6, paddingHorizontal: 14, borderRadius: radius.full, backgroundColor: colors.emberLight },
  tagText:   { fontSize: 13, color: colors.ember, fontWeight: '500' },

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
  postImage:        { width: '100%', height: 140 },
  postCaption:      { padding: 10 },
  postCaptionOnly:  { minHeight: 100, justifyContent: 'center' },
  postCaptionText:  { fontSize: 13, color: colors.graphite, lineHeight: 19 },
  postDate:         { fontSize: 10, color: colors.ash, paddingHorizontal: 10, paddingBottom: 8 },
});
