// navigation/AppNavigator.jsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Dimensions, ScrollView, PanResponder } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { radius } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import { supabase } from '../supabase/client';
import { registerForPushNotifications, promptForPushNotificationsIfNeeded } from '../utils/notifications';
import { countPendingIncomingSparks } from '../services/sparks';

// Screens
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
import * as Linking from 'expo-linking';

// ── Glassmorphic bottom tab bar ───────────────────────────────────────────────
function TabBar({ active, setActive, matchesBadge, colors }) {
  const tabs = [
    { id: 'Discover', icon: 'earth',              iconOff: 'earth-outline',         label: 'Discover' },
    { id: 'Circles',  icon: 'people-sharp',       iconOff: 'people-outline',        label: 'Circles'  },
    { id: 'Feed',     icon: 'newspaper',          iconOff: 'newspaper-outline',     label: 'Feed'     },
    { id: 'Chat',     icon: 'chatbubbles-sharp',  iconOff: 'chatbubbles-outline',   label: 'Chat',    badge: matchesBadge },
    { id: 'Profile',  icon: 'person-circle',      iconOff: 'person-circle-outline', label: 'Profile'  },
  ];

  const [tabWidth, setTabWidth] = useState(0);
  const activeIndex = tabs.findIndex(t => t.id === active);
  
  const indicatorPosition = useSharedValue(0);
  const shinePosition = useSharedValue(-200);

  useEffect(() => {
    if (tabWidth > 0) {
      indicatorPosition.value = withSpring(activeIndex * tabWidth, {
        damping: 18,
        stiffness: 120,
      });
    }
  }, [activeIndex, tabWidth]);

  useEffect(() => {
    shinePosition.value = withRepeat(
      withTiming(600, { duration: 4000, easing: Easing.linear }),
      -1,
      false
    );
  }, []);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorPosition.value }],
    width: tabWidth,
  }));

  const shineStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shinePosition.value }],
  }));

  const handlePress = (tabId, index) => {
    if (active === tabId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActive(tabId);
  };

  return (
    <View style={tb.wrapper} pointerEvents="box-none">
      <BlurView intensity={80} tint="dark" style={tb.blurContainer}>
        <LinearGradient
          colors={['rgba(255,255,255,0.15)', 'rgba(255,255,255,0.02)']}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        
        {tabWidth > 0 && (
          <Animated.View style={[tb.activeIndicatorWrap, indicatorStyle]} pointerEvents="none">
            <View style={tb.activeGlassDrop}>
              <LinearGradient
                colors={['rgba(255,255,255,0.3)', 'rgba(255,255,255,0.05)']}
                style={StyleSheet.absoluteFill}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
              />
            </View>
          </Animated.View>
        )}

        <View 
          style={tb.bar} 
          onLayout={(e) => {
            const width = e.nativeEvent.layout.width;
            setTabWidth(width / tabs.length);
          }}
        >
          {tabs.map((tab, index) => {
            const isActive = active === tab.id;
            return (
              <TouchableOpacity 
                key={tab.id} 
                style={tb.btn} 
                onPress={() => handlePress(tab.id, index)} 
                activeOpacity={0.8}
              >
                <View style={tb.iconWrap}>
                  <Ionicons
                    name={isActive ? tab.icon : tab.iconOff}
                    size={26}
                    color={isActive ? '#ffffff' : 'rgba(255,255,255,0.5)'}
                  />
                  {tab.badge > 0 && (
                    <View style={[tb.badge, { backgroundColor: colors.ember }]}>
                      <Text style={tb.badgeText}>{tab.badge > 9 ? '9+' : tab.badge}</Text>
                    </View>
                  )}
                </View>
                <Text style={[tb.label, isActive ? tb.labelActive : tb.labelInactive]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Animated.View style={[tb.shineOverlay, shineStyle]} pointerEvents="none">
          <LinearGradient
            colors={['transparent', 'rgba(255,255,255,0.2)', 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      </BlurView>
    </View>
  );
}

const tb = StyleSheet.create({
  wrapper: {
    position: 'absolute', 
    bottom: Platform.OS === 'ios' ? 24 : 16, 
    left: 16, 
    right: 16,
    zIndex: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 8,
  },
  blurContainer: {
    borderRadius: 32,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderTopColor: 'rgba(255,255,255,0.4)',
  },
  bar: {
    flexDirection: 'row',
    height: 64,
    alignItems: 'center',
  },
  activeIndicatorWrap: {
    position: 'absolute',
    top: 6,
    bottom: 6,
    paddingHorizontal: 6,
  },
  activeGlassDrop: {
    flex: 1,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  btn: { 
    flex: 1, 
    alignItems: 'center', 
    justifyContent: 'center',
    height: '100%',
  },
  iconWrap: { position: 'relative' },
  badge: {
    position: 'absolute', top: -4, right: -10,
    minWidth: 16, height: 16, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: 'rgba(30,30,40,0.9)',
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  label: { fontSize: 10, marginTop: 4 },
  labelActive: { color: '#fff', fontWeight: '700' },
  labelInactive: { color: 'rgba(255,255,255,0.6)', fontWeight: '500' },
  shineOverlay: {
    position: 'absolute',
    top: 0, bottom: 0, left: 0,
    width: 60,
    transform: [{ skewX: '-20deg' }],
  },
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
  const [sessionCheckDone, setSessionCheckDone] = useState(false);
  const [showSplash, setShowSplash] = useState(true);

  const TABS = ['Discover', 'Circles', 'Feed', 'Chat', 'Profile'];
  const scrollRef = useRef(null);
  const windowWidth = Dimensions.get('window').width;

  const edgePanResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (evt, gestureState) => {
      // Only trigger if starting from the left edge (< 40px) and moving mostly right
      return evt.nativeEvent.pageX < 40 && gestureState.dx > 20 && gestureState.dx > Math.abs(gestureState.dy);
    },
    onPanResponderRelease: (evt, gestureState) => {
      if (gestureState.dx > 50) {
        goBack();
      }
    },
  }), [screen]);

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

  const navigate = (name, p = {}) => {
    setScreen(name);
    setParams(p);
  };

  const replace = (name, p = {}) => {
    setScreen(name);
    setParams(p);
  };

  const goBack = () => {
    if (['Login', 'Register', 'ProfileSetup', 'VerifyEmail', 'EmailConfirmed', 'ResetPassword'].includes(screen)) {
      setScreen('Welcome');
      setParams({});
    } else {
      setScreen('MainTabs');
      setParams({});
    }
  };


  const nav = {
    navigate,
    replace,
    goBack,
    openSparksInbox: () => {
      setTab('Chat');
      setChatSubTab('sparks');
    },
    switchTab: (tabName) => {
      setScreen('MainTabs');
      setTab(tabName);
    },
  };

  // ── Deep Linking Watcher ──────────────────────────────────────────────────
  useEffect(() => {
    const handleAuthRedirect = async (url) => {
      if (!url) return;

      const isEmailConfirmedLink =
        url.includes('type=email') ||
        url.includes('type=signup') ||
        url.includes('confirmation_url');

      const isResetPasswordLink =
        url.includes('type=recovery');

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
              return 'MainTabs';
            }
            return current;
          });
          })();
        }
      } else {
        setMyUid(null);
        setSearchBadge(0);
        setSparksBadge(0);
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
            if (current === 'Welcome') return 'MainTabs';
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
                {t === 'Feed' && <PostsScreen navigation={nav} />}
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

      default:
        return <WelcomeScreen navigation={nav} />;
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.snow }} {...(screen !== 'MainTabs' ? edgePanResponder.panHandlers : {})}>
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
