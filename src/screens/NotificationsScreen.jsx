// screens/NotificationsScreen.jsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Animated, PanResponder, Dimensions, Platform } from 'react-native';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { supabase } from '../supabase/client';
import { radius } from '../theme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AnimatedSparkles from '../components/AnimatedSparkles';
import { SkeletonFeed, SkeletonNotificationItem } from '../components/Skeleton';
import { getPlaceholderUrl } from '../utils/placeholders';

const { width: W } = Dimensions.get('window');

function SwipeableNotification({ item, onDelete, children }) {
  const pan = useRef(new Animated.Value(0)).current;
  const isDeleted = useRef(false);

  const handleDelete = () => {
    if (isDeleted.current) return;
    isDeleted.current = true;
    Animated.timing(pan, {
      toValue: W,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      onDelete(item.id);
    });
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 15 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) > 15 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_, g) => {
        if (g.dx > 0 && !isDeleted.current) {
          pan.setValue(g.dx);
        }
      },
      onPanResponderRelease: (_, g) => {
        if (isDeleted.current) return;
        if (g.dx > W * 0.35 || g.vx > 1.0) {
          handleDelete();
        } else {
          Animated.spring(pan, {
            toValue: 0,
            friction: 5,
            tension: 40,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  const iconOpacity = pan.interpolate({ inputRange: [0, 60], outputRange: [0, 1], extrapolate: 'clamp' });
  const iconScale = pan.interpolate({ inputRange: [0, 80], outputRange: [0.5, 1], extrapolate: 'clamp' });

  const bgOpacity = pan.interpolate({ inputRange: [0, 45], outputRange: [0, 1], extrapolate: 'clamp' });

  return (
    <View style={{ position: 'relative' }}>
      <Animated.View 
        style={{
          position: 'absolute', left: 0, top: 0, bottom: 0, width: '100%',
          backgroundColor: '#FF3B30', borderRadius: 24,
          justifyContent: 'center', paddingLeft: 24,
          opacity: bgOpacity,
        }}
      >
        <TouchableOpacity activeOpacity={0.8} onPress={handleDelete} style={{ flex: 1, justifyContent: 'center' }}>
          <Animated.View style={{ transform: [{ scale: iconScale }] }}>
            <Ionicons name="trash" size={24} color="#FFF" />
          </Animated.View>
        </TouchableOpacity>
      </Animated.View>
      <Animated.View
        style={{ transform: [{ translateX: pan }] }}
        {...panResponder.panHandlers}
      >
        {children}
      </Animated.View>
    </View>
  );
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function NotificationsScreen({ navigation }) {
  const { colors, shadow, isDark } = useTheme();
  const s = getStyles(colors, shadow, isDark);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [myUid, setMyUid] = useState(null);

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const uid = session.user.id;
      setMyUid(uid);

      const { data: rawNotifs, error: notifErr } = await supabase
        .from('notifications')
        .select('*')
        .eq('recipient_id', uid)
        .order('created_at', { ascending: false });
        
      if (notifErr) throw notifErr;

      const dismissedRaw = await AsyncStorage.getItem('dismissed_notifications');
      const dismissedIds = dismissedRaw ? JSON.parse(dismissedRaw) : [];

      const items = [];

      if (!dismissedIds.includes('sys-1')) {
        items.push({
          id: 'sys-1',
          type: 'update',
          title: 'Welcome to Cupid!',
          message: 'Your profile is ready. Start swiping and connecting with new people.',
          created_at: new Date(Date.now() - 86400000).toISOString(),
        });
      }

      const senderIds = [...new Set(rawNotifs?.map(n => n.sender_id).filter(Boolean))];
      let usersMap = {};
      if (senderIds.length > 0) {
        const { data: usersData } = await supabase.from('users').select('id, name, photo_urls').in('id', senderIds);
        usersMap = Object.fromEntries((usersData || []).map(u => [u.id, u]));
      }

      rawNotifs?.forEach(n => {
        if (dismissedIds.includes(n.id)) return;
        const user = n.sender_id ? usersMap[n.sender_id] : null;
        items.push({
          ...n,
          user
        });
      });

      items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setNotifications(items);
      
      // Update last viewed time to clear the orange dot in DiscoverScreen
      AsyncStorage.setItem('last_viewed_notifications', new Date().toISOString()).catch(() => {});
    } catch (err) {
      console.log('Error fetching notifications:', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handleDelete = async (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
    
    try {
      const dismissedRaw = await AsyncStorage.getItem('dismissed_notifications');
      const dismissedIds = dismissedRaw ? JSON.parse(dismissedRaw) : [];
      if (!dismissedIds.includes(id)) {
        dismissedIds.push(id);
        await AsyncStorage.setItem('dismissed_notifications', JSON.stringify(dismissedIds));
      }
    } catch (e) {}

    if (id !== 'sys-1') {
      const { error } = await supabase.from('notifications').delete().eq('id', id);
      if (error) console.log('Failed to delete notification:', error.message);
    }
  };

  const openFeedFromNotif = (item) => {
    const postId = item.post_id;
    const commentId = item.comment_id || null;
    if (postId && navigation.openFeedPost) {
      navigation.openFeedPost(postId, commentId);
    } else if (navigation.switchTab) {
      navigation.switchTab('Feed');
    } else if (item.user) {
      navigation.navigate('UserProfile', { userId: item.user.id });
    }
  };

  const renderItem = ({ item }) => {
    let content = null;
    
    if (item.type === 'update') {
      content = (
        <View style={s.card}>
          <View style={[s.iconBox, { backgroundColor: colors.gold + '20' }]}>
            <Ionicons name="sparkles" size={20} color={colors.gold} />
          </View>
          <View style={s.cardBody}>
            <Text style={s.title}>{item.title}</Text>
            <Text style={s.desc}>{item.message}</Text>
            <Text style={s.time}>{timeAgo(item.created_at)}</Text>
          </View>
        </View>
      );
    } else if (item.type === 'circle_promotion') {
      content = (
        <View style={s.card}>
          <View style={[s.iconBox, { backgroundColor: colors.gold + '20' }]}>
            <Ionicons name="shield-checkmark" size={20} color={colors.gold} />
          </View>
          <View style={s.cardBody}>
            <Text style={s.title}>{item.title}</Text>
            <Text style={s.desc}>{item.message}</Text>
            <Text style={s.time}>{timeAgo(item.created_at)}</Text>
          </View>
        </View>
      );
    } else if (item.type === 'friend_request') {
      content = (
        <TouchableOpacity style={s.card} onPress={() => item.user && navigation.navigate('UserProfile', { userId: item.user.id })} activeOpacity={1}>
          <View style={s.avatarBox}>
            {item.user?.photo_urls?.[0] ? (
              <Image source={{ uri: item.user.photo_urls[0] }} style={[StyleSheet.absoluteFillObject, {width: "100%", height: "100%"}] } />
            ) : (
              <Image source={{ uri: getPlaceholderUrl(item.user?.name) }} style={[StyleSheet.absoluteFillObject, {width: "100%", height: "100%"}] } />
            )}
          </View>
          <View style={s.cardBody}>
            <Text style={s.title}><Text style={s.bold}>{item.user?.name || 'Someone'}</Text> {item.message || 'sent you a friend request'}</Text>
            <Text style={s.time}>{timeAgo(item.created_at)}</Text>
          </View>
        </TouchableOpacity>
      );
    } else if (item.type === 'spark') {
      content = (
        <TouchableOpacity
          style={s.card}
          onPress={() => {
            if (item.user) {
              navigation.navigate('UserProfile', { userId: item.user.id });
            } else {
              navigation.openSparksInbox?.();
            }
          }}
          activeOpacity={1}
        >
          <View style={[s.iconBox, { backgroundColor: colors.ember + '20' }]}>
            <Ionicons name="flash-sharp" size={22} color={colors.ember} />
          </View>
          <View style={s.cardBody}>
            <Text style={s.title}>{item.title || 'New Spark'}</Text>
            <Text style={s.desc}>{item.message}</Text>
            <Text style={s.time}>{timeAgo(item.created_at)}</Text>
          </View>
        </TouchableOpacity>
      );
    } else if (item.type === 'activity_invite') {
      content = (
        <TouchableOpacity
          style={s.card}
          onPress={() => navigation.navigate('Activity', {
            otherUserId: item.sender_id,
            otherUserName: item.user?.name || 'Friend',
          })}
          activeOpacity={1}
        >
          <View style={[s.iconBox, { backgroundColor: colors.ember + '20' }]}>
            <Ionicons name="game-controller" size={22} color={colors.ember} />
          </View>
          <View style={s.cardBody}>
            <Text style={s.title}>{item.title || 'Truth or Dare invitation'}</Text>
            <Text style={s.desc}>{item.message}</Text>
            <Text style={s.time}>{timeAgo(item.created_at)}</Text>
          </View>
        </TouchableOpacity>
      );
    } else if (item.type === 'match') {
      content = (
        <TouchableOpacity style={s.card} onPress={() => item.user && navigation.navigate('Match', { otherUser: item.user })} activeOpacity={1}>
          <View style={[s.iconBox, { backgroundColor: colors.ember + '20', overflow: 'hidden' }]}>
            {item.user?.photo_urls?.[0] ? (
              <Image source={{ uri: item.user.photo_urls[0] }} style={[StyleSheet.absoluteFillObject, {width: "100%", height: "100%"}] } />
            ) : (
              <Ionicons name="heart" size={20} color={colors.ember} />
            )}
          </View>
          <View style={s.cardBody}>
            <Text style={s.title}>{item.title || 'New Match!'}</Text>
            <Text style={s.desc}>{item.message}</Text>
            <Text style={s.time}>{timeAgo(item.created_at)}</Text>
          </View>
        </TouchableOpacity>
      );
    } else if (item.type === 'like') {
      content = (
        <TouchableOpacity style={s.card} onPress={() => openFeedFromNotif(item)} activeOpacity={1}>
          <View style={[s.iconBox, { backgroundColor: colors.ember + '20', overflow: 'hidden' }]}>
            {item.user?.photo_urls?.[0] ? (
              <Image source={{ uri: item.user.photo_urls[0] }} style={[StyleSheet.absoluteFillObject, {width: "100%", height: "100%"}] } />
            ) : (
              <Ionicons name="heart" size={20} color={colors.ember} />
            )}
            <View style={{ position: 'absolute', bottom: -2, right: -2, backgroundColor: colors.white, borderRadius: 10, padding: 2 }}>
              <Ionicons name="heart" size={12} color={colors.ember} />
            </View>
          </View>
          <View style={s.cardBody}>
            <Text style={s.title}><Text style={s.bold}>{item.user?.name || 'Someone'}</Text> liked your post</Text>
            <Text style={s.time}>{timeAgo(item.created_at)}</Text>
          </View>
        </TouchableOpacity>
      );
    } else if (item.type === 'comment' || item.type === 'mention') {
      const isMention = item.type === 'mention';
      content = (
        <TouchableOpacity style={s.card} onPress={() => openFeedFromNotif(item)} activeOpacity={1}>
          <View style={[s.iconBox, { backgroundColor: colors.ember + '20', overflow: 'hidden' }]}>
            {item.user?.photo_urls?.[0] ? (
              <Image source={{ uri: item.user.photo_urls[0] }} style={[StyleSheet.absoluteFillObject, {width: "100%", height: "100%"}] } />
            ) : (
              <Ionicons name={isMention ? 'at' : 'chatbubble'} size={20} color={colors.ember} />
            )}
            <View style={{ position: 'absolute', bottom: -2, right: -2, backgroundColor: colors.white, borderRadius: 10, padding: 2 }}>
              <Ionicons name={isMention ? 'at' : 'chatbubble'} size={12} color={colors.ember} />
            </View>
          </View>
          <View style={s.cardBody}>
            <Text style={s.title}>
              {isMention ? (
                <><Text style={s.bold}>{item.user?.name || 'Someone'}</Text> mentioned you</>
              ) : (
                <><Text style={s.bold}>{item.user?.name || 'Someone'}</Text> commented on your post</>
              )}
            </Text>
            <Text style={s.desc}>{item.message}</Text>
            <Text style={s.time}>{timeAgo(item.created_at)}</Text>
          </View>
        </TouchableOpacity>
      );
    } else if (item.type === 'post' || (item.type === 'update' && item.post_id)) {
      content = (
        <TouchableOpacity style={s.card} onPress={() => openFeedFromNotif(item)} activeOpacity={1}>
          <View style={[s.iconBox, { backgroundColor: colors.gold + '20' }]}>
            <Ionicons name="newspaper-outline" size={20} color={colors.gold} />
          </View>
          <View style={s.cardBody}>
            <Text style={s.title}>{item.title || 'New Post!'}</Text>
            <Text style={s.desc}>{item.message}</Text>
            <Text style={s.time}>{timeAgo(item.created_at)}</Text>
          </View>
        </TouchableOpacity>
      );
    }

    if (!content) return null;

    // Determine if it is clickable based on item.type
    const isClickable = (item.type !== 'update' || !!item.post_id) && item.type !== 'circle_promotion';

    const CardContent = (
      <BlurView intensity={75} tint={isDark ? "dark" : "light"} style={s.cardWrapper}>
        <View style={s.card}>
          {content.props.children}
        </View>
      </BlurView>
    );

    return (
      <SwipeableNotification item={item} onDelete={handleDelete}>
        {isClickable ? (
          <TouchableOpacity activeOpacity={0.8} onPress={content.props.onPress}>
            {CardContent}
          </TouchableOpacity>
        ) : (
          <View>
            {CardContent}
          </View>
        )}
      </SwipeableNotification>
    );
  };

  return (
    <View style={s.root}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color={colors.ink} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Notifications</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <SkeletonFeed itemCount={4} ItemComponent={SkeletonNotificationItem} />
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          initialNumToRender={10}
          maxToRenderPerBatch={5}
          windowSize={5}
          removeClippedSubviews={Platform.OS === 'android'}
          contentContainerStyle={s.list}
          ListEmptyComponent={
            <View style={s.empty}>
              <Ionicons name="notifications-off-outline" size={48} color={colors.fog} />
              <Text style={s.emptyText}>No notifications yet</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const getStyles = (colors, shadow, isDark) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.snow },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 60, paddingBottom: 16,
    borderBottomWidth: 1, borderColor: colors.fog, backgroundColor: colors.white
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.ink },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16, paddingBottom: 110, gap: 12 },
  cardWrapper: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 1, 
    borderColor: 'rgba(255, 255, 255, 0.4)',
    backgroundColor: Platform.OS === 'android' ? (isDark ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.7)') : 'transparent',
  },
  card: {
    flexDirection: 'row', gap: 14,
    padding: 16,
  },
  iconBox: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarBox: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: colors.fog,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  cardBody: { flex: 1, justifyContent: 'center' },
  title: { fontSize: 15, color: colors.ink, lineHeight: 22 },
  bold: { fontWeight: '700' },
  desc: { fontSize: 14, color: colors.graphite, marginTop: 2, lineHeight: 20 },
  time: { fontSize: 12, color: colors.stone, marginTop: 6, fontWeight: '500' },
  empty: { alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 },
  emptyText: { fontSize: 16, color: colors.stone, fontWeight: '500' }
});
