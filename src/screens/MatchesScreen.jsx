import { Image } from 'expo-image';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Animated,
  Platform,
  FlatList,
  Modal} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { radius } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import { supabase } from '../supabase/client';
import AnimatedSparkles from '../components/AnimatedSparkles';
import SparksInbox from '../components/SparksInbox';
import { getPlaceholderUrl } from '../utils/placeholders';
import { SkeletonFeed, SkeletonChatRow } from '../components/Skeleton';
import { VIBES, getVibeActivityLabel, getVibeColor, getVibeIcon, isVibeExpired } from '../constants/vibes';
import { repairSparkFriendships } from '../services/sparks';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  FRIENDS_CACHE_KEY,
  applyChatPreviews,
  subscribeChatPreview,
} from '../utils/chatPreviewStore';

function timeAgo(iso) {
  if (!iso) return '';

  const diff = (Date.now() - new Date(iso)) / 1000;

  if (diff < 60) return 'now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;

  return `${Math.floor(diff / 86400)}d`;
}

function isOnline(lastSeen) {
  return lastSeen && Date.now() - new Date(lastSeen).getTime() < 5 * 60 * 1000;
}

function FriendVibe({ friend, onPress }) {
  const { colors, shadow } = useTheme();
  const vibe = friend.otherUser.current_vibe;
  const vibeColor = getVibeColor(vibe);
  const badgePulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(badgePulse, { toValue: 1.12, duration: 1000, useNativeDriver: true }),
        Animated.timing(badgePulse, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [badgePulse]);

  return (
    <TouchableOpacity style={styles.vibeItem} activeOpacity={0.82} onPress={onPress}>
      <View style={[styles.vibeRing, { borderColor: vibeColor }]}>
        <Image
          source={{ uri: friend.otherUser.photo_urls?.[0] || getPlaceholderUrl(friend.otherUser.name) }}
          style={styles.vibeAvatar}
        />
      </View>
      <Animated.View style={[styles.vibeBadge, { backgroundColor: colors.white, borderColor: colors.snow, transform: [{ scale: badgePulse }], ...shadow.soft }]}>
        <Ionicons name={getVibeIcon(vibe)} size={18} color={vibeColor} />
      </Animated.View>
      <Text style={[styles.vibeName, { color: colors.ink }]} numberOfLines={1}>{friend.otherUser.name.split(' ')[0]}</Text>
      <Text style={[styles.vibeActivity, { color: vibeColor }]} numberOfLines={1}>{getVibeActivityLabel(vibe)}</Text>
    </TouchableOpacity>
  );
}

function NewMatchBubble({ item, onPress }) {
  const { colors, shadow, isDark } = useTheme();
  const s = getStyles(colors, shadow, isDark);

  return (
    <TouchableOpacity
      style={s.newMatchItem}
      onPress={() => onPress(item)}
      activeOpacity={0.8}
    >
      <View style={s.newMatchRing}>
        <View style={s.newMatchAv}>
          {item.photoUrl ? (
            <Image
              source={{ uri: item.photoUrl }}
              style={[StyleSheet.absoluteFillObject, {width: "100%", height: "100%"}] }
            />
          ) : (
            <Image
              source={{ uri: getPlaceholderUrl(item.name) }}
              style={[StyleSheet.absoluteFillObject, {width: "100%", height: "100%"}] }
            />
          )}
        </View>
      </View>

      <Text style={s.newMatchName} numberOfLines={1}>
        {item.name}
      </Text>

      <Text style={s.newMatchTime}>{item.time}</Text>
    </TouchableOpacity>
  );
}

function ConversationRow({ item, onPress, index = 0 }) {
  const { colors, shadow, isDark } = useTheme();
  const s = getStyles(colors, shadow, isDark);
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fade, {
      toValue: 1,
      duration: 360,
      delay: Math.min(index * 50, 350),
      useNativeDriver: true,
    }).start();
  }, []);

  // Only show the blue unread dot when the last message was NOT sent by me
  // (i.e. there are truly unread incoming messages).
  // If the last message is mine, we never show the dot — instead we show a
  // sent-read indicator (grey → amber ticks) next to the preview.
  const hasUnread = item.unread > 0 && !item.lastMsgIsMine;
  const isDeleted = item.isDeleted === true;
  const lastMsgIsAudio = item.isAudio === true;
  const isAudioUnread = lastMsgIsAudio && !item.lastMsgRead;

  return (
    <Animated.View style={{ opacity: fade, transform: [{ translateX: fade.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
    <TouchableOpacity
      style={[s.convRow, hasUnread && s.convRowUnread]}
      onPress={() => onPress(item)}
      activeOpacity={0.75}
    >
      <View style={s.convAvWrap}>
        <View style={s.convAv}>
          {item.photoUrl ? (
            <Image
              source={{ uri: item.photoUrl }}
              style={[StyleSheet.absoluteFillObject, {width: "100%", height: "100%"}] }
              borderRadius={28}
            />
          ) : (
            <Image
              source={{ uri: getPlaceholderUrl(item.name) }}
              style={[StyleSheet.absoluteFillObject, {width: "100%", height: "100%"}] }
              borderRadius={28}
            />
          )}
        </View>
        {item.online && <View style={s.onlineDot} />}
      </View>

      <View style={s.convInfo}>
        <View style={s.convTop}>
          <Text
            style={[s.convName, hasUnread && s.convNameBold]}
            numberOfLines={1}
          >
            {item.name}
          </Text>

          <View style={s.convTopRight}>
            <Text style={s.convTime}>{item.time}</Text>
            {/* Unread badge — only for unread INCOMING messages */}
            {hasUnread && (
              <View style={s.unreadBadge}>
                <Text style={s.unreadBadgeText}>+{item.unread}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={s.convBottom}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 }}>
            {isDeleted && (
              <Ionicons name="trash-outline" size={12} color={colors.ash} />
            )}
            {lastMsgIsAudio && !isDeleted && (
              <Ionicons name="mic" size={12} color={isAudioUnread ? colors.ember : colors.ash} />
            )}
            <Text
              style={[
                s.convPreview,
                hasUnread && s.convPreviewBold,
                isDeleted && { color: colors.ash, fontStyle: 'italic' },
                lastMsgIsAudio && !isDeleted && { color: isAudioUnread ? colors.ember : colors.ash }
              ]}
              numberOfLines={1}
            >
              {item.lastMsg}
            </Text>
          </View>

          {/* Sent-read tick — only shown when last message is mine */}
          {item.lastMsgIsMine && (
            <Ionicons
              name="checkmark-done"
              size={14}
              color={item.lastMsgRead ? colors.ember : colors.ash}
            />
          )}
        </View>
      </View>
    </TouchableOpacity>
    </Animated.View>
  );
}

export default function MatchesScreen({
  navigation,
  initialSubTab,
  onSubTabSeen,
  onSparksCountChange,
}) {
  const { colors, shadow, isDark } = useTheme();
  const s = getStyles(colors, shadow, isDark);

  const [activeTab, setActiveTab] = useState('friends');

  useEffect(() => {
    if (initialSubTab) {
      setActiveTab(initialSubTab);
      onSubTabSeen?.();
    }
  }, [initialSubTab]);
  const [matches, setMatches] = useState([]);
  const [friends, setFriends] = useState([]);
  const [myId, setMyId] = useState(null);
  const myIdRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [chatQuery, setChatQuery] = useState('');
  const [myVibe, setMyVibe] = useState(null);
  const [selectedVibeFriend, setSelectedVibeFriend] = useState(null);
  const [vibePickerVisible, setVibePickerVisible] = useState(false);

  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const searchAnim = useRef(new Animated.Value(0)).current;

  const toggleSearch = () => {
    if (isSearchVisible) {
      Animated.timing(searchAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: false,
      }).start(() => setIsSearchVisible(false));
    } else {
      setIsSearchVisible(true);
      Animated.timing(searchAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: false,
      }).start();
    }
  };

  const TABS = ['friends', 'sparks', 'likes'];
  const activeIndex = TABS.indexOf(activeTab);
  const tabAnim = useRef(new Animated.Value(0)).current;
  const [tabWidth, setTabWidth] = useState(0);

  useEffect(() => {
    Animated.spring(tabAnim, {
      toValue: activeIndex,
      tension: 70,
      friction: 10,
      useNativeDriver: true,
    }).start();
  }, [activeIndex]);

  // Count the number of CONVERSATIONS that have at least one unread incoming message,
  // not the raw total of all unread messages across every chat.
  const unreadConversationsCount = friends.filter(
    (f) => (f.unreadCount ?? 0) > 0
  ).length;

  const loadFriends = async (uid, { repair = false } = {}) => {
    // One-time / on-focus backfill: accepted sparks that never got a friendship row.
    if (repair) {
      try {
        await repairSparkFriendships(uid);
      } catch (e) {
        console.log('repairSparkFriendships:', e.message);
      }
    }

    const { data: friendRows, error: friendError } = await supabase
      .from('friendships')
      .select('id, created_at, requester_id, recipient_id, status')
      .eq('status', 'accepted')
      .or(`requester_id.eq.${uid},recipient_id.eq.${uid}`)
      .order('created_at', { ascending: false });

    if (friendError) {
      console.log('Load friends error:', friendError.message);
      setFriends([]);
      return;
    }

    if (!friendRows || friendRows.length === 0) {
      setFriends([]);
      return;
    }

    const uniqueFriendsMap = {};

    for (const f of friendRows) {
      const otherId = f.requester_id === uid ? f.recipient_id : f.requester_id;

      if (!uniqueFriendsMap[otherId]) {
        uniqueFriendsMap[otherId] = f;
      }
    }

    const uniqueFriends = Object.values(uniqueFriendsMap);

    const otherIds = uniqueFriends.map((f) =>
      f.requester_id === uid ? f.recipient_id : f.requester_id
    );

    const { data: profiles } = await supabase
      .from('users')
      .select('id, name, photo_urls, last_seen, hide_last_seen, current_vibe, vibe_set_at')
      .in('id', otherIds);

    const enriched = await Promise.all(
      uniqueFriends.map(async (friendship) => {
        const otherId =
          friendship.requester_id === uid
            ? friendship.recipient_id
            : friendship.requester_id;

        const otherUser =
          profiles?.find((p) => p.id === otherId) ?? {
            id: otherId,
            name: 'Friend',
            photo_urls: [],
          };

        const { data: msgs } = await supabase
          .from('friend_messages')
          .select('id, text, created_at, sender_id, is_read, type, deleted_for_everyone, deleted_by')
          .eq('friendship_id', friendship.id)
          .order('created_at', { ascending: false })
          .limit(1);

        // Only count unread messages I RECEIVED.
        // Messages I sent must never increase my unread counter.
        const { count: unreadCount, error: unreadError } = await supabase
          .from('friend_messages')
          .select('id', { count: 'exact', head: true })
          .eq('friendship_id', friendship.id)
          .neq('sender_id', uid)
          .eq('is_read', false);

        return {
          ...friendship,
          otherUser,
          lastMessage: msgs?.[0] ?? null,
          unreadCount: unreadError ? 0 : unreadCount ?? 0,
        };
      })
    );

    const merged = applyChatPreviews(enriched);
    setFriends(merged);
    AsyncStorage.setItem(FRIENDS_CACHE_KEY, JSON.stringify(merged)).catch(() => {});
  };

  const loadMatches = async (uid) => {
    const { data: matchRows, error: matchError } = await supabase
      .from('swipes')
      .select('id, created_at, swiper_id')
      .eq('swiped_id', uid)
      .in('direction', ['like', 'super'])
      .order('created_at', { ascending: false });

    if (matchError) {
      console.log('Load matches error:', matchError.message);
      setMatches([]);
      setLoading(false);
      return;
    }

    if (!matchRows || matchRows.length === 0) {
      setMatches([]);
      setLoading(false);
      return;
    }

    const uniqueMatchesMap = {};

    for (const m of matchRows) {
      const otherId = m.swiper_id;

      if (!uniqueMatchesMap[otherId]) {
        uniqueMatchesMap[otherId] = m;
      }
    }

    const uniqueMatches = Object.values(uniqueMatchesMap);

    const otherIds = uniqueMatches.map((m) => m.swiper_id);

    const { data: profiles } = await supabase
      .from('users')
      .select('id, name, photo_urls, last_seen, hide_last_seen')
      .in('id', otherIds);

    const enriched = uniqueMatches.map((match) => {
      const otherId = match.swiper_id;

      const otherUser =
        profiles?.find((p) => p.id === otherId) ?? {
          id: otherId,
          name: 'User',
          photo_urls: [],
        };

      return {
        ...match,
        otherUser,
      };
    });

    setMatches(enriched);
    setLoading(false);
  };

  const reloadAll = async (uid) => {
    await Promise.all([loadMatches(uid), loadFriends(uid, { repair: true })]);
    setLoading(false);
  };

  useEffect(() => {
    let channel;

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setLoading(false);
        return;
      }

      const uid = session.user.id;

      setMyId(uid);
      myIdRef.current = uid;

      try {
        const cached = await AsyncStorage.getItem(FRIENDS_CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed && parsed.length > 0) {
            setFriends(applyChatPreviews(parsed));
            setLoading(false);
          }
        }
      } catch (e) {}

      const { data: myProfile } = await supabase
        .from('users')
        .select('current_vibe, vibe_set_at')
        .eq('id', uid)
        .maybeSingle();
      setMyVibe(myProfile);

      await reloadAll(uid);

      channel = supabase
        .channel('matches-friends-list-realtime')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'swipes' },
          () => loadMatches(myIdRef.current)
        )
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'friendships' },
          () => loadFriends(myIdRef.current)
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'friendships' },
          () => loadFriends(myIdRef.current)
        )
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'friend_messages' },
          (payload) => {
            const msg = payload.new;
            const uid = myIdRef.current;
            if (!uid) return;
            // Optimistically update the friend's last message and unread count locally
            setFriends((prev) => {
              const friend = prev.find((f) => f.id === msg.friendship_id);
              if (!friend) return prev;
              const isMine = msg.sender_id === uid;
              return applyChatPreviews(
                prev.map((f) =>
                  f.id === msg.friendship_id
                    ? {
                        ...f,
                        lastMessage: msg,
                        unreadCount: isMine ? f.unreadCount : (f.unreadCount ?? 0) + 1,
                      }
                    : f
                )
              );
            });
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'friend_messages' },
          (payload) => {
            const msg = payload.new;
            const uid = myIdRef.current;
            if (!uid) return;
            
            setFriends((prev) =>
              applyChatPreviews(
                prev.map((f) => {
                  if (f.id === msg.friendship_id) {
                    let updatedFriend = { ...f };
                    
                    // Update read receipt / unread count
                    if (msg.is_read && msg.sender_id !== uid && (f.unreadCount ?? 0) > 0) {
                      updatedFriend.unreadCount = f.unreadCount - 1;
                    }
                    
                    // Update last message if this is the last message
                    if (f.lastMessage && f.lastMessage.id === msg.id) {
                      updatedFriend.lastMessage = msg;
                    }
                    
                    return updatedFriend;
                  }
                  return f;
                })
              )
            );
          }
        )
        .subscribe();
    })();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  // Instant last-message preview from the open chat — do not wait for the
  // backend round-trip or the friends reload (which can take several seconds).
  useEffect(() => {
    return subscribeChatPreview((friendshipId, lastMessage) => {
      setFriends((prev) =>
        applyChatPreviews(
          prev.map((f) => (f.id === friendshipId ? { ...f, lastMessage } : f))
        )
      );
    });
  }, []);

  // Poll every 30 s as a fallback for any edge cases where realtime missed an update
  // (e.g., network hiccup). Realtime optimistic updates handle most cases instantly.
  useEffect(() => {
    const interval = setInterval(() => {
      if (myIdRef.current) {
        loadFriends(myIdRef.current);
      }
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const openProfile = (match) => {
    navigation?.navigate('UserProfile', {
      userId: match.otherUser.id,
    });
  };

  const openFriendChat = (friend) => {
    // Instantly remove orange highlight/dot locally.
    // FriendChatScreen will mark the DB rows as read after opening.
    setFriends((prev) =>
      prev.map((f) =>
        f.id === friend.id ? { ...f, unreadCount: 0 } : f
      )
    );

    navigation?.navigate('FriendChat', {
      friendship: friend,
      otherUser: friend.otherUser,
      myUid: myId,
    });
  };

  const setVibe = async (vibe) => {
    if (!myId) return;
    const vibeSetAt = new Date().toISOString();
    const { error } = await supabase
      .from('users')
      .update({ current_vibe: vibe.id, vibe_set_at: vibeSetAt })
      .eq('id', myId);
    if (!error) {
      setMyVibe({ current_vibe: vibe.id, vibe_set_at: vibeSetAt });
      setVibePickerVisible(false);
    }
  };

  const filteredFriends = friends.filter((f) => {
    if (!chatQuery.trim()) return true;
    const q = chatQuery.trim().toLowerCase();
    const name = (f.otherUser?.name ?? '').toLowerCase();
    const preview = (f.lastMessage?.text ?? '').toLowerCase();
    return name.includes(q) || preview.includes(q);
  });

  const filteredMatches = matches.filter((m) => {
    if (!chatQuery.trim()) return true;
    return (m.otherUser?.name ?? '').toLowerCase().includes(chatQuery.trim().toLowerCase());
  });

  // header gradients//
  return (
    <View style={s.root}>
      <LinearGradient
        colors={['rgba(0, 240, 255, 0.08)', 'transparent']}
        style={s.heroGlow}
        pointerEvents="none"
      />

      <View style={s.header}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={s.screenTitle}>Chat</Text>
          <TouchableOpacity onPress={toggleSearch} style={{ padding: 4 }}>
            <Ionicons name="search" size={24} color={colors.ink} />
          </TouchableOpacity>
        </View>
        <BlurView 
          intensity={50} 
          tint="dark" 
          style={s.tabsRow}
          onLayout={(e) => setTabWidth((e.nativeEvent.layout.width - 8) / 3)}
        >
          {tabWidth > 0 && (
            <Animated.View style={[
              s.tabAnimatedPill,
              {
                width: tabWidth,
                transform: [
                  {
                    translateX: tabAnim.interpolate({
                      inputRange: [0, 1, 2],
                      outputRange: [0, tabWidth, tabWidth * 2]
                    })
                  }
                ]
              }
            ]}>
              <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.ember }]} />
            </Animated.View>
          )}

          <TouchableOpacity
            style={s.tabBtn}
            onPress={() => setActiveTab('friends')}
            activeOpacity={0.8}
          >
            <Text style={[s.tabText, activeTab === 'friends' && s.tabTextActive]}>Messages</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={s.tabBtn}
            onPress={() => setActiveTab('sparks')}
            activeOpacity={0.8}
          >
            <Text style={[s.tabText, activeTab === 'sparks' && s.tabTextActive]}>Sparks</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={s.tabBtn}
            onPress={() => setActiveTab('likes')}
          >
            <Text style={[s.tabText, activeTab === 'likes' && s.tabTextActive]}>
              Likes
            </Text>
          </TouchableOpacity>
        </BlurView>
      </View>

      {isSearchVisible && (
        <Animated.View style={{
          height: searchAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 50] }),
          opacity: searchAnim,
          overflow: 'hidden',
          marginBottom: searchAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 18] })
        }}>
          <BlurView intensity={45} tint="dark" style={[s.searchBar, { marginBottom: 0 }]}>
            <Ionicons name="search" size={18} color={colors.ember} />
            <TextInput
              style={s.searchInput}
              placeholder={activeTab === 'friends' ? 'Search conversations…' : 'Search likes…'}
              placeholderTextColor={colors.ash}
              value={chatQuery}
              onChangeText={setChatQuery}
            />
            {chatQuery.length > 0 && (
              <TouchableOpacity onPress={() => setChatQuery('')}>
                <Ionicons name="close-circle" size={18} color={colors.stone} />
              </TouchableOpacity>
            )}
          </BlurView>
        </Animated.View>
      )}

      {activeTab === 'sparks' ? (
        <SparksInbox
          navigation={navigation}
          myUid={myId}
          onSparkCountChange={onSparksCountChange}
        />
      ) : activeTab === 'likes' ? (
            <FlatList
              data={filteredMatches}
              keyExtractor={(i) => i.id.toString()}
              renderItem={({ item }) => (
                <NewMatchBubble item={{ ...item.otherUser, time: timeAgo(item.created_at), photoUrl: item.otherUser.photo_urls?.[0] }} onPress={() => openProfile(item)} />
              )}
              numColumns={3}
              columnWrapperStyle={{ justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 18 }}
              contentContainerStyle={{ paddingBottom: 100, paddingTop: 16 }}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <View style={s.emptyState}>
                  <Ionicons name="heart" size={48} color={colors.fog} style={{ marginBottom: 16 }} />
                  <Text style={s.emptyTitle}>No likes yet</Text>
                  <Text style={s.emptySub}>
                    When someone likes your profile, they will appear here. Update your profile to get more visibility!
                  </Text>
                </View>
              }
            />
          ) : (
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 110 }}>
        {loading ? (
          <SkeletonFeed itemCount={4} ItemComponent={SkeletonChatRow} style={{ paddingTop: 20 }} />
        ) : filteredFriends.length === 0 ? (
          <View style={s.emptyHint}>
            <Ionicons
              name="people-outline"
              size={32}
              color={colors.ember}
              style={{ marginBottom: 12, alignSelf: 'center' }}
            />
            <Text style={s.emptyHintText}>
              No conversations yet — accept sparks or friend requests, or add people from Search.
            </Text>
          </View>
        ) : (
          <>
            <View style={s.vibesSection}>
              <View style={s.sectionHeader}>
                <Text style={s.sectionTitle}>Friend Vibes</Text>
                {(!myVibe?.current_vibe || isVibeExpired(myVibe?.vibe_set_at)) && (
                  <TouchableOpacity style={s.setVibeButton} onPress={() => setVibePickerVisible(true)}>
                    <Ionicons name="add" size={16} color={colors.ember} />
                    <Text style={s.setVibeText}>Set your vibe</Text>
                  </TouchableOpacity>
                )}
              </View>
              {(!myVibe?.current_vibe || isVibeExpired(myVibe?.vibe_set_at)) ? (
                <Text style={s.vibesEmpty}>Set a vibe and let friends know what you're up to.</Text>
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={s.vibesRow}
                >
                  {friends
                    .filter(f => f.otherUser?.current_vibe && !isVibeExpired(f.otherUser?.vibe_set_at))
                    .map((friend) => {
                      return (
                        <FriendVibe
                          key={friend.id}
                          friend={friend}
                          onPress={() => setSelectedVibeFriend(friend)}
                        />
                      );
                    })}
                </ScrollView>
              )}
            </View>

            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>Messages</Text>

              {unreadConversationsCount > 0 && (
                <View style={s.newBadge}>
                  <Text style={s.newBadgeText}>{unreadConversationsCount}</Text>
                </View>
              )}
            </View>

            {filteredFriends.map((friend, index) => {
              const lastMessage = friend.lastMessage;
              const lastMsgIsMe = lastMessage?.sender_id === myId;

            const isDeleted = lastMessage?.deleted_for_everyone || lastMessage?.deleted_by?.includes(myIdRef.current) || false;
            const isAudio = lastMessage?.type === 'audio';
            const lastText = lastMessage
                ? isDeleted
                  ? 'This message was deleted'
                  : lastMessage.type === 'post_share'
                  ? lastMsgIsMe
                    ? 'You shared a post'
                    : 'Shared a post'
                  : isAudio
                    ? (lastMsgIsMe ? 'You: Voice message' : 'Voice message')
                    : lastMsgIsMe
                      ? `You: ${lastMessage.text}`
                      : lastMessage.text
                : 'Say hello';

              return (
                <ConversationRow
                  key={friend.id}
                  index={index}
                  item={{
                    id: friend.id,
                    name: friend.otherUser?.name ?? 'Friend',
                    photoUrl: friend.otherUser?.photo_urls?.[0] ?? null,
                    lastMsg: lastText,
                    isDeleted,
                    isAudio,
                    time: timeAgo(lastMessage?.created_at || friend.created_at),
                    unread: friend.unreadCount ?? 0,
                    // Tell the row whether the last message was sent by ME
                    // so it can correctly decide dot vs tick display.
                    lastMsgIsMine: lastMsgIsMe,
                    lastMsgRead: lastMessage?.is_read ?? false,
                    online: isOnline(friend.otherUser?.last_seen),
                  }}
                  onPress={() => openFriendChat(friend)}
                />
              );
            })}
          </>
        )}

        <View style={{ height: Platform.OS === 'ios' ? 120 : 100 }} />
      </ScrollView>
      )}
      <Modal visible={!!selectedVibeFriend} transparent animationType="slide" onRequestClose={() => setSelectedVibeFriend(null)}>
        <TouchableOpacity style={s.sheetBackdrop} activeOpacity={1} onPress={() => setSelectedVibeFriend(null)}>
          <TouchableOpacity activeOpacity={1} style={s.vibeSheet} onPress={() => {}}>
            {selectedVibeFriend && <>
              <View style={s.sheetHandle} />
              <Image source={{ uri: selectedVibeFriend.otherUser.photo_urls?.[0] || getPlaceholderUrl(selectedVibeFriend.otherUser.name) }} style={s.sheetAvatar} />
              <Text style={s.sheetName}>{selectedVibeFriend.otherUser.name}</Text>
              <View style={[s.sheetActivity, { backgroundColor: getVibeColor(selectedVibeFriend.otherUser.current_vibe) + '20' }]}>
                <Ionicons name={getVibeIcon(selectedVibeFriend.otherUser.current_vibe)} size={18} color={getVibeColor(selectedVibeFriend.otherUser.current_vibe)} />
                <Text style={[s.sheetActivityText, { color: getVibeColor(selectedVibeFriend.otherUser.current_vibe) }]}>{getVibeActivityLabel(selectedVibeFriend.otherUser.current_vibe)}</Text>
              </View>
              <Text style={s.sheetStarted}>Started {timeAgo(selectedVibeFriend.otherUser.vibe_set_at)} ago</Text>
              <TouchableOpacity style={s.sheetPrimary} onPress={() => { const friend = selectedVibeFriend; setSelectedVibeFriend(null); openFriendChat(friend); }}><Text style={s.sheetPrimaryText}>Send message</Text></TouchableOpacity>
              <TouchableOpacity style={s.sheetSecondary} onPress={() => { const friend = selectedVibeFriend; setSelectedVibeFriend(null); navigation?.navigate('UserProfile', { userId: friend.otherUser.id }); }}><Text style={s.sheetSecondaryText}>View profile</Text></TouchableOpacity>
            </>}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
      <Modal visible={vibePickerVisible} transparent animationType="fade" onRequestClose={() => setVibePickerVisible(false)}>
        <TouchableOpacity style={s.sheetBackdrop} activeOpacity={1} onPress={() => setVibePickerVisible(false)}>
          <TouchableOpacity activeOpacity={1} style={s.vibeSheet} onPress={() => {}}>
            <View style={s.sheetHandle} />
            <Text style={s.pickerTitle}>Set your vibe</Text>
            <Text style={s.pickerSub}>Let your friends know what you're up to.</Text>
            {VIBES.filter((v) => !['All', 'Dating'].includes(v.id)).map((vibe) => <TouchableOpacity key={vibe.id} style={s.pickerRow} onPress={() => setVibe(vibe)}><Ionicons name={vibe.icon} size={20} color={vibe.color} /><Text style={s.pickerRowText}>{getVibeActivityLabel(vibe.id)}</Text></TouchableOpacity>)}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const getStyles = (colors, shadow, isDark) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.snow },
    heroGlow: { position: 'absolute', top: 0, left: 0, right: 0, height: 200 },

    header: {
      paddingHorizontal: 20,
      paddingTop: 56,
      paddingBottom: 12,
      gap: 12,
    },
    screenTitle: {
      fontSize: 30,
      fontWeight: '800',
      color: colors.ink,
      letterSpacing: -0.6,
    },
    tabsRow: {
      flexDirection: 'row',
      borderRadius: radius.full,
      padding: 4,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.12)',
    },
    tabAnimatedPill: {
      position: 'absolute',
      top: 4,
      bottom: 4,
      left: 4,
      borderRadius: radius.full,
      overflow: 'hidden',
    },
    tabBtn: { flex: 1, borderRadius: radius.full, overflow: 'hidden', minWidth: 0, justifyContent: 'center' },
    tabBtnActive: {},
    tabGradient: {
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.full,
    },
    tabText: {
      fontSize: 12,
      color: colors.stone,
      fontWeight: '700',
      textAlign: 'center',
      paddingVertical: 10,
    },
    tabTextActive: { color: colors.white },

    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginHorizontal: 16,
      marginBottom: 18,
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderRadius: radius.xl,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.1)',
    },
    searchInput: {
      flex: 1,
      fontSize: 15,
      color: colors.ink,
      padding: 0,
    },

    loadingWrap: {
      alignItems: 'center',
      paddingVertical: 40,
    },

    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginHorizontal: 16,
      marginBottom: 12,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: colors.ink,
    },
    vibesSection: { marginBottom: 20 },
    vibesRow: { paddingHorizontal: 16, paddingTop: 2, gap: 16 },
    vibesEmpty: { marginHorizontal: 16, color: colors.stone, fontSize: 13, lineHeight: 19 },
    setVibeButton: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.emberLight, borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 6 },
    setVibeText: { color: colors.ember, fontSize: 12, fontWeight: '700' },
    newBadge: {
      backgroundColor: colors.emberLight,
      borderRadius: radius.full,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    newBadgeText: {
      color: colors.ember,
      fontSize: 12,
      fontWeight: '700',
    },

    newMatchesRow: {
      paddingHorizontal: 16,
      paddingBottom: 18,
      gap: 12,
    },
    newMatchItem: {
      width: '33.33%',
      alignItems: 'center',
      paddingHorizontal: 8,
    },
    newMatchRing: {
      width: 66,
      height: 66,
      borderRadius: 33,
      borderWidth: 2,
      borderColor: colors.ember,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 6,
    },
    newMatchAv: {
      width: 58,
      height: 58,
      borderRadius: 29,
      backgroundColor: '#FFE8D6',
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    },
    newMatchName: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.ink,
      textAlign: 'center',
    },
    newMatchTime: {
      fontSize: 10,
      color: colors.ash,
      marginTop: 2,
    },

    divider: {
      height: 1,
      backgroundColor: colors.fog,
      marginHorizontal: 16,
      marginBottom: 16,
    },

    convRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colors.white,
      marginHorizontal: 16,
      marginBottom: 12,
      padding: 14,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.fog + '99',
      ...shadow.soft,
    },
    convRowUnread: {
      backgroundColor: colors.ember + '15',
      borderColor: colors.ember + '40',
      ...Platform.select({
        ios: {
          shadowColor: colors.ember,
          shadowOpacity: 0.15,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 4 },
        },
        android: {
          elevation: 0,
        }
      })
    },
    convAvWrap: {
      position: 'relative',
    },
    convAv: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: '#FFE8D6',
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    },
    convInfo: {
      flex: 1,
      minWidth: 0,
    },
    convTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 4,
      gap: 8,
    },
    convTopRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    convName: {
      flex: 1,
      fontSize: 15,
      fontWeight: '700',
      color: colors.ink,
    },
    convNameBold: {
      fontWeight: '900',
    },
    convTime: {
      fontSize: 11,
      color: colors.ash,
    },
    unreadBadge: {
      backgroundColor: colors.ember,
      borderRadius: 10,
      minWidth: 20,
      paddingHorizontal: 6,
      height: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    unreadBadgeText: {
      color: colors.white,
      fontSize: 11,
      fontWeight: '800',
    },
    onlineDot: { position: 'absolute', right: -1, bottom: -1, width: 14, height: 14, borderRadius: 7, backgroundColor: colors.success, borderWidth: 2, borderColor: colors.white },
    convBottom: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    convPreview: {
      flex: 1,
      fontSize: 13,
      color: colors.stone,
    },
    convPreviewBold: {
      color: colors.ink,
      fontWeight: '700',
    },

    emptyHint: {
      backgroundColor: colors.white,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.fog,
      marginHorizontal: 16,
      padding: 26,
      marginTop: 12,
    },
    emptyHintText: {
      fontSize: 14,
      color: colors.stone,
      textAlign: 'center',
      lineHeight: 20,
    },
    sheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
    vibeSheet: { backgroundColor: colors.white, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: 20, paddingBottom: 34, alignItems: 'center' },
    sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.fog, marginBottom: 18 },
    sheetAvatar: { width: 78, height: 78, borderRadius: 39, backgroundColor: colors.fog, marginBottom: 10 },
    sheetName: { fontSize: 21, fontWeight: '800', color: colors.ink },
    sheetActivity: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.full, marginTop: 12 },
    sheetActivityText: { fontSize: 14, fontWeight: '800' },
    sheetStarted: { fontSize: 13, color: colors.ash, marginTop: 10, marginBottom: 20 },
    sheetPrimary: { width: '100%', alignItems: 'center', backgroundColor: colors.ember, borderRadius: radius.lg, paddingVertical: 14, marginBottom: 9 },
    sheetPrimaryText: { color: colors.white, fontSize: 15, fontWeight: '800' },
    sheetSecondary: { width: '100%', alignItems: 'center', borderRadius: radius.lg, paddingVertical: 13, borderWidth: 1, borderColor: colors.fog },
    sheetSecondaryText: { color: colors.ink, fontSize: 15, fontWeight: '700' },
    pickerTitle: { width: '100%', color: colors.ink, fontSize: 21, fontWeight: '800' },
    pickerSub: { width: '100%', color: colors.ash, fontSize: 13, marginTop: 4, marginBottom: 14 },
    pickerRow: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, borderBottomWidth: 1, borderColor: colors.fog },
    pickerRowText: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  });

const styles = StyleSheet.create({
  vibeItem: { width: 88, alignItems: 'center', paddingBottom: 3 },
  vibeRing: { width: 68, height: 68, borderRadius: 34, borderWidth: 3, padding: 3 },
  vibeAvatar: { width: '100%', height: '100%', borderRadius: 30 },
  vibeBadge: { position: 'absolute', top: 48, right: 7, width: 30, height: 30, borderRadius: 15, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  vibeName: { width: '100%', fontSize: 12, fontWeight: '800', marginTop: 8, textAlign: 'center' },
  vibeActivity: { width: '100%', fontSize: 10, fontWeight: '700', marginTop: 2, textAlign: 'center' },
});
