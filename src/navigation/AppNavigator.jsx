// navigation/AppNavigator.jsx
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Dimensions, ScrollView, PanResponder, BackHandler } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { supabase } from '../supabase/client';
import { registerForPushNotifications, promptForPushNotificationsIfNeeded } from '../utils/notifications';
import { handleNotificationNavigation } from '../utils/notificationNavigation';
import * as Notifications from 'expo-notifications';
import { countPendingIncomingSparks, checkUnattendedSparkReminders } from '../services/sparks';
import WelcomeScreen from '../screens/WelcomeScreen';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import ProfileSetupScreen from '../screens/ProfileSetupScreen';
import DiscoverScreen from '../screens/DiscoverScreen';
import MatchesScreen from '../screens/MatchesScreen';
import MatchScreen from '../screens/MatchScreen';
import ProfileScreen from '../screens/ProfileScreen';
import PostsScreen from '../screens/PostsScreen';
import SearchScreen from '../screens/SearchScreen';
import FriendChatScreen from '../screens/FriendChatScreen';
import EditProfileScreen from '../screens/EditProfileScreen';
import UserProfileScreen from '../screens/UserProfileScreen';
import SettingsScreen from '../screens/SettingsScreen';
import DiscoverySettingsScreen from '../screens/DiscoverySettingsScreen';
import VerifyEmailScreen from '../screens/VerifyEmailScreen';
import EmailConfirmedScreen from '../screens/EmailConfirmedScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import CirclesScreen from '../screens/CirclesScreen';
import ResetPasswordScreen from '../screens/ResetPasswordScreen';
import SplashScreen from '../screens/SplashScreen';
import ActivityScreen from '../screens/ActivityScreen';
import ReferralsScreen from '../screens/ReferralsScreen';
import ReferralRewardWatcher from '../components/ReferralRewardWatcher';
import * as Linking from 'expo-linking';

const DISCO_ICON = require('../../assets/disco-icon.png');
const LIQUID_SPRING = { damping: 15, stiffness: 140, mass: 0.9, overshootClamping: false };
const AUTH_SCREENS = ['Login', 'Register', 'ProfileSetup', 'VerifyEmail', 'EmailConfirmed', 'ResetPassword'];
const ROOT_SCREENS = ['Welcome', 'MainTabs'];
const HISTORY_LIMIT = 20;

// ── Animated sticky bottom tab bar ───────────────────────────────────────────
function TabItem({ tab, isActive, onPress, colors, inactiveColor, badgeBorderColor, profilePhoto }) {
  const progress = useSharedValue(isActive ? 1 : 0);
  const isDisco = tab.id === 'Feed';
  const isProfile = tab.id === 'Profile';

  useEffect(() => {
    progress.value = withSpring(isActive ? 1 : 0, LIQUID_SPRING);
  }, [isActive, progress]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(progress.value, [0, 1], [2, -11], Extrapolation.CLAMP) },
      { scale: interpolate(progress.value, [0, 1], [0.9, 1.16], Extrapolation.CLAMP) },
    ],
  }));

  const labelStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0.48, 1], Extrapolation.CLAMP),
    transform: [
      { translateY: interpolate(progress.value, [0, 1], [0, 3], Extrapolation.CLAMP) },
      { scale: interpolate(progress.value, [0, 1], [0.9, 1], Extrapolation.CLAMP) },
    ],
  }));

  const iconColor = isActive ? colors.ember : inactiveColor;
  const iconSize = isActive ? 28 : 26;

  const renderIcon = () => {
    if (isDisco) {
      return (
        <Image
          source={DISCO_ICON}
          style={[
            tb.discoImage,
            !isActive && tb.discoImageInactive,
            isActive && tb.discoImageActive,
          ]}
          contentFit="contain"
        />
      );
    }
    if (isProfile && profilePhoto) {
      return (
        <View style={[tb.avatarWrap, isActive && { borderColor: colors.ember }]}>
          <Image source={{ uri: profilePhoto }} style={tb.avatarImage} />
        </View>
      );
    }
    return (
      <Ionicons
        name={isActive ? tab.icon : tab.iconOff}
        size={iconSize}
        color={iconColor}
      />
    );
  };

  return (
    <TouchableOpacity style={tb.btn} onPress={onPress} activeOpacity={0.72} hitSlop={{ top: 8, bottom: 4 }}>
      <View style={tb.iconCol}>
        <Animated.View style={[tb.iconWrap, iconStyle]}>
          {renderIcon()}
          {tab.badge > 0 && (
            <View style={[tb.badge, { backgroundColor: colors.ember, borderColor: badgeBorderColor }]}>
              <Text style={tb.badgeText}>{tab.badge > 9 ? '9+' : tab.badge}</Text>
            </View>
          )}
        </Animated.View>
      </View>
      <Animated.Text
        style={[
          tb.label,
          { color: isActive ? colors.ember : inactiveColor },
          labelStyle,
        ]}
      >
        {tab.label}
      </Animated.Text>
    </TouchableOpacity>
  );
}

function TabBar({ active, setActive, matchesBadge, colors, isDark, profilePhoto }) {
  const insets = useSafeAreaInsets();
  const tabs = [
    { id: 'Discover', icon: 'earth',             iconOff: 'earth-outline',         label: 'Discover' },
    { id: 'Circles',  icon: 'people-sharp',      iconOff: 'people-outline',        label: 'Circles'  },
    { id: 'Feed',     icon: 'newspaper',         iconOff: 'newspaper-outline',     label: 'Feed'     },
    { id: 'Chat',     icon: 'paper-plane',       iconOff: 'paper-plane-outline',   label: 'Chat',    badge: matchesBadge },
    { id: 'Profile',  icon: 'person-circle',     iconOff: 'person-circle-outline', label: 'Profile'  },
  ];

  const handlePress = (tabId) => {
    if (active === tabId) return;
    Haptics.selectionAsync().catch(() => {});
    setActive(tabId);
  };

  const backgroundColor = isDark ? '#121212' : '#FFFFFF';
  const borderTopColor = isDark ? '#2C2C2E' : '#F0E6E4';
  const inactiveColor = isDark ? '#8E8E93' : '#8E8E93';
  const badgeBorderColor = backgroundColor;
  const bottomPad = Math.max(insets.bottom, Platform.OS === 'android' ? 10 : 8);

  return (
    <View style={[tb.wrapper, { backgroundColor, borderTopColor, paddingBottom: bottomPad }]}>
      <View style={tb.bar}>
        {tabs.map((tab) => (
          <TabItem
            key={tab.id}
            tab={tab}
            isActive={active === tab.id}
            onPress={() => handlePress(tab.id)}
            colors={colors}
            inactiveColor={inactiveColor}
            badgeBorderColor={badgeBorderColor}
            profilePhoto={profilePhoto}
          />
        ))}
      </View>
    </View>
  );
}

const tb = StyleSheet.create({
  wrapper: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  bar: {
    flexDirection: 'row',
    height: 72,
    alignItems: 'flex-end',
    paddingBottom: 2,
  },
  btn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: '100%',
    paddingBottom: 2,
  },
  iconCol: {
    width: 52,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrap: { position: 'relative', alignItems: 'center', justifyContent: 'center' },
  discoImage: {
    width: 34,
    height: 34,
  },
  discoImageActive: {
    width: 36,
    height: 36,
  },
  discoImageInactive: {
    opacity: 0.55,
  },
  avatarWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  badge: {
    position: 'absolute', top: -2, right: -14,
    minWidth: 17, height: 17, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  label: { fontSize: 11, marginTop: 1, fontWeight: '700', letterSpacing: 0.1 },
});

// ── Root Navigator ──────────────────────────────────────────────────────────
export default function AppNavigator() {
  const { colors, isDark } = useTheme();

  const [screen, setScreen] = useState('Welcome');
  const [params, setParams] = useState({});
  const [tab, setTab] = useState('Discover');
  const [searchBadge, setSearchBadge] = useState(0);
  const [matchesBadge, setMatchesBadge] = useState(0);
  const [sparksBadge, setSparksBadge] = useState(0);
  const [chatSubTab, setChatSubTab] = useState(null);
  const [myUid, setMyUid] = useState(null);
  const [profilePhoto, setProfilePhoto] = useState(null);
  const [sessionCheckDone, setSessionCheckDone] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [feedTarget, setFeedTarget] = useState(null);

  const TABS = ['Discover', 'Circles', 'Feed', 'Chat', 'Profile'];
  const scrollRef = useRef(null);
  const windowWidth = Dimensions.get('window').width;
  const historyRef = useRef([]);
  const screenRef = useRef(screen);
  const paramsRef = useRef(params);
  const tabRef = useRef(tab);
  const goBackRef = useRef(() => false);

  screenRef.current = screen;
  paramsRef.current = params;
  tabRef.current = tab;

  useEffect(() => {
    if (!myUid) {
      setProfilePhoto(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('users')
        .select('photo_urls')
        .eq('id', myUid)
        .maybeSingle();
      if (cancelled) return;
      setProfilePhoto(data?.photo_urls?.[0] || null);
    })();
    return () => { cancelled = true; };
  }, [myUid, tab, screen]);

  const edgePanResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (evt, gestureState) => {
      // Only trigger if starting from the left edge (< 40px) and moving mostly right
      return evt.nativeEvent.pageX < 40 && gestureState.dx > 20 && gestureState.dx > Math.abs(gestureState.dy);
    },
    onPanResponderRelease: (evt, gestureState) => {
      if (gestureState.dx > 50) {
        goBackRef.current();
      }
    },
  }), []);

  const handleSetTab = (newTab) => {
    setTab(newTab);
  };

  useEffect(() => {
    const index = TABS.indexOf(tab);
    if (scrollRef.current && index !== -1) {
      setTimeout(() => {
        scrollRef.current?.scrollTo({ x: index * windowWidth, animated: true });
      }, 50);
    }
  }, [tab, windowWidth]);

  const clearHistory = () => {
    historyRef.current = [];
  };

  const pushHistory = () => {
    historyRef.current = [
      ...historyRef.current,
      { screen: screenRef.current, params: paramsRef.current, tab: tabRef.current },
    ].slice(-HISTORY_LIMIT);
  };

  const resetTo = (name, p = {}) => {
    clearHistory();
    setScreen(name);
    setParams(p);
  };

  const navigate = (name, p = {}) => {
    // MatchScreen still calls navigate('Matches') — that is the Chat tab, not a stack screen.
    if (name === 'Matches') {
      resetTo('MainTabs');
      setTab('Chat');
      return;
    }
    if (ROOT_SCREENS.includes(name)) {
      resetTo(name, p);
      return;
    }
    if (screenRef.current !== name || paramsRef.current !== p) {
      pushHistory();
    }
    setScreen(name);
    setParams(p);
  };

  const replace = (name, p = {}) => {
    if (ROOT_SCREENS.includes(name)) {
      resetTo(name, p);
      return;
    }
    setScreen(name);
    setParams(p);
  };

  const goBack = useCallback(() => {
    const hist = historyRef.current;
    if (hist.length > 0) {
      const prev = hist[hist.length - 1];
      historyRef.current = hist.slice(0, -1);
      setScreen(prev.screen);
      setParams(prev.params || {});
      if (prev.tab) setTab(prev.tab);
      return true;
    }

    const current = screenRef.current;
    if (AUTH_SCREENS.includes(current)) {
      historyRef.current = [];
      setScreen('Welcome');
      setParams({});
      return true;
    }

    if (!ROOT_SCREENS.includes(current)) {
      historyRef.current = [];
      setScreen('MainTabs');
      setParams({});
      return true;
    }

    if (current === 'MainTabs' && tabRef.current !== 'Discover') {
      setTab('Discover');
      return true;
    }

    return false;
  }, []);

  goBackRef.current = goBack;

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => goBackRef.current());
    return () => sub.remove();
  }, []);

  const nav = {
    navigate,
    replace,
    goBack,
    openSparksInbox: () => {
      setTab('Chat');
      setChatSubTab('sparks');
    },
    switchTab: (tabName) => {
      clearHistory();
      setScreen('MainTabs');
      setTab(tabName);
    },
    openFeedPost: (postId, commentId = null) => {
      clearHistory();
      setScreen('MainTabs');
      setTab('Feed');
      setFeedTarget({ postId, commentId, ts: Date.now() });
    },
    clearFeedTarget: () => setFeedTarget(null),
    openReferrals: () => {
      pushHistory();
      setScreen('Referrals');
      setParams({});
    },
  };

  // ── Push notification tap → deep link ─────────────────────────────────────
  useEffect(() => {
    if (Platform.OS === 'web') return undefined;

    const onResponse = (response) => {
      const data = response?.notification?.request?.content?.data;
      if (data) handleNotificationNavigation(data, nav);
    };

    Notifications.getLastNotificationResponseAsync()
      .then((response) => { if (response) onResponse(response); })
      .catch(() => {});

    const sub = Notifications.addNotificationResponseReceivedListener(onResponse);
    return () => sub.remove();
  }, [myUid]);

  // ── Deep Linking Watcher ──────────────────────────────────────────────────
  useEffect(() => {
    const handleAuthRedirect = async (url) => {
      if (!url) return;

      // Email-confirmed link can arrive three ways:
      //   1. Native app:     cupid://email-confirmed#access_token=...&type=signup
      //   2. Web (Supabase): https://app-cupid-5292e.web.app/#access_token=...&type=signup
      //   3. Web (our own):  https://app-cupid-5292e.web.app/#/email-confirmed
      // We treat (1) and (2) as token-bearing (setSession runs below) and
      // detect (3) by the #/email-confirmed hash route we set as redirectTo.
      const isEmailConfirmedLink =
        url.includes('type=email') ||
        url.includes('type=signup') ||
        url.includes('confirmation_url') ||
        url.includes('#/email-confirmed') ||
        url.endsWith('/email-confirmed');

      const isResetPasswordLink =
        url.includes('type=recovery') ||
        url.includes('#/reset-password') ||
        url.endsWith('/reset-password');

      try {
        const hashIndex = url.indexOf('#');
        if (hashIndex !== -1) {
          const fragment = url.substring(hashIndex + 1);
          const params = new URLSearchParams(fragment);
          const accessToken = params.get('access_token');
          const refreshToken = params.get('refresh_token');

          if (accessToken && refreshToken) {
            const { error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            if (error) console.log('Supabase set session error:', error.message);
          }
        }

        const queryIndex = url.indexOf('?');
        if (queryIndex !== -1) {
          const queryParams = new URLSearchParams(url.substring(queryIndex + 1));
          const accessToken = queryParams.get('access_token');
          const refreshToken = queryParams.get('refresh_token');

          if (accessToken && refreshToken) {
            const { error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            if (error) console.log('Supabase set session error:', error.message);
          }

          // Referral capture: ?ref=CODE (web link)
          const refCode = queryParams.get('ref');
          if (refCode) {
            const { setPendingRef } = await import('../utils/pendingReferral');
            await setPendingRef(refCode);
          }
        }

        // Referral capture: cupid://r/CODE (app deep link)
        // The path segment between '/r/' and the end (or '?') is the code.
        const refMatch = url.match(/\/r\/([A-Za-z0-9]+)/);
        if (refMatch && refMatch[1]) {
          const { setPendingRef } = await import('../utils/pendingReferral');
          await setPendingRef(refMatch[1]);
        }

        if (isEmailConfirmedLink) {
          setScreen('EmailConfirmed');
          setParams({});
        } else if (isResetPasswordLink) {
          setScreen('ResetPassword');
          setParams({});
        }
        // For Google OAuth, onAuthStateChange in the block below handles navigation.
      } catch (error) {
        console.log('Deep link handling error:', error.message);
        if (isEmailConfirmedLink) {
          setScreen('EmailConfirmed');
          setParams({});
        } else if (isResetPasswordLink) {
          setScreen('ResetPassword');
          setParams({});
        }
      }
    };

    const subscription = Linking.addEventListener('url', (event) => {
      handleAuthRedirect(event.url);
    });

    Linking.getInitialURL().then((url) => {
      handleAuthRedirect(url);
    });

    return () => {
      subscription.remove();
    };
  }, []);

  // ── Auth + friendship watcher ─────────────────────────────────────────────
  useEffect(() => {
    let channel;

    const setupFriendshipWatch = async (uid) => {
      if (channel) return;
      channel = 'pending';

      supabase
        .from('users')
        .update({ last_seen: new Date().toISOString() })
        .eq('id', uid)
        .then();

      const { count } = await supabase
        .from('friendships')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_id', uid)
        .eq('status', 'pending');

      setSearchBadge(count ?? 0);

      // Function to refresh unread conversations count
      const refreshMatchesBadge = async () => {
        const { data } = await supabase
          .from('friend_messages')
          .select('friendship_id')
          .neq('sender_id', uid)
          .eq('is_read', false);
        
        if (data) {
          const uniqueChats = new Set(data.map(m => m.friendship_id));
          setMatchesBadge(uniqueChats.size);
        }
      };

      refreshMatchesBadge();

      const refreshSparksBadge = async () => {
        const count = await countPendingIncomingSparks(uid);
        setSparksBadge(count);
        if (count > 0) {
          try { await checkUnattendedSparkReminders(uid); } catch (e) { console.log('[AppNavigator] unattended sparks reminder:', e.message); }
        }
      };
      refreshSparksBadge();

      channel = supabase
        .channel('nav-friendship-watch')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'friendships',
            filter: `recipient_id=eq.${uid}`,
          },
          () => setSearchBadge((c) => c + 1)
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'friendships',
          },
          () => {
            supabase
              .from('friendships')
              .select('id', { count: 'exact', head: true })
              .eq('recipient_id', uid)
              .eq('status', 'pending')
              .then(({ count: c }) => setSearchBadge(c ?? 0));
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'friend_messages' },
          () => refreshMatchesBadge()
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'sparks' },
          () => refreshSparksBadge()
        )
        .subscribe();
    };

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        if (!session.user.email_confirmed_at) {
          setScreen((current) => {
            if (current === 'EmailConfirmed') return current;
            return 'VerifyEmail';
          });
          setParams({ email: session.user.email });
        } else {
          const uid = session.user.id;

          (async () => {
            // For Google OAuth sign-ins, Supabase auto-confirms the email.
            // Make sure a row exists in our users table (first-time Google login).
            const userQueryPromise = supabase
            .from('users')
            .select('id, profile_complete, push_token')
            .eq('id', uid)
            .maybeSingle();

          const queryTimeout = new Promise((resolve) => 
            setTimeout(() => resolve({ data: null, error: new Error('Query timeout') }), 5000)
          );

          const { data: existingUser } = await Promise.race([userQueryPromise, queryTimeout]);

          if (!existingUser) {
            // First time — create a bare profile row from the Google metadata.
            const meta = session.user.user_metadata ?? {};
            const { detectRegion } = await import('../supabase/storage');
            const region = await detectRegion().catch(() => '');

            // Resolve any pending referral code (from a deep link) into a
            // referrer id, so the new Google user gets `referred_by` set.
            let referredBy = null;
            try {
              const { getPendingRef, clearPendingRef } = await import('../utils/pendingReferral');
              const pendingCode = await getPendingRef();
              if (pendingCode) {
                const { data: referrer } = await supabase
                  .from('users')
                  .select('id')
                  .eq('referral_code', String(pendingCode).toUpperCase())
                  .maybeSingle();
                if (referrer?.id) referredBy = referrer.id;
                await clearPendingRef();
              }
            } catch (e) {
              console.log('[AppNavigator] pending ref resolution failed:', e?.message);
            }

            await supabase.from('users').insert({
              id: uid,
              name: meta.full_name ?? meta.name ?? session.user.email?.split('@')[0] ?? 'User',
              username: meta.username ?? null,
              email: session.user.email ?? '',
              region: region ?? '',
              age: 18,
              gender: '',
              bio: '',
              city: '',
              photo_urls: meta.avatar_url ? [meta.avatar_url] : [],
              hobbies: [],
              astrology_sign: '',
              preference: 'everyone',
              min_age: 18,
              max_age: 35,
              profile_complete: false,
              show_me_on_cupid: true,
              hide_last_seen: false,
              referred_by: referredBy,
            }).then(({ error }) => {
              if (error) console.log('Google user row creation error:', error.message);
            });
          }

          setMyUid(uid);
          setupFriendshipWatch(uid);
          
          promptForPushNotificationsIfNeeded(uid);

          setScreen((current) => {
            if (
              current === 'Welcome' ||
              current === 'Login' ||
              current === 'Register' ||
              current === 'VerifyEmail'
            ) {
              historyRef.current = [];
              return 'MainTabs';
            }
            return current;
          });
          })();
        }
      } else {
        setMyUid(null);
        setProfilePhoto(null);
        setSearchBadge(0);
        setSparksBadge(0);
        historyRef.current = [];
        setScreen('Welcome');
        setParams({});

        if (channel) {
          supabase.removeChannel(channel);
          channel = null;
        }
      }
    });

    // Check initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        if (!session.user.email_confirmed_at) {
          setScreen((current) => {
            if (current === 'EmailConfirmed') return current;
            return 'VerifyEmail';
          });
          setParams({ email: session.user.email });
        } else {
          const uid = session.user.id;
          setMyUid(uid);
          setupFriendshipWatch(uid);
          
          promptForPushNotificationsIfNeeded(uid);

          setScreen((current) => {
            if (current === 'Welcome') {
              historyRef.current = [];
              return 'MainTabs';
            }
            return current;
          });
        }
      }
      setSessionCheckDone(true);
    });

    const pingInterval = setInterval(async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (session) {
        supabase
          .from('users')
          .update({ last_seen: new Date().toISOString() })
          .eq('id', session.user.id)
          .then();
          
        // Poll for badge updates in case realtime events are misconfigured
        const { data } = await supabase
          .from('friend_messages')
          .select('friendship_id')
          .neq('sender_id', session.user.id)
          .eq('is_read', false);
        
        if (data) {
          const uniqueChats = new Set(data.map(m => m.friendship_id));
          setMatchesBadge(uniqueChats.size);
        }

        const sparkCount = await countPendingIncomingSparks(session.user.id);
        if (sparkCount > 0) {
          try { await checkUnattendedSparkReminders(session.user.id); } catch (e) { console.log('[AppNavigator] background spark reminder:', e.message); }
        }
      }
    }, 15000); // 15 seconds

    return () => {
      if (channel) supabase.removeChannel(channel);
      authListener?.subscription?.unsubscribe?.();
      clearInterval(pingInterval);
    };
  }, []);

  const renderScreen = () => {
    if (screen === 'MainTabs') {
      return (
        <View style={{ flex: 1 }}>
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            bounces={false}
            style={{ flex: 1 }}
            contentOffset={{ x: TABS.indexOf(tab) * windowWidth, y: 0 }}
            onMomentumScrollEnd={(e) => {
              const pageIndex = Math.round(e.nativeEvent.contentOffset.x / windowWidth);
              const newTab = TABS[pageIndex];
              if (newTab && newTab !== tab) setTab(newTab);
            }}
          >
            {TABS.map((t) => (
              <View key={t} style={{ width: windowWidth, flex: 1 }}>
                {t === 'Discover' && <DiscoverScreen navigation={nav} searchBadge={searchBadge} />}
                {t === 'Circles' && <CirclesScreen navigation={nav} />}
                {t === 'Feed' && (
                  <PostsScreen
                    navigation={nav}
                    feedTarget={feedTarget}
                    onFeedTargetHandled={() => setFeedTarget(null)}
                  />
                )}
                {t === 'Chat' && (
                  <MatchesScreen
                    navigation={nav}
                    initialSubTab={chatSubTab}
                    onSubTabSeen={() => setChatSubTab(null)}
                    onSparksCountChange={setSparksBadge}
                  />
                )}
                {t === 'Profile' && <ProfileScreen navigation={nav} />}
              </View>
            ))}
          </ScrollView>

          <TabBar
            active={tab}
            setActive={handleSetTab}
            matchesBadge={matchesBadge + sparksBadge}
            colors={colors}
            isDark={isDark}
            profilePhoto={profilePhoto}
          />
          {/* Celebration modal when the user earns a referral reward. */}
          <ReferralRewardWatcher
            myUid={myUid}
            onViewWallet={() => {
              pushHistory();
              setScreen('Referrals');
              setParams({});
            }}
          />
        </View>
      );
    }

    switch (screen) {
      case 'Welcome':
        return <WelcomeScreen navigation={nav} />;

      case 'Login':
        return <LoginScreen navigation={nav} />;

      case 'Register':
        return <RegisterScreen navigation={nav} />;

      case 'ResetPassword':
        return <ResetPasswordScreen navigation={nav} />;

      case 'VerifyEmail':
        return <VerifyEmailScreen navigation={nav} route={{ params }} />;

      case 'EmailConfirmed':
        return <EmailConfirmedScreen navigation={nav} />;

      case 'ProfileSetup':
        return <ProfileSetupScreen navigation={nav} />;

      case 'Match':
        return <MatchScreen navigation={nav} route={{ params }} />;

      case 'FriendChat':
        return <FriendChatScreen navigation={nav} route={{ params }} />;

      case 'EditProfile':
        return <EditProfileScreen navigation={nav} />;

      case 'Settings':
        return <SettingsScreen navigation={nav} />;

      case 'DiscoverySettings':
        return <DiscoverySettingsScreen navigation={nav} />;

      case 'UserProfile':
        return <UserProfileScreen navigation={nav} route={{ params }} />;

      case 'Notifications':
        return <NotificationsScreen navigation={nav} route={{ params }} />;

      case 'Search':
        return <SearchScreen navigation={nav} route={{ params }} />;

      case 'Activity':
        return <ActivityScreen navigation={nav} route={{ params }} />;

      case 'Referrals':
        return <ReferralsScreen navigation={nav} />;

      default:
        return <WelcomeScreen navigation={nav} />;
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.snow }} {...(Platform.OS !== 'web' && screen !== 'MainTabs' ? edgePanResponder.panHandlers : {})}>
      {renderScreen()}
      {showSplash && (
        <SplashScreen 
          sessionCheckDone={sessionCheckDone} 
          onFinish={() => setShowSplash(false)} 
        />
      )}
    </View>
  );
}
