// screens/ChatScreen.jsx
import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, Dimensions, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme';
import { supabase } from '../supabase/client';

const { width: W } = Dimensions.get('window');

function formatTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function Bubble({ item, myId }) {
  const isMe = item.sender_id === myId;
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

export default function ChatScreen({ route, navigation }) {
  const { matchId, otherUser } = route?.params ?? {};

  const [messages, setMessages] = useState([]);
  const [text,     setText]     = useState('');
  const [myId,     setMyId]     = useState(null);
  const [loading,  setLoading]  = useState(true);
  const listRef = useRef(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  }, []);

  useEffect(() => {
    if (!matchId) return;
    let channel;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      setMyId(session.user.id);

      const { data } = await supabase
        .from('messages').select('*')
        .eq('match_id', matchId).order('created_at', { ascending: true });

      setMessages(data ?? []);
      setLoading(false);
      scrollToBottom();

      channel = supabase.channel(`chat:${matchId}`)
        .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages', filter: `match_id=eq.${matchId}` },
          (payload) => {
            setMessages(prev => {
              if (prev.find(m => m.id === payload.new.id)) return prev;
              return [...prev, payload.new];
            });
            scrollToBottom();
          }
        ).subscribe();
    })();
    return () => { if (channel) supabase.removeChannel(channel); };
  }, [matchId]);

  const send = async () => {
    const trimmed = text.trim();
    if (!trimmed || !myId || !matchId) return;
    
    const tempId = 'temp-' + Date.now();
    const tempMsg = {
      id: tempId,
      match_id: matchId,
      sender_id: myId,
      text: trimmed,
      created_at: new Date().toISOString(),
      isTemp: true,
    };
    
    setMessages(prev => [...prev, tempMsg]);
    setText('');
    scrollToBottom();

    const { data, error } = await supabase.from('messages')
      .insert({ match_id: matchId, sender_id: myId, text: trimmed })
      .select().single();
      
    if (error) {
      console.log('Send error:', error.message);
      setMessages(prev => prev.filter(m => m.id !== tempId));
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

  const name     = otherUser?.name     ?? 'Match';
  const photoUrl = otherUser?.photo_urls?.[0] ?? null;

  // Quick-reply suggestions shown when no messages yet
  const SUGGESTIONS = ['Hey! 👋', "What's up?", 'How are you?', 'Love your photos!'];

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
            <View style={s.onlineRow}>
              <View style={s.onlineDot} />
              <Text style={s.headerOnline}>Active now</Text>
            </View>
          </View>
        </TouchableOpacity>
        <View style={s.headerActions}>
          <TouchableOpacity style={s.headerActionBtn}>
            <Ionicons name="call-outline" size={20} color={colors.graphite} />
          </TouchableOpacity>
          <TouchableOpacity style={s.headerActionBtn}>
            <Ionicons name="ellipsis-vertical" size={20} color={colors.graphite} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Match banner */}
      <View style={s.matchBanner}>
        <Ionicons name="heart" size={12} color={colors.ember} style={{ marginRight: 6 }} />
        <Text style={s.matchBannerText}>You matched with {name} · Start the conversation!</Text>
      </View>

      {/* Messages */}
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: colors.ash }}>Loading messages…</Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={item => item.id}
          renderItem={({ item }) => <Bubble item={item} myId={myId} />}
          contentContainerStyle={s.msgList}
          onContentSizeChange={scrollToBottom}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingVertical: 32 }}>
              <Ionicons name="chatbubbles-outline" size={40} color={colors.ash} style={{ marginBottom: 12 }} />
              <Text style={{ color: colors.stone, fontSize: 15, marginBottom: 20 }}>Say hello to {name}!</Text>
              <View style={s.suggestionsRow}>
                {SUGGESTIONS.map(sug => (
                  <TouchableOpacity key={sug} style={s.suggestionPill} onPress={() => setText(sug)}>
                    <Text style={s.suggestionText}>{sug}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          }
        />
      )}

      {/* Input */}
      <View style={s.inputBar}>
        <TouchableOpacity style={s.attachBtn}>
          <Ionicons name="image-outline" size={22} color={colors.stone} />
        </TouchableOpacity>
        <TextInput
          style={s.input}
          value={text}
          onChangeText={setText}
          placeholder={`Message ${name}…`}
          placeholderTextColor={colors.ash}
          multiline
          maxLength={1000}
          returnKeyType="default"
        />
        <TouchableOpacity
          style={[s.sendBtn, !text.trim() && s.sendBtnDisabled]}
          onPress={send}
          disabled={!text.trim()}
        >
          <Ionicons name="arrow-up" size={20} color={colors.white} />
        </TouchableOpacity>
      </View>
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
  backBtn: {
    width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.fog,
    alignItems: 'center', justifyContent: 'center',
  },
  headerProfile: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerAv:      { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  headerName:    { fontSize: 15, fontWeight: '700', color: colors.ink },
  onlineRow:     { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  onlineDot:     { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.success },
  headerOnline:  { fontSize: 12, color: colors.success, fontWeight: '500' },
  headerActions: { flexDirection: 'row', gap: 2 },
  headerActionBtn:{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },

  matchBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.emberLight, paddingVertical: 10, paddingHorizontal: 16,
    borderBottomWidth: 1, borderColor: colors.ember + '30',
  },
  matchBannerText: { fontSize: 12, color: colors.ember, fontWeight: '500' },

  msgList:    { padding: 16, paddingBottom: 8 },
  bubbleRow:  { marginBottom: 4, alignItems: 'flex-start', maxWidth: '80%' },
  bubbleRowMe:{ alignSelf: 'flex-end', alignItems: 'flex-end' },
  bubble:     { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 20, maxWidth: W * 0.72 },
  bubbleThem:     { backgroundColor: colors.snow, borderBottomLeftRadius: 4 },
  bubbleMe:       { backgroundColor: colors.ember, borderBottomRightRadius: 4 },
  bubbleText:     { fontSize: 16, color: colors.ink, lineHeight: 23, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' },
  bubbleTextMe:   { color: colors.white },
  metaRow:    { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3, paddingHorizontal: 4 },
  metaRowMe:  { justifyContent: 'flex-end' },
  bubbleTime: { fontSize: 11, color: colors.ash },

  suggestionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', paddingHorizontal: 16 },
  suggestionPill: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: radius.full, borderWidth: 1, borderColor: colors.fog, backgroundColor: colors.snow },
  suggestionText: { fontSize: 13, color: colors.graphite },

  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    padding: 10, paddingBottom: 28, borderTopWidth: 1, borderColor: colors.fog,
    backgroundColor: colors.white,
  },
  attachBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.snow, borderWidth: 1, borderColor: colors.fog,
    alignItems: 'center', justifyContent: 'center', marginBottom: 2,
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
