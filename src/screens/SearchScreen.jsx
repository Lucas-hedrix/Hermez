// screens/SearchScreen.jsx — search users + friend requests
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Image, TextInput, ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, shadow } from '../theme';
import { supabase } from '../supabase/client';

// ── Friendship state helper ───────────────────────────────────────────────────
function getFriendState(friendships, userId, myUid) {
  const f = friendships[userId];
  if (!f) return 'none';
  if (f.status === 'accepted') return 'friends';
  return f.requester_id === myUid ? 'pending_sent' : 'pending_received';
}

// ── User card ─────────────────────────────────────────────────────────────────
function UserCard({ user, friendState, onAdd, onAccept, onCancel, onOpenChat }) {
  return (
    <View style={c.card}>
      <TouchableOpacity style={c.avatarWrap} onPress={() => onOpenChat(user)} activeOpacity={0.8}>
        <View style={[c.avatar, { backgroundColor: '#FFE8D6', overflow: 'hidden' }]}>
          {user.photo_urls?.[0]
            ? <Image source={{ uri: user.photo_urls[0] }} style={c.avatarImg} />
            : <Ionicons name="person" size={28} color={colors.ash} />}
        </View>
        {/* Online dot placeholder */}
        <View style={c.onlineDot} />
      </TouchableOpacity>

      <View style={c.info}>
        <Text style={c.name}>{user.name}{user.age ? `, ${user.age}` : ''}</Text>
        {user.city ? (
          <View style={c.locationRow}>
            <Ionicons name="location-sharp" size={12} color={colors.ash} />
            <Text style={c.city}>{user.city}</Text>
          </View>
        ) : null}
        {user.bio ? <Text style={c.bio} numberOfLines={1}>{user.bio}</Text> : null}
      </View>

      {/* Action button */}
      {friendState === 'none' && (
        <TouchableOpacity style={c.addBtn} onPress={() => onAdd(user.id)}>
          <Ionicons name="person-add" size={16} color={colors.white} />
        </TouchableOpacity>
      )}
      {friendState === 'pending_sent' && (
        <TouchableOpacity style={[c.statusPill, { backgroundColor: colors.fog }]} onPress={() => onCancel(user.id)}>
          <Ionicons name="time-outline" size={13} color={colors.stone} />
          <Text style={[c.statusText, { color: colors.stone }]}>Sent · Cancel</Text>
        </TouchableOpacity>
      )}
      {friendState === 'pending_received' && (
        <TouchableOpacity style={[c.statusPill, { backgroundColor: colors.ember }]} onPress={() => onAccept(user.id)}>
          <Ionicons name="checkmark" size={13} color={colors.white} />
          <Text style={[c.statusText, { color: colors.white }]}>Accept</Text>
        </TouchableOpacity>
      )}
      {friendState === 'friends' && (
        <TouchableOpacity style={[c.statusPill, { backgroundColor: colors.emberLight }]} onPress={() => onOpenChat(user)}>
          <Ionicons name="chatbubble-ellipses" size={13} color={colors.ember} />
          <Text style={[c.statusText, { color: colors.ember }]}>Message</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const c = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.white, borderRadius: radius.lg,
    padding: 12, marginHorizontal: 16, marginBottom: 10,
    borderWidth: 1, borderColor: colors.fog,
  },
  avatarWrap: { position: 'relative' },
  avatar: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  avatarImg: { width: '100%', height: '100%', borderRadius: 26 },
  onlineDot: {
    position: 'absolute', bottom: 1, right: 1,
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: colors.success, borderWidth: 2, borderColor: colors.white,
  },
  info: { flex: 1, minWidth: 0 },
  name: { fontSize: 15, fontWeight: '700', color: colors.ink, marginBottom: 2 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 2 },
  city: { fontSize: 12, color: colors.ash },
  bio:  { fontSize: 12, color: colors.stone },
  addBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: colors.ember,
    alignItems: 'center', justifyContent: 'center',
  },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.full,
  },
  statusText: { fontSize: 12, fontWeight: '600' },
});

// ── Pending request banner ────────────────────────────────────────────────────
function PendingBanner({ requests, usersMap, onAccept }) {
  if (requests.length === 0) return null;
  return (
    <View style={pb.wrap}>
      <View style={pb.header}>
        <Ionicons name="person-add" size={15} color={colors.ember} />
        <Text style={pb.title}>Friend requests</Text>
        <View style={pb.badge}><Text style={pb.badgeText}>{requests.length}</Text></View>
      </View>
      {requests.map(req => {
        const requester = usersMap[req.requester_id];
        if (!requester) return null;
        return (
          <View key={req.id} style={pb.row}>
            <View style={[pb.avatar, { overflow: 'hidden' }]}>
              {requester.photo_urls?.[0]
                ? <Image source={{ uri: requester.photo_urls[0] }} style={{ width: '100%', height: '100%', borderRadius: 20 }} />
                : <Ionicons name="person" size={18} color={colors.ash} />}
            </View>
            <Text style={pb.name} numberOfLines={1}>{requester.name}</Text>
            <TouchableOpacity style={pb.acceptBtn} onPress={() => onAccept(req)}>
              <Text style={pb.acceptText}>Accept</Text>
            </TouchableOpacity>
          </View>
        );
      })}
    </View>
  );
}

const pb = StyleSheet.create({
  wrap: {
    marginHorizontal: 16, marginBottom: 16, backgroundColor: colors.white,
    borderRadius: radius.lg, padding: 14,
    borderWidth: 1, borderColor: colors.ember + '40',
    borderLeftWidth: 4, borderLeftColor: colors.ember,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  title:  { fontSize: 14, fontWeight: '700', color: colors.ink, flex: 1 },
  badge:  { backgroundColor: colors.ember, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  badgeText: { color: colors.white, fontSize: 11, fontWeight: '700' },
  row:    { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFE8D6', alignItems: 'center', justifyContent: 'center' },
  name:   { flex: 1, fontSize: 14, fontWeight: '600', color: colors.ink },
  acceptBtn: { backgroundColor: colors.ember, borderRadius: radius.full, paddingVertical: 6, paddingHorizontal: 14 },
  acceptText:{ color: colors.white, fontSize: 13, fontWeight: '600' },
});

// ── Main SearchScreen ─────────────────────────────────────────────────────────
export default function SearchScreen({ navigation }) {
  const [query,        setQuery]        = useState('');
  const [results,      setResults]      = useState([]);
  const [recommended,  setRecommended]  = useState([]);
  const [friendships,  setFriendships]  = useState({});  // keyed by other user id
  const [pendingIn,    setPendingIn]    = useState([]);   // incoming pending requests
  const [requesterMap, setRequesterMap] = useState({});   // userId → profile, for pending banners
  const [loading,      setLoading]      = useState(false);
  const [myUid,        setMyUid]        = useState(null);
  const debounceRef = useRef(null);

  // ── Load initial data ────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const uid = session.user.id;
      setMyUid(uid);
      loadRecommended(uid);
      loadFriendships(uid);
    })();
  }, []);

  const loadRecommended = async (uid) => {
    const { data } = await supabase
      .from('users')
      .select('id, name, age, city, photo_urls, bio')
      .neq('id', uid)
      .eq('profile_complete', true)
      .limit(20);
    setRecommended(data ?? []);
  };

  const loadFriendships = async (uid) => {
    const { data } = await supabase
      .from('friendships')
      .select('*')
      .or(`requester_id.eq.${uid},recipient_id.eq.${uid}`);

    const map = {};
    (data ?? []).forEach(f => {
      const otherId = f.requester_id === uid ? f.recipient_id : f.requester_id;
      map[otherId] = f;
    });
    setFriendships(map);

    // Incoming pending requests
    const incoming = (data ?? []).filter(f => f.recipient_id === uid && f.status === 'pending');
    setPendingIn(incoming);

    // Fetch requester profiles for the banner
    if (incoming.length > 0) {
      const ids = incoming.map(f => f.requester_id);
      const { data: profiles } = await supabase.from('users').select('id, name, photo_urls').in('id', ids);
      const rMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]));
      setRequesterMap(rMap);
    }
  };

  // ── Realtime — listen for new incoming friend requests ────────────────────
  useEffect(() => {
    if (!myUid) return;
    const channel = supabase.channel('friendship-notif')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'friendships', filter: `recipient_id=eq.${myUid}` },
        async (payload) => {
          const newReq = payload.new;
          // Fetch requester profile
          const { data: prof } = await supabase.from('users').select('id, name, photo_urls').eq('id', newReq.requester_id).single();
          if (prof) {
            setRequesterMap(prev => ({ ...prev, [prof.id]: prof }));
            setPendingIn(prev => [...prev, newReq]);
            Alert.alert(
              'Friend request',
              `${prof.name} sent you a friend request!`,
              [{ text: 'View', onPress: () => {} }, { text: 'Dismiss' }]
            );
          }
        }
      ).subscribe();
    return () => supabase.removeChannel(channel);
  }, [myUid]);

  // ── Search ───────────────────────────────────────────────────────────────
  const doSearch = useCallback(async (q) => {
    if (!q.trim() || !myUid) { setResults([]); return; }
    setLoading(true);
    try {
      const { data } = await supabase
        .from('users')
        .select('id, name, age, city, photo_urls, bio')
        .neq('id', myUid)
        .eq('profile_complete', true)
        .ilike('name', `%${q.trim()}%`)
        .limit(20);
      setResults(data ?? []);
    } finally {
      setLoading(false);
    }
  }, [myUid]);

  const handleChange = (text) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(text), 300);
  };

  // ── Friend actions ───────────────────────────────────────────────────────
  const sendRequest = async (recipientId) => {
    try {
      const { data, error } = await supabase.from('friendships').insert({
        requester_id: myUid,
        recipient_id: recipientId,
        status: 'pending',
      }).select().single();
      if (error) throw error;
      setFriendships(prev => ({ ...prev, [recipientId]: data }));
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  };

  const cancelRequest = (recipientId) => {
    Alert.alert(
      'Cancel request',
      'Are you sure you want to cancel this friend request?',
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Cancel request', style: 'destructive',
          onPress: async () => {
            try {
              const f = friendships[recipientId];
              if (!f?.id) return;
              await supabase.from('friendships').delete().eq('id', f.id);
              setFriendships(prev => { const n = { ...prev }; delete n[recipientId]; return n; });
            } catch (e) {
              Alert.alert('Error', e.message);
            }
          },
        },
      ]
    );
  };

  const acceptRequest = async (friendship) => {
    try {
      const { error } = await supabase.from('friendships').update({ status: 'accepted' }).eq('id', friendship.id);
      if (error) throw error;
      const otherId = friendship.requester_id === myUid ? friendship.recipient_id : friendship.requester_id;
      setFriendships(prev => ({ ...prev, [otherId]: { ...friendship, status: 'accepted' } }));
      setPendingIn(prev => prev.filter(f => f.id !== friendship.id));
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  };

  const openFriendChat = (otherUser) => {
    const f = friendships[otherUser.id];
    if (!f) {
      Alert.alert('Send a request first', `Add ${otherUser.name} as a friend to message them.`);
      return;
    }
    navigation?.navigate('FriendChat', { friendship: f, otherUser, myUid });
  };

  const displayList = query.trim() ? results : recommended;
  const showingSearch = !!query.trim();

  return (
    <View style={s.root}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.title}>Search</Text>
      </View>

      {/* Search bar */}
      <View style={s.searchWrap}>
        <Ionicons name="search-outline" size={18} color={colors.ash} style={s.searchIcon} />
        <TextInput
          style={s.searchInput}
          placeholder="Search by name…"
          placeholderTextColor={colors.ash}
          value={query}
          onChangeText={handleChange}
          autoCapitalize="words"
          returnKeyType="search"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => { setQuery(''); setResults([]); }}>
            <Ionicons name="close-circle" size={18} color={colors.ash} />
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={displayList}
        keyExtractor={item => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }}
        ListHeaderComponent={
          <View>
            {/* Pending requests banner */}
            {!showingSearch && (
              <PendingBanner
                requests={pendingIn}
                usersMap={requesterMap}
                onAccept={acceptRequest}
              />
            )}

            <View style={s.sectionRow}>
              <Text style={s.sectionLabel}>
                {showingSearch ? `Results for "${query}"` : 'People you may know'}
              </Text>
              {loading && <ActivityIndicator color={colors.ember} size="small" />}
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <UserCard
            user={item}
            friendState={getFriendState(friendships, item.id, myUid)}
            onAdd={sendRequest}
            onCancel={cancelRequest}
            onAccept={() => acceptRequest(friendships[item.id])}
            onOpenChat={openFriendChat}
          />
        )}
        ListEmptyComponent={
          !loading ? (
            <View style={s.empty}>
              <Ionicons name="people-outline" size={40} color={colors.ash} />
              <Text style={s.emptyTitle}>
                {showingSearch ? 'No users found' : 'No suggestions yet'}
              </Text>
              <Text style={s.emptySub}>
                {showingSearch ? 'Try a different name' : 'Check back as more people join!'}
              </Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: colors.snow },
  header: { paddingHorizontal: 22, paddingTop: 56, paddingBottom: 12 },
  title:  { fontSize: 32, fontWeight: '800', color: colors.ink, letterSpacing: -0.8 },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, marginBottom: 16,
    backgroundColor: colors.white, borderRadius: radius.full,
    paddingHorizontal: 16, paddingVertical: 12,
    borderWidth: 1, borderColor: colors.fog,
    ...shadow.soft,
  },
  searchIcon:  {},
  searchInput: { flex: 1, fontSize: 15, color: colors.ink, padding: 0 },

  sectionRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 10 },
  sectionLabel:{ fontSize: 13, fontWeight: '700', color: colors.stone, textTransform: 'uppercase', letterSpacing: 0.6 },

  empty:     { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyTitle:{ fontSize: 18, fontWeight: '700', color: colors.ink },
  emptySub:  { fontSize: 14, color: colors.ash, textAlign: 'center' },
});
