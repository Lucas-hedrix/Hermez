// screens/FriendChatScreen.jsx — DM for friend requests
// Rules: requester can send ≤3 messages while pending
//        when recipient replies → auto-accept friendship silently
import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, Dimensions, Image, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme';
import { supabase } from '../supabase/client';

const { width: W } = Dimensions.get('window');
const MAX_PENDING_MSGS = 3;

function formatTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function Bubble({ item, myId, onPressShare }) {
  const isMe = item.sender_id === myId;
  
  if (item.type === 'post_share') {
    return (
      <View style={[s.bubbleRow, isMe && s.bubbleRowMe]}>
        <TouchableOpacity 
          style={[s.bubbleShare, isMe ? s.bubbleMe : s.bubbleThem]}
          onPress={() => onPressShare(item)}
          activeOpacity={0.8}
        >
          <View style={s.shareHeader}>
            <Ionicons name="share-social" size={16} color={isMe ? colors.white : colors.ember} />
            <Text style={[s.shareHeaderText, isMe && s.shareHeaderTextMe]}>Shared a post</Text>
          </View>
          <Text style={[s.bubbleText, isMe && s.bubbleTextMe]}>Tap to view profile</Text>
        </TouchableOpacity>
        <View style={[s.metaRow, isMe && s.metaRowMe]}>
          <Text style={s.bubbleTime}>{formatTime(item.created_at)}</Text>
          {isMe && <Ionicons name="checkmark-done" size={13} color={colors.ember} />}
        </View>
      </View>
    );
  }

  return (
    <View style={[s.bubbleRow, isMe && s.bubbleRowMe]}>
      <View style={[s.bubble, isMe ? s.bubbleMe : s.bubbleThem]}>
        <Text style={[s.bubbleText, isMe && s.bubbleTextMe]}>{item.text}</Text>
      </View>
      <View style={[s.metaRow, isMe && s.metaRowMe]}>
        <Text style={s.bubbleTime}>{formatTime(item.created_at)}</Text>
        {isMe && <Ionicons name="checkmark-done" size={13} color={colors.ember} />}
      </View>
    </View>
  );
}

export default function FriendChatScreen({ route, navigation }) {
  const { friendship: initialFriendship, otherUser, myUid } = route?.params ?? {};

  const [messages,    setMessages]    = useState([]);
  const [text,        setText]        = useState('');
  const [loading,     setLoading]     = useState(true);
  const [friendship,  setFriendship]  = useState(initialFriendship);
  const [myMsgCount,  setMyMsgCount]  = useState(0);
  const listRef = useRef(null);

  const iAmRequester = friendship?.requester_id === myUid;
  const isPending    = friendship?.status === 'pending';
  const isLimited    = iAmRequester && isPending;
  const msgLimitHit  = isLimited && myMsgCount >= MAX_PENDING_MSGS;

  const scrollToBottom = useCallback(() => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  }, []);

  useEffect(() => {
    if (!friendship?.id) return;
    let channel;

    (async () => {
      // Load messages
      const { data } = await supabase
        .from('friend_messages')
        .select('*')
        .eq('friendship_id', friendship.id)
        .order('created_at', { ascending: true });

      const msgs = data ?? [];
      setMessages(msgs);
      setMyMsgCount(msgs.filter(m => m.sender_id === myUid).length);
      setLoading(false);
      scrollToBottom();

      // Realtime
      channel = supabase.channel(`fchat:${friendship.id}`)
        .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'friend_messages', filter: `friendship_id=eq.${friendship.id}` },
          async (payload) => {
            const msg = payload.new;
            setMessages(prev => {
              if (prev.find(m => m.id === msg.id)) return prev;
              return [...prev, msg];
            });
            // If recipient (not requester) just replied → auto-accept
            if (msg.sender_id !== myUid && isPending && !iAmRequester) {
              // I am recipient and other person (requester) already in chat — wait for my reply
            }
            if (msg.sender_id === myUid && isPending && !iAmRequester) {
              // I (recipient) just replied → auto-accept
              autoAccept();
            }
            if (msg.sender_id !== myUid) {
              setMyMsgCount(c => c); // don't change count for other person's messages
            } else {
              setMyMsgCount(c => c + 1);
            }
            scrollToBottom();
          }
        ).subscribe();
    })();

    return () => { if (channel) supabase.removeChannel(channel); };
  }, [friendship?.id]);

  const autoAccept = async () => {
    if (friendship.status === 'accepted') return;
    const { error } = await supabase.from('friendships').update({ status: 'accepted' }).eq('id', friendship.id);
    if (!error) setFriendship(f => ({ ...f, status: 'accepted' }));
  };

  const send = async () => {
    const trimmed = text.trim();
    if (!trimmed || !myUid || !friendship?.id) return;
    if (msgLimitHit) {
      Alert.alert('Message limit reached', `You can send up to ${MAX_PENDING_MSGS} messages until ${otherUser?.name ?? 'they'} accepts your request.`);
      return;
    }

    const tempId = 'temp-' + Date.now();
    const tempMsg = {
      id: tempId,
      friendship_id: friendship.id,
      sender_id: myUid,
      text: trimmed,
      created_at: new Date().toISOString(),
      isTemp: true,
    };

    setMessages(prev => [...prev, tempMsg]);
    setText('');
    setMyMsgCount(c => c + 1);
    scrollToBottom();

    // If I'm the recipient replying → auto-accept silently
    if (!iAmRequester && isPending) {
      autoAccept();
    }

    const { data, error } = await supabase.from('friend_messages').insert({
      friendship_id: friendship.id,
      sender_id: myUid,
      text: trimmed,
    }).select().single();

    if (error) {
      console.log('Send error:', error.message);
      setMessages(prev => prev.filter(m => m.id !== tempId));
      setMyMsgCount(c => c - 1);
      return;
    }
    
    setMessages(prev => {
      const filtered = prev.filter(m => m.id !== tempId);
      if (!filtered.find(m => m.id === data.id)) {
        return [...filtered, data];
      }
      return filtered;
    });
  };

  const handlePressShare = async (item) => {
    if (!item.post_user_id) return;
    try {
      const { data } = await supabase.from('users').select('*').eq('id', item.post_user_id).single();
      if (data) {
        // Navigate to their profile via MatchScreen
        navigation?.navigate('Match', { otherUser: data });
      }
    } catch (e) {
      console.log('Error opening shared post user', e);
    }
  };

  const name     = otherUser?.name      ?? 'Friend';
  const photoUrl = otherUser?.photo_urls?.[0] ?? null;

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation?.goBack()}>
          <Ionicons name="chevron-back" size={22} color={colors.graphite} />
        </TouchableOpacity>
        <TouchableOpacity 
          style={s.headerProfile}
          onPress={() => otherUser?.id && navigation?.navigate('UserProfile', { userId: otherUser.id })}
          activeOpacity={0.7}
        >
          <View style={[s.headerAv, { backgroundColor: '#FFE8D6', overflow: 'hidden' }]}>
            {photoUrl
              ? <Image source={{ uri: photoUrl }} style={StyleSheet.absoluteFillObject} borderRadius={21} />
              : <Ionicons name="person" size={20} color={colors.ash} />}
          </View>
          <View>
            <Text style={s.headerName}>{name}</Text>
            <Text style={s.headerSub}>
              {friendship?.status === 'accepted' ? 'Friends' : 'Pending request'}
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Status banner */}
      {isPending && (
        <View style={[s.banner, iAmRequester ? s.bannerPending : s.bannerIncoming]}>
          <Ionicons
            name={iAmRequester ? 'time-outline' : 'person-add-outline'}
            size={13}
            color={iAmRequester ? colors.stone : colors.ember}
          />
          <Text style={[s.bannerText, !iAmRequester && { color: colors.ember }]}>
            {iAmRequester
              ? `Waiting for ${name} to accept · ${MAX_PENDING_MSGS - myMsgCount} message${MAX_PENDING_MSGS - myMsgCount !== 1 ? 's' : ''} remaining`
              : `${name} sent you a friend request`}
          </Text>
        </View>
      )}
      {friendship?.status === 'accepted' && (
        <View style={[s.banner, s.bannerAccepted]}>
          <Ionicons name="heart" size={13} color={colors.ember} />
          <Text style={[s.bannerText, { color: colors.ember }]}>You're friends with {name}</Text>
        </View>
      )}

      {/* Messages */}
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: colors.ash }}>Loading…</Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={item => item.id}
          renderItem={({ item }) => <Bubble item={item} myId={myUid} onPressShare={handlePressShare} />}
          contentContainerStyle={s.msgList}
          onContentSizeChange={scrollToBottom}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingVertical: 40 }}>
              <Ionicons name="chatbubbles-outline" size={40} color={colors.ash} style={{ marginBottom: 12 }} />
              <Text style={{ color: colors.stone, fontSize: 15 }}>
                {iAmRequester ? `Say hi to ${name}!` : `${name} sent you a friend request`}
              </Text>
              {iAmRequester && (
                <Text style={{ color: colors.ash, fontSize: 13, marginTop: 6, textAlign: 'center', paddingHorizontal: 32 }}>
                  You can send up to {MAX_PENDING_MSGS} messages before they accept.
                </Text>
              )}
            </View>
          }
        />
      )}

      {/* Message limit wall */}
      {msgLimitHit && (
        <View style={s.limitWall}>
          <Ionicons name="lock-closed" size={18} color={colors.stone} />
          <Text style={s.limitText}>
            Message limit reached. Wait for {name} to accept your request.
          </Text>
        </View>
      )}

      {/* Input */}
      {!msgLimitHit && (
        <View style={s.inputBar}>
          <TextInput
            style={s.input}
            value={text}
            onChangeText={setText}
            placeholder={`Message ${name}…`}
            placeholderTextColor={colors.ash}
            multiline
            maxLength={1000}
          />
          <TouchableOpacity
            style={[s.sendBtn, !text.trim() && s.sendBtnDisabled]}
            onPress={send}
            disabled={!text.trim()}
          >
            <Ionicons name="arrow-up" size={20} color={colors.white} />
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingTop: 54, paddingBottom: 12,
    borderBottomWidth: 1, borderColor: colors.fog, gap: 8,
  },
  backBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.fog, alignItems: 'center', justifyContent: 'center' },
  headerProfile: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerAv:  { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  headerName:{ fontSize: 15, fontWeight: '700', color: colors.ink },
  headerSub: { fontSize: 12, color: colors.ash, marginTop: 1 },

  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingVertical: 9, paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  bannerPending:  { backgroundColor: colors.snow,      borderColor: colors.fog },
  bannerIncoming: { backgroundColor: colors.emberLight, borderColor: colors.ember + '30' },
  bannerAccepted: { backgroundColor: colors.emberLight, borderColor: colors.ember + '30' },
  bannerText: { fontSize: 12, color: colors.stone, fontWeight: '500', flex: 1 },

  msgList:    { padding: 16, paddingBottom: 8 },
  bubbleRow:  { marginBottom: 4, alignItems: 'flex-start', maxWidth: '80%' },
  bubbleRowMe:{ alignSelf: 'flex-end', alignItems: 'flex-end' },
  bubble:     { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 20, maxWidth: W * 0.72 },
  bubbleThem:   { backgroundColor: colors.snow, borderBottomLeftRadius: 4 },
  bubbleMe:     { backgroundColor: colors.ember, borderBottomRightRadius: 4 },
  bubbleText:   { fontSize: 16, color: colors.ink, lineHeight: 23, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' },
  bubbleTextMe: { color: colors.white },
  metaRow:    { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3, paddingHorizontal: 4 },
  metaRowMe:  { justifyContent: 'flex-end' },
  bubbleTime: { fontSize: 11, color: colors.ash },

  bubbleShare: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 20, maxWidth: W * 0.72, borderWidth: 1, borderColor: colors.fog },
  shareHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  shareHeaderText: { fontSize: 13, fontWeight: '600', color: colors.ember },
  shareHeaderTextMe: { color: colors.white },

  limitWall: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, marginBottom: 12, padding: 14,
    backgroundColor: colors.snow, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.fog,
  },
  limitText: { flex: 1, fontSize: 13, color: colors.stone, lineHeight: 18 },

  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    padding: 10, paddingBottom: 28, borderTopWidth: 1, borderColor: colors.fog,
  },
  input: {
    flex: 1, backgroundColor: colors.snow, borderRadius: 22,
    paddingHorizontal: 16, paddingVertical: 10,
    fontSize: 15, color: colors.ink, maxHeight: 120,
    borderWidth: 1, borderColor: colors.fog,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.ember,
    alignItems: 'center', justifyContent: 'center', marginBottom: 2,
  },
  sendBtnDisabled: { backgroundColor: colors.fog },
});
