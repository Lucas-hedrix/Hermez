import { Image } from 'expo-image';
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Animated,
  Platform} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { radius } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import { supabase } from '../supabase/client';
import { getVibeColor, getVibeIcon, isVibeExpired } from '../constants/vibes';
import { getPlaceholderUrl } from '../utils/placeholders';

function getFriendState(friendships, userId, myUid) {
  const f = friendships[userId];

  if (!f) return 'none';
  if (f.status === 'accepted') return 'friends';

  return f.requester_id === myUid ? 'pending_sent' : 'pending_received';
}

function UserCard({ user, friendState, onAdd, onAccept, onCancel, onOpenChat, index = 0 }) {
  const { colors, shadow } = useTheme();
  const c = getCardStyles(colors, shadow);
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fade, {
      toValue: 1,
      duration: 380,
      delay: Math.min(index * 45, 400),
      useNativeDriver: true,
    }).start();
  }, []);

  const currentVibe = user.current_vibe && user.vibe_set_at && !isVibeExpired(user.vibe_set_at) ? user.current_vibe : null;
  const vibeColor = currentVibe ? getVibeColor(currentVibe) : null;

  return (
    <Animated.View style={[c.card, { opacity: fade, transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }]}>
      <TouchableOpacity
        style={c.avatarWrap}
        onPress={() => onOpenChat(user)}
        activeOpacity={0.8}
      >
        <View style={c.avatar}>
          {user.photo_urls?.[0] ? (
            <Image source={{ uri: user.photo_urls[0] }} style={c.avatarImg} />
          ) : (
            <Image source={{ uri: getPlaceholderUrl(user.name) }} style={c.avatarImg} />
          )}
        </View>

        {!user.hide_last_seen && user.last_seen ? <View style={c.onlineDot} /> : null}
      </TouchableOpacity>

      <View style={c.info}>
        <Text style={c.name} numberOfLines={1}>
          {user.name || 'Cupid user'}
          {user.age ? `, ${user.age}` : ''}
        </Text>

        {user.username ? (
          <Text style={c.username} numberOfLines={1}>
            @{user.username}
          </Text>
        ) : null}

        {user.city || user.region ? (
          <View style={c.locationRow}>
            <Ionicons name="location-sharp" size={12} color={colors.ash} />
            <Text style={c.city} numberOfLines={1}>
              {[user.city, user.region].filter(Boolean).join(', ')}
            </Text>
          </View>
        ) : null}

        {user.bio ? (
          <Text style={c.bio} numberOfLines={1}>
            {user.bio}
          </Text>
        ) : null}

        {currentVibe ? (
          <View style={[c.vibePill, { borderColor: vibeColor + '55', backgroundColor: vibeColor + '18' }]}>
            <Ionicons name={getVibeIcon(currentVibe)} size={11} color={vibeColor} />
            <Text style={[c.vibePillText, { color: vibeColor }]}>{currentVibe}</Text>
          </View>
        ) : null}

        {!user.profile_complete ? (
          <Text style={c.incomplete}>Profile not completed yet</Text>
        ) : null}
      </View>

      {friendState === 'none' && (
        <TouchableOpacity style={c.addBtn} onPress={() => onAdd(user.id)}>
          <Ionicons name="person-add" size={16} color={colors.white} />
        </TouchableOpacity>
      )}

      {friendState === 'pending_sent' && (
        <TouchableOpacity
          style={[c.statusPill, { backgroundColor: colors.fog }]}
          onPress={() => onCancel(user.id)}
        >
          <Ionicons name="time-outline" size={13} color={colors.stone} />
          <Text style={[c.statusText, { color: colors.stone }]}>Sent</Text>
        </TouchableOpacity>
      )}

      {friendState === 'pending_received' && (
        <TouchableOpacity
          style={[c.statusPill, { backgroundColor: colors.ember }]}
          onPress={() => onAccept(user.id)}
        >
          <Ionicons name="checkmark" size={13} color={colors.white} />
          <Text style={[c.statusText, { color: colors.white }]}>Accept</Text>
        </TouchableOpacity>
      )}

      {friendState === 'friends' && (
        <TouchableOpacity
          style={[c.statusPill, { backgroundColor: colors.emberLight }]}
          onPress={() => onOpenChat(user)}
        >
          <Ionicons name="chatbubble-ellipses" size={13} color={colors.ember} />
          <Text style={[c.statusText, { color: colors.ember }]}>Message</Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

const getCardStyles = (colors, shadow) =>
  StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colors.white,
      borderRadius: radius.xl,
      padding: 14,
      marginHorizontal: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.fog + '99',
      ...shadow.soft,
    },
    avatarWrap: { position: 'relative' },
    avatar: {
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.emberLight,
      overflow: 'hidden',
      borderWidth: 2,
      borderColor: colors.ember + '33',
    },
    vibePill: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 4,
      marginTop: 4,
      paddingVertical: 3,
      paddingHorizontal: 8,
      borderRadius: radius.full,
      borderWidth: 1,
    },
    vibePillText: { fontSize: 10, fontWeight: '800' },
    avatarImg: { width: '100%', height: '100%', borderRadius: 26 },
    onlineDot: {
      position: 'absolute',
      bottom: 1,
      right: 1,
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: colors.success,
      borderWidth: 2,
      borderColor: colors.white,
    },
    info: { flex: 1, minWidth: 0 },
    name: { fontSize: 15, fontWeight: '700', color: colors.ink, marginBottom: 2 },
    username: {
      fontSize: 12,
      color: colors.ember,
      fontWeight: '600',
      marginBottom: 2,
    },
    locationRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      marginBottom: 2,
    },
    city: { fontSize: 12, color: colors.ash, flex: 1 },
    bio: { fontSize: 12, color: colors.stone },
    incomplete: {
      fontSize: 11,
      color: colors.ash,
      fontStyle: 'italic',
      marginTop: 2,
    },
    addBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.ember,
      alignItems: 'center',
      justifyContent: 'center',
    },
    statusPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: radius.full,
    },
    statusText: { fontSize: 12, fontWeight: '600' },
  });

function PendingBanner({ requests, usersMap, onAccept }) {
  const { colors } = useTheme();
  const pb = getPendingStyles(colors);

  if (requests.length === 0) return null;

  return (
    <View style={pb.wrap}>
      <View style={pb.header}>
        <Ionicons name="person-add" size={15} color={colors.ember} />
        <Text style={pb.title}>Friend requests</Text>
        <View style={pb.badge}>
          <Text style={pb.badgeText}>{requests.length}</Text>
        </View>
      </View>

      {requests.map((req) => {
        const requester = usersMap[req.requester_id];

        if (!requester) return null;

        return (
          <View key={req.id} style={pb.row}>
            <View style={pb.avatar}>
              {requester.photo_urls?.[0] ? (
                <Image
                  source={{ uri: requester.photo_urls[0] }}
                  style={{ width: '100%', height: '100%', borderRadius: 20 }}
                />
              ) : (
                <Image
                  source={{ uri: getPlaceholderUrl(requester.name) }}
                  style={{ width: '100%', height: '100%', borderRadius: 20 }}
                />
              )}
            </View>

            <Text style={pb.name} numberOfLines={1}>
              {requester.name}
            </Text>

            <TouchableOpacity style={pb.acceptBtn} onPress={() => onAccept(req)}>
              <Text style={pb.acceptText}>Accept</Text>
            </TouchableOpacity>
          </View>
        );
      })}
    </View>
  );
}

const getPendingStyles = (colors) =>
  StyleSheet.create({
    wrap: {
      marginHorizontal: 16,
      marginBottom: 16,
      backgroundColor: colors.white,
      borderRadius: radius.lg,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.ember + '40',
      borderLeftWidth: 4,
      borderLeftColor: colors.ember,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 12,
    },
    title: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.ink,
      flex: 1,
    },
    badge: {
      backgroundColor: colors.ember,
      borderRadius: 10,
      paddingHorizontal: 7,
      paddingVertical: 2,
    },
    badgeText: {
      color: colors.white,
      fontSize: 11,
      fontWeight: '700',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 8,
    },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: '#FFE8D6',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    name: {
      flex: 1,
      fontSize: 14,
      fontWeight: '600',
      color: colors.ink,
    },
    acceptBtn: {
      backgroundColor: colors.ember,
      borderRadius: radius.full,
      paddingVertical: 6,
      paddingHorizontal: 14,
    },
    acceptText: {
      color: colors.white,
      fontSize: 13,
      fontWeight: '600',
    },
  });

export default function SearchScreen({ navigation }) {
  const { colors, shadow, isDark } = useTheme();
  const s = getStyles(colors, shadow, isDark);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [recommended, setRecommended] = useState([]);
  const [friendships, setFriendships] = useState({});
  const [pendingIn, setPendingIn] = useState([]);
  const [requesterMap, setRequesterMap] = useState({});
  const [loading, setLoading] = useState(false);
  const [myUid, setMyUid] = useState(null);

  const debounceRef = useRef(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session || !mounted) return;

      const uid = session.user.id;

      setMyUid(uid);

      await Promise.all([
        loadRecommended(uid),
        loadFriendships(uid),
      ]);
    })();

    return () => {
      mounted = false;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const loadRecommended = async (uid) => {
    const { data, error } = await supabase
      .from('users')
      .select('id, name, username, age, city, region, photo_urls, bio, profile_complete, last_seen, hide_last_seen, current_vibe, vibe_set_at')
      .neq('id', uid)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.log('Recommended users error:', error.message);
      return;
    }

    setRecommended(data ?? []);
  };

  const loadFriendships = async (uid) => {
    const { data, error } = await supabase
      .from('friendships')
      .select('*')
      .or(`requester_id.eq.${uid},recipient_id.eq.${uid}`);

    if (error) {
      console.log('Friendships error:', error.message);
      return;
    }

    const map = {};

    (data ?? []).forEach((f) => {
      const otherId = f.requester_id === uid ? f.recipient_id : f.requester_id;
      map[otherId] = f;
    });

    setFriendships(map);

    const incoming = (data ?? []).filter(
      (f) => f.recipient_id === uid && f.status === 'pending'
    );

    setPendingIn(incoming);

    if (incoming.length > 0) {
      const ids = incoming.map((f) => f.requester_id);

      const { data: profiles } = await supabase
        .from('users')
        .select('id, name, photo_urls')
        .in('id', ids);

      const rMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]));
      setRequesterMap(rMap);
    } else {
      setRequesterMap({});
    }
  };

  useEffect(() => {
    if (!myUid) return;

    const channel = supabase
      .channel('friendship-notif')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'friendships',
          filter: `recipient_id=eq.${myUid}`,
        },
        async (payload) => {
          const newReq = payload.new;

          const { data: prof } = await supabase
            .from('users')
            .select('id, name, photo_urls')
            .eq('id', newReq.requester_id)
            .single();

          if (prof) {
            setRequesterMap((prev) => ({ ...prev, [prof.id]: prof }));
            setPendingIn((prev) => [...prev, newReq]);

            setFriendships((prev) => ({
              ...prev,
              [newReq.requester_id]: newReq,
            }));

            Alert.alert(
              'Friend request',
              `${prof.name} sent you a friend request!`
            );
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'friendships',
        },
        () => {
          loadFriendships(myUid);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [myUid]);

  const doSearch = useCallback(async (q) => {
    const term = q.trim();

    if (!term || !myUid) {
      setResults([]);
      return;
    }

    setLoading(true);

    try {
      const searchTerm = `%${term}%`;

      const { data, error } = await supabase
        .from('users')
        .select('id, name, username, age, city, region, photo_urls, bio, profile_complete, last_seen, hide_last_seen, current_vibe, vibe_set_at')
        .neq('id', myUid)
        .or(
          `name.ilike.${searchTerm},username.ilike.${searchTerm},city.ilike.${searchTerm},region.ilike.${searchTerm},bio.ilike.${searchTerm}`
        )
        .limit(50);

      if (error) throw error;

      setResults(data ?? []);
    } catch (e) {
      Alert.alert('Search failed', e.message);
    } finally {
      setLoading(false);
    }
  }, [myUid]);

  const handleChange = (text) => {
    setQuery(text);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      doSearch(text);
    }, 300);
  };

  const sendRequest = async (recipientId) => {
    if (!myUid || friendships[recipientId]) return;

    const optimistic = {
      requester_id: myUid,
      recipient_id: recipientId,
      status: 'pending',
    };

    try {
      setFriendships((prev) => ({
        ...prev,
        [recipientId]: optimistic,
      }));

      const { data, error } = await supabase
        .from('friendships')
        .insert({
          requester_id: myUid,
          recipient_id: recipientId,
          status: 'pending',
        })
        .select()
        .single();

      if (error) throw error;

      setFriendships((prev) => ({
        ...prev,
        [recipientId]: data,
      }));

      // Send push notification
      const { data: me } = await supabase.from('users').select('name').eq('id', myUid).maybeSingle();
      const senderName = me?.name || 'Someone';
      import('../utils/notifications').then(({ sendFriendRequestNotification }) => {
        sendFriendRequestNotification(recipientId, senderName, myUid);
      });
    } catch (e) {
      Alert.alert('Error', e.message);

      setFriendships((prev) => {
        const n = { ...prev };
        delete n[recipientId];
        return n;
      });
    }
  };

  const cancelRequest = (recipientId) => {
    Alert.alert(
      'Cancel request',
      'Are you sure you want to cancel this friend request?',
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Cancel request',
          style: 'destructive',
          onPress: async () => {
            const f = friendships[recipientId];

            if (!f) return;

            setFriendships((prev) => {
              const n = { ...prev };
              delete n[recipientId];
              return n;
            });

            try {
              if (f.id) {
                const { error } = await supabase
                  .from('friendships')
                  .delete()
                  .eq('id', f.id);

                if (error) throw error;
              }
            } catch (e) {
              Alert.alert('Error', e.message);

              setFriendships((prev) => ({
                ...prev,
                [recipientId]: f,
              }));
            }
          },
        },
      ]
    );
  };

  const acceptRequest = async (friendship) => {
    if (!friendship?.id) return;

    try {
      const { data, error } = await supabase
        .from('friendships')
        .update({ status: 'accepted' })
        .eq('id', friendship.id)
        .select()
        .single();

      if (error) throw error;

      const otherId = friendship.requester_id === myUid
        ? friendship.recipient_id
        : friendship.requester_id;

      setFriendships((prev) => ({
        ...prev,
        [otherId]: data ?? { ...friendship, status: 'accepted' },
      }));

      setPendingIn((prev) => prev.filter((f) => f.id !== friendship.id));
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  };

  const openFriendChat = (otherUser) => {
    const f = friendships[otherUser.id];

    if (!f) {
      Alert.alert(
        'Send a request first',
        `Add ${otherUser.name || 'this user'} as a friend to message them.`
      );
      return;
    }

    navigation?.navigate('FriendChat', {
      friendship: f,
      otherUser,
      myUid,
    });
  };

  const clearSearch = () => {
    setQuery('');
    setResults([]);
  };

  const displayList = query.trim() ? results : recommended;
  const showingSearch = !!query.trim();

  return (
    <View style={s.root}>
      <LinearGradient
        colors={['rgba(123, 97, 255, 0.2)', 'rgba(255, 77, 109, 0.15)', 'transparent']}
        style={s.heroGlow}
        pointerEvents="none"
      />
      <View style={s.header}>
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 12}}>
          <TouchableOpacity onPress={() => navigation?.goBack()}>
            <Ionicons name="arrow-back" size={28} color={colors.ink} />
          </TouchableOpacity>
          <Text style={s.title}>Search</Text>
        </View>
        <Text style={s.subtitle}>Find people by vibe, name, or city</Text>
      </View>

      <BlurView intensity={55} tint="dark" style={s.searchWrap}>
        <Ionicons name="search" size={20} color={colors.ember} style={s.searchIcon} />
        <TextInput
          style={s.searchInput}
          placeholder="Search by name, username, city…"
          placeholderTextColor={colors.ash}
          value={query}
          onChangeText={handleChange}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={() => doSearch(query)}
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={clearSearch} style={s.clearBtn}>
            <Ionicons name="close-circle" size={20} color={colors.stone} />
          </TouchableOpacity>
        )}
      </BlurView>

      <FlatList
        data={displayList}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 110 }}
        ListHeaderComponent={
          <View>
            {!showingSearch && (
              <PendingBanner
                requests={pendingIn}
                usersMap={requesterMap}
                onAccept={acceptRequest}
              />
            )}

            <View style={s.sectionRow}>
              <Text style={s.sectionLabel}>
                {showingSearch ? `Results for "${query}"` : 'Registered users'}
              </Text>

              {loading && <ActivityIndicator color={colors.ember} size="small" />}
            </View>
          </View>
        }
        renderItem={({ item, index }) => (
          <UserCard
            user={item}
            index={index}
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
                {showingSearch ? 'No users found' : 'No registered users yet'}
              </Text>

              <Text style={s.emptySub}>
                {showingSearch
                  ? 'Try searching by name, username, city, or region.'
                  : 'Users will appear here as they register.'}
              </Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const getStyles = (colors, shadow, isDark) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.snow },
    heroGlow: { position: 'absolute', top: 0, left: 0, right: 0, height: 180 },
    header: {
      paddingHorizontal: 22,
      paddingTop: 56,
      paddingBottom: 8,
      zIndex: 1,
    },
    title: {
      fontSize: 30,
      fontWeight: '800',
      color: colors.ink,
      letterSpacing: -0.8,
    },
    subtitle: { fontSize: 13, color: colors.stone, marginTop: 4 },
    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginHorizontal: 16,
      marginBottom: 16,
      borderRadius: radius.xl,
      paddingHorizontal: 16,
      paddingVertical: 14,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.12)',
    },
    searchIcon: {},
    clearBtn: { padding: 2 },
    searchInput: {
      flex: 1,
      fontSize: 16,
      color: colors.ink,
      padding: 0,
    },
    sectionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      marginBottom: 10,
    },
    sectionLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.stone,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    empty: {
      alignItems: 'center',
      paddingTop: 60,
      gap: 10,
      paddingHorizontal: 24,
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.ink,
      textAlign: 'center',
    },
    emptySub: {
      fontSize: 14,
      color: colors.ash,
      textAlign: 'center',
      lineHeight: 20,
    },
  });