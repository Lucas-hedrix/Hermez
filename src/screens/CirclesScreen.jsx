// screens/CirclesScreen.jsx
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Modal, Alert, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform, RefreshControl, Animated,
  Dimensions} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { radius } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import { supabase } from '../supabase/client';
import { getSession } from '../auth/session';
import { pickAndUploadPhoto, pickImageAsset, pickVideoAsset, pickAudioAsset, pickFileAsset, uploadPhotoAsset } from '../supabase/storage';
import { deletePost, canDeletePost } from '../services/posts';
import { getPlaceholderUrl } from '../utils/placeholders';
import { sendPostNotification, sendMentionNotification } from '../utils/notifications';
import AttachmentSheet from '../components/AttachmentSheet';
import GiphyPicker from '../components/GiphyPicker';
import { GIPHY_CONTENT_TYPES } from '../services/giphy';
import { SkeletonCircleCard, SkeletonFeed, SkeletonPost, SkeletonSearchResult } from '../components/Skeleton';
import MentionText from '../components/MentionText';
import { extractMentionUsernames, getActiveMentionQuery } from '../utils/mentions';

const { width: W } = Dimensions.get('window');

function isVideoUrl(url) {
  if (!url) return false;
  return /\.(mp4|mov|m4v|webm)(\?|$)/i.test(url);
}

// Replaces the old `<Video>` component from expo-av. expo-video's API is
// hook-based: you create a player with useVideoPlayer(source), then hand
// the player to <VideoView>. The setup callback runs once when the
// player is created; we set loop=false so a video doesn't restart on its
// own when the user pauses. nativeControls + resizeMode behave the same
// as the old `useNativeControls` / `resizeMode` props.
function CircleVideo({ uri, style, resizeMode = 'contain' }) {
  const player = useVideoPlayer({ uri }, (p) => {
    p.loop = false;
  });
  return (
    <VideoView
      player={player}
      style={style}
      nativeControls
      contentFit={resizeMode}
      allowsFullscreen
      allowsPictureInPicture
    />
  );
}

function isAudioUrl(url) {
  if (!url) return false;
  return /\.(m4a|mp3|wav|aac|caf)(\?|$)/i.test(url);
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const CATEGORIES = ['General', 'Dating', 'Gaming', 'Study', 'Fitness', 'Music', 'Travel', 'Foodie', 'Art', 'Tech'];

const CATEGORY_ICONS = {
  General: 'globe-outline',
  Dating: 'heart-outline',
  Gaming: 'game-controller-outline',
  Study: 'book-outline',
  Fitness: 'barbell-outline',
  Music: 'musical-notes-outline',
  Travel: 'airplane-outline',
  Foodie: 'restaurant-outline',
  Art: 'color-palette-outline',
  Tech: 'hardware-chip-outline',
};

const CATEGORY_COLORS = {
  General: '#7B61FF',
  Dating: '#FF4D6D',
  Gaming: '#00F0FF',
  Study: '#F9C22E',
  Fitness: '#20C997',
  Music: '#FF9F1C',
  Travel: '#4ECDC4',
  Foodie: '#FF6B6B',
  Art: '#C77DFF',
  Tech: '#48CAE4',
};

// ── Circle Card ───────────────────────────────────────────────────────────────
function CircleCard({ circle, onPress, onAction, colors }) {
  const styles = getStyles(colors);
  const color = CATEGORY_COLORS[circle.category] ?? '#7B61FF';
  const icon  = CATEGORY_ICONS[circle.category]  ?? 'globe-outline';
  const coverUrl = circle.cover_image_url || null;
  const scale = useRef(new Animated.Value(1)).current;
  const membership = circle.membership_status;
  const actionLabel = membership === 'member' || membership === 'owner' ? 'Joined' : membership === 'requested' ? 'Requested' : 'Join';

  const onPressIn = () => Animated.spring(scale, { toValue: 0.98, useNativeDriver: true, speed: 38, bounciness: 2 }).start();
  const onPressOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 24, bounciness: 8 }).start();

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity style={styles.card} onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut} activeOpacity={1}>
        <View style={styles.cardBanner}>
          {coverUrl ? <ExpoImage source={coverUrl} style={styles.cardCoverImg} contentFit="cover" cachePolicy="memory-disk" transition={180} /> : <View style={[styles.cardBannerFallback, { backgroundColor: color + '24' }]}><Ionicons name={icon} size={44} color={color + 'B8'} /></View>}
          <View style={styles.cardBannerShade} />
          <View style={[styles.categoryBadge, { backgroundColor: color + 'E6' }]}><Ionicons name={icon} size={12} color="#FFFFFF" /><Text style={styles.categoryBadgeText}>{circle.category}</Text></View>
          <View style={[styles.cardIconBox, { borderColor: color + '55' }]}><Ionicons name={icon} size={23} color={color} /></View>
        </View>

        <View style={styles.cardBody}>
          <Text style={styles.cardName} numberOfLines={1}>{circle.name}</Text>
          <Text style={styles.cardDesc} numberOfLines={2}>{circle.description || 'A place to connect, share, and belong.'}</Text>
          <View style={styles.cardFooter}>
            <View style={styles.memberMeta}><Ionicons name="people-outline" size={14} color={colors.stone} /><Text style={styles.memberCountText}>{circle.member_count ?? 0} members</Text>{circle.online_count ? <><View style={styles.onlineDot} /><Text style={styles.memberCountText}>{circle.online_count} online</Text></> : null}</View>
            <View style={styles.memberAvatars}>{(circle.member_previews ?? []).slice(0, 3).map((member, index) => <ExpoImage ey={member.user_id ?? index} source={{ uri: member.users?.photo_urls?.[0] || getPlaceholderUrl(member.users?.name) }} style={[styles.memberAvatar, { marginLeft: index ? -7 : 0 }]} />)}</View>
          </View>
          <TouchableOpacity style={[styles.circleAction, membership && styles.circleActionJoined]} onPress={onAction} activeOpacity={0.85}>
            <Text style={[styles.circleActionText, membership && styles.circleActionTextJoined]}>{actionLabel}</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── Manage Members Modal ──────────────────────────────────────────────────────
function ManageMembersModal({ visible, onClose, circleId, circleName, isOwner, myUid, colors, styles }) {
  const [members, setMembers] = useState([]);
  const [requests, setRequests] = useState([]);
  const [tab, setTab] = useState('members');
  const [loading, setLoading] = useState(true);

  const fetchMembers = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('circle_members')
        .select('user_id, role, users(name, username, photo_urls)')
        .eq('circle_id', circleId);
      setMembers(data || []);
    } catch (e) {
      Alert.alert('Error', e.message);
    }
    setLoading(false);
  };

  const fetchRequests = async () => {
    try {
      const { data } = await supabase
        .from('circle_join_requests')
        .select('id, user_id, answers, status, created_at, users(name, username, photo_urls)')
        .eq('circle_id', circleId)
        .eq('status', 'pending');
      setRequests(data || []);
    } catch (e) {
      console.log('Error fetching requests', e);
    }
  };

  useEffect(() => {
    if (visible) {
      setTab('members');
      fetchMembers();
      if (isOwner) fetchRequests();
    }
  }, [visible, isOwner, circleId]);

  const updateRole = async (userId, newRole) => {
    try {
      const { error } = await supabase.from('circle_members').update({ role: newRole }).eq('circle_id', circleId).eq('user_id', userId);
      if (error) throw error;
      
      if (newRole === 'moderator') {
        try {
          await supabase.from('notifications').insert({
            recipient_id: userId,
            sender_id: myUid || userId,
            circle_id: circleId,
            type: 'circle_promotion',
            title: 'Promoted to Moderator!',
            message: `You have been promoted to Moderator in ${circleName || 'this circle'}.`
          });
        } catch(notifError) {
          console.log('Notification error:', notifError);
        }
      }
      
      fetchMembers();
    } catch(e) { Alert.alert('Error', e.message); }
  };

  const removeMember = async (userId) => {
    try {
      await supabase.from('circle_members').delete().eq('circle_id', circleId).eq('user_id', userId);
      fetchMembers();
    } catch(e) { Alert.alert('Error', e.message); }
  };

  const approveRequest = async (req) => {
    try {
      await supabase.from('circle_join_requests').update({ status: 'approved' }).eq('id', req.id);
      await supabase.from('circle_members').insert({ circle_id: circleId, user_id: req.user_id });
      fetchRequests();
      fetchMembers();
    } catch(e) { Alert.alert('Error', e.message); }
  };

  const rejectRequest = async (req) => {
    try {
      await supabase.from('circle_join_requests').update({ status: 'rejected' }).eq('id', req.id);
      fetchRequests();
    } catch(e) { Alert.alert('Error', e.message); }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalSheet, { backgroundColor: colors.white, maxHeight: '85%', paddingHorizontal: 0 }]}>
          <View style={[styles.modalHeader, { paddingHorizontal: 24, paddingBottom: 0, borderBottomWidth: 0 }]}>
            <Text style={[styles.modalTitle, { color: colors.ink }]}>Manage Circle</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.ink} />
            </TouchableOpacity>
          </View>
          
          <View style={{ flexDirection: 'row', paddingHorizontal: 24, borderBottomWidth: 1, borderColor: colors.fog, marginBottom: 16 }}>
            <TouchableOpacity onPress={() => setTab('members')} style={{ flex: 1, paddingVertical: 12, borderBottomWidth: 2, borderColor: tab === 'members' ? colors.ember : 'transparent' }}>
              <Text style={{ textAlign: 'center', fontWeight: '700', color: tab === 'members' ? colors.ember : colors.stone }}>Members</Text>
            </TouchableOpacity>
            {isOwner && (
              <TouchableOpacity onPress={() => setTab('requests')} style={{ flex: 1, paddingVertical: 12, borderBottomWidth: 2, borderColor: tab === 'requests' ? colors.ember : 'transparent' }}>
                <Text style={{ textAlign: 'center', fontWeight: '700', color: tab === 'requests' ? colors.ember : colors.stone }}>Requests ({requests.length})</Text>
              </TouchableOpacity>
            )}
          </View>

          {loading ? (
            <SkeletonFeed itemCount={4} ItemComponent={SkeletonSearchResult} style={{ paddingHorizontal: 24 }} />
          ) : tab === 'members' ? (
            <FlatList
              data={members}
              keyExtractor={m => m.user_id}
              contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }}
              renderItem={({ item }) => {
                const u = item.users;
                const isTargetOwner = item.role === 'owner';
                const canManage = isOwner && !isTargetOwner;
                
                return (
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 }}>
                      <ExpoImage source={{ uri: u?.photo_urls?.[0] || 'https://via.placeholder.com/40' }} style={{ width: 40, height: 40, borderRadius: 20 }} />
                      <View>
                        <Text style={{ color: colors.ink, fontWeight: '700' }}>{u?.name || 'User'}</Text>
                        <Text style={{ color: colors.stone, fontSize: 12 }}>@{u?.username}</Text>
                      </View>
                    </View>
                    
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <Text style={{ color: item.role === 'moderator' ? colors.gold : colors.stone, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' }}>
                        {item.role}
                      </Text>
                      
                      {canManage && (
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          {item.role === 'member' && (
                            <TouchableOpacity onPress={() => updateRole(item.user_id, 'moderator')} style={{ padding: 6, backgroundColor: colors.fog, borderRadius: 6 }}>
                              <Ionicons name="shield-checkmark" size={16} color={colors.gold} />
                            </TouchableOpacity>
                          )}
                          {item.role === 'moderator' && (
                            <TouchableOpacity onPress={() => updateRole(item.user_id, 'member')} style={{ padding: 6, backgroundColor: colors.fog, borderRadius: 6 }}>
                              <Ionicons name="person-remove" size={16} color={colors.stone} />
                            </TouchableOpacity>
                          )}
                          <TouchableOpacity onPress={() => removeMember(item.user_id)} style={{ padding: 6, backgroundColor: colors.ember + '22', borderRadius: 6 }}>
                            <Ionicons name="trash" size={16} color={colors.ember} />
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  </View>
                );
              }}
            />
          ) : (
            <FlatList
              data={requests}
              keyExtractor={r => r.id}
              contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }}
              ListEmptyComponent={<Text style={{ color: colors.stone, textAlign: 'center', marginTop: 40 }}>No pending requests.</Text>}
              renderItem={({ item }) => {
                const u = item.users;
                return (
                  <View style={{ backgroundColor: colors.snow, padding: 12, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: colors.fog }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                      <ExpoImage source={{ uri: u?.photo_urls?.[0] || 'https://via.placeholder.com/40' }} style={{ width: 40, height: 40, borderRadius: 20 }} />
                      <View>
                        <Text style={{ color: colors.ink, fontWeight: '700' }}>{u?.name || 'User'}</Text>
                        <Text style={{ color: colors.stone, fontSize: 12 }}>@{u?.username}</Text>
                      </View>
                    </View>
                    
                    {item.answers && Object.keys(item.answers).length > 0 && (
                      <View style={{ marginBottom: 12, backgroundColor: colors.white, padding: 8, borderRadius: 8 }}>
                        <Text style={{ color: colors.ink, fontWeight: '600', fontSize: 12, marginBottom: 4 }}>Answers provided:</Text>
                        {Object.entries(item.answers).map(([qid, ans]) => (
                          <Text key={qid} style={{ color: colors.stone, fontSize: 12, marginBottom: 2 }}>• {ans === true ? 'Agreed' : ans}</Text>
                        ))}
                      </View>
                    )}
                    
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                      <TouchableOpacity onPress={() => approveRequest(item)} style={{ flex: 1, backgroundColor: colors.ember, paddingVertical: 8, borderRadius: 8, alignItems: 'center' }}>
                        <Text style={{ color: colors.white, fontWeight: '700', fontSize: 13 }}>Approve</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => rejectRequest(item)} style={{ flex: 1, backgroundColor: colors.fog, paddingVertical: 8, borderRadius: 8, alignItems: 'center' }}>
                        <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 13 }}>Reject</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              }}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

// ── Circle Detail ─────────────────────────────────────────────────────────────
function CircleDetail({ circle, myUid, colors, shadow, onBack, onCircleUpdated, onOpenProfile }) {
  const styles = getStyles(colors);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isMember, setIsMember] = useState(false);
  const [myRole, setMyRole] = useState(null);
  const [joining, setJoining] = useState(false);
  const [newPost, setNewPost] = useState('');
  const [postMediaPreview, setPostMediaPreview] = useState(null);
  const [postMediaKind, setPostMediaKind] = useState(null);
  const [newPostMedia, setNewPostMedia] = useState(null);
  const [mediaUploading, setMediaUploading] = useState(false);
  const [showAttachmentSheet, setShowAttachmentSheet] = useState(false);
  const [giphyPickerVisible, setGiphyPickerVisible] = useState(false);
  const [posting, setPosting] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [leaveReason, setLeaveReason] = useState('');
  const [circleCover, setCircleCover] = useState(circle.cover_image_url ?? null);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [hasPendingRequest, setHasPendingRequest] = useState(false);
  const [joinAnswers, setJoinAnswers] = useState({});
  const [showEditRules, setShowEditRules] = useState(false);
  const [editQuestions, setEditQuestions] = useState([]);
  const [showManagePrivacy, setShowManagePrivacy] = useState(false);
  const [editingPrivacy, setEditingPrivacy] = useState('public');
  const [savingRules, setSavingRules] = useState(false);
  const [showEditCoverGifPicker, setShowEditCoverGifPicker] = useState(false);
  const [showEditCoverSheet, setShowEditCoverSheet] = useState(false);
  const [viewingPostImage, setViewingPostImage] = useState(null);
  const [mentionQuery, setMentionQuery] = useState(null);
  const [mentionableUsers, setMentionableUsers] = useState([]);
  const postListRef = useRef(null);
  const color = CATEGORY_COLORS[circle.category] || colors.ember;
  const isOwner = circle.owner_id === myUid;

  useEffect(() => {
    setCircleCover(circle.cover_image_url ?? null);
  }, [circle.cover_image_url, circle.id]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: postsData, error: postsError }, { data: memberData }, requestResponse] = await Promise.all([
        supabase
          .from('posts')
          .select('id, caption, image_url, created_at, user_id')
          .eq('circle_id', circle.id)
          .order('created_at', { ascending: false })
          .limit(30),
        supabase
          .from('circle_members')
          .select('user_id, role')
          .eq('circle_id', circle.id)
          .eq('user_id', myUid)
          .maybeSingle(),
        supabase
          .from('circle_join_requests')
          .select('status')
          .eq('circle_id', circle.id)
          .eq('user_id', myUid)
          .eq('status', 'pending')
          .maybeSingle(),
      ]);

      if (postsError) {
        console.log('Circle posts load error:', postsError.message);
        setPosts([]);
      } else {
        const rows = postsData ?? [];
        const userIds = [...new Set(rows.map((p) => p.user_id).filter(Boolean))];
        let usersMap = {};

        if (userIds.length > 0) {
          const { data: usersData } = await supabase
            .from('users')
            .select('id, name, username, photo_urls')
            .in('id', userIds);
          usersMap = Object.fromEntries((usersData ?? []).map((u) => [u.id, u]));
        }

        // Chat-style: oldest at the top, newest at the bottom.
        // The query is DESC, so reverse for display.
        const ordered = rows.map((p) => ({ ...p, users: usersMap[p.user_id] ?? null })).reverse();
        setPosts(ordered);
      }

      setIsMember(!!memberData || circle.owner_id === myUid);
      setMyRole(memberData?.role ?? (circle.owner_id === myUid ? 'owner' : null));
      setHasPendingRequest(!!requestResponse?.data);
    } catch (e) {
      console.log('Circle load error:', e);
    } finally {
      setLoading(false);
    }
  }, [circle.id, circle.owner_id, myUid]);

  useEffect(() => { load(); }, [load]);

  // Auto-scroll to bottom (newest post) when posts first load or when a
  // new post is appended locally. Chat-style: users see the latest at the
  // bottom of the screen.
  useEffect(() => {
    if (loading || posts.length === 0) return;
    const t = setTimeout(() => {
      postListRef.current?.scrollToEnd({ animated: false });
    }, 50);
    return () => clearTimeout(t);
  }, [loading, posts.length]);

  useEffect(() => {
    if (!circle?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const { data: members, error: membersError } = await supabase
          .from('circle_members')
          .select('user_id')
          .eq('circle_id', circle.id);
        if (membersError) throw membersError;
        const ids = [...new Set((members ?? [])
          .map((m) => m.user_id)
          .filter((id) => id && id !== myUid))];
        if (ids.length === 0) {
          if (!cancelled) setMentionableUsers([]);
          return;
        }
        const { data: users } = await supabase
          .from('users')
          .select('id, name, username, photo_urls')
          .in('id', ids)
          .not('username', 'is', null);
        if (!cancelled) setMentionableUsers(users ?? []);
      } catch (e) {
        console.log('Circle mentionable users load error:', e?.message);
        if (!cancelled) setMentionableUsers([]);
      }
    })();
    return () => { cancelled = true; };
  }, [circle?.id, myUid]);

  const handleNewPostChange = (val) => {
    setNewPost(val);
    setMentionQuery(getActiveMentionQuery(val));
  };

  const insertMention = (user) => {
    if (!mentionQuery || !user?.username) return;
    const before = newPost.slice(0, mentionQuery.start);
    const after = newPost.slice(mentionQuery.start + 1 + mentionQuery.query.length);
    setNewPost(`${before}@${user.username} ${after}`);
    setMentionQuery(null);
  };

  const mentionSuggestions = mentionQuery
    ? mentionableUsers
        .filter((u) => u.username?.toLowerCase().includes(mentionQuery.query.toLowerCase()))
        .slice(0, 6)
    : [];

  const notifyMentions = async (txt, postId, myName) => {
    const usernames = extractMentionUsernames(txt);
    if (!usernames.length) return;
    for (const username of usernames) {
      const local = mentionableUsers.find(
        (u) => u.username?.toLowerCase() === username.toLowerCase(),
      );
      let user = local;
      if (!user) {
        const { data } = await supabase
          .from('users')
          .select('id, name, username, photo_urls')
          .eq('username', username)
          .maybeSingle();
        user = data || null;
      }
      if (!user || user.id === myUid) continue;
      try {
        await supabase.from('notifications').insert({
          recipient_id: user.id,
          sender_id: myUid,
          post_id: postId,
          circle_id: circle.id,
          type: 'mention',
          title: 'You were mentioned',
          message: `${myName} mentioned you in ${circle.name}: "${txt.slice(0, 80)}"`,
        });
        await sendMentionNotification(user.id, myName, txt, { postId });
      } catch (err) {
        console.log('Error notifying mention:', err.message);
      }
    }
  };

  const handleMentionPress = async (username) => {
    const clean = String(username || '').replace(/^@/, '').toLowerCase();
    if (!clean) return;
    const local = mentionableUsers.find(
      (u) => u.username?.toLowerCase() === clean,
    );
    let user = local;
    if (!user) {
      const { data } = await supabase
        .from('users')
        .select('id, name, username, photo_urls')
        .eq('username', clean)
        .maybeSingle();
      user = data || null;
    }
    if (user?.id) {
      onOpenProfile?.(user);
    } else {
      Alert.alert('Not found', `@${clean} isn't a Cupid user.`);
    }
  };

  const processJoin = async (answers = {}) => {
    setJoining(true);
    try {
      if (circle.join_questions && circle.join_questions.length > 0) {
        await supabase.from('circle_join_requests').insert({ circle_id: circle.id, user_id: myUid, answers });
        setHasPendingRequest(true);
        Alert.alert('Sent', 'Your join request has been sent to the moderators for review.');
      } else {
        await supabase.from('circle_members').insert({ circle_id: circle.id, user_id: myUid });
        setIsMember(true);
      }
      setShowJoinModal(false);
    } catch (e) { Alert.alert('Error', e.message); }
    finally { setJoining(false); }
  };

  const join = async () => {
    if (isMember) {
      setJoining(true);
      try {
        await supabase.from('circle_members').delete().eq('circle_id', circle.id).eq('user_id', myUid);
        setIsMember(false);
      } catch (e) { Alert.alert('Error', e.message); }
      finally { setJoining(false); }
    } else {
      if (circle.join_questions && circle.join_questions.length > 0) {
        setShowJoinModal(true);
      } else {
        Alert.alert('Terms & Conditions', 'Do You Agree To Follow The Terms For This Circle?', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'I Agree', onPress: () => processJoin() }
        ]);
      }
    }
  };

  const clearPostMedia = () => {
    setPostMediaPreview(null);
    setPostMediaKind(null);
    setNewPostMedia(null);
  };

  const submitPost = async () => {
    if (!newPost.trim() && !newPostMedia && !postMediaPreview) return;

    if (postMediaPreview && !newPostMedia) {
      Alert.alert('Please wait', 'Your media is still uploading. Try again in a moment.');
      return;
    }

    setPosting(true);
    try {
      const { data, error } = await supabase
        .from('posts')
        .insert({
          user_id: myUid,
          caption: newPost.trim() || null,
          image_url: newPostMedia || null,
          circle_id: circle.id,
          visibility: 'public',
        })
        .select('id, caption, image_url, created_at, user_id')
        .single();

      if (error) throw error;

      const { data: me } = await supabase
        .from('users')
        .select('id, name, username, photo_urls')
        .eq('id', myUid)
        .maybeSingle();

      setPosts((prev) => [...prev, { ...data, users: me ?? null }]);
      const postedCaption = newPost.trim();
      setNewPost('');
      setMentionQuery(null);
      clearPostMedia();

      // Fire mention notifications (non-blocking — failures are logged).
      notifyMentions(postedCaption, data.id, me?.name || 'A member').catch((e) =>
        console.log('Circle mention notify error:', e?.message),
      );

      try {
        const { data: members } = await supabase
          .from('circle_members')
          .select('user_id')
          .eq('circle_id', circle.id)
          .neq('user_id', myUid);
        
        if (members && members.length > 0) {
          const memberIds = members.map(m => m.user_id);
          const myName = me?.name || 'A member';
          
          const notifs = memberIds.map(id => ({
            recipient_id: id,
            sender_id: myUid,
            circle_id: circle.id,
            type: 'circle_post',
            title: `New post in ${circle.name}`,
            message: `${myName} just made a new post.`
          }));
          
          if (notifs.length > 0) {
            await supabase.from('notifications').insert(notifs);
            await sendPostNotification(memberIds, myName, circle.name);
          }
        }
      } catch (e) {
        console.log('Error notifying circle members:', e.message);
      }
    } catch (e) {
      Alert.alert(
        'Could not post',
        e.message + '\n\nIf this keeps happening, run supabase_migration_posts_circles.sql in the Supabase SQL editor.'
      );
    } finally {
      setPosting(false);
    }
  };

  const uploadPickedAsset = async (asset, kind) => {
    if (!asset?.uri) return;

    setPostMediaPreview(asset.uri);
    setPostMediaKind(kind);
    setNewPostMedia(null);
    setMediaUploading(true);

    try {
      const url = await uploadPhotoAsset(myUid, asset);
      if (url) {
        setNewPostMedia(url);
      } else {
        clearPostMedia();
        Alert.alert('Upload failed', 'Could not upload this file. Please try again.');
      }
    } finally {
      setMediaUploading(false);
    }
  };

  const handlePickPostMedia = async (kind) => {
    let asset = null;
    if (kind === 'photo') asset = await pickImageAsset();
    else if (kind === 'video') asset = await pickVideoAsset();
    else if (kind === 'audio') asset = await pickAudioAsset();
    else if (kind === 'file') asset = await pickFileAsset();

    if (asset) await uploadPickedAsset(asset, kind);
  };

  const attachmentOptions = [
    {
      key: 'photo',
      label: 'Photo',
      icon: 'image',
      iconColor: '#3b82f6',
      bgColor: '#3b82f620',
      onPress: () => handlePickPostMedia('photo'),
    },
    {
      key: 'video',
      label: 'Video',
      icon: 'videocam',
      iconColor: '#8b5cf6',
      bgColor: '#8b5cf620',
      onPress: () => handlePickPostMedia('video'),
    },
    {
      key: 'audio',
      label: 'Audio',
      icon: 'musical-notes',
      iconColor: '#f59e0b',
      bgColor: '#f59e0b20',
      onPress: () => handlePickPostMedia('audio'),
    },
    {
      key: 'gif',
      label: 'GIF',
      icon: 'happy-outline',
      iconColor: '#7c3aed',
      bgColor: '#7c3aed20',
      onPress: () => {
        setShowAttachmentSheet(false);
        setGiphyPickerVisible(true);
      },
    },
    {
      key: 'file',
      label: 'File',
      icon: 'document',
      iconColor: colors.stone,
      bgColor: colors.fog,
      onPress: () => handlePickPostMedia('file'),
    },
  ];

  const handleGiphySelect = (item) => {
    setGiphyPickerVisible(false);
    setPostMediaPreview(item.previewUrl || item.mediaUrl);
    setPostMediaKind(item.type === GIPHY_CONTENT_TYPES.STICKER ? 'sticker' : 'gif');
    setNewPostMedia(item.mediaUrl);
  };

  const canPost = isMember || isOwner;

  const handleDeleteCirclePost = async (post) => {
    if (!myUid) return;
    try {
      await deletePost(post, myUid, {
        circleOwnerId: circle.owner_id,
        myCircleRole: myRole,
      });
      setPosts((prev) => prev.filter((p) => p.id !== post.id));
    } catch (e) {
      Alert.alert('Delete failed', e.message);
    }
  };

  const confirmDeletePost = (post) => {
    Alert.alert('Delete post?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => handleDeleteCirclePost(post) },
    ]);
  };

  const persistCircleCover = async (nextUrl, sourceLabel) => {
    if (!nextUrl) return;

    const { data, error } = await supabase
      .from('circles')
      .update({ cover_image_url: nextUrl })
      .eq('id', circle.id)
      .select('id, cover_image_url')
      .maybeSingle();

    if (error) {
      Alert.alert('Update Failed', error.message);
      return;
    }

    if (!data?.cover_image_url) {
      Alert.alert(
        'Could not save cover',
        'The file uploaded but was not saved to this circle. If you are the owner or a moderator, run supabase_migration_circles_cover_update.sql in the Supabase SQL editor (missing UPDATE permission).'
      );
      return;
    }

    setCircleCover(data.cover_image_url);
    onCircleUpdated?.({ ...circle, cover_image_url: data.cover_image_url });
    Alert.alert('Success', `${sourceLabel} updated!`);
  };

  const handleEditCover = () => setShowEditCoverSheet(true);

  const handleEditCoverPhoto = async () => {
    const url = await pickAndUploadPhoto(myUid);
    if (url) await persistCircleCover(url, 'Cover photo');
    setShowEditCoverSheet(false);
  };

  const handleEditCoverGif = () => {
    setShowEditCoverSheet(false);
    setShowEditCoverGifPicker(true);
  };

  const handleManagePrivacy = () => {
    setEditingPrivacy(circle.privacy || 'public');
    setShowSettings(false);
    setShowManagePrivacy(true);
  };

  const updatePrivacy = async (newPrivacy) => {
    try {
      const { error } = await supabase.from('circles').update({ privacy: newPrivacy }).eq('id', circle.id);
      if (error) throw error;
      Alert.alert('Success', `Circle privacy is now ${newPrivacy}.`);
      onCircleUpdated?.({ ...circle, privacy: newPrivacy });
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  };

  const openEditRules = () => {
    setEditQuestions(circle.join_questions || []);
    setShowSettings(false);
    setShowEditRules(true);
  };

  const saveRules = async () => {
    setSavingRules(true);
    try {
      const { error } = await supabase.from('circles').update({ join_questions: editQuestions }).eq('id', circle.id);
      if (error) throw error;
      Alert.alert('Success', 'Join rules updated successfully.');
      setShowEditRules(false);
      onCircleUpdated?.({ ...circle, join_questions: editQuestions });
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setSavingRules(false);
    }
  };

  const handleLeaveConfirm = async () => {
    // You could save `leaveReason` to a telemetry/logs table here
    await join(); // This calls the existing join() which deletes the member if they are already in it
    setShowLeaveModal(false);
    onBack();
  };

  const detailIcon = CATEGORY_ICONS[circle.category] || 'people';

  return (
    <View style={{ flex: 1, backgroundColor: colors.snow }}>
      {circleCover ? (
        <ExpoImage source={{ uri: circleCover }} style={styles.detailCover} contentFit="cover" />
      ) : null}
      {/* Header */}
      <View style={[styles.detailHeader, { backgroundColor: colors.white, borderBottomColor: colors.fog }]}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <Ionicons name="chevron-back" size={22} color={colors.graphite} />
        </TouchableOpacity>

        <View style={[styles.headerLogoWrapper, { borderColor: color + '4D', shadowColor: color }]}>
          <Ionicons name={detailIcon} size={18} color={color} />
        </View>

        <View style={{ flex: 1 }}>
          <Text style={[styles.detailTitle, { color: colors.ink }]} numberOfLines={1}>{circle.name}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={[styles.detailSub, { color: colors.stone }]}>{circle.category}</Text>
            {myRole && (
              <View style={[styles.roleBadge, { backgroundColor: color + '1A', borderColor: color + '4D', shadowColor: color }]}>
                <Ionicons 
                  name={isOwner ? 'star' : myRole === 'moderator' ? 'shield-checkmark' : 'person'} 
                  size={10} 
                  color={color} 
                  style={{ marginRight: 4 }} 
                />
                <Text style={[styles.roleBadgeText, { color }]}>
                  {isOwner ? 'OWNER' : myRole === 'moderator' ? 'MOD' : 'MEMBER'}
                </Text>
              </View>
            )}
          </View>
        </View>
        {!isOwner && (
          <TouchableOpacity
            style={[styles.joinBtn, { backgroundColor: isMember || hasPendingRequest ? colors.fog : color }]}
            onPress={join}
            disabled={joining || hasPendingRequest}
          >
            {joining ? <ActivityIndicator size="small" color={colors.white} /> : (
              <Text style={[styles.joinBtnText, { color: isMember || hasPendingRequest ? colors.stone : colors.white }]}>
                {isMember ? 'Joined' : hasPendingRequest ? 'Pending' : 'Join'}
              </Text>
            )}
          </TouchableOpacity>
        )}
        <TouchableOpacity style={{ padding: 8, marginLeft: 6 }} onPress={() => setShowSettings(true)}>
          <Ionicons name="settings-outline" size={22} color={colors.graphite} />
        </TouchableOpacity>
      </View>

      <AttachmentSheet
        visible={showEditCoverSheet}
        onClose={() => setShowEditCoverSheet(false)}
        title="Add circle cover"
        options={[
          { key: 'image', label: 'Photo', icon: 'image-outline', iconColor: '#3b82f6', bgColor: '#3b82f620', onPress: handleEditCoverPhoto },
          { key: 'gif', label: 'GIF', icon: 'sparkles-outline', iconColor: '#f59e0b', bgColor: '#f59e0b20', onPress: handleEditCoverGif },
        ]}
      />

      <GiphyPicker
        visible={showEditCoverGifPicker}
        onClose={() => setShowEditCoverGifPicker(false)}
        contentTypes={[GIPHY_CONTENT_TYPES.GIF]}
        onSelect={(item) => {
          setShowEditCoverGifPicker(false);
          persistCircleCover(item.mediaUrl, 'Circle GIF cover');
        }}
      />

      <FlatList
        ref={postListRef}
        data={posts}
        keyExtractor={i => i.id}
        contentContainerStyle={styles.bubbleListContent}
        ListEmptyComponent={
          loading ? <SkeletonFeed itemCount={3} ItemComponent={SkeletonPost} style={{ paddingHorizontal: 16 }} /> : (
            <View style={styles.emptyBox}>
              <Ionicons name="chatbubbles-outline" size={48} color={colors.ash} />
              <Text style={[styles.emptyText, { color: colors.stone }]}>No posts yet. Be the first!</Text>
            </View>
          )
        }
        renderItem={({ item }) => {
          const user = item.users;
          const photo = user?.photo_urls?.[0];
          const mayDelete =
            item.user_id === myUid ||
            isOwner ||
            myRole === 'moderator' ||
            myRole === 'owner';
          const isMine = item.user_id === myUid;
          // Chat-bubble palette: own messages use the circle's accent, others
          // use a soft neutral. Text colors flip for contrast.
          const bubbleBg = isMine ? color : colors.fog;
          const bubbleText = isMine ? colors.white : colors.graphite;
          const mentionColor = isMine ? colors.white : color;
          const bubbleMaxWidth = '78%';
          return (
            <View
              style={[
                styles.bubbleRow,
                isMine ? styles.bubbleRowMine : styles.bubbleRowTheirs,
              ]}
            >
              {!isMine && (
                <View style={[styles.bubbleAvatar, { backgroundColor: color + '33' }]}>
                  {photo ? (
                    <ExpoImage source={{ uri: photo }} style={styles.bubbleAvatarImg} />
                  ) : (
                    <ExpoImage source={{ uri: getPlaceholderUrl(user?.name) }} style={styles.bubbleAvatarImg} />
                  )}
                </View>
              )}
              <View style={{ maxWidth: bubbleMaxWidth, alignItems: isMine ? 'flex-end' : 'flex-start' }}>
                {!isMine && (
                  <View style={styles.bubbleMetaLeft}>
                    <Text style={[styles.bubbleAuthor, { color: colors.ink }]} numberOfLines={1}>
                      {user?.name || 'Cupid User'}
                    </Text>
                    {user?.username ? (
                      <Text style={[styles.bubbleUsername, { color: colors.stone }]} numberOfLines={1}>
                        @{user.username}
                      </Text>
                    ) : null}
                  </View>
                )}
                <View
                  style={[
                    styles.bubble,
                    isMine ? styles.bubbleMine : styles.bubbleTheirs,
                    { backgroundColor: bubbleBg },
                    shadow.soft,
                  ]}
                >
                  {item.image_url ? (
                    isVideoUrl(item.image_url) ? (
                      <CircleVideo
                        uri={item.image_url}
                        style={styles.bubbleMedia}
                        contentFit="contain"
                      />
                    ) : isAudioUrl(item.image_url) ? (
                      <View style={styles.bubbleAudioRow}>
                        <Ionicons name="musical-notes" size={18} color={isMine ? colors.white : color} />
                        <Text style={[styles.bubbleAudioText, { color: bubbleText }]}>Audio attachment</Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.bubbleMediaFrame}
                        onPress={() => setViewingPostImage(item.image_url)}
                        activeOpacity={0.9}
                      >
                        <ExpoImage source={{ uri: item.image_url }} style={styles.bubbleMedia} contentFit="cover" />
                      </TouchableOpacity>
                    )
                  ) : null}
                  {item.caption ? (
                    <MentionText
                      text={item.caption}
                      style={[styles.bubbleText, { color: bubbleText }]}
                      mentionStyle={{ color: mentionColor, fontWeight: '700' }}
                      onMentionPress={handleMentionPress}
                    />
                  ) : null}
                </View>
                <View style={[styles.bubbleFooter, isMine ? styles.bubbleFooterMine : styles.bubbleFooterTheirs]}>
                  <Text style={[styles.bubbleTime, { color: colors.ash }]}>{timeAgo(item.created_at)}</Text>
                  {mayDelete && (
                    <TouchableOpacity onPress={() => confirmDeletePost(item)} hitSlop={8} style={styles.bubbleDeleteBtn}>
                      <Ionicons name="trash-outline" size={14} color={colors.ash} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
              {isMine && (
                <View style={[styles.bubbleAvatar, { backgroundColor: color + '33' }]}>
                  {photo ? (
                    <ExpoImage source={{ uri: photo }} style={styles.bubbleAvatarImg} />
                  ) : (
                    <ExpoImage source={{ uri: getPlaceholderUrl(user?.name) }} style={styles.bubbleAvatarImg} />
                  )}
                </View>
              )}
            </View>
          );
        }}
      />

      <Modal
        visible={!!viewingPostImage}
        animationType="fade"
        transparent
        onRequestClose={() => setViewingPostImage(null)}
      >
        <View style={styles.imageViewerOverlay}>
          <TouchableOpacity
            style={styles.imageViewerClose}
            onPress={() => setViewingPostImage(null)}
            hitSlop={12}
          >
            <Ionicons name="close" size={28} color="#FFFFFF" />
          </TouchableOpacity>
          {viewingPostImage ? (
            <ExpoImage              source={{ uri: viewingPostImage }}
              style={styles.imageViewerImage}
              contentFit="contain"
            />
          ) : null}
        </View>
      </Modal>

      {/* Post input — members and circle owner */}
      {canPost && (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.inputBar, { backgroundColor: colors.white, borderTopColor: colors.fog, paddingBottom: 12 }]}>
            {postMediaPreview ? (
              <View style={styles.postImagePreviewWrapper}>
                {postMediaKind === 'video' ? (
                  <CircleVideo uri={postMediaPreview} style={styles.postImagePreview} contentFit="cover" />
                ) : postMediaKind === 'audio' || postMediaKind === 'file' ? (
                  <View style={styles.postMediaPlaceholder}>
                    <Ionicons
                      name={postMediaKind === 'audio' ? 'musical-notes' : 'document'}
                      size={36}
                      color={color}
                    />
                    <Text style={[styles.postMediaPlaceholderText, { color: colors.stone }]}>
                      {postMediaKind === 'audio' ? 'Audio selected' : 'File selected'}
                    </Text>
                  </View>
                ) : (
                  <ExpoImage source={{ uri: postMediaPreview }} style={styles.postImagePreview} />
                )}
                {mediaUploading ? (
                  <View style={styles.postImageUploading}>
                    <ActivityIndicator color="#fff" />
                    <Text style={styles.postImageUploadingText}>Uploading…</Text>
                  </View>
                ) : null}
                <TouchableOpacity style={styles.postImageRemove} onPress={clearPostMedia}>
                  <Ionicons name="close-circle" size={26} color="#fff" />
                </TouchableOpacity>
              </View>
            ) : null}
            <View style={styles.inputBarRow}>
              <TouchableOpacity onPress={() => setShowAttachmentSheet(true)} style={styles.addBtn} disabled={mediaUploading}>
                <Ionicons name="add" size={28} color={color} />
              </TouchableOpacity>
              <TextInput
                style={[styles.postInput, { color: colors.ink, backgroundColor: colors.snow }]}
                placeholder="Share something..."
                placeholderTextColor={colors.ash}
                value={newPost}
                onChangeText={handleNewPostChange}
                multiline
              />
              <TouchableOpacity
                style={[
                  styles.sendBtn,
                  {
                    backgroundColor: color,
                    opacity: (newPost.trim() || newPostMedia || postMediaPreview) ? 1 : 0.4,
                  },
                ]}
                onPress={submitPost}
                disabled={
                  posting ||
                  mediaUploading ||
                  (!newPost.trim() && !newPostMedia && !postMediaPreview)
                }
              >
                {posting ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={18} color="#fff" />}
              </TouchableOpacity>
            </View>
            {mentionSuggestions.length > 0 && (
              <View style={[styles.mentionList, { backgroundColor: colors.white, borderColor: colors.fog }]}>
                {mentionSuggestions.map((u) => (
                  <TouchableOpacity
                    key={u.id}
                    style={[styles.mentionRow, { borderBottomColor: colors.fog }]}
                    onPress={() => insertMention(u)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.mentionAvatar, { backgroundColor: colors.fog }]}>
                      {u.photo_urls?.[0] ? (
                        <ExpoImage source={{ uri: u.photo_urls[0] }} style={[StyleSheet.absoluteFillObject, {width: "100%", height: "100%"}] } borderRadius={14} />
                      ) : (
                        <ExpoImage source={{ uri: getPlaceholderUrl(u.name) }} style={[StyleSheet.absoluteFillObject, {width: "100%", height: "100%"}] } borderRadius={14} />
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.mentionName, { color: colors.ink }]} numberOfLines={1}>
                        {u.name}
                      </Text>
                      <Text style={[styles.mentionUsername, { color: colors.stone }]} numberOfLines={1}>
                        @{u.username}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      )}
      <AttachmentSheet
        visible={showAttachmentSheet}
        onClose={() => setShowAttachmentSheet(false)}
        title="Add to post"
        options={attachmentOptions}
      />
      <GiphyPicker
        visible={giphyPickerVisible}
        onClose={() => setGiphyPickerVisible(false)}
        onSelect={handleGiphySelect}
        customerId={myUid}
      />

      {/* Join prompt for non-members */}
      {!canPost && !loading && (
        <View style={[styles.joinPrompt, { backgroundColor: colors.white, borderTopColor: colors.fog }]}>
          <Text style={[styles.joinPromptText, { color: colors.stone }]}>Join this circle to post</Text>
        </View>
      )}

      {/* Settings Modal */}
      <Modal visible={showSettings} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.white }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.ink }]}>Circle Settings</Text>
              <TouchableOpacity onPress={() => setShowSettings(false)}>
                <Ionicons name="close" size={24} color={colors.ink} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.settingRow} onPress={() => { Alert.alert('Link', `hermez://circle/${circle.id}`); }}>
              <Ionicons name="share-social-outline" size={20} color={colors.ink} />
              <Text style={[styles.settingText, { color: colors.ink }]}>Share Circle Link</Text>
            </TouchableOpacity>

            {(isOwner || myRole === 'moderator') && (
              <>
                <TouchableOpacity style={styles.settingRow} onPress={handleEditCover}>
                  <Ionicons name="image-outline" size={20} color={colors.ink} />
                  <Text style={[styles.settingText, { color: colors.ink }]}>Edit Cover Photo</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.settingRow} onPress={() => { setShowSettings(false); setShowMembers(true); }}>
                  <Ionicons name="people-outline" size={20} color={colors.ink} />
                  <Text style={[styles.settingText, { color: colors.ink }]}>Manage Members</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.settingRow} onPress={handleManagePrivacy}>
                  <Ionicons name="lock-closed-outline" size={20} color={colors.ink} />
                  <Text style={[styles.settingText, { color: colors.ink }]}>Manage Privacy ({circle.privacy})</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.settingRow} onPress={openEditRules}>
                  <Ionicons name="list-outline" size={20} color={colors.ink} />
                  <Text style={[styles.settingText, { color: colors.ink }]}>Edit Join Rules</Text>
                </TouchableOpacity>
              </>
            )}

            {!isOwner && isMember && (
              <TouchableOpacity style={[styles.settingRow, { marginTop: 24, borderTopWidth: 1, borderColor: colors.fog, paddingTop: 16 }]} onPress={() => { setShowSettings(false); setShowLeaveModal(true); }}>
                <Ionicons name="log-out-outline" size={20} color={colors.danger} />
                <Text style={[styles.settingText, { color: colors.danger, fontWeight: '700' }]}>Leave Circle</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      {/* Leave Confirmation Modal */}
      <Modal visible={showLeaveModal} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.white, maxHeight: '70%' }]}>
            <Text style={[styles.modalTitle, { color: colors.ink, marginBottom: 8 }]}>Why are you leaving?</Text>
            <Text style={{ color: colors.stone, marginBottom: 16, fontSize: 13 }}>Please let us know why you are leaving this circle.</Text>
            
            {['Just leaving', 'Hate speech', 'Cyber bullying', 'Pornography/Nudity', 'Spam'].map(reason => (
              <TouchableOpacity key={reason} style={[styles.reasonBtn, { borderColor: colors.fog }, leaveReason === reason && { borderColor: color, backgroundColor: color + '15' }]} onPress={() => setLeaveReason(reason)}>
                <Text style={{ color: leaveReason === reason ? color : colors.ink, fontWeight: '600' }}>{reason}</Text>
              </TouchableOpacity>
            ))}

            <TouchableOpacity style={[styles.joinBtn, { backgroundColor: colors.danger, marginTop: 24, alignItems: 'center' }]} onPress={handleLeaveConfirm} disabled={joining}>
              {joining ? <ActivityIndicator color="#fff" /> : <Text style={[styles.joinBtnText, { color: colors.white }]}>Confirm Leave</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={{ alignItems: 'center', marginTop: 16, paddingVertical: 8 }} onPress={() => setShowLeaveModal(false)}>
              <Text style={{ color: colors.stone, fontWeight: '700' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <ManageMembersModal
        visible={showMembers}
        onClose={() => setShowMembers(false)}
        circleId={circle.id}
        circleName={circle.name}
        isOwner={isOwner}
        myUid={myUid}
        colors={colors}
        styles={styles}
      />

      {/* Manage Privacy Modal */}
      <Modal visible={showManagePrivacy} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.white }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.ink }]}>Manage Privacy</Text>
              <TouchableOpacity onPress={() => setShowManagePrivacy(false)}>
                <Ionicons name="close" size={24} color={colors.stone} />
              </TouchableOpacity>
            </View>
            <View style={{ gap: 12, marginBottom: 24 }}>
              {[
                { val: 'public', label: 'Public (Anyone can join)', icon: 'earth' },
                { val: 'private', label: 'Private (Requests only)', icon: 'lock-closed' },
                { val: 'invite_only', label: 'Invite Only', icon: 'mail' },
                { val: 'campus_only', label: 'Campus Only', icon: 'school' },
              ].map(({ val, label, icon }) => {
                const active = editingPrivacy === val;
                return (
                  <TouchableOpacity
                    key={val}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: active ? colors.ember : colors.fog, backgroundColor: active ? colors.ember + '15' : colors.snow }}
                    onPress={() => setEditingPrivacy(val)}
                  >
                    <Ionicons name={icon} size={20} color={active ? colors.ember : colors.stone} />
                    <Text style={{ fontWeight: '600', color: active ? colors.ember : colors.ink }}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: colors.ember }]}
              onPress={() => {
                setShowManagePrivacy(false);
                updatePrivacy(editingPrivacy);
              }}
            >
              <Text style={styles.primaryButtonText}>Save Privacy</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Join Request Modal */}
      <Modal visible={showJoinModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ width: '100%' }}>
            <View style={[styles.modalSheet, { backgroundColor: colors.white, maxHeight: '85%' }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.ink }]}>Join {circle.name}</Text>
                <TouchableOpacity onPress={() => setShowJoinModal(false)}>
                  <Ionicons name="close" size={24} color={colors.ink} />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={{ color: colors.stone, marginBottom: 20, fontSize: 13 }}>Please answer the following questions to join this circle.</Text>
                
                {(circle.join_questions || []).map((q, idx) => (
                  <View key={q.id} style={{ marginBottom: 20 }}>
                    <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 14, marginBottom: 8 }}>{q.text}</Text>
                    {q.type === 'checkbox' && (
                      <TouchableOpacity onPress={() => setJoinAnswers({...joinAnswers, [q.id]: !joinAnswers[q.id]})} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Ionicons name={joinAnswers[q.id] ? "checkbox" : "square-outline"} size={24} color={joinAnswers[q.id] ? colors.ember : colors.stone} />
                        <Text style={{ color: colors.ink, flex: 1 }}>I agree to this rule</Text>
                      </TouchableOpacity>
                    )}
                    {q.type === 'yes_no' && (
                      <View style={{ flexDirection: 'row', gap: 12 }}>
                        {['Yes', 'No'].map(opt => (
                          <TouchableOpacity key={opt} onPress={() => setJoinAnswers({...joinAnswers, [q.id]: opt})} style={{ paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: joinAnswers[q.id] === opt ? colors.ember : colors.fog, backgroundColor: joinAnswers[q.id] === opt ? colors.ember + '15' : colors.snow }}>
                            <Text style={{ color: joinAnswers[q.id] === opt ? colors.ember : colors.stone, fontWeight: '600' }}>{opt}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                    {q.type === 'text' && (
                      <TextInput
                        style={[styles.input, { color: colors.ink, backgroundColor: colors.snow, borderColor: colors.fog }]}
                        placeholder="Your answer..."
                        placeholderTextColor={colors.ash}
                        value={joinAnswers[q.id] || ''}
                        onChangeText={(txt) => setJoinAnswers({...joinAnswers, [q.id]: txt})}
                      />
                    )}
                  </View>
                ))}

                <TouchableOpacity 
                  style={[styles.createSubmitBtn, { backgroundColor: colors.ember, marginTop: 20, opacity: joining ? 0.6 : 1 }]}
                  onPress={() => {
                    const allRulesChecked = (circle.join_questions || []).filter(q => q.type === 'checkbox').every(q => joinAnswers[q.id] === true);
                    if (!allRulesChecked) {
                      Alert.alert('Incomplete', 'You must agree to all rules to join.');
                      return;
                    }
                    Alert.alert('Terms & Conditions', 'Do You Agree To Follow The Terms For This Circle?', [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'I Agree', onPress: () => processJoin(joinAnswers) }
                    ]);
                  }}
                  disabled={joining}
                >
                  {joining ? <ActivityIndicator color="#fff" /> : <Text style={styles.createSubmitText}>Submit Request</Text>}
                </TouchableOpacity>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Edit Join Rules Modal */}
      <Modal visible={showEditRules} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ width: '100%' }}>
            <View style={[styles.modalSheet, { backgroundColor: colors.white, maxHeight: '85%' }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.ink }]}>Edit Join Rules</Text>
                <TouchableOpacity onPress={() => setShowEditRules(false)}>
                  <Ionicons name="close" size={24} color={colors.ink} />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <Text style={{ color: colors.stone, fontSize: 13 }}>These rules apply to new members joining.</Text>
                  <TouchableOpacity onPress={() => setEditQuestions([...editQuestions, { id: Date.now().toString(), type: 'checkbox', text: '' }])} style={{ paddingHorizontal: 8, paddingVertical: 4, backgroundColor: colors.fog, borderRadius: 4 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: colors.ink }}>+ Add</Text>
                  </TouchableOpacity>
                </View>

                {editQuestions.length > 0 ? (
                  <View style={{ gap: 12, marginBottom: 20 }}>
                    {editQuestions.map((q, idx) => (
                      <View key={q.id} style={{ borderWidth: 1, borderColor: colors.fog, borderRadius: 8, padding: 12, backgroundColor: colors.snow }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.ink }}>Question {idx + 1}</Text>
                          <TouchableOpacity onPress={() => setEditQuestions(editQuestions.filter(x => x.id !== q.id))}>
                            <Ionicons name="trash-outline" size={16} color={colors.danger} />
                          </TouchableOpacity>
                        </View>
                        
                        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                          {['checkbox', 'text', 'yes_no'].map(t => (
                            <TouchableOpacity key={t} onPress={() => {
                              const nq = [...editQuestions];
                              nq[idx].type = t;
                              setEditQuestions(nq);
                            }} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, backgroundColor: q.type === t ? colors.ember + '33' : colors.fog }}>
                              <Text style={{ fontSize: 11, fontWeight: '600', color: q.type === t ? colors.ember : colors.stone }}>{t === 'checkbox' ? 'Rule/Agree' : t === 'text' ? 'Text Input' : 'Yes/No'}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>

                        <TextInput
                          style={[styles.input, { marginBottom: 0, paddingVertical: 8, color: colors.ink, backgroundColor: colors.white, borderColor: colors.fog }]}
                          placeholder="e.g. Do you agree to be respectful?"
                          placeholderTextColor={colors.ash}
                          value={q.text}
                          onChangeText={(txt) => {
                            const nq = [...editQuestions];
                            nq[idx].text = txt;
                            setEditQuestions(nq);
                          }}
                        />
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={{ fontSize: 13, color: colors.stone, marginBottom: 20, fontStyle: 'italic' }}>No questions added. Users will join directly after agreeing to terms.</Text>
                )}

                <TouchableOpacity 
                  style={[styles.createSubmitBtn, { backgroundColor: colors.ember, marginTop: 10, opacity: savingRules ? 0.6 : 1 }]}
                  onPress={saveRules}
                  disabled={savingRules}
                >
                  {savingRules ? <ActivityIndicator color="#fff" /> : <Text style={styles.createSubmitText}>Save Rules</Text>}
                </TouchableOpacity>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

    </View>
  );
}

// ── Main Circles Screen ───────────────────────────────────────────────────────
export default function CirclesScreen({ navigation }) {
  const { colors, shadow } = useTheme();
  const styles = getStyles(colors);
  const [circles, setCircles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [myUid, setMyUid] = useState(null);
  const [activeCircle, setActiveCircle] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState('All');
  const [query, setQuery] = useState('');

  // Create form state
  const [cName, setCName] = useState('');
  const [cDesc, setCDesc] = useState('');
  const [cCategory, setCCategory] = useState('General');
  const [cPrivacy, setCPrivacy] = useState('public');
  const [cCover, setCCover] = useState(null);
  const [cQuestions, setCQuestions] = useState([]);
  const [creating, setCreating] = useState(false);
  const [showCircleCoverSheet, setShowCircleCoverSheet] = useState(false);
  const [showCircleCoverGifPicker, setShowCircleCoverGifPicker] = useState(false);

  const resolveUid = async () => {
    // Primary: Supabase session. Fallback: Firebase session stored in AsyncStorage.
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id) return session.user.id;
    } catch {}
    const firebaseSession = await getSession();
    return firebaseSession?.uid ?? null;
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const uid = await resolveUid();
      if (!uid) return;
      setMyUid(uid);

      const { data } = await supabase
        .from('circles')
        .select('*, circle_members(count)')
        .order('created_at', { ascending: false });

      const circleIds = (data ?? []).map((circle) => circle.id);
      const [{ data: memberships }, { data: requests }] = await Promise.all([
        circleIds.length ? supabase.from('circle_members').select('circle_id, role').eq('user_id', uid).in('circle_id', circleIds) : Promise.resolve({ data: [] }),
        circleIds.length ? supabase.from('circle_join_requests').select('circle_id').eq('user_id', uid).eq('status', 'pending').in('circle_id', circleIds) : Promise.resolve({ data: [] }),
      ]);
      const membershipMap = Object.fromEntries((memberships ?? []).map((membership) => [membership.circle_id, membership.role]));
      const requestIds = new Set((requests ?? []).map((request) => request.circle_id));

      const enriched = (data ?? []).map(c => ({
        ...c,
        member_count: c.circle_members?.[0]?.count ?? 0,
        member_previews: [],
        membership_status: c.owner_id === uid ? 'owner' : membershipMap[c.id] ? 'member' : requestIds.has(c.id) ? 'requested' : null,
      }));
      setCircles(enriched);
    } catch (e) { console.log(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRefresh = () => { setRefreshing(true); load(); };

  const createCircle = async () => {
    if (!cName.trim()) { Alert.alert('Name required'); return; }
    setCreating(true);
    try {
      const { data, error } = await supabase.from('circles').insert({
        name: cName.trim(),
        description: cDesc.trim(),
        category: cCategory,
        privacy: cPrivacy,
        cover_image_url: cCover,
        owner_id: myUid,
        join_questions: cQuestions,
      }).select().single();
      if (error) throw error;

      // Auto-join as owner
      await supabase.from('circle_members').insert({ circle_id: data.id, user_id: myUid, role: 'owner' });

      setShowCreate(false);
      setCName(''); setCDesc(''); setCCategory('General'); setCPrivacy('public'); setCCover(null); setCQuestions([]);
      load();
    } catch (e) { Alert.alert('Error', e.message); }
    finally { setCreating(false); }
  };

  const handlePickCover = () => setShowCircleCoverSheet(true);

  const handleAddCoverPhoto = async () => {
    const url = await pickAndUploadPhoto(myUid);
    if (url) setCCover(url);
    setShowCircleCoverSheet(false);
  };

  const handleAddCoverGif = () => {
    setShowCircleCoverSheet(false);
    setShowCircleCoverGifPicker(true);
  };

  const displayed = circles.filter((circle) => {
    const matchesCategory = filter === 'All' || circle.category === filter;
    const search = query.trim().toLowerCase();
    return matchesCategory && (!search || `${circle.name} ${circle.description ?? ''} ${circle.category}`.toLowerCase().includes(search));
  });

  const handleCircleAction = async (circle) => {
    if (circle.membership_status === 'member' || circle.membership_status === 'owner' || circle.membership_status === 'requested') {
      setActiveCircle(circle);
      return;
    }
    if (circle.join_questions?.length) {
      setActiveCircle(circle);
      return;
    }
    try {
      const { error } = await supabase.from('circle_members').insert({ circle_id: circle.id, user_id: myUid });
      if (error) throw error;
      setCircles((current) => current.map((item) => item.id === circle.id ? { ...item, membership_status: 'member', member_count: (item.member_count ?? 0) + 1 } : item));
    } catch (e) {
      Alert.alert('Could not join circle', e.message);
    }
  };

  const patchCircleInList = useCallback((updated) => {
    setCircles((prev) =>
      prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c))
    );
    setActiveCircle((prev) =>
      prev?.id === updated.id ? { ...prev, ...updated } : prev
    );
  }, []);

  if (activeCircle) {
    return (
      <CircleDetail
        circle={activeCircle}
        myUid={myUid}
        colors={colors}
        shadow={shadow}
        onCircleUpdated={patchCircleInList}
        onBack={() => {
          setActiveCircle(null);
          load();
        }}
        onOpenProfile={(u) => { if (u) navigation?.navigate('UserProfile', { userId: u.id }); }}
      />
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.snow }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.snow }]}>
        <Text style={[styles.logo, { color: colors.ink }]}>Circles</Text>
        <TouchableOpacity style={styles.createBtn} onPress={() => setShowCreate(true)}>
          <Ionicons name="add" size={17} color="#FFFFFF" />
          <Text style={styles.createBtnText}>Create Circle</Text>
        </TouchableOpacity>
        <Text style={[styles.headerSubtitle, { color: colors.stone }]}>Find your people</Text>
      </View>

      {/* Category filter */}
      <View style={styles.discoveryControls}>
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={19} color={colors.stone} />
          <TextInput value={query} onChangeText={setQuery} placeholder="Search circles..." placeholderTextColor={colors.ash} style={styles.searchInput} returnKeyType="search" />
          {query ? <TouchableOpacity onPress={() => setQuery('')}><Ionicons name="close-circle" size={18} color={colors.ash} /></TouchableOpacity> : null}
        </View>
        <ScrollView horizontal nestedScrollEnabled={true} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {['All', ...CATEGORIES].map(cat => {
            const active = filter === cat;
            return (
              <TouchableOpacity
                key={cat}
                style={[styles.filterTab, active && styles.filterTabActive]}
                onPress={() => setFilter(cat)}
              >
                {cat !== 'All' ? <Ionicons name={CATEGORY_ICONS[cat]} size={14} color={active ? '#FFFFFF' : colors.stone} /> : null}
                <Text style={[styles.filterTabText, active && styles.filterTabTextActive]}>{cat}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Circles list */}
      {loading ? (
        <SkeletonFeed itemCount={3} ItemComponent={SkeletonCircleCard} style={{ paddingHorizontal: 16 }} />
      ) : (
        <FlatList
          data={displayed}
          keyExtractor={i => i.id}
          contentContainerStyle={[styles.grid, { paddingBottom: 110 }]}
          initialNumToRender={5}
          maxToRenderPerBatch={5}
          windowSize={7}
          removeClippedSubviews
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.ember} />
          }
          ListEmptyComponent={(
            <View style={styles.emptyBox}>
              <Ionicons name="people-circle-outline" size={56} color={colors.ash} />
              <Text style={[styles.emptyTitle, { color: colors.ink }]}>{query ? 'No circles found' : 'No circles yet'}</Text>
              <Text style={[styles.emptyText, { color: colors.stone }]}>{query ? 'Try a different search or category.' : 'Your community is waiting to be created.'}</Text>
              {!query && <TouchableOpacity style={styles.emptyCreateBtn} onPress={() => setShowCreate(true)}><Text style={styles.emptyCreateText}>Create Circle</Text></TouchableOpacity>}
            </View>
          )}
          renderItem={({ item }) => (
            <CircleCard circle={item} onPress={() => setActiveCircle(item)} onAction={() => handleCircleAction(item)} colors={colors} />
          )}
        />
      )}

      {/* Create Modal */}
      <AttachmentSheet
        visible={showCircleCoverSheet}
        onClose={() => setShowCircleCoverSheet(false)}
        title="Add circle cover"
        options={[
          { key: 'image', label: 'Photo', icon: 'image-outline', iconColor: '#3b82f6', bgColor: '#3b82f620', onPress: handleAddCoverPhoto },
          { key: 'gif', label: 'GIF', icon: 'sparkles-outline', iconColor: '#f59e0b', bgColor: '#f59e0b20', onPress: handleAddCoverGif },
        ]}
      />

      <Modal visible={showCreate} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ width: '100%' }}>
            <View style={[styles.modalSheet, { backgroundColor: colors.white }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.ink }]}>Create a Circle</Text>
                <TouchableOpacity onPress={() => setShowCreate(false)}>
                  <Ionicons name="close" size={24} color={colors.stone} />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.coverUploadBox}>
                  {cCover ? (
                    <ExpoImage source={{ uri: cCover }} style={styles.coverPreview} />
                  ) : null}
                  <TouchableOpacity style={styles.coverBtn} onPress={handlePickCover}>
                    <Ionicons name="camera" size={20} color={colors.ink} />
                    <Text style={[styles.coverBtnText, { color: colors.ink }]}>{cCover ? 'Change Cover' : 'Add Cover Photo or GIF'}</Text>
                  </TouchableOpacity>
                </View>

                <Text style={[styles.fieldLabel, { color: colors.stone }]}>Circle name *</Text>
                <TextInput
                  style={[styles.input, { color: colors.ink, backgroundColor: colors.snow, borderColor: colors.fog }]}
                  placeholder="e.g. Cupid Gaming Crew"
                  placeholderTextColor={colors.ash}
                  value={cName}
                  onChangeText={setCName}
                  maxLength={60}
                />

                <Text style={[styles.fieldLabel, { color: colors.stone }]}>Description</Text>
                <TextInput
                  style={[styles.input, styles.inputMulti, { color: colors.ink, backgroundColor: colors.snow, borderColor: colors.fog }]}
                  placeholder="What is this circle about?"
                  placeholderTextColor={colors.ash}
                  value={cDesc}
                  onChangeText={setCDesc}
                  multiline
                  maxLength={200}
                />

                <Text style={[styles.fieldLabel, { color: colors.stone }]}>Category</Text>
                <ScrollView horizontal nestedScrollEnabled={true} showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {CATEGORIES.map(cat => {
                      const active = cCategory === cat;
                      const col = CATEGORY_COLORS[cat];
                      return (
                        <TouchableOpacity
                          key={cat}
                          style={[
                            styles.modalFilterTab, 
                            { 
                              borderColor: active ? col : colors.fog,
                              backgroundColor: active ? col + '15' : colors.snow
                            }
                          ]}
                          onPress={() => setCCategory(cat)}
                        >
                          <Text style={[styles.modalFilterTabText, { color: active ? col : colors.stone }]}>{cat}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </ScrollView>

                <Text style={[styles.fieldLabel, { color: colors.stone }]}>Privacy</Text>
                <View style={styles.privacyRow}>
                  {[['public', 'globe-outline', 'Public'], ['private', 'lock-closed-outline', 'Private']].map(([val, icon, label]) => {
                    const active = cPrivacy === val;
                    return (
                      <TouchableOpacity
                        key={val}
                        style={[
                          styles.privacyOpt, 
                          { 
                            backgroundColor: active ? colors.ember + '15' : colors.snow, 
                            borderColor: active ? colors.ember : colors.fog 
                          }
                        ]}
                        onPress={() => setCPrivacy(val)}
                      >
                        <Ionicons name={icon} size={16} color={active ? colors.ember : colors.stone} />
                        <Text style={[styles.privacyOptText, { color: active ? colors.ember : colors.stone }]}>{label.toUpperCase()}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, marginBottom: 12 }}>
                  <Text style={[styles.fieldLabel, { color: colors.stone, marginBottom: 0 }]}>Join Questions & Rules</Text>
                  <TouchableOpacity onPress={() => setCQuestions([...cQuestions, { id: Date.now().toString(), type: 'checkbox', text: '' }])} style={{ paddingHorizontal: 8, paddingVertical: 4, backgroundColor: colors.fog, borderRadius: 4 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: colors.ink }}>+ Add</Text>
                  </TouchableOpacity>
                </View>

                {cQuestions.length > 0 ? (
                  <View style={{ gap: 12, marginBottom: 20 }}>
                    {cQuestions.map((q, idx) => (
                      <View key={q.id} style={{ borderWidth: 1, borderColor: colors.fog, borderRadius: 8, padding: 12, backgroundColor: colors.snow }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.ink }}>Question {idx + 1}</Text>
                          <TouchableOpacity onPress={() => setCQuestions(cQuestions.filter(x => x.id !== q.id))}>
                            <Ionicons name="trash-outline" size={16} color={colors.danger} />
                          </TouchableOpacity>
                        </View>
                        
                        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                          {['checkbox', 'text', 'yes_no'].map(t => (
                            <TouchableOpacity key={t} onPress={() => {
                              const nq = [...cQuestions];
                              nq[idx].type = t;
                              setCQuestions(nq);
                            }} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, backgroundColor: q.type === t ? colors.ember + '33' : colors.fog }}>
                              <Text style={{ fontSize: 11, fontWeight: '600', color: q.type === t ? colors.ember : colors.stone }}>{t === 'checkbox' ? 'Rule/Agree' : t === 'text' ? 'Text Input' : 'Yes/No'}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>

                        <TextInput
                          style={[styles.input, { marginBottom: 0, paddingVertical: 8, color: colors.ink, backgroundColor: colors.white, borderColor: colors.fog }]}
                          placeholder="e.g. Do you agree to be respectful?"
                          placeholderTextColor={colors.ash}
                          value={q.text}
                          onChangeText={(txt) => {
                            const nq = [...cQuestions];
                            nq[idx].text = txt;
                            setCQuestions(nq);
                          }}
                        />
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={{ fontSize: 13, color: colors.stone, marginBottom: 20, fontStyle: 'italic' }}>No questions added. Users will join directly after agreeing to terms.</Text>
                )}

                <TouchableOpacity
                  style={[styles.createSubmitBtn, { backgroundColor: colors.ember, opacity: creating ? 0.6 : 1 }]}
                  onPress={createCircle}
                  disabled={creating}
                >
                  {creating ? <ActivityIndicator color="#fff" /> : <Text style={styles.createSubmitText}>Create Circle</Text>}
                </TouchableOpacity>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <GiphyPicker
        visible={showCircleCoverGifPicker}
        onClose={() => setShowCircleCoverGifPicker(false)}
        contentTypes={[GIPHY_CONTENT_TYPES.GIF]}
        onSelect={(item) => {
          setCCover(item.mediaUrl);
          setShowCircleCoverGifPicker(false);
        }}
      />
    </View>
  );
}

const getStyles = (colors) => StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 42, paddingBottom: 18, position: 'relative' },
  logo: { fontSize: 28, fontWeight: '800', letterSpacing: -0.8 },
  headerSubtitle: { position: 'absolute', left: 20, bottom: 0, fontSize: 14 },
  createBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 11, paddingHorizontal: 14, borderRadius: 22, backgroundColor: colors.ember, shadowColor: colors.ember, shadowOpacity: 0.22, shadowOffset: { width: 0, height: 5 }, shadowRadius: 10, elevation: 4 },
  createBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },

  discoveryControls: { paddingTop: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.fog },
  searchBar: { height: 46, marginHorizontal: 16, backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.fog, alignItems: 'center', flexDirection: 'row', gap: 10, paddingHorizontal: 14, marginBottom: 14 },
  searchInput: { flex: 1, color: colors.ink, fontSize: 15, paddingVertical: 0 },
  filterRow: { paddingHorizontal: 16, gap: 8 },
  filterTab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 9, paddingHorizontal: 13, borderRadius: 20, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.fog },
  filterTabActive: { backgroundColor: colors.ember, borderColor: colors.ember },
  filterTabText: { fontSize: 13, fontWeight: '700', color: colors.stone },
  filterTabTextActive: { color: '#FFFFFF' },

  modalFilterTab: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 4, borderWidth: 1 },
  modalFilterTabText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },

  grid: { paddingHorizontal: 16, paddingTop: 20, gap: 18 },
  
  // Circle card
  card: { borderRadius: 24, overflow: 'hidden', backgroundColor: colors.white, borderWidth: 1, borderColor: colors.fog, shadowColor: '#000', shadowOpacity: 0.25, shadowOffset: { width: 0, height: 8 }, shadowRadius: 16, elevation: 6 },
  cardBanner: { width: '100%', aspectRatio: 16 / 9, backgroundColor: colors.fog, position: 'relative' },
  cardCoverImg: { width: '100%', height: '100%' },
  cardBannerFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cardBannerShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.12)' },
  categoryBadge: { position: 'absolute', left: 16, top: 14, flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6, paddingHorizontal: 9, borderRadius: 14 },
  categoryBadgeText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  cardIconBox: { width: 50, height: 50, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white, borderWidth: 1.5, position: 'absolute', bottom: -25, left: 16, zIndex: 2 },
  cardBody: { padding: 16, paddingTop: 34 },
  cardName: { fontSize: 20, fontWeight: '800', color: colors.ink, marginBottom: 6, letterSpacing: -0.4 },
  cardDesc: { fontSize: 14, lineHeight: 20, color: colors.stone, minHeight: 40 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, marginBottom: 14 },
  memberMeta: { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 1 },
  memberCountText: { fontSize: 12, color: colors.stone, fontWeight: '600' },
  onlineDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#22C55E', marginLeft: 3 },
  memberAvatars: { flexDirection: 'row', paddingLeft: 8 },
  memberAvatar: { width: 25, height: 25, borderRadius: 13, borderWidth: 2, borderColor: colors.white, backgroundColor: colors.fog },
  circleAction: { height: 44, borderRadius: 14, backgroundColor: colors.ember, alignItems: 'center', justifyContent: 'center' },
  circleActionJoined: { backgroundColor: colors.snow, borderWidth: 1, borderColor: colors.fog },
  circleActionText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  circleActionTextJoined: { color: colors.ink },

  emptyBox: { alignItems: 'center', paddingTop: 76, paddingHorizontal: 36, gap: 9 },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptyText: { fontSize: 14 },
  emptyCreateBtn: { marginTop: 12, backgroundColor: '#3B82F6', borderRadius: 22, paddingVertical: 12, paddingHorizontal: 20 },
  emptyCreateText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },

  // Detail
  detailCover: { width: '100%', height: 120 },
  detailHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 54, paddingBottom: 14, borderBottomWidth: 1 },
  headerLogoWrapper: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white, shadowRadius: 4, shadowOpacity: 0.3, elevation: 2 },
  backBtn: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.fog, backgroundColor: colors.snow },
  detailTitle: { fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  detailSub: { fontSize: 12 },
  roleBadge: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 12, borderWidth: 1, shadowRadius: 6, shadowOpacity: 0.4, elevation: 3 },
  roleBadgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  joinBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 6, backgroundColor: colors.snow, borderWidth: 1 },
  joinBtnText: { fontWeight: '800', fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase' },

  postCard: { borderRadius: radius.md, padding: 14, marginBottom: 12 },
  postImageFrame: { width: '100%', aspectRatio: 4 / 3, borderRadius: 8, marginVertical: 10, overflow: 'hidden', backgroundColor: colors.snow },
  postImage: { width: '100%', height: '100%' },
  imageViewerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.94)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  imageViewerImage: { width: '100%', height: '82%' },
  imageViewerClose: { position: 'absolute', top: 52, right: 20, zIndex: 2, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)' },
  postHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  postAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  postAvatarImg: { width: 36, height: 36 },
  postAuthor: { fontSize: 14, fontWeight: '700' },
  postUsername: { fontSize: 12, fontWeight: '600' },
  postTime: { fontSize: 10 },
  postContent: { fontSize: 14, lineHeight: 21 },

  // ── Chat-bubble post layout ──
  bubbleListContent: { padding: 12, paddingBottom: 24 },
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 10 },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubbleRowTheirs: { justifyContent: 'flex-start' },
  bubbleAvatar: { width: 30, height: 30, borderRadius: 15, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  bubbleAvatarImg: { width: 30, height: 30 },
  bubbleMetaLeft: { marginBottom: 4, marginLeft: 4 },
  bubbleAuthor: { fontSize: 12, fontWeight: '700' },
  bubbleUsername: { fontSize: 11, fontWeight: '500' },
  bubble: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 18,
    minWidth: 56,
  },
  bubbleMine: { borderBottomRightRadius: 4 },
  bubbleTheirs: { borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  bubbleMediaFrame: {
    width: 200,
    aspectRatio: 4 / 3,
    borderRadius: 12,
    marginBottom: 8,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  bubbleMedia: { width: '100%', height: '100%' },
  bubbleAudioRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2 },
  bubbleAudioText: { fontSize: 13, fontWeight: '600' },
  bubbleFooter: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 8 },
  bubbleFooterMine: { justifyContent: 'flex-end' },
  bubbleFooterTheirs: { justifyContent: 'flex-start' },
  bubbleTime: { fontSize: 10, fontWeight: '500' },
  bubbleDeleteBtn: { padding: 2 },
  mentionList: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  mentionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  mentionAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    overflow: 'hidden',
  },
  mentionName: { fontSize: 13, fontWeight: '700' },
  mentionUsername: { fontSize: 11 },

  inputBar: { padding: 12, borderTopWidth: 1 },
  inputBarRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  addBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  postAudioRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 12, paddingHorizontal: 14, borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.04)', marginVertical: 10,
  },
  postAudioText: { fontSize: 14, fontWeight: '600' },
  postMediaPlaceholder: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  postMediaPlaceholderText: { fontSize: 13, fontWeight: '600' },
  postImagePreviewWrapper: {
    position: 'relative',
    width: '100%',
    height: 140,
    marginBottom: 12,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.fog,
  },
  postImagePreview: { width: '100%', height: '100%' },
  postImageUploading: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  postImageUploadingText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  postImageRemove: { position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 14 },
  postInput: { flex: 1, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, maxHeight: 100 },
  sendBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  joinPrompt: { padding: 16, borderTopWidth: 1, alignItems: 'center' },
  joinPromptText: { fontSize: 14, fontWeight: '500' },

  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  modalSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '800' },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  settingText: { fontSize: 16, fontWeight: '600' },
  reasonBtn: { paddingVertical: 12, paddingHorizontal: 16, borderWidth: 1, borderRadius: 8, marginBottom: 10 },
  coverUploadBox: { height: 100, borderRadius: 8, backgroundColor: colors.fog, marginBottom: 16, overflow: 'hidden', justifyContent: 'center', alignItems: 'center', position: 'relative' },
  coverPreview: { position: 'absolute', width: '100%', height: '100%' },
  coverBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  coverBtnText: { fontSize: 12, fontWeight: '700' },
  fieldLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 16 },
  inputMulti: { minHeight: 80, paddingTop: 12, textAlignVertical: 'top' },
  privacyRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  privacyOpt: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: radius.md, padding: 12 },
  privacyOptText: { fontWeight: '600', fontSize: 14 },
  createSubmitBtn: { borderRadius: radius.md, paddingVertical: 16, alignItems: 'center', marginTop: 4, marginBottom: 20 },
  createSubmitText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
