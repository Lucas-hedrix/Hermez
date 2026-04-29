// screens/PostsScreen.jsx — community feed + create post
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Image, TextInput, ActivityIndicator, Modal, KeyboardAvoidingView,
  Platform, Dimensions, Alert, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radius, colors } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import { supabase } from '../supabase/client';
import { pickAndUploadPhoto } from '../supabase/storage';

const { width: W } = Dimensions.get('window');

function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function PostCard({ post, myUid, onOpenComments, onOpenShare, onOpenProfile }) {  const { colors, shadow, isDark } = useTheme();
  const s = getStyles(colors, shadow, isDark);
  const [liked, setLiked]         = useState(false);
  const [likeCount, setLikeCount] = useState(Math.floor(Math.random() * 20));
  const isOwn = post.user_id === myUid;

  const toggleLike = () => {
    setLiked(l => !l);
    setLikeCount(c => liked ? c - 1 : c + 1);
  };

  return (
    <View style={[pc.card, shadow.soft]}>
      {/* Author row */}
      <TouchableOpacity style={pc.authorRow} onPress={() => onOpenProfile(post.users)} activeOpacity={0.7}>
        <View style={[pc.avatar, { backgroundColor: colors.emberLight, overflow: 'hidden' }]}>
          {post.users?.photo_urls?.[0]
            ? <Image source={{ uri: post.users.photo_urls[0] }} style={StyleSheet.absoluteFillObject} />
            : <Ionicons name="person" size={20} color={colors.ash} />}
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={pc.authorName}>{post.users?.name ?? 'Someone'}</Text>
            {post.users?.username && <Text style={pc.authorUsername}>@{post.users.username}</Text>}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={pc.timeAgo}>{timeAgo(post.created_at)}</Text>
            <Ionicons name={post.visibility === 'friends' ? "people" : "globe-outline"} size={12} color={colors.ash} />
          </View>
        </View>
        {isOwn && <View style={pc.ownBadge}><Text style={pc.ownBadgeText}>You</Text></View>}
      </TouchableOpacity>

      {post.image_url && (
        <Image source={{ uri: post.image_url }} style={pc.postImage} resizeMode="cover" />
      )}
      {post.caption ? (
        <Text style={[pc.caption, !post.image_url && pc.captionOnly]}>{post.caption}</Text>
      ) : null}

      <View style={pc.actions}>
        <TouchableOpacity style={pc.actionBtn} onPress={toggleLike}>
          <Ionicons name={liked ? 'heart' : 'heart-outline'} size={18} color={liked ? colors.ember : colors.ash} />
          <Text style={[pc.actionCount, liked && pc.actionCountLiked]}>{likeCount}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={pc.actionBtn} onPress={() => onOpenComments(post)}>
          <Ionicons name="chatbubble-outline" size={17} color={colors.ash} />
          <Text style={pc.actionCount}>{post.comments_count || 0}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={pc.actionBtn} onPress={() => onOpenShare(post)}>
          <Ionicons name="share-social-outline" size={18} color={colors.ash} />
          <Text style={pc.actionCount}>Share</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const pc = StyleSheet.create({
  card: {
    backgroundColor: colors.white, borderRadius: radius.xl,
    marginHorizontal: 16, marginBottom: 14, overflow: 'hidden',
    borderWidth: 1, borderColor: colors.fog,
  },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  authorName: { fontSize: 15, fontWeight: '700', color: colors.ink },
  authorUsername: { fontSize: 13, color: colors.stone, fontWeight: '500' },
  timeAgo:    { fontSize: 12, color: colors.ash, marginTop: 1 },
  ownBadge:     { backgroundColor: colors.emberLight, borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 4 },
  ownBadgeText: { fontSize: 11, color: colors.ember, fontWeight: '700' },
  postImage:  { width: '100%', height: 280 },
  caption:    { fontSize: 15, color: colors.graphite, lineHeight: 22, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4 },
  captionOnly:{ paddingTop: 0, paddingBottom: 12, fontSize: 16, lineHeight: 24 },
  actions: {
    flexDirection: 'row', gap: 4,
    paddingHorizontal: 10, paddingVertical: 10,
    borderTopWidth: 1, borderColor: colors.fog,
  },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.full },
  actionCount:       { fontSize: 13, color: colors.ash },
  actionCountLiked:  { color: colors.ember, fontWeight: '600' },
});

// ── Create Post Modal ────────────────────────────────────────────────────────

function CreatePostModal({ visible, onClose, onCreated, myUid }) {  const { colors, shadow, isDark } = useTheme();
  const s = getStyles(colors, shadow, isDark);
  const [caption,   setCaption]   = useState('');
  const [imageUri,  setImageUri]  = useState(null);
  const [visibility, setVisibility] = useState('public');
  const [uploading, setUploading] = useState(false);
  const [posting,   setPosting]   = useState(false);

  const reset = () => { setCaption(''); setImageUri(null); setVisibility('public'); };

  const handlePickImage = async () => {
    try {
      setUploading(true);
      const url = await pickAndUploadPhoto(myUid);
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
      const { error } = await supabase.from('posts').insert({
        user_id:   myUid,
        caption:   caption.trim() || null,
        image_url: imageUri || null,
        visibility,
      });
      if (error) throw error;
      reset(); onCreated(); onClose();
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setPosting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={cm.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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

        {imageUri && (
          <View style={cm.imagePreviewWrap}>
            <Image source={{ uri: imageUri }} style={cm.imagePreview} resizeMode="cover" />
            <TouchableOpacity style={cm.removeImage} onPress={() => setImageUri(null)}>
              <Ionicons name="close" size={14} color={colors.white} />
            </TouchableOpacity>
          </View>
        )}

        <TextInput
          style={cm.input}
          placeholder="What's on your mind?"
          placeholderTextColor={colors.ash}
          multiline
          value={caption}
          onChangeText={setCaption}
          maxLength={500}
          autoFocus
        />
        <Text style={cm.charCount}>{caption.length}/500</Text>

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

const cm = StyleSheet.create({
  root:   { flex: 1, backgroundColor: colors.white },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 58, paddingBottom: 14,
    borderBottomWidth: 1, borderColor: colors.fog,
  },
  title:           { fontSize: 17, fontWeight: '700', color: colors.ink },
  postBtn:         { fontSize: 16, fontWeight: '700', color: colors.ember },
  postBtnDisabled: { color: colors.ash },
  imagePreviewWrap:{ position: 'relative', marginHorizontal: 20, marginTop: 16, borderRadius: radius.lg, overflow: 'hidden' },
  imagePreview:    { width: '100%', height: 220 },
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
});

// ── Comment Modal ────────────────────────────────────────────────────────────
function CommentModal({ visible, onClose, post, myUid }) {  const { colors, shadow, isDark } = useTheme();
  const s = getStyles(colors, shadow, isDark);
  const [comments, setComments] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!visible || !post?.id) return;
    let channel;
    (async () => {
      setLoading(true);
      const { data: commentsData } = await supabase.from('post_comments')
        .select('*')
        .eq('post_id', post.id)
        .order('created_at', { ascending: true });
        
      if (commentsData && commentsData.length > 0) {
        const userIds = [...new Set(commentsData.map(c => c.user_id))];
        const { data: usersData } = await supabase.from('users').select('id, name, photo_urls').in('id', userIds);
        const usersMap = Object.fromEntries((usersData ?? []).map(u => [u.id, u]));
        setComments(commentsData.map(c => ({ ...c, users: usersMap[c.user_id] })));
      } else {
        setComments([]);
      }
      setLoading(false);

      channel = supabase.channel(`comments:${post.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'post_comments', filter: `post_id=eq.${post.id}` }, async (payload) => {
          if (payload.eventType === 'INSERT') {
            const { data: u } = await supabase.from('users').select('name, photo_urls').eq('id', payload.new.user_id).single();
            setComments(prev => [...prev, { ...payload.new, users: u }]);
          } else if (payload.eventType === 'UPDATE') {
            setComments(prev => prev.map(c => c.id === payload.new.id ? { ...c, likes: payload.new.likes } : c));
          } else if (payload.eventType === 'DELETE') {
            setComments(prev => prev.filter(c => c.id !== payload.old.id));
          }
        }).subscribe();
    })();
    return () => { if (channel) supabase.removeChannel(channel); };
  }, [visible, post?.id]);

  const handleSend = async () => {
    if (!text.trim() || !post?.id || !myUid) return;
    const txt = text.trim();
    setText('');
    await supabase.from('post_comments').insert({ post_id: post.id, user_id: myUid, text: txt });
  };

  const handleLike = async (comment) => {
    const { data } = await supabase.from('comment_likes').select('id').eq('comment_id', comment.id).eq('user_id', myUid).maybeSingle();
    if (data) {
      await supabase.from('comment_likes').delete().eq('comment_id', comment.id).eq('user_id', myUid);
      await supabase.from('post_comments').update({ likes: Math.max(0, comment.likes - 1) }).eq('id', comment.id);
    } else {
      await supabase.from('comment_likes').insert({ comment_id: comment.id, user_id: myUid });
      await supabase.from('post_comments').update({ likes: comment.likes + 1 }).eq('id', comment.id);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={modals.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={modals.sheet}>
          <View style={modals.header}>
            <Text style={modals.title}>Comments</Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color={colors.stone} /></TouchableOpacity>
          </View>
          
          {loading ? (
            <ActivityIndicator color={colors.ember} style={{ padding: 40 }} />
          ) : (
            <FlatList
              data={comments}
              keyExtractor={c => c.id}
              renderItem={({ item }) => (
                <View style={modals.commentRow}>
                  <View style={modals.commentAvatar}>
                    {item.users?.photo_urls?.[0] ? <Image source={{ uri: item.users.photo_urls[0] }} style={StyleSheet.absoluteFillObject} borderRadius={16} /> : <Ionicons name="person" size={16} color={colors.ash} />}
                  </View>
                  <View style={modals.commentBody}>
                    <Text style={modals.commentName}>{item.users?.name ?? 'User'}</Text>
                    <Text style={modals.commentText}>{item.text}</Text>
                  </View>
                  <TouchableOpacity style={modals.commentLike} onPress={() => handleLike(item)}>
                    <Ionicons name="heart-outline" size={16} color={colors.ash} />
                    <Text style={modals.commentLikeText}>{item.likes || 0}</Text>
                  </TouchableOpacity>
                </View>
              )}
              contentContainerStyle={{ padding: 16 }}
              ListEmptyComponent={<Text style={modals.emptyText}>No comments yet.</Text>}
            />
          )}

          <View style={modals.inputBar}>
            <TextInput style={modals.input} value={text} onChangeText={setText} placeholder="Add a comment..." placeholderTextColor={colors.ash} />
            <TouchableOpacity style={modals.sendBtn} onPress={handleSend} disabled={!text.trim()}><Ionicons name="arrow-up" size={18} color={colors.white} /></TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Share Modal ────────────────────────────────────────────────────────────
function ShareModal({ visible, onClose, post, myUid }) {  const { colors, shadow, isDark } = useTheme();
  const s = getStyles(colors, shadow, isDark);
  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sentTo, setSentTo] = useState({});

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
    if (sentTo[friend.id] || !post?.id || !myUid) return;
    
    const { error } = await supabase.from('friend_messages').insert({
      friendship_id: friend.friendship_id,
      sender_id: myUid,
      type: 'post_share',
      post_id: post.id,
      post_user_id: post.user_id,
      text: 'Shared a post',
    });
    
    if (!error) {
      setSentTo(prev => ({ ...prev, [friend.id]: true }));
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
            <ActivityIndicator color={colors.ember} style={{ padding: 40 }} />
          ) : (
            <FlatList
              data={friends}
              keyExtractor={f => f.id}
              renderItem={({ item }) => (
                <View style={modals.friendRow}>
                  <View style={modals.friendAvatar}>
                    {item.photo_urls?.[0] ? <Image source={{ uri: item.photo_urls[0] }} style={StyleSheet.absoluteFillObject} borderRadius={20} /> : <Ionicons name="person" size={20} color={colors.ash} />}
                  </View>
                  <Text style={modals.friendName}>{item.name}</Text>
                  <TouchableOpacity 
                    style={[modals.shareBtn, sentTo[item.id] && modals.shareBtnSent]} 
                    onPress={() => handleShare(item)}
                    disabled={sentTo[item.id]}
                  >
                    <Text style={[modals.shareBtnText, sentTo[item.id] && modals.shareBtnTextSent]}>
                      {sentTo[item.id] ? 'Sent' : 'Share'}
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

const modals = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '80%' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderColor: colors.fog },
  title: { fontSize: 17, fontWeight: '700', color: colors.ink },
  emptyText: { textAlign: 'center', color: colors.stone, padding: 20 },

  commentRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  commentAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.fog, alignItems: 'center', justifyContent: 'center' },
  commentBody: { flex: 1 },
  commentName: { fontSize: 13, fontWeight: '700', color: colors.ink, marginBottom: 2 },
  commentText: { fontSize: 14, color: colors.graphite },
  commentLike: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  commentLikeText: { fontSize: 11, color: colors.ash },

  inputBar: { flexDirection: 'row', padding: 12, borderTopWidth: 1, borderColor: colors.fog, alignItems: 'center' },
  input: { flex: 1, backgroundColor: colors.snow, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8, fontSize: 15, marginRight: 8, borderWidth: 1, borderColor: colors.fog },
  sendBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.ember, alignItems: 'center', justifyContent: 'center' },

  friendRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  friendAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.fog, alignItems: 'center', justifyContent: 'center' },
  friendName: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.ink },
  shareBtn: { backgroundColor: colors.ember, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16 },
  shareBtnSent: { backgroundColor: colors.fog },
  shareBtnText: { color: colors.white, fontWeight: '600', fontSize: 13 },
  shareBtnTextSent: { color: colors.stone },
});

// ── Main PostsScreen ─────────────────────────────────────────────────────────

export default function PostsScreen({ navigation }) {
  const { colors, shadow, isDark } = useTheme();
  const s = getStyles(colors, shadow, isDark);
  const [posts,      setPosts]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating,   setCreating]   = useState(false);
  const [myUid,      setMyUid]      = useState(null);

  const [activeCommentPost, setActiveCommentPost] = useState(null);
  const [activeSharePost, setActiveSharePost] = useState(null);

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
        .or(orQuery)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      if (!postsData || postsData.length === 0) { setPosts([]); return; }

      const userIds = [...new Set(postsData.map(p => p.user_id))];
      const { data: usersData } = await supabase
        .from('users')
        .select('id, name, username, photo_urls')
        .in('id', userIds);

      const usersMap = Object.fromEntries((usersData ?? []).map(u => [u.id, u]));
      
      // Get comment counts
      const postIds = postsData.map(p => p.id);
      const { data: comments } = await supabase.from('post_comments').select('post_id');
      const counts = {};
      (comments || []).forEach(c => { counts[c.post_id] = (counts[c.post_id] || 0) + 1; });

      setPosts(postsData.map(p => ({ ...p, users: usersMap[p.user_id] ?? null, comments_count: counts[p.id] || 0 })));
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
      if (session) setMyUid(session.user.id);
      loadPosts();
    })();
  }, [loadPosts]);

  const handleRefresh = () => { setRefreshing(true); loadPosts(); };

  return (
    <View style={s.root}>
      <View style={s.header}>
        <Text style={s.title}>Feed</Text>
        <TouchableOpacity style={s.writeBtn} onPress={() => setCreating(true)}>
          <Ionicons name="create-outline" size={16} color={colors.white} style={{ marginRight: 4 }} />
          <Text style={s.writeBtnText}>Post</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color={colors.ember} size="large" />
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <PostCard 
              post={item} 
              myUid={myUid} 
              onOpenComments={setActiveCommentPost} 
              onOpenShare={setActiveSharePost} 
              onOpenProfile={(u) => { if (u) navigation?.navigate('Match', { otherUser: u }) }}
            />
          )}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: 8, paddingBottom: 24 }}
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

      {!loading && posts.length > 0 && (
        <TouchableOpacity style={s.fab} onPress={() => setCreating(true)}>
          <Ionicons name="create" size={24} color={colors.white} />
        </TouchableOpacity>
      )}

      <CreatePostModal
        visible={creating}
        onClose={() => setCreating(false)}
        onCreated={loadPosts}
        myUid={myUid}
      />

      <CommentModal
        visible={!!activeCommentPost}
        onClose={() => setActiveCommentPost(null)}
        post={activeCommentPost}
        myUid={myUid}
      />

      <ShareModal
        visible={!!activeSharePost}
        onClose={() => setActiveSharePost(null)}
        post={activeSharePost}
        myUid={myUid}
      />
    </View>
  );
}

const getStyles = (colors, shadow, isDark) => StyleSheet.create({
  root:   { flex: 1, backgroundColor: colors.snow },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 22, paddingTop: 56, paddingBottom: 12,
  },
  title:        { fontSize: 32, fontWeight: '800', color: colors.ink, letterSpacing: -0.8 },
  writeBtn:     { backgroundColor: colors.ember, borderRadius: radius.full, paddingVertical: 8, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' },
  writeBtnText: { color: colors.white, fontWeight: '700', fontSize: 14 },
  center:       { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty:        { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 12 },
  emptyTitle:   { fontSize: 22, fontWeight: '700', color: colors.ink },
  emptySub:     { fontSize: 15, color: colors.stone, textAlign: 'center' },
  emptyBtn:     { backgroundColor: colors.ember, borderRadius: radius.full, paddingVertical: 12, paddingHorizontal: 28, marginTop: 8 },
  emptyBtnText: { color: colors.white, fontWeight: '600', fontSize: 15 },
  fab: {
    position: 'absolute', bottom: 28, right: 22,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.ember, alignItems: 'center', justifyContent: 'center',
    ...shadow.card,
  },
});
