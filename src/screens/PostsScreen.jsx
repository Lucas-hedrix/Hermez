// screens/PostsScreen.jsx — community feed + create post
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ScrollView,
  TextInput, ActivityIndicator, Modal, KeyboardAvoidingView,
  Platform, Dimensions, Alert, RefreshControl, TouchableWithoutFeedback, Image as RNImage} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Animated as RNAnimated } from 'react-native';
import { radius } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import { supabase } from '../supabase/client';
import { pickAndUploadPhoto } from '../supabase/storage';
import SparkBurst from '../components/SparkBurst';
import { SkeletonActivityItem, SkeletonFeed, SkeletonPost, SkeletonSearchResult } from '../components/Skeleton';
import { deletePost, canDeletePost } from '../services/posts';
import { getPlaceholderUrl } from '../utils/placeholders';
import { sendPostNotification } from '../utils/notifications';
import { POST_TYPES, getPostType, DEFAULT_POST_TYPE } from '../constants/postTypes';
import { isVibeExpired } from '../constants/vibes';
import MentionText from '../components/MentionText';
import { extractMentionUsernames, getActiveMentionQuery } from '../utils/mentions';
import AttachmentSheet from '../components/AttachmentSheet';
import GiphyPicker from '../components/GiphyPicker';
import { GIPHY_CONTENT_TYPES, trackGiphyAction } from '../services/giphy';


const { width: W } = Dimensions.get('window');
const FEED_IMAGE_MAX_HEIGHT = Math.round(W * 1.25);

/** Full-width feed image that keeps the source aspect ratio without cropping. */
function FeedMediaImage({ uri, style, maxHeight = FEED_IMAGE_MAX_HEIGHT }) {
  const [ratio, setRatio] = useState(4 / 5);

  useEffect(() => {
    if (!uri) return;
    let alive = true;
    RNImage.getSize(
      uri,
      (w, h) => {
        if (!alive || !w || !h) return;
        const next = w / h;
        const heightAtFullWidth = W / next;
        if (heightAtFullWidth > maxHeight) {
          setRatio(W / maxHeight);
        } else {
          setRatio(next);
        }
      },
      () => { if (alive) setRatio(4 / 5); },
    );
    return () => { alive = false; };
  }, [uri, maxHeight]);

  return (
    <ExpoImage
      source={{ uri }}
      style={[{ width: '100%', aspectRatio: ratio, backgroundColor: 'transparent' }, style]}
      contentFit="contain"
    />
  );
}

function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function PostCard({ post, myUid, myVibe, onOpenComments, onOpenShare, onOpenProfile, onOpenImage, onDelete, canDelete, onLike, onSpark, onOpenLikes }) {
  const { colors, shadow, isDark } = useTheme();
  const pc = getPcStyles(colors, isDark);

  const type = getPostType(post.post_type);

  // Use passed props or local fallback for optimistic UI
  const [optimisticLiked, setOptimisticLiked] = useState(post.liked || false);
  const [optimisticCount, setOptimisticCount] = useState(post.like_count || 0);

  // Spark = a vibe signal on the content itself (distinct from ♡ Like).
  const [optimisticSparked, setOptimisticSparked]     = useState(post.sparked || false);
  const [optimisticSparkCount, setOptimisticSparkCount] = useState(post.spark_count || 0);
  const [burst, setBurst]             = useState(0);      // one-shot SparkBurst trigger
  const [showSparkSent, setShowSparkSent] = useState(false); // ~1s "Spark sent" micro-copy
  const sparkSentTimer = useRef(null);
  const lastTapRef = useRef(0);

  const handleDoubleTap = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      if (!optimisticSparked) toggleSpark();
    }
    lastTapRef.current = now;
  };

  // Sync optimistic state if props change (e.g. on refresh)
  useEffect(() => {
    setOptimisticLiked(post.liked || false);
    setOptimisticCount(post.like_count || 0);
  }, [post.liked, post.like_count]);

  useEffect(() => {
    setOptimisticSparked(post.sparked || false);
    setOptimisticSparkCount(post.spark_count || 0);
  }, [post.sparked, post.spark_count]);

  useEffect(() => () => { if (sparkSentTimer.current) clearTimeout(sparkSentTimer.current); }, []);

  const isOwn = post.user_id === myUid;
  const hasImage = !!post.image_url;
  const hasCaption = !!post.caption?.trim();

  const handleDelete = () => {
    Alert.alert(
      'Delete post?',
      'This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => onDelete?.(post) },
      ]
    );
  };

  const toggleLike = () => {
    const newLiked = !optimisticLiked;
    setOptimisticLiked(newLiked);
    setOptimisticCount(c => newLiked ? c + 1 : Math.max(0, c - 1));
    if (newLiked) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onLike?.(post, newLiked);
  };

  const toggleSpark = () => {
    const newSparked = !optimisticSparked;
    setOptimisticSparked(newSparked);
    setOptimisticSparkCount(c => newSparked ? c + 1 : Math.max(0, c - 1));
    if (newSparked) {
      // animation = consequence: burst + stronger haptic + a beat of micro-copy.
      setBurst(b => b + 1);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setShowSparkSent(true);
      if (sparkSentTimer.current) clearTimeout(sparkSentTimer.current);
      sparkSentTimer.current = setTimeout(() => setShowSparkSent(false), 1100);
    }
    onSpark?.(post, newSparked);
  };

  // Discovery cue (real data only) — conversation takes priority over sparks.
  const cue = (post.comments_count || 0) > 0
    ? `${post.comments_count} ${post.comments_count === 1 ? 'person is' : 'people are'} talking`
    : optimisticSparkCount > 0
      ? `${optimisticSparkCount} connected with this vibe`
      : null;

  const authorVibeActive = post.users?.current_vibe && !isVibeExpired(post.users?.vibe_set_at);
  const sameVibe = !isOwn && authorVibeActive && myVibe && post.users.current_vibe === myVibe;

  return (
    <View style={[pc.card, shadow.soft]}>

      <View style={pc.cardInner}>
        {/* Header: author + type badge */}
        <View style={pc.header}>
          <TouchableOpacity style={pc.authorBlock} onPress={() => onOpenProfile(post.users)} activeOpacity={0.7}>
            <View style={[pc.avatarRing, { borderColor: type.color + '66' }]}>
              <View style={[pc.avatar, { backgroundColor: colors.emberLight }]}>
                {post.users?.photo_urls?.[0]
                  ? <ExpoImage source={{ uri: post.users.photo_urls[0] }} style={[StyleSheet.absoluteFillObject, {width: "100%", height: "100%"}] } />
                  : <ExpoImage source={{ uri: getPlaceholderUrl(post.users?.name) }} style={[StyleSheet.absoluteFillObject, {width: "100%", height: "100%"}] } />}
              </View>
            </View>
            <View style={pc.authorMeta}>
              <View style={pc.nameRow}>
                <Text style={pc.authorName} numberOfLines={1}>{post.users?.name ?? 'Someone'}</Text>
                {isOwn && (
                  <View style={pc.ownBadge}>
                    <Text style={pc.ownBadgeText}>You</Text>
                  </View>
                )}
              </View>
              <View style={pc.metaRow}>
                <Text style={pc.timeAgo}>{timeAgo(post.created_at)}</Text>
                <View style={pc.metaDot} />
                <Ionicons
                  name={post.visibility === 'friends' ? 'people' : 'globe-outline'}
                  size={11}
                  color={colors.ash}
                />
                <Text style={pc.visibilityText}>
                  {post.visibility === 'friends' ? 'Friends' : 'Public'}
                </Text>
              </View>
            </View>
          </TouchableOpacity>

          <View style={pc.headerRight}>
            <View style={[pc.typeBadge, { backgroundColor: type.color + (isDark ? '22' : '14') }]}>
              <Ionicons name={type.icon} size={14} color={type.color} />
              <Text style={[pc.typeBadgeText, { color: type.color }]}>{type.label}</Text>
            </View>
            {canDelete && (
              <TouchableOpacity onPress={handleDelete} hitSlop={10} style={pc.moreBtn}>
                <Ionicons name="ellipsis-horizontal" size={18} color={colors.ash} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Body: media first (standard layout), then caption */}
        <TouchableWithoutFeedback onPress={handleDoubleTap}>
          <View>
            {hasImage && (
              <TouchableOpacity
                style={[pc.mediaFrame, { marginBottom: hasCaption ? 12 : 12 }]}
                onPress={() => onOpenImage?.(post.image_url)}
                activeOpacity={0.9}
              >
                <FeedMediaImage uri={post.image_url} style={pc.postImage} />
              </TouchableOpacity>
            )}

            {hasCaption && (
              <MentionText
                text={post.caption}
                style={[
                  pc.caption,
                  !hasImage && pc.captionFeatured,
                  type.id === 'hot_take' && pc.captionHotTake,
                ]}
                mentionStyle={{ color: colors.ember, fontWeight: '700' }}
              />
            )}

            {type.id === 'question' && (
              <TouchableOpacity style={pc.actionPrompt} onPress={() => onOpenComments(post)} activeOpacity={0.8}>
                <Text style={pc.actionPromptText}>Answer this <Ionicons name="chatbubble-ellipses" size={14} color={colors.ember} style={{ marginLeft: 4, marginTop: -2 }} /></Text>
              </TouchableOpacity>
            )}

            {type.id === 'challenge' && (
              <TouchableOpacity style={pc.actionPrompt} onPress={() => onOpenComments(post)} activeOpacity={0.8}>
                <Text style={pc.actionPromptText}>Accept Challenge <Ionicons name="flag" size={14} color={colors.ember} style={{ marginLeft: 4, marginTop: -2 }} /></Text>
              </TouchableOpacity>
            )}
          </View>
        </TouchableWithoutFeedback>

        {/* Social proof strip */}
        {(cue || sameVibe) && (
          <View style={pc.cueRow}>
            {cue && (
              <View style={pc.cueChip}>
                <Ionicons
                  name={(post.comments_count || 0) > 0 ? 'chatbubbles-outline' : 'sparkles-outline'}
                  size={12}
                  color={colors.stone}
                />
                <Text style={pc.cueText}>{cue}</Text>
              </View>
            )}
            {sameVibe && (
              <View style={pc.sameVibePill}>
                <Ionicons name="sparkles" size={11} color={colors.gold} />
                <Text style={pc.sameVibeText}>Same vibe</Text>
              </View>
            )}
          </View>
        )}

        {/* Engagement toolbar — equal pills, not a timeline icon row */}
        <View style={pc.actions}>
          <View style={[pc.actionPill, optimisticLiked && pc.actionPillLiked]}>
            <TouchableOpacity style={pc.actionPillHit} onPress={toggleLike} activeOpacity={0.75} hitSlop={4}>
              <Ionicons
                name={optimisticLiked ? 'heart' : 'heart-outline'}
                size={16}
                color={optimisticLiked ? colors.ember : colors.stone}
              />
              {optimisticCount === 0 && <Text style={[pc.actionPillLabel, optimisticLiked && { color: colors.ember }]}>Like</Text>}
            </TouchableOpacity>
            {optimisticCount > 0 && (
              <TouchableOpacity onPress={() => onOpenLikes(post)} hitSlop={6} activeOpacity={0.7}>
                <Text style={[pc.actionPillLabel, optimisticLiked && { color: colors.ember }]}>{optimisticCount}</Text>
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity style={pc.actionPill} onPress={() => onOpenComments(post)} activeOpacity={0.75}>
            <Ionicons name="chatbubble-ellipses-outline" size={15} color={colors.stone} />
            <Text style={pc.actionPillLabel}>{(post.comments_count || 0) > 0 ? post.comments_count : 'Talk'}</Text>
          </TouchableOpacity>

          <View style={pc.sparkWrap}>
            <TouchableOpacity style={[pc.actionPill, optimisticSparked && pc.actionPillSparked]} onPress={toggleSpark} activeOpacity={0.75}>
              <Ionicons name={optimisticSparked ? 'sparkles' : 'sparkles-outline'} size={15} color={optimisticSparked ? colors.gold : colors.stone} />
              <Text style={[pc.actionPillLabel, optimisticSparked && { color: colors.gold }]}>{optimisticSparkCount > 0 ? optimisticSparkCount : 'Spark'}</Text>
            </TouchableOpacity>
            <View style={StyleSheet.absoluteFill} pointerEvents="none"><SparkBurst trigger={burst} color={colors.gold} /></View>
          </View>

          <TouchableOpacity style={pc.shareBtn} onPress={() => onOpenShare(post)} hitSlop={8}>
            <Ionicons name="arrow-redo-outline" size={17} color={colors.ash} />
          </TouchableOpacity>
        </View>
      </View>

      {showSparkSent && (
        <Animated.View
          entering={FadeIn.duration(160)}
          exiting={FadeOut.duration(220)}
          style={pc.sparkSentBubble}
          pointerEvents="none"
        >
          <Text style={pc.sparkSentText}>Spark sent ✨</Text>
        </Animated.View>
      )}
    </View>
  );
}

const getPcStyles = (colors, isDark) => StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    marginHorizontal: 16,
    marginBottom: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.06)' : colors.fog,
  },

  cardInner: {
    flex: 1,
    paddingTop: 14,
    paddingBottom: 12,
    paddingHorizontal: 14,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 12,
  },
  authorBlock: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    minWidth: 0,
  },
  avatarRing: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    overflow: 'hidden',
  },
  authorMeta: { flex: 1, minWidth: 0, gap: 3 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  authorName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  timeAgo: { fontSize: 12, color: colors.ash, fontWeight: '500' },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.ash,
    opacity: 0.55,
  },
  visibilityText: { fontSize: 12, color: colors.ash, fontWeight: '500' },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 2,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.full,
  },
  typeBadgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },
  ownBadge: {
    backgroundColor: colors.emberLight,
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  ownBadgeText: { fontSize: 10, color: colors.ember, fontWeight: '700' },
  moreBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : colors.fog + '88',
  },

  // Content
  caption: {
    fontSize: 15,
    color: colors.graphite,
    lineHeight: 22,
    letterSpacing: -0.1,
    marginBottom: 12,
  },
  captionFeatured: {
    fontSize: 17,
    lineHeight: 26,
    color: colors.ink,
    fontWeight: '500',
    letterSpacing: -0.25,
    marginBottom: 14,
  },
  captionHotTake: {
    fontStyle: 'italic',
    fontWeight: '800',
    color: colors.danger,
    fontSize: 18,
    lineHeight: 26,
  },
  actionPrompt: {
    marginTop: -4,
    marginBottom: 12,
    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : colors.fog,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    alignSelf: 'flex-start',
  },
  actionPromptText: {
    color: colors.ink,
    fontWeight: '700',
    fontSize: 14,
  },
  mediaFrame: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginBottom: 12,
    backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : colors.fog,
    width: '100%',
  },
  postImage: {
    width: '100%',
  },
  imageViewerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  imageViewerImage: { width: '100%', height: '82%' },
  imageViewerClose: {
    position: 'absolute',
    top: 52,
    right: 20,
    zIndex: 2,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },

  // Social proof
  cueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  cueChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  cueText: { fontSize: 12.5, color: colors.stone, fontWeight: '500' },
  sameVibePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.goldLight,
    borderRadius: radius.full,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  sameVibeText: { fontSize: 11, fontWeight: '700', color: colors.gold },

  // Actions
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 4,
    position: 'relative',
  },
  actionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : colors.snow,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.06)' : colors.fog,
  },
  actionPillHit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  actionPillLiked: {
    backgroundColor: colors.emberLight,
    borderColor: colors.ember + '44',
  },
  actionPillSparked: {
    backgroundColor: colors.goldLight,
    borderColor: colors.gold + '44',
  },
  actionPillLabel: {
    fontSize: 13,
    color: colors.stone,
    fontWeight: '600',
  },
  sparkWrap: { position: 'relative' },
  shareBtn: {
    marginLeft: 'auto',
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : colors.snow,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.06)' : colors.fog,
  },
  sparkSentBubble: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  sparkSentText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFF',
    backgroundColor: 'rgba(249, 194, 46, 0.95)',
    borderRadius: radius.xl,
    paddingHorizontal: 24,
    paddingVertical: 14,
    overflow: 'hidden',
  },
});

// ── Create Post Modal ────────────────────────────────────────────────────────

function CreatePostModal({ visible, onClose, onCreated, myUid }) {
  const { colors, shadow, isDark } = useTheme();
  const s = getStyles(colors, shadow, isDark);
  const cm = getCmStyles(colors);
  const [caption,   setCaption]   = useState('');
  const [imageUri,  setImageUri]  = useState(null);
  const [visibility, setVisibility] = useState('public');
  const [postType,  setPostType]  = useState(DEFAULT_POST_TYPE.id);
  const [uploading, setUploading] = useState(false);
  const [posting,   setPosting]   = useState(false);
  const [mentionFriends, setMentionFriends] = useState([]);
  const [mentionQuery, setMentionQuery] = useState(null);

  const activeType = getPostType(postType);

  const reset = () => {
    setCaption('');
    setImageUri(null);
    setVisibility('public');
    setPostType(DEFAULT_POST_TYPE.id);
    setMentionQuery(null);
  };

  useEffect(() => {
    if (!visible || !myUid) return;
    (async () => {
      const { data: friendships } = await supabase
        .from('friendships')
        .select('requester_id, recipient_id')
        .eq('status', 'accepted')
        .or(`requester_id.eq.${myUid},recipient_id.eq.${myUid}`);
      const friendIds = (friendships ?? []).map((f) =>
        f.requester_id === myUid ? f.recipient_id : f.requester_id,
      );
      if (friendIds.length === 0) {
        setMentionFriends([]);
        return;
      }
      const { data: users } = await supabase
        .from('users')
        .select('id, name, username, photo_urls')
        .in('id', friendIds)
        .not('username', 'is', null);
      setMentionFriends(users ?? []);
    })();
  }, [visible, myUid]);

  const handleCaptionChange = (val) => {
    setCaption(val);
    setMentionQuery(getActiveMentionQuery(val));
  };

  const insertMention = (user) => {
    if (!mentionQuery || !user?.username) return;
    const before = caption.slice(0, mentionQuery.start);
    const after = caption.slice(mentionQuery.start + 1 + mentionQuery.query.length);
    setCaption(`${before}@${user.username} ${after}`);
    setMentionQuery(null);
  };

  const mentionSuggestions = mentionQuery
    ? mentionFriends.filter((f) =>
        f.username?.toLowerCase().includes(mentionQuery.query.toLowerCase()),
      ).slice(0, 6)
    : [];

  const notifyMentions = async (txt, myName, postId) => {
    const usernames = extractMentionUsernames(txt);
    if (!usernames.length) return;
    const { sendMentionNotification } = await import('../utils/notifications');

    for (const username of usernames) {
      const user = mentionFriends.find((f) => f.username?.toLowerCase() === username);
      if (!user || user.id === myUid) continue;
      try {
        await supabase.from('notifications').insert({
          recipient_id: user.id,
          sender_id: myUid,
          post_id: postId,
          type: 'mention',
          title: 'You were mentioned',
          message: `${myName} mentioned you: "${txt.slice(0, 80)}"`,
        });
        await sendMentionNotification(user.id, myName, txt, { postId });
      } catch (err) {
        console.log('Error notifying mention:', err.message);
      }
    }
  };

  const handlePickImage = async () => {
    try {
      setUploading(true);
      const url = await pickAndUploadPhoto(myUid, { freeAspect: true });
      if (url) setImageUri(url);
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setUploading(false);
    }
  };

  const handlePost = async () => {
    if (!caption.trim() && !imageUri) {
      Alert.alert('Empty post', 'Add a caption or photo to post.');
      return;
    }
    try {
      setPosting(true);
      const { data: newPost, error } = await supabase.from('posts').insert({
        user_id:   myUid,
        caption:   caption.trim() || null,
        image_url: imageUri || null,
        post_type: postType,
        visibility,
        circle_id: null,
      }).select().single();
      if (error) throw error;

      try {
        const { data: friends } = await supabase.from('friendships')
          .select('*')
          .eq('status', 'accepted')
          .or(`requester_id.eq.${myUid},recipient_id.eq.${myUid}`);

        const { data: myData } = await supabase.from('users').select('name').eq('id', myUid).single();
        const myName = myData?.name || 'A friend';

        if (caption.trim()) {
          await notifyMentions(caption.trim(), myName, newPost.id);
        }

        if (friends && friends.length > 0) {
          const notifs = friends.map(f => {
            const friendId = f.requester_id === myUid ? f.recipient_id : f.requester_id;
            return {
              recipient_id: friendId,
              sender_id: myUid,
              post_id: newPost.id,
              type: 'post',
              title: 'New Post!',
              message: `${myName} just made a new post.`,
            };
          });

          if (notifs.length > 0) {
            await supabase.from('notifications').insert(notifs);
            const friendIds = notifs.map(n => n.recipient_id);
            await sendPostNotification(friendIds, myName, null, newPost.id);
          }
        }
      } catch (e) {
        console.log('Error notifying friends:', e.message);
      }

      reset(); onCreated(); onClose();
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setPosting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={cm.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={cm.header}>
          <TouchableOpacity onPress={() => { reset(); onClose(); }}>
            <Ionicons name="close" size={24} color={colors.stone} />
          </TouchableOpacity>
          <Text style={cm.title}>New post</Text>
          <TouchableOpacity onPress={handlePost} disabled={posting || uploading}>
            {posting
              ? <ActivityIndicator color={colors.ember} />
              : <Text style={[cm.postBtn, (!caption.trim() && !imageUri) && cm.postBtnDisabled]}>Post</Text>}
          </TouchableOpacity>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={cm.typeScroll}
          contentContainerStyle={cm.typeRow}
        >
          {POST_TYPES.map((t) => {
            const selected = t.id === postType;
            return (
              <TouchableOpacity
                key={t.id}
                style={[
                  cm.typePill,
                  selected && { backgroundColor: t.color + '22', borderColor: t.color },
                ]}
                onPress={() => setPostType(t.id)}
                activeOpacity={0.8}
              >
                <Ionicons name={t.icon} size={16} color={selected ? t.color : colors.ash} />
                <Text style={[cm.typePillText, selected && { color: t.color }]}>{t.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {imageUri && (
          <View style={cm.imagePreviewWrap}>
            <FeedMediaImage uri={imageUri} style={cm.imagePreview} maxHeight={320} />
            <TouchableOpacity style={cm.removeImage} onPress={() => setImageUri(null)}>
              <Ionicons name="close" size={14} color={colors.white} />
            </TouchableOpacity>
          </View>
        )}

        <TextInput
          style={cm.input}
          placeholder={activeType.placeholder}
          placeholderTextColor={colors.ash}
          multiline
          value={caption}
          onChangeText={handleCaptionChange}
          maxLength={500}
          autoFocus
        />
        <Text style={cm.charCount}>{caption.length}/500</Text>

        {mentionSuggestions.length > 0 ? (
          <View style={cm.mentionList}>
            {mentionSuggestions.map((f) => (
              <TouchableOpacity key={f.id} style={cm.mentionRow} onPress={() => insertMention(f)}>
                <View style={cm.mentionAvatar}>
                  {f.photo_urls?.[0] ? (
                    <ExpoImage source={{ uri: f.photo_urls[0] }} style={[StyleSheet.absoluteFillObject, {width: "100%", height: "100%"}] } borderRadius={14} />
                  ) : (
                    <ExpoImage source={{ uri: getPlaceholderUrl(f.name) }} style={[StyleSheet.absoluteFillObject, {width: "100%", height: "100%"}] } borderRadius={14} />
                  )}
                </View>
                <View>
                  <Text style={cm.mentionName}>{f.name}</Text>

              <Modal
                visible={!!viewingImage}
                animationType="fade"
                transparent
                onRequestClose={() => setViewingImage(null)}
              >
                <View style={pc.imageViewerOverlay}>
                  <TouchableOpacity
                    style={pc.imageViewerClose}
                    onPress={() => setViewingImage(null)}
                    hitSlop={12}
                  >
                    <Ionicons name="close" size={28} color="#FFFFFF" />
                  </TouchableOpacity>
                  {viewingImage ? (
                    <ExpoImage source={{ uri: viewingImage }} style={pc.imageViewerImage} contentFit="contain" />
                  ) : null}
                </View>
              </Modal>
                  <Text style={cm.mentionUsername}>@{f.username}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        <View style={cm.toolbar}>
          <TouchableOpacity style={cm.toolBtn} onPress={handlePickImage} disabled={uploading}>
            {uploading
              ? <ActivityIndicator color={colors.ember} size="small" />
              : <Ionicons name="image-outline" size={22} color={colors.ember} />}
            <Text style={cm.toolLabel}>Photo</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[cm.toolBtn, visibility === 'friends' && { backgroundColor: colors.emberLight }]}
            onPress={() => setVisibility(v => v === 'public' ? 'friends' : 'public')}
          >
            <Ionicons name={visibility === 'friends' ? "people" : "globe-outline"} size={22} color={visibility === 'friends' ? colors.ember : colors.stone} />
            <Text style={[cm.toolLabel, visibility === 'friends' && { color: colors.ember }]}>
              {visibility === 'public' ? 'Public' : 'Friends only'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const getCmStyles = (colors) => StyleSheet.create({
  root:   { flex: 1, backgroundColor: colors.white },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 58, paddingBottom: 14,
    borderBottomWidth: 1, borderColor: colors.fog,
  },
  title:           { fontSize: 17, fontWeight: '700', color: colors.ink },
  postBtn:         { fontSize: 16, fontWeight: '700', color: colors.ember },
  postBtnDisabled: { color: colors.ash },
  typeScroll:      { maxHeight: 52, flexGrow: 0 },
  typeRow:         { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  typePill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.full,
    borderWidth: 1, borderColor: colors.fog, backgroundColor: colors.snow,
  },
  typePillText:  { fontSize: 13, fontWeight: '700', color: colors.stone },
  imagePreviewWrap:{ position: 'relative', marginHorizontal: 20, marginTop: 16, borderRadius: radius.lg, overflow: 'hidden' },
  imagePreview:    { width: '100%' },
  removeImage: {
    position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center',
  },
  input:     { flex: 1, paddingHorizontal: 20, paddingTop: 16, fontSize: 17, color: colors.ink, lineHeight: 26, textAlignVertical: 'top' },
  charCount: { textAlign: 'right', paddingHorizontal: 20, fontSize: 12, color: colors.ash, paddingBottom: 8 },
  toolbar: {
    flexDirection: 'row', borderTopWidth: 1, borderColor: colors.fog,
    paddingHorizontal: 16, paddingVertical: 12, gap: 4,
    paddingBottom: Platform.OS === 'ios' ? 32 : 12,
  },
  toolBtn:   { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.full, backgroundColor: colors.snow },
  toolLabel: { fontSize: 14, color: colors.graphite, fontWeight: '500' },
  mentionList: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.fog,
    backgroundColor: colors.snow,
    overflow: 'hidden',
  },
  mentionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderBottomWidth: 1, borderBottomColor: colors.fog },
  mentionAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.fog, overflow: 'hidden' },
  mentionName: { fontSize: 14, fontWeight: '600', color: colors.ink },
  mentionUsername: { fontSize: 12, color: colors.ember },
});

// ── Comment Modal ────────────────────────────────────────────────────────────
function CommentModal({ visible, onClose, post, myUid, highlightCommentId }) {
  const { colors, shadow, isDark } = useTheme();
  const modals = getModalsStyles(colors);
  const [comments, setComments] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [replyingTo, setReplyingTo] = useState(null);
  const [selectedMedia, setSelectedMedia] = useState(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [attachmentSheetVisible, setAttachmentSheetVisible] = useState(false);
  const [giphyPickerVisible, setGiphyPickerVisible] = useState(false);
  const [mentionFriends, setMentionFriends] = useState([]);
  const [mentionQuery, setMentionQuery] = useState(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const glowAnim = useRef(new RNAnimated.Value(0)).current;
  const [isFocused, setIsFocused] = useState(false);

  const startGlow = () => {
    RNAnimated.timing(glowAnim, {
      toValue: 1,
      duration: 200,
      useNativeDriver: false,
    }).start();
  };

  const stopGlow = () => {
    RNAnimated.timing(glowAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
  };

  const glowBorderColor = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.fog, colors.ember],
  });

  const glowBorderWidth = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 2.5],
  });

  const glowShadow = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 8],
  });

  const glowShadowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.35],
  });

  useEffect(() => {
    if (text.trim() || replyingTo) {
      startGlow();
    } else if (!isFocused) {
      stopGlow();
    }
  }, [text, replyingTo]);

  useEffect(() => {
    if (!visible) {
      setReplyingTo(null);
      setText('');
      setMentionQuery(null);
      setSelectedMedia(null);
      setAttachmentSheetVisible(false);
      setGiphyPickerVisible(false);
    }
  }, [visible]);

  useEffect(() => {
    if (!visible || !myUid) return;
    (async () => {
      const { data: friendships } = await supabase
        .from('friendships')
        .select('requester_id, recipient_id')
        .eq('status', 'accepted')
        .or(`requester_id.eq.${myUid},recipient_id.eq.${myUid}`);
      const friendIds = (friendships ?? []).map((f) =>
        f.requester_id === myUid ? f.recipient_id : f.requester_id,
      );
      if (friendIds.length === 0) {
        setMentionFriends([]);
        return;
      }
      const { data: users } = await supabase
        .from('users')
        .select('id, name, username, photo_urls')
        .in('id', friendIds)
        .not('username', 'is', null);
      setMentionFriends(users ?? []);
    })();
  }, [visible, myUid]);

  useEffect(() => {
    if (!highlightCommentId || loading || !comments.length) return;
    const index = comments.findIndex((c) => c.id === highlightCommentId);
    if (index >= 0) {
      setTimeout(() => {
        listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
      }, 350);
    }
  }, [highlightCommentId, comments, loading]);

  const sortNewestFirst = (rows) =>
    [...rows].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const enrichComments = async (rows) => {
    if (!rows?.length) return [];
    const userIds = [...new Set(rows.map((c) => c.user_id))];
    const { data: usersData } = await supabase
      .from('users')
      .select('id, name, photo_urls')
      .in('id', userIds);
    const usersMap = new Map((usersData ?? []).map((u) => [u.id, u]));
    return rows.map((c) => ({ ...c, users: usersMap.get(c.user_id) }));
  };

  useEffect(() => {
    if (!visible || !post?.id) return;
    let channel;
    (async () => {
      setLoading(true);
      const { data: commentsData } = await supabase
        .from('post_comments')
        .select('*')
        .eq('post_id', post.id)
        .order('created_at', { ascending: false });

      setComments(await enrichComments(commentsData ?? []));
      setLoading(false);

      channel = supabase
        .channel(`comments:${post.id}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'post_comments', filter: `post_id=eq.${post.id}` },
          async (payload) => {
            if (payload.eventType === 'INSERT') {
              const { data: u } = await supabase
                .from('users')
                .select('name, photo_urls')
                .eq('id', payload.new.user_id)
                .single();
              setComments((prev) => {
                if (prev.some((c) => c.id === payload.new.id)) return prev;
                const filtered = prev.filter(
                  (c) => !(c.isOptimistic && c.text === payload.new.text && c.user_id === payload.new.user_id),
                );
                return sortNewestFirst([{ ...payload.new, users: u }, ...filtered]);
              });
            } else if (payload.eventType === 'UPDATE') {
              setComments((prev) =>
                prev.map((c) => (c.id === payload.new.id ? { ...c, ...payload.new } : c)),
              );
            } else if (payload.eventType === 'DELETE') {
              setComments((prev) => prev.filter((c) => c.id !== payload.old.id));
            }
          },
        )
        .subscribe();
    })();
    return () => { if (channel) supabase.removeChannel(channel); };
  }, [visible, post?.id]);

  const notifyUser = async (recipientId, myName, snippet, { isReply = false, commentId = null } = {}) => {
    if (!recipientId || recipientId === myUid) return;
    try {
      await supabase.from('notifications').insert({
        recipient_id: recipientId,
        sender_id: myUid,
        post_id: post.id,
        comment_id: commentId,
        type: 'comment',
        title: isReply ? 'New Reply' : 'New Comment!',
        message: isReply
          ? `${myName} replied: "${snippet}"`
          : `${myName} commented: "${snippet}"`,
      });
      const { sendCommentNotification } = await import('../utils/notifications');
      await sendCommentNotification(recipientId, myName, snippet, {
        postId: post.id,
        commentId,
      });
    } catch (err) {
      console.log('Error notifying comment:', err.message);
    }
  };

  const notifyMentions = async (txt, myName, commentId) => {
    const usernames = extractMentionUsernames(txt);
    if (!usernames.length) return;
    const { sendMentionNotification } = await import('../utils/notifications');

    for (const username of usernames) {
      const user = mentionFriends.find((f) => f.username?.toLowerCase() === username);
      if (!user || user.id === myUid) continue;
      try {
        await supabase.from('notifications').insert({
          recipient_id: user.id,
          sender_id: myUid,
          post_id: post.id,
          comment_id: commentId,
          type: 'mention',
          title: 'You were mentioned',
          message: `${myName} mentioned you: "${txt.slice(0, 80)}"`,
        });
        await sendMentionNotification(user.id, myName, txt, {
          postId: post.id,
          commentId,
        });
      } catch (err) {
        console.log('Error notifying mention:', err.message);
      }
    }
  };

  const handleTextChange = (val) => {
    setText(val);
    const active = getActiveMentionQuery(val);
    setMentionQuery(active);
  };

  const insertMention = (user) => {
    if (!mentionQuery || !user?.username) return;
    const before = text.slice(0, mentionQuery.start);
    const after = text.slice(mentionQuery.start + 1 + mentionQuery.query.length);
    setText(`${before}@${user.username} ${after}`);
    setMentionQuery(null);
    inputRef.current?.focus();
  };

  const mentionSuggestions = mentionQuery
    ? mentionFriends.filter((f) =>
        f.username?.toLowerCase().includes(mentionQuery.query.toLowerCase()),
      ).slice(0, 6)
    : [];

  const handleSend = async () => {
    if ((!text.trim() && !selectedMedia) || !post?.id || !myUid) return;
    const txt = text.trim();
    const parent = replyingTo;
    const media = selectedMedia;
    setText('');
    setReplyingTo(null);
    setSelectedMedia(null);

    const tempId = `temp-${Date.now()}`;
    const optimisticComment = {
      id: tempId,
      post_id: post.id,
      user_id: myUid,
      text: txt,
      media_url: media?.uri ?? null,
      media_type: media?.type ?? null,
      reply_to_id: parent?.id ?? null,
      created_at: new Date().toISOString(),
      likes: 0,
      users: { name: 'Posting...' },
      isOptimistic: true,
    };

    setComments((prev) => sortNewestFirst([optimisticComment, ...prev]));

    const insertPayload = {
      post_id: post.id,
      user_id: myUid,
      text: txt,
      media_url: media?.uri ?? null,
      media_type: media?.type ?? null,
      ...(parent?.id ? { reply_to_id: parent.id } : {}),
    };

    let { error, data: newComment } = await supabase
      .from('post_comments')
      .insert(insertPayload)
      .select()
      .single();

    // Graceful fallback if reply_to_id column isn't migrated yet.
    if (error && parent?.id) {
      ({ error, data: newComment } = await supabase
        .from('post_comments')
        .insert({
          post_id: post.id,
          user_id: myUid,
          text: txt,
          media_url: media?.uri ?? null,
          media_type: media?.type ?? null,
        })
        .select()
        .single());
    }

    if (error) {
      setComments((prev) => prev.filter((c) => c.id !== tempId));
      Alert.alert('Error', 'Failed to post comment.');
      return;
    }

    const commentId = newComment?.id ?? null;

    if (media?.isGiphy) {
      trackGiphyAction(media, 'onsent', myUid);
    }

    try {
      const { data: me } = await supabase.from('users').select('name').eq('id', myUid).single();
      const myName = me?.name || 'Someone';

      if (post.user_id !== myUid) {
        const notificationSnippet = txt || (media?.type === GIPHY_CONTENT_TYPES.STICKER ? 'Sent a sticker' : 'Sent an image');
        await notifyUser(post.user_id, myName, notificationSnippet, { isReply: false, commentId });
      }
      if (parent?.user_id && parent.user_id !== myUid && parent.user_id !== post.user_id) {
        await notifyUser(parent.user_id, myName, txt, { isReply: true, commentId });
      }
      await notifyMentions(txt, myName, commentId);
    } catch (err) {
      console.log('Error notifying comment:', err.message);
    }
  };

  const handlePickCommentImage = async () => {
    try {
      setUploadingMedia(true);
      const uri = await pickAndUploadPhoto(myUid, { freeAspect: true });
      if (uri) setSelectedMedia({ uri, type: 'image' });
    } catch (error) {
      Alert.alert('Image unavailable', error.message || 'Could not add that image.');
    } finally {
      setUploadingMedia(false);
    }
  };

  const handleStickerSelect = (item) => {
    setGiphyPickerVisible(false);
    setSelectedMedia({
      uri: item.mediaUrl,
      type: item?.type ?? GIPHY_CONTENT_TYPES.STICKER,
      isGiphy: true,
      analytics: item.analytics,
    });
  };

  const handleLike = async (comment) => {
    if (comment.isOptimistic || String(comment.id).startsWith('temp-')) return;
    const nextLikes = comment.likedByMe ? Math.max(0, (comment.likes || 0) - 1) : (comment.likes || 0) + 1;
    setComments((prev) => prev.map((item) => item.id === comment.id
      ? { ...item, likes: nextLikes, likedByMe: !comment.likedByMe }
      : item));

    let error = null;
    const { data } = await supabase
      .from('comment_likes')
      .select('id')
      .eq('comment_id', comment.id)
      .eq('user_id', myUid)
      .maybeSingle();
    if (data) {
      const deleteResult = await supabase.from('comment_likes').delete().eq('comment_id', comment.id).eq('user_id', myUid);
      error = deleteResult.error;
      const updateResult = await supabase
        .from('post_comments')
        .update({ likes: nextLikes })
        .eq('id', comment.id);
      error = error || updateResult.error;
    } else {
      const insertResult = await supabase.from('comment_likes').insert({ comment_id: comment.id, user_id: myUid });
      error = insertResult.error;
      const updateResult = await supabase
        .from('post_comments')
        .update({ likes: nextLikes })
        .eq('id', comment.id);
      error = error || updateResult.error;
    }
    if (error) {
      setComments((prev) => prev.map((item) => item.id === comment.id
        ? { ...item, likes: comment.likes || 0, likedByMe: comment.likedByMe }
        : item));
      Alert.alert('Like unavailable', error.message || 'Could not update this like.');
    }
  };

  const handleReply = (comment) => {
    Haptics.selectionAsync().catch(() => {});
    setReplyingTo(comment);
    inputRef.current?.focus();
  };

  const commentsById = new Map(comments.map((c) => [c.id, c]));

  const renderComment = ({ item }) => {
    const parent = item.reply_to_id ? commentsById.get(item.reply_to_id) : null;
    const isReplyTarget = replyingTo?.id === item.id;
    const isHighlighted = highlightCommentId === item.id;

    return (
      <View
        style={[
          modals.commentRow,
          isReplyTarget && modals.commentRowActive,
          isHighlighted && modals.commentRowHighlight,
        ]}
      >
        <View style={modals.commentAvatar}>
          {item.users?.photo_urls?.[0] ? (
            <ExpoImage source={{ uri: item.users.photo_urls[0] }} style={[StyleSheet.absoluteFillObject, {width: "100%", height: "100%"}] } borderRadius={16} />
          ) : (
            <ExpoImage source={{ uri: getPlaceholderUrl(item.users?.name) }} style={[StyleSheet.absoluteFillObject, {width: "100%", height: "100%"}] } borderRadius={16} />
          )}
        </View>
        <View style={modals.commentBody}>
          <View style={modals.commentHeader}>
            <Text style={modals.commentName}>{item.users?.name ?? 'User'}</Text>
            <Text style={modals.commentTime}>{timeAgo(item.created_at)}</Text>
          </View>
          {parent ? (
            <TouchableOpacity
              style={modals.replySnippet}
              activeOpacity={0.8}
              onPress={() => {
                const index = comments.findIndex((c) => c.id === parent.id);
                if (index >= 0) {
                  listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
                }
              }}
            >
              <Text style={modals.replySnippetName}>
                {parent.user_id === myUid ? 'You' : parent.users?.name ?? 'User'}
              </Text>
              <Text style={modals.replySnippetText} numberOfLines={2}>
                {parent.text}
              </Text>
            </TouchableOpacity>
          ) : null}
          <MentionText
            text={item.text}
            style={modals.commentText}
            mentionStyle={{ color: colors.ember, fontWeight: '700' }}
          />
          {item.media_url ? (
            item.media_type === GIPHY_CONTENT_TYPES.STICKER ? (
              <ExpoImage
                source={{ uri: item.media_url }}
                style={modals.commentSticker}
                contentFit="contain"
                cachePolicy="none"
                accessibilityLabel="GIPHY sticker"
              />
            ) : (
              <ExpoImage source={{ uri: item.media_url }} style={modals.commentImage} contentFit="cover" />
            )
          ) : null}
          <TouchableOpacity style={modals.replyBtn} onPress={() => handleReply(item)} hitSlop={8}>
            <Text style={modals.replyBtnText}>Reply</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={modals.commentLike} onPress={() => handleLike(item)}>
          <Ionicons name={item.likedByMe ? 'heart' : 'heart-outline'} size={20} color={item.likedByMe ? colors.ember : colors.ash} />
          <Text style={modals.commentLikeText}>{item.likes || 0}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={modals.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={modals.sheet}>
          <View style={modals.header}>
            <Text style={modals.title}>Conversation</Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color={colors.stone} /></TouchableOpacity>
          </View>

          {loading ? (
            <SkeletonFeed itemCount={4} ItemComponent={SkeletonActivityItem} style={{ paddingHorizontal: 16 }} />
          ) : (
            <FlatList
              ref={listRef}
              data={comments}
              keyExtractor={(c) => String(c.id)}
              renderItem={renderComment}
              contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
              ListEmptyComponent={<Text style={modals.emptyText}>Start the conversation.</Text>}
              onScrollToIndexFailed={(info) => {
                setTimeout(() => {
                  listRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.5 });
                }, 80);
              }}
            />
          )}

          {replyingTo ? (
            <View style={modals.replyBar}>
              <View style={modals.replyBarAccent} />
              <View style={{ flex: 1 }}>
                <Text style={modals.replyBarLabel}>
                  Replying to {replyingTo.user_id === myUid ? 'yourself' : replyingTo.users?.name ?? 'User'}
                </Text>
                <Text style={modals.replyBarText} numberOfLines={2}>{replyingTo.text}</Text>
              </View>
              <TouchableOpacity onPress={() => setReplyingTo(null)} hitSlop={10}>
                <Ionicons name="close-circle" size={22} color={colors.ash} />
              </TouchableOpacity>
            </View>
          ) : null}

          {mentionSuggestions.length > 0 ? (
            <View style={modals.mentionList}>
              {mentionSuggestions.map((f) => (
                <TouchableOpacity key={f.id} style={modals.mentionRow} onPress={() => insertMention(f)}>
                  <View style={modals.mentionAvatar}>
                    {f.photo_urls?.[0] ? (
                      <ExpoImage source={{ uri: f.photo_urls[0] }} style={[StyleSheet.absoluteFillObject, {width: "100%", height: "100%"}] } borderRadius={14} />
                    ) : (
                      <ExpoImage source={{ uri: getPlaceholderUrl(f.name) }} style={[StyleSheet.absoluteFillObject, {width: "100%", height: "100%"}] } borderRadius={14} />
                    )}
                  </View>
                  <View>
                    <Text style={modals.mentionName}>{f.name}</Text>
                    <Text style={modals.mentionUsername}>@{f.username}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}

          {selectedMedia ? (
            <View style={modals.mediaPreview}>
              {selectedMedia.type === GIPHY_CONTENT_TYPES.STICKER ? (
                <ExpoImage source={{ uri: selectedMedia.uri }} style={modals.mediaPreviewImage} contentFit="contain" cachePolicy="none" />
              ) : (
                <ExpoImage source={{ uri: selectedMedia.uri }} style={modals.mediaPreviewImage} contentFit="cover" />
              )}
              <TouchableOpacity style={modals.mediaPreviewClose} onPress={() => setSelectedMedia(null)} accessibilityLabel="Remove attachment">
                <Ionicons name="close-circle" size={22} color={colors.ash} />
              </TouchableOpacity>
            </View>
          ) : null}

          <View style={modals.inputBar}>
            <TouchableOpacity
              style={modals.addAttachmentBtn}
              onPress={() => setAttachmentSheetVisible(true)}
              disabled={uploadingMedia}
              accessibilityLabel="Add image or sticker"
            >
              {uploadingMedia ? <ActivityIndicator size="small" color={colors.ember} /> : <Ionicons name="add" size={25} color={colors.graphite} />}
            </TouchableOpacity>
            <RNAnimated.View
              style={{
                flex: 1,
                marginRight: 8,
                borderRadius: 24,
                borderWidth: glowBorderWidth,
                borderColor: glowBorderColor,
                shadowColor: colors.ember,
                shadowOffset: { width: 0, height: 0 },
                shadowRadius: glowShadow,
                shadowOpacity: glowShadowOpacity,
                elevation: glowShadow,
                overflow: 'hidden',
              }}>
              <TextInput
                ref={inputRef}
                style={modals.input}
                value={text}
                onChangeText={handleTextChange}
                placeholder={
                  replyingTo
                    ? `Reply to ${replyingTo.user_id === myUid ? 'yourself' : replyingTo.users?.name ?? 'them'}…`
                    : 'Join the conversation…'
                }
                placeholderTextColor={colors.ash}
                onFocus={() => { setIsFocused(true); startGlow(); }}
                onBlur={() => { setIsFocused(false); if (!text.trim() && !replyingTo) stopGlow(); }}
              />
            </RNAnimated.View>
            <TouchableOpacity style={modals.sendBtn} onPress={handleSend} disabled={(!text.trim() && !selectedMedia) || uploadingMedia}>
              <Ionicons name="arrow-up" size={18} color={colors.white} />
            </TouchableOpacity>
          </View>

          <AttachmentSheet
            visible={attachmentSheetVisible}
            onClose={() => setAttachmentSheetVisible(false)}
            title="Add to comment"
            options={[
              { key: 'image', label: 'Image', icon: 'image-outline', iconColor: '#3b82f6', bgColor: '#3b82f620', onPress: handlePickCommentImage },
              { key: 'sticker', label: 'GIFs', icon: 'happy-outline', iconColor: '#7c3aed', bgColor: '#7c3aed20', onPress: () => setGiphyPickerVisible(true) },
            ]}
          />
          <GiphyPicker
            visible={giphyPickerVisible}
            onClose={() => setGiphyPickerVisible(false)}
            onSelect={handleStickerSelect}
            customerId={myUid}
            contentTypes={[GIPHY_CONTENT_TYPES.GIF, GIPHY_CONTENT_TYPES.STICKER]}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Share Modal ────────────────────────────────────────────────────────────
function ShareModal({ visible, onClose, post, myUid }) {
  const { colors, shadow, isDark } = useTheme();
  const s = getStyles(colors, shadow, isDark);
  const modals = getModalsStyles(colors);
  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sentTo, setSentTo] = useState(new Set());

  useEffect(() => {
    if (!visible || !myUid) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase.from('friendships').select('*').eq('status', 'accepted').or(`requester_id.eq.${myUid},recipient_id.eq.${myUid}`);
      
      const friendIds = (data ?? []).map(f => f.requester_id === myUid ? f.recipient_id : f.requester_id);
      if (friendIds.length > 0) {
        const { data: usersData } = await supabase.from('users').select('id, name, photo_urls').in('id', friendIds);
        
        const friendsList = (usersData ?? []).map(u => {
          const f = data.find(f => f.requester_id === u.id || f.recipient_id === u.id);
          return { ...u, friendship_id: f.id };
        });
        setFriends(friendsList);
      } else {
        setFriends([]);
      }
      setLoading(false);
    })();
  }, [visible, myUid]);

  const handleShare = async (friend) => {
    if (sentTo.has(friend.id) || !post?.id || !myUid) return;
    
    const { error } = await supabase.from('friend_messages').insert({
      friendship_id: friend.friendship_id,
      sender_id: myUid,
      type: 'post_share',
      post_id: post.id,
      post_user_id: post.user_id,
      text: 'Shared a post',
    });
    
    if (!error) {
      setSentTo(prev => {
        const next = new Set(prev);
        next.add(friend.id);
        return next;
      });
    } else {
      Alert.alert('Error', error.message);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={modals.overlay}>
        <View style={modals.sheet}>
          <View style={modals.header}>
            <Text style={modals.title}>Share to Friend</Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color={colors.stone} /></TouchableOpacity>
          </View>

          {loading ? (
            <SkeletonFeed itemCount={4} ItemComponent={SkeletonSearchResult} style={{ paddingHorizontal: 16 }} />
          ) : (
            <FlatList
              data={friends}
              keyExtractor={f => f.id}
              renderItem={({ item }) => (
                <View style={modals.friendRow}>
                  <View style={modals.friendAvatar}>
                    {item.photo_urls?.[0] ? <ExpoImage source={{ uri: item.photo_urls[0] }} style={[StyleSheet.absoluteFillObject, {width: "100%", height: "100%"}] } borderRadius={20} /> : <ExpoImage source={{ uri: getPlaceholderUrl(item.name) }} style={[StyleSheet.absoluteFillObject, {width: "100%", height: "100%"}] } borderRadius={20} />}
                  </View>
                  <Text style={modals.friendName}>{item.name}</Text>
                  <TouchableOpacity 
                    style={[modals.shareBtn, sentTo.has(item.id) && modals.shareBtnSent]} 
                    onPress={() => handleShare(item)}
                    disabled={sentTo.has(item.id)}
                  >
                    <Text style={[modals.shareBtnText, sentTo.has(item.id) && modals.shareBtnTextSent]}>
                      {sentTo.has(item.id) ? 'Sent' : 'Share'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
              contentContainerStyle={{ padding: 16 }}
              ListEmptyComponent={<Text style={modals.emptyText}>No friends to share with yet.</Text>}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const getModalsStyles = (colors) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '80%' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderColor: colors.fog },
  title: { fontSize: 17, fontWeight: '700', color: colors.ink },
  emptyText: { textAlign: 'center', color: colors.stone, padding: 20 },

  commentRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  commentRowActive: {
    borderColor: colors.ember + '55',
    backgroundColor: colors.emberLight,
  },
  commentRowHighlight: {
    borderColor: colors.ember,
    backgroundColor: colors.emberLight,
  },
  commentAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.fog, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  commentBody: { flex: 1 },
  commentHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  commentName: { fontSize: 14, fontWeight: '700', color: colors.ink },
  commentTime: { fontSize: 12, color: colors.ash },
  commentText: { fontSize: 16, color: colors.graphite, lineHeight: 22 },
  commentImage: { width: '100%', height: 180, borderRadius: 12, marginTop: 8, backgroundColor: colors.fog },
  commentSticker: { width: 180, height: 150, marginTop: 6, alignSelf: 'flex-start' },
  replySnippet: {
    backgroundColor: colors.snow,
    padding: 8,
    borderRadius: 10,
    marginBottom: 6,
    borderLeftWidth: 3,
    borderLeftColor: colors.ember,
  },
  replySnippetName: { fontSize: 12, fontWeight: '700', color: colors.ember, marginBottom: 2 },
  replySnippetText: { fontSize: 12, color: colors.ash, lineHeight: 16 },
  replyBtn: { alignSelf: 'flex-start', marginTop: 6, paddingVertical: 2 },
  replyBtnText: { fontSize: 13, fontWeight: '700', color: colors.ember },
  commentLike: { alignItems: 'center', justifyContent: 'flex-start', paddingHorizontal: 8, paddingTop: 4 },
  commentLikeText: { fontSize: 13, color: colors.ash },

  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 12,
    marginBottom: 4,
    padding: 10,
    borderRadius: 12,
    backgroundColor: colors.emberLight,
    borderWidth: 1,
    borderColor: colors.ember + '44',
  },
  replyBarAccent: {
    width: 3,
    alignSelf: 'stretch',
    borderRadius: 2,
    backgroundColor: colors.ember,
  },
  replyBarLabel: { fontSize: 12, fontWeight: '700', color: colors.ember, marginBottom: 2 },
  replyBarText: { fontSize: 13, color: colors.ash, lineHeight: 18 },

  mediaPreview: { width: 86, height: 86, marginLeft: 12, marginBottom: 8, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.snow },
  mediaPreviewImage: { width: '100%', height: '100%' },
  mediaPreviewClose: { position: 'absolute', top: 2, right: 2, backgroundColor: colors.white, borderRadius: 11 },
  inputBar: { flexDirection: 'row', padding: 12, borderTopWidth: 1, borderColor: colors.fog, alignItems: 'center', marginBottom: 12, gap: 8 },
  addAttachmentBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.snow, borderWidth: 1, borderColor: colors.fog },
  input: { flex: 1, backgroundColor: colors.snow, borderRadius: 24, paddingHorizontal: 18, paddingVertical: 14, fontSize: 16, minHeight: 50, color: colors.ink },
  sendBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.ember, alignItems: 'center', justifyContent: 'center' },

  friendRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  friendAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.fog, alignItems: 'center', justifyContent: 'center' },
  friendName: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.ink },
  shareBtn: { backgroundColor: colors.ember, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16 },
  shareBtnSent: { backgroundColor: colors.fog },
  shareBtnText: { color: colors.white, fontWeight: '600', fontSize: 13 },
  shareBtnTextSent: { color: colors.stone },
  mentionList: {
    marginHorizontal: 12,
    marginBottom: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.fog,
    backgroundColor: colors.snow,
    overflow: 'hidden',
  },
  mentionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderBottomWidth: 1, borderBottomColor: colors.fog },
  mentionAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.fog, overflow: 'hidden' },
  mentionName: { fontSize: 14, fontWeight: '600', color: colors.ink },
  mentionUsername: { fontSize: 12, color: colors.ember },
});

// ── Main PostsScreen ─────────────────────────────────────────────────────────

export default function PostsScreen({ navigation, feedTarget, onFeedTargetHandled }) {
  const { colors, shadow, isDark } = useTheme();
  const s = getStyles(colors, shadow, isDark);
  const modals = getModalsStyles(colors);
  const [posts,      setPosts]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating,   setCreating]   = useState(false);
  const [myUid,      setMyUid]      = useState(null);
  const [myVibe,     setMyVibe]     = useState(null); // viewer's active vibe, for the "same vibe" cue

  const [activeCommentPost, setActiveCommentPost] = useState(null);
  const [highlightCommentId, setHighlightCommentId] = useState(null);
  const [activeSharePost, setActiveSharePost] = useState(null);
  const [activeLikesPost, setActiveLikesPost] = useState(null);
  const [viewingImage, setViewingImage] = useState(null);
  const [filterType,      setFilterType]      = useState('all');

  const loadPosts = useCallback(async () => {
    try {
      // Get friends to filter 'friends' visibility
      let friendIds = [];
      if (myUid) {
        const { data: fData } = await supabase.from('friendships').select('requester_id, recipient_id')
          .eq('status', 'accepted').or(`requester_id.eq.${myUid},recipient_id.eq.${myUid}`);
        friendIds = (fData || []).map(f => f.requester_id === myUid ? f.recipient_id : f.requester_id);
      }
      
      const orQuery = `visibility.eq.public,user_id.eq.${myUid}` + 
                      (friendIds.length > 0 ? `,and(visibility.eq.friends,user_id.in.(${friendIds.join(',')}))` : '');

      const { data: postsData, error } = await supabase
        .from('posts')
        .select('*')
        .is('circle_id', null)
        .or(orQuery)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      if (!postsData || postsData.length === 0) { setPosts([]); return; }

      const userIds = [...new Set(postsData.map(p => p.user_id))];
      const { data: usersData } = await supabase
        .from('users')
        .select('id, name, username, photo_urls, current_vibe, vibe_set_at')
        .in('id', userIds);

      const usersMap = new Map((usersData ?? []).map(u => [u.id, u]));
      
      // Get comment counts
      const postIds = postsData.map(p => p.id);
      const { data: comments } = await supabase.from('post_comments').select('post_id');
      const counts = new Map();
      (comments || []).forEach(c => { counts.set(c.post_id, (counts.get(c.post_id) || 0) + 1); });

      // Get like counts and my likes
      let likesData = [];
      try {
        const res = await supabase.from('post_likes').select('post_id, user_id').eq('status', 'liked').in('post_id', postIds);
        likesData = res.data || [];
      } catch (e) {
        // Fallback if table doesn't exist yet
      }
      const likesCounts = new Map();
      const userLikes = new Set();
      likesData.forEach(l => {
        likesCounts.set(l.post_id, (likesCounts.get(l.post_id) || 0) + 1);
        if (myUid && l.user_id === myUid) userLikes.add(l.post_id);
      });

      // Get post-level Sparks — reuse post_reactions with reaction_type = 'spark'
      let sparksData = [];
      try {
        const res = await supabase.from('post_reactions').select('post_id, user_id').eq('reaction_type', 'spark').in('post_id', postIds);
        sparksData = res.data || [];
      } catch (e) {
        // Fallback if the table/index isn't there yet
      }
      const sparkCounts = new Map();
      const userSparks = new Set();
      sparksData.forEach(sr => {
        sparkCounts.set(sr.post_id, (sparkCounts.get(sr.post_id) || 0) + 1);
        if (myUid && sr.user_id === myUid) userSparks.add(sr.post_id);
      });

      setPosts(postsData.map(p => ({
        ...p,
        users: usersMap.get(p.user_id) ?? null,
        comments_count: counts.get(p.id) || 0,
        like_count: likesCounts.get(p.id) || 0,
        liked: userLikes.has(p.id),
        spark_count: sparkCounts.get(p.id) || 0,
        sparked: userSparks.has(p.id),
      })));
    } catch (e) {
      console.log('feed error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setMyUid(session.user.id);
        // Viewer's own vibe (if still active) powers the "same vibe as you" cue.
        const { data: me } = await supabase.from('users')
          .select('current_vibe, vibe_set_at')
          .eq('id', session.user.id)
          .maybeSingle();
        if (me?.current_vibe && !isVibeExpired(me.vibe_set_at)) setMyVibe(me.current_vibe);
        else setMyVibe(null);
      }
      loadPosts();
    })();
  }, [loadPosts]);

  useEffect(() => {
    if (!feedTarget?.postId) return;

    let cancelled = false;
    (async () => {
      const { data: postData, error } = await supabase
        .from('posts')
        .select('*')
        .eq('id', feedTarget.postId)
        .single();

      if (cancelled) return;

      if (error || !postData) {
        onFeedTargetHandled?.();
        return;
      }

      const { data: userData } = await supabase
        .from('users')
        .select('id, name, username, photo_urls, current_vibe, vibe_set_at')
        .eq('id', postData.user_id)
        .maybeSingle();

      if (cancelled) return;

      setHighlightCommentId(feedTarget.commentId || null);
      setActiveCommentPost({ ...postData, users: userData ?? null });
      onFeedTargetHandled?.();
    })();

    return () => { cancelled = true; };
  }, [feedTarget?.postId, feedTarget?.commentId, feedTarget?.ts]);

  const handleRefresh = () => { setRefreshing(true); loadPosts(); };

  const handleDeletePost = async (post) => {
    if (!myUid) return;
    try {
      const allowed = await canDeletePost(post, myUid);
      if (!allowed) {
        Alert.alert('Not allowed', 'You cannot delete this post.');
        return;
      }
      await deletePost(post, myUid);
      setPosts((prev) => prev.filter((p) => p.id !== post.id));
    } catch (e) {
      Alert.alert('Delete failed', e.message);
    }
  };

  const handleLikePost = async (post, newLiked) => {
    if (!myUid) return;
    try {
      if (newLiked) {
        // Optimistically checking if we've notified before
        const { data: existing } = await supabase.from('post_likes')
          .select('id, notified')
          .eq('post_id', post.id)
          .eq('user_id', myUid)
          .maybeSingle();

        if (existing) {
          await supabase.from('post_likes').update({ status: 'liked' }).eq('id', existing.id);
          
          if (!existing.notified && post.user_id !== myUid) {
            // First time liking again after a failure? Or we just didn't notify yet.
            await notifyLike(post, existing.id);
          }
        } else {
          // Insert new like and mark as notified true
          const { data: newLike } = await supabase.from('post_likes')
            .insert({ post_id: post.id, user_id: myUid, status: 'liked', notified: true })
            .select()
            .single();

          if (post.user_id !== myUid && newLike) {
            await notifyLike(post, newLike.id);
          }
        }
      } else {
        await supabase.from('post_likes').update({ status: 'unliked' }).eq('post_id', post.id).eq('user_id', myUid);
      }
    } catch (e) {
      console.log('Error liking post:', e.message);
    }
  };

  const notifyLike = async (post, likeId) => {
    try {
      const { data: me } = await supabase.from('users').select('name').eq('id', myUid).single();
      const myName = me?.name || 'Someone';

      // Insert in-app notification
      await supabase.from('notifications').insert({
        recipient_id: post.user_id,
        sender_id: myUid,
        post_id: post.id,
        type: 'like',
        title: 'New Like!',
        message: `${myName} liked your post.`,
      });

      // Send push notification via the exported helper
      const { sendLikeNotification } = await import('../utils/notifications');
      await sendLikeNotification(post.user_id, myName, post.id);
    } catch (err) {
      console.log('Error notifying like:', err.message);
      // Revert the notified flag if we failed, so we can try again next time they like
      await supabase.from('post_likes').update({ notified: false }).eq('id', likeId);
    }
  };

  const handleSparkPost = async (post, newSparked) => {
    if (!myUid) return;
    try {
      if (newSparked) {
        const { error } = await supabase.from('post_reactions')
          .insert({ post_id: post.id, user_id: myUid, reaction_type: 'spark' });
        // 23505 = already sparked (fast double-tap) — treat as success.
        if (error && error.code !== '23505') throw error;
        if (!error && post.user_id !== myUid) await notifySpark(post);
      } else {
        await supabase.from('post_reactions')
          .delete()
          .eq('post_id', post.id)
          .eq('user_id', myUid)
          .eq('reaction_type', 'spark');
      }
    } catch (e) {
      console.log('Error sparking post:', e.message);
    }
  };

  const notifySpark = async (post) => {
    try {
      const { data: me } = await supabase.from('users').select('name').eq('id', myUid).single();
      const myName = me?.name || 'Someone';

      // In-app notification
      await supabase.from('notifications').insert({
        recipient_id: post.user_id,
        sender_id: myUid,
        type: 'spark',
        title: 'New Spark! ✦',
        message: `${myName} connected with your vibe.`,
      });

      // Push notification (reuse the Spark helper)
      const { sendSparkNotification } = await import('../utils/notifications');
      await sendSparkNotification(post.user_id, myName, 'connected with your vibe', myUid);
    } catch (err) {
      console.log('Error notifying spark:', err.message);
    }
  };

  const displayedPosts = filterType === 'all' ? posts : posts.filter(p => p.post_type === filterType);

  return (
    <View style={s.root}>
      <View style={s.header}>
        <TouchableOpacity style={s.writeBtn} onPress={() => setCreating(true)}>
          <Ionicons name="create-outline" size={16} color={colors.white} style={{ marginRight: 4 }} />
          <Text style={s.writeBtnText}>Post</Text>
        </TouchableOpacity>
      </View>

      <View>
        <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow} style={s.filterScroll}>
          <TouchableOpacity 
            style={[s.filterPill, filterType === 'all' && s.filterPillActive]} 
            onPress={() => setFilterType('all')}
          >
            <Text style={[s.filterText, filterType === 'all' && s.filterTextActive]}>All Vibes</Text>
          </TouchableOpacity>
          {Object.values(POST_TYPES).map(t => (
            <TouchableOpacity 
              key={t.id} 
              style={[
                s.filterPill, 
                filterType === t.id && { backgroundColor: t.color + '22', borderColor: t.color }
              ]} 
              onPress={() => setFilterType(t.id)}
            >
              <Ionicons name={t.icon} size={16} color={filterType === t.id ? t.color : colors.ash} />
              <Text style={[s.filterText, filterType === t.id && { color: t.color, fontWeight: '700' }]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <SkeletonFeed itemCount={3} ItemComponent={SkeletonPost} />
      ) : (
        <FlatList
          data={displayedPosts}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <PostCard
              post={item}
              myUid={myUid}
              myVibe={myVibe}
              canDelete={item.user_id === myUid}
              onDelete={handleDeletePost}
              onOpenImage={setViewingImage}
              onOpenComments={setActiveCommentPost}
              onOpenShare={setActiveSharePost}
              onLike={handleLikePost}
              onSpark={handleSparkPost}
              onOpenLikes={setActiveLikesPost}
              onOpenProfile={(u) => { if (u) navigation?.navigate('UserProfile', { userId: u.id }); }}
            />
          )}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: 8, paddingBottom: 110 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.ember} />}
          ListEmptyComponent={
            <View style={s.empty}>
              <Ionicons name="newspaper-outline" size={48} color={colors.ash} />
              <Text style={s.emptyTitle}>Nothing here yet</Text>
              <Text style={s.emptySub}>Be the first to post something!</Text>
              <TouchableOpacity style={s.emptyBtn} onPress={() => setCreating(true)}>
                <Text style={s.emptyBtnText}>Create a post</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}

      <Modal
        visible={!!viewingImage}
        animationType="fade"
        transparent
        onRequestClose={() => setViewingImage(null)}
      >
        <View style={s.imageViewerOverlay}>
          <TouchableOpacity
            style={s.imageViewerClose}
            onPress={() => setViewingImage(null)}
            hitSlop={12}
          >
            <Ionicons name="close" size={28} color="#FFFFFF" />
          </TouchableOpacity>
          {viewingImage ? (
            <ExpoImage source={{ uri: viewingImage }} style={s.imageViewerImage} contentFit="contain" />
          ) : null}
        </View>
      </Modal>

      <CreatePostModal
        visible={creating}
        onClose={() => setCreating(false)}
        onCreated={loadPosts}
        myUid={myUid}
      />

      <CommentModal
        visible={!!activeCommentPost}
        onClose={() => { setActiveCommentPost(null); setHighlightCommentId(null); }}
        post={activeCommentPost}
        myUid={myUid}
        highlightCommentId={highlightCommentId}
      />

      <ShareModal
        visible={!!activeSharePost}
        onClose={() => setActiveSharePost(null)}
        post={activeSharePost}
        myUid={myUid}
      />

      <LikesModal
        visible={!!activeLikesPost}
        onClose={() => setActiveLikesPost(null)}
        post={activeLikesPost}
        colors={colors}
        modals={modals}
        navigation={navigation}
      />
    </View>
  );
}

const getStyles = (colors, shadow, isDark) => StyleSheet.create({
  root:   { flex: 1, backgroundColor: colors.snow },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end',
    paddingHorizontal: 22, paddingTop: 56, paddingBottom: 12,
  },
  writeBtn:     { backgroundColor: colors.ember, borderRadius: radius.full, paddingVertical: 8, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' },
  writeBtnText: { color: colors.white, fontWeight: '700', fontSize: 14 },
  
  filterScroll: { flexGrow: 0, marginBottom: 8 },
  filterRow:    { paddingHorizontal: 22, gap: 10, paddingBottom: 8, alignItems: 'center' },
  filterPill:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.full, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.white, gap: 6 },
  filterPillActive: { backgroundColor: colors.ember, borderColor: colors.ember },
  filterText:   { color: colors.stone, fontSize: 14, fontWeight: '600' },
  filterTextActive: { color: colors.ink, fontWeight: '700' },

  center:       { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty:        { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 12 },
  emptyTitle:   { fontSize: 22, fontWeight: '700', color: colors.ink },
  emptySub:     { fontSize: 15, color: colors.stone, textAlign: 'center' },
  emptyBtn:     { backgroundColor: colors.ember, borderRadius: radius.full, paddingVertical: 12, paddingHorizontal: 28, marginTop: 8 },
  emptyBtnText: { color: colors.white, fontWeight: '600', fontSize: 15 },
  imageViewerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.94)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  imageViewerImage: { width: '100%', height: '82%' },
  imageViewerClose: { position: 'absolute', top: 52, right: 20, zIndex: 2, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)' },
});

// ── Likes Modal ────────────────────────────────────────────────────────────
function LikesModal({ visible, onClose, post, colors, modals, navigation }) {
  const [likes, setLikes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!visible || !post?.id) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('post_likes')
        .select('user_id, status')
        .eq('post_id', post.id)
        .eq('status', 'liked');
        
      if (data && data.length > 0) {
        const userIds = data.map(l => l.user_id);
        const { data: usersData } = await supabase.from('users').select('id, name, photo_urls').in('id', userIds);
        setLikes(usersData || []);
      } else {
        setLikes([]);
      }
      setLoading(false);
    })();
  }, [visible, post?.id]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={modals.overlay}>
        <View style={modals.sheet}>
          <View style={modals.header}>
            <Text style={modals.title}>Likes</Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color={colors.stone} /></TouchableOpacity>
          </View>

          {loading ? (
            <SkeletonFeed itemCount={4} ItemComponent={SkeletonSearchResult} style={{ paddingHorizontal: 16 }} />
          ) : (
            <FlatList
              data={likes}
              keyExtractor={u => u.id}
              renderItem={({ item }) => (
                <TouchableOpacity 
                  style={modals.friendRow} 
                  onPress={() => {
                    onClose();
                    navigation?.navigate('UserProfile', { userId: item.id });
                  }}
                >
                  <View style={modals.friendAvatar}>
                    {item.photo_urls?.[0] ? <ExpoImage source={{ uri: item.photo_urls[0] }} style={[StyleSheet.absoluteFillObject, {width: "100%", height: "100%"}] } borderRadius={20} /> : <ExpoImage source={{ uri: getPlaceholderUrl(item.name) }} style={[StyleSheet.absoluteFillObject, {width: "100%", height: "100%"}] } borderRadius={20} />}
                  </View>
                  <Text style={modals.friendName}>{item.name}</Text>
                  <Ionicons name="heart" size={16} color={colors.ember} />
                </TouchableOpacity>
              )}
              contentContainerStyle={{ padding: 16 }}
              ListEmptyComponent={<Text style={modals.emptyText}>No likes yet.</Text>}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}
