// screens/MatchesScreen.jsx
import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ScrollView, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radius } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import { supabase } from '../supabase/client';

function timeAgo(iso) {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso)) / 1000;
  if (diff < 60)    return 'now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

function NewMatchBubble({ item, onPress }) {
  const { colors, shadow, isDark } = useTheme();
  const s = getStyles(colors, shadow, isDark);
  return (
    <TouchableOpacity style={s.newMatchItem} onPress={() => onPress(item)} activeOpacity={0.8}>
      <View style={s.newMatchRing}>
        <View style={[s.newMatchAv, { backgroundColor: item.bg, overflow: 'hidden' }]}>
          {item.photoUrl
            ? <Image source={{ uri: item.photoUrl }} style={StyleSheet.absoluteFillObject} />
            : <Ionicons name="person" size={26} color={colors.ash} />}
        </View>
      </View>
      <Text style={s.newMatchName} numberOfLines={1}>{item.name}</Text>
      <Text style={s.newMatchTime}>{item.time}</Text>
    </TouchableOpacity>
  );
}

function ConversationRow({ item, onPress }) {
  const { colors, shadow, isDark } = useTheme();
  const s = getStyles(colors, shadow, isDark);
  return (
    <TouchableOpacity style={s.convRow} onPress={() => onPress(item)} activeOpacity={0.75}>
      <View style={s.convAvWrap}>
        <View style={[s.convAv, { backgroundColor: item.bg, overflow: 'hidden' }]}>
          {item.photoUrl
            ? <Image source={{ uri: item.photoUrl }} style={StyleSheet.absoluteFillObject} borderRadius={28} />
            : <Ionicons name="person" size={24} color={colors.ash} />}
        </View>
        {item.online && <View style={s.onlineDot} />}
      </View>
      <View style={s.convInfo}>
        <View style={s.convTop}>
          <Text style={[s.convName, item.unread > 0 && s.convNameBold]}>{item.name}</Text>
          <Text style={s.convTime}>{item.time}</Text>
        </View>
        <View style={s.convBottom}>
          <Text style={[s.convPreview, item.unread > 0 && s.convPreviewBold]} numberOfLines={1}>
            {item.lastMsg}
          </Text>
          {item.unread > 0 && (
            <View style={s.unreadBadge}>
              <Text style={s.unreadText}>{item.unread}</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function MatchesScreen({ navigation }) {
  const { colors, shadow, isDark } = useTheme();
  const s = getStyles(colors, shadow, isDark);
  const [activeTab, setActiveTab] = useState('matches');
  const [matches, setMatches] = useState([]);
  const [friends, setFriends] = useState([]);
  const [myId,    setMyId]    = useState(null);
  const [loading, setLoading] = useState(true);

  const loadFriends = async (uid) => {
    const { data: friendRows } = await supabase
      .from('friendships')
      .select('id, created_at, requester_id, recipient_id, status')
      .eq('status', 'accepted')
      .or(`requester_id.eq.${uid},recipient_id.eq.${uid}`)
      .order('created_at', { ascending: false });

    if (!friendRows || friendRows.length === 0) { setFriends([]); return; }

    const uniqueFriendsMap = {};
    for (const f of friendRows) {
      const otherId = f.requester_id === uid ? f.recipient_id : f.requester_id;
      if (!uniqueFriendsMap[otherId]) {
        uniqueFriendsMap[otherId] = f;
      }
    }
    const uniqueFriends = Object.values(uniqueFriendsMap);

    const otherIds = uniqueFriends.map(f => f.requester_id === uid ? f.recipient_id : f.requester_id);
    const { data: profiles } = await supabase.from('users').select('id, name, photo_urls').in('id', otherIds);

    const enriched = await Promise.all(uniqueFriends.map(async (friendship) => {
      const otherId   = friendship.requester_id === uid ? friendship.recipient_id : friendship.requester_id;
      const otherUser = profiles?.find(p => p.id === otherId) ?? { id: otherId, name: 'Friend' };
      const { data: msgs } = await supabase
        .from('friend_messages').select('text, created_at, sender_id')
        .eq('friendship_id', friendship.id).order('created_at', { ascending: false }).limit(1);
      return { ...friendship, otherUser, lastMessage: msgs?.[0] ?? null };
    }));

    setFriends(enriched);
  };

  const loadMatches = async (uid) => {
    const { data: matchRows } = await supabase
      .from('matches')
      .select('id, created_at, user1_id, user2_id')
      .or(`user1_id.eq.${uid},user2_id.eq.${uid}`)
      .order('created_at', { ascending: false });

    if (!matchRows || matchRows.length === 0) { setMatches([]); setLoading(false); return; }

    const uniqueMatchesMap = {};
    for (const m of matchRows) {
      const otherId = m.user1_id === uid ? m.user2_id : m.user1_id;
      if (!uniqueMatchesMap[otherId]) {
        uniqueMatchesMap[otherId] = m;
      }
    }
    const uniqueMatches = Object.values(uniqueMatchesMap);

    const otherIds = uniqueMatches.map(m => m.user1_id === uid ? m.user2_id : m.user1_id);
    const { data: profiles } = await supabase.from('users').select('id, name, photo_urls').in('id', otherIds);

    const enriched = await Promise.all(uniqueMatches.map(async (match) => {
      const otherId   = match.user1_id === uid ? match.user2_id : match.user1_id;
      const otherUser = profiles?.find(p => p.id === otherId) ?? { id: otherId, name: 'User' };
      return { ...match, otherUser };
    }));

    setMatches(enriched);
    setLoading(false);
  };

  useEffect(() => {
    let channel;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }
      setMyId(session.user.id);
      await Promise.all([
        loadMatches(session.user.id),
        loadFriends(session.user.id)
      ]);

      channel = supabase.channel('matches-realtime')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'matches'  }, () => loadMatches(session.user.id))
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => loadMatches(session.user.id))
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'friendships' }, () => loadFriends(session.user.id))
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'friend_messages' }, () => loadFriends(session.user.id))
        .subscribe();
    })();
    return () => { if (channel) supabase.removeChannel(channel); };
  }, []);

  const openProfile = (match) => navigation?.navigate('UserProfile', { userId: match.otherUser.id });

  return (
    <View style={s.root}>
      {/* Header Tabs */}
      <View style={s.header}>
        <View style={s.tabsRow}>
          <TouchableOpacity style={[s.tabBtn, activeTab === 'matches' && s.tabBtnActive]} onPress={() => setActiveTab('matches')}>
            <Text style={[s.tabText, activeTab === 'matches' && s.tabTextActive]}>Matches</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.tabBtn, activeTab === 'friends' && s.tabBtnActive]} onPress={() => setActiveTab('friends')}>
            <Text style={[s.tabText, activeTab === 'friends' && s.tabTextActive]}>Friends</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={s.filterBtn}>
          <Ionicons name="options-outline" size={18} color={colors.graphite} />
        </TouchableOpacity>
      </View>

      {/* Search bar */}
      <View style={s.searchBar}>
        <Ionicons name="search-outline" size={16} color={colors.ash} />
        <Text style={s.searchPlaceholder}>Search {activeTab}…</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={{ alignItems: 'center', paddingVertical: 40 }}>
            <Text style={{ color: colors.ash }}>Loading…</Text>
          </View>
        ) : activeTab === 'matches' ? (
          matches.length === 0 ? (
          <View style={s.emptyHint}>
            <Ionicons name="heart-dislike-outline" size={32} color={colors.ember} style={{ marginBottom: 12, alignSelf: 'center' }} />
            <Text style={s.emptyHintText}>No matches yet — start swiping in Discover!</Text>
          </View>
        ) : (
          <>
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>Your Matches</Text>
              <View style={s.newBadge}><Text style={s.newBadgeText}>{matches.length}</Text></View>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.newMatchesRow}>
              {matches.map(match => (
                <NewMatchBubble
                  key={match.id}
                  item={{
                    id: match.id,
                    name: match.otherUser?.name ?? 'Match',
                    photoUrl: match.otherUser?.photo_urls?.[0] ?? null,
                    bg: '#FFE8D6',
                    time: timeAgo(match.created_at),
                  }}
                  onPress={() => openProfile(match)}
                />
              ))}
            </ScrollView>
            <View style={s.divider} />
          </>
        )) : (
          friends.length === 0 ? (
            <View style={s.emptyHint}>
              <Ionicons name="people-outline" size={32} color={colors.ember} style={{ marginBottom: 12, alignSelf: 'center' }} />
              <Text style={s.emptyHintText}>You have no friends yet. Send some requests!</Text>
            </View>
          ) : (
            <>
              {friends.filter(f => !f.lastMessage).length > 0 && (
                <>
                  <View style={s.sectionHeader}>
                    <Text style={s.sectionTitle}>Your Friends</Text>
                    <View style={s.newBadge}><Text style={s.newBadgeText}>{friends.filter(f => !f.lastMessage).length}</Text></View>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.newMatchesRow}>
                    {friends.filter(f => !f.lastMessage).map(friend => (
                      <NewMatchBubble
                        key={friend.id}
                        item={{
                          id: friend.id,
                          name: friend.otherUser?.name ?? 'Friend',
                          photoUrl: friend.otherUser?.photo_urls?.[0] ?? null,
                          bg: '#FFE8D6',
                          time: timeAgo(friend.created_at),
                        }}
                        onPress={() => navigation?.navigate('FriendChat', { friendship: friend, otherUser: friend.otherUser, myUid: myId })}
                      />
                    ))}
                  </ScrollView>
                  <View style={s.divider} />
                </>
              )}

              {friends.filter(f => f.lastMessage).length > 0 && (
                <>
                  <View style={s.sectionHeader}>
                    <Text style={s.sectionTitle}>Friend Chats</Text>
                  </View>
                  {friends.filter(f => f.lastMessage).map(friend => (
                    <ConversationRow
                      key={friend.id}
                      item={{
                        id: friend.id,
                        name: friend.otherUser?.name ?? 'Friend',
                        photoUrl: friend.otherUser?.photo_urls?.[0] ?? null,
                        bg: '#FFE8D6',
                        lastMsg: friend.lastMessage?.sender_id === myId
                          ? `You: ${friend.lastMessage.text}`
                          : friend.lastMessage?.text ?? '',
                        time: timeAgo(friend.lastMessage?.created_at),
                        unread: 0, online: false,
                      }}
                      onPress={() => navigation?.navigate('FriendChat', { friendship: friend, otherUser: friend.otherUser, myUid: myId })}
                    />
                  ))}
                </>
              )}
            </>
          )
        )}
        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  );
}

const getStyles = (colors, shadow, isDark) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 22, paddingTop: 56, paddingBottom: 14,
  },
  tabsRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  tabBtn: { paddingVertical: 6 },
  tabBtnActive: { borderBottomWidth: 2, borderColor: colors.ember },
  tabText: { fontSize: 24, fontWeight: '800', color: colors.ash, letterSpacing: -0.5 },
  tabTextActive: { color: colors.ink },
  filterBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: colors.snow, borderWidth: 1, borderColor: colors.fog,
    alignItems: 'center', justifyContent: 'center',
  },

  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 20, marginBottom: 18,
    backgroundColor: colors.snow, borderRadius: radius.full,
    paddingHorizontal: 16, paddingVertical: 11,
    borderWidth: 1, borderColor: colors.fog,
  },
  searchPlaceholder: { fontSize: 15, color: colors.ash },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 22, marginBottom: 14 },
  sectionTitle:  { fontSize: 15, fontWeight: '700', color: colors.ink },
  newBadge:      { backgroundColor: colors.ember, borderRadius: radius.full, paddingHorizontal: 7, paddingVertical: 2 },
  newBadgeText:  { color: colors.white, fontSize: 11, fontWeight: '700' },

  newMatchesRow: { paddingHorizontal: 18, gap: 16, paddingBottom: 4 },
  newMatchItem:  { alignItems: 'center', gap: 6, width: 70 },
  newMatchRing:  { padding: 3, borderRadius: 99, borderWidth: 2, borderColor: colors.ember },
  newMatchAv:    { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center' },
  newMatchName:  { fontSize: 12, fontWeight: '600', color: colors.ink, textAlign: 'center' },
  newMatchTime:  { fontSize: 10, color: colors.ash },

  divider: { height: 1, backgroundColor: colors.fog, marginHorizontal: 22, marginVertical: 20 },

  convRow:    { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 12 },
  convAvWrap: { position: 'relative' },
  convAv:     { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  onlineDot:  { position: 'absolute', bottom: 2, right: 2, width: 13, height: 13, borderRadius: 7, backgroundColor: colors.success, borderWidth: 2, borderColor: colors.white },
  convInfo:   { flex: 1, minWidth: 0 },
  convTop:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 },
  convName:       { fontSize: 15, color: colors.ink, fontWeight: '400' },
  convNameBold:   { fontWeight: '700' },
  convTime:       { fontSize: 11, color: colors.ash },
  convBottom:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  convPreview:    { flex: 1, fontSize: 13, color: colors.ash, lineHeight: 18 },
  convPreviewBold:{ color: colors.graphite, fontWeight: '500' },
  unreadBadge: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: colors.ember, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  unreadText:  { color: colors.white, fontSize: 11, fontWeight: '700' },

  emptyHint:    { margin: 24, padding: 20, backgroundColor: colors.emberLight, borderRadius: radius.lg },
  emptyHintText:{ fontSize: 13, color: colors.ember, textAlign: 'center', lineHeight: 20 },
});
