// navigation/AppNavigator.jsx
import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radius } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import { supabase } from '../supabase/client';

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
import VerifyEmailScreen from '../screens/VerifyEmailScreen';
import EmailConfirmedScreen from '../screens/EmailConfirmedScreen';
import * as Linking from 'expo-linking';

// ── Bottom tab bar ──────────────────────────────────────────────────────────
function TabBar({ active, setActive, searchBadge, colors, isDark }) {
  const tb = getTbStyles(colors, isDark);

  const tabs = [
    { id: 'Discover', icon: 'flame-sharp', iconOff: 'flame-outline', label: 'Discover' },
    { id: 'Search', icon: 'search-circle', iconOff: 'search-circle-outline', label: 'Search', badge: searchBadge },
    { id: 'Feed', icon: 'newspaper', iconOff: 'newspaper-outline', label: 'Feed' },
    { id: 'Matches', icon: 'chatbubbles-sharp', iconOff: 'chatbubbles-outline', label: 'Matches' },
    { id: 'Profile', icon: 'person-circle', iconOff: 'person-circle-outline', label: 'Profile' },
  ];

  return (
    <View style={tb.bar}>
      {tabs.map((tab) => {
        const isActive = active === tab.id;

        return (
          <TouchableOpacity
            key={tab.id}
            style={tb.btn}
            onPress={() => setActive(tab.id)}
            activeOpacity={0.75}
          >
            <View style={tb.iconWrap}>
              <Ionicons
                name={isActive ? tab.icon : tab.iconOff}
                size={22}
                color={isActive ? colors.ember : colors.ash}
              />

              {tab.badge > 0 && (
                <View style={tb.badge}>
                  <Text style={tb.badgeText}>{tab.badge}</Text>
                </View>
              )}
            </View>

            <Text style={[tb.label, isActive && tb.labelActive]}>{tab.label}</Text>

            {isActive && <View style={tb.indicator} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const getTbStyles = (colors, isDark) =>
  StyleSheet.create({
    bar: {
      flexDirection: 'row',
      borderTopWidth: 1,
      borderColor: colors.fog,
      backgroundColor: colors.white,
      paddingBottom: 24,
      paddingTop: 8,
    },
    btn: {
      flex: 1,
      alignItems: 'center',
      gap: 2,
      position: 'relative',
    },
    iconWrap: {
      position: 'relative',
    },
    badge: {
      position: 'absolute',
      top: -4,
      right: -8,
      minWidth: 16,
      height: 16,
      borderRadius: 8,
      backgroundColor: colors.ember,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 3,
    },
    badgeText: {
      color: colors.white,
      fontSize: 9,
      fontWeight: '800',
    },
    label: {
      fontSize: 9,
      color: colors.ash,
      fontWeight: '500',
    },
    labelActive: {
      color: colors.ember,
      fontWeight: '700',
    },
    indicator: {
      position: 'absolute',
      top: -9,
      width: 4,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.ember,
    },
  });

// ── Root Navigator ──────────────────────────────────────────────────────────
export default function AppNavigator() {
  const { colors, isDark } = useTheme();

  const [screen, setScreen] = useState('Welcome');
  const [params, setParams] = useState({});
  const [tab, setTab] = useState('Discover');
  const [searchBadge, setSearchBadge] = useState(0);
  const [myUid, setMyUid] = useState(null);

  const navigate = (name, p = {}) => {
    setScreen(name);
    setParams(p);
  };

  const replace = (name, p = {}) => {
    setScreen(name);
    setParams(p);
  };

  const goBack = () => {
    if (['Login', 'Register', 'ProfileSetup', 'VerifyEmail', 'EmailConfirmed'].includes(screen)) {
      setScreen('Welcome');
      setParams({});
    } else {
      setScreen('MainTabs');
      setParams({});
    }
  };

  const nav = { navigate, replace, goBack };

  // ── Deep Linking Watcher ──────────────────────────────────────────────────
  useEffect(() => {
    const handleAuthRedirect = async (url) => {
      if (!url) return;

      const isEmailConfirmedLink = url.includes('email-confirmed');

      if (!isEmailConfirmedLink) return;

      try {
        /**
         * Supabase auth links may come back as:
         * 1. cupid://email-confirmed?code=xxxx
         * 2. cupid://email-confirmed#access_token=xxx&refresh_token=xxx
         *
         * This handles both formats.
         */

        const parsedUrl = Linking.parse(url);
        const queryParams = parsedUrl?.queryParams || {};

        // Case 1: PKCE/code flow
        if (queryParams.code) {
          const { error } = await supabase.auth.exchangeCodeForSession(queryParams.code);

          if (error) {
            console.log('Supabase code exchange error:', error.message);
          }
        }

        // Case 2: token/hash flow
        const hashPart = url.includes('#') ? url.split('#')[1] : '';
        const hashParams = new URLSearchParams(hashPart);

        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');

        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (error) {
            console.log('Supabase set session error:', error.message);
          }
        }

        setScreen('EmailConfirmed');
        setParams({});
      } catch (error) {
        console.log('Deep link handling error:', error.message);

        // Even if session processing fails, show the confirmation screen.
        // The button/check flow can still recover from Supabase session state.
        setScreen('EmailConfirmed');
        setParams({});
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
        .subscribe();
    };

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session) {
        if (!session.user.email_confirmed_at) {
          setScreen((current) => {
            if (current === 'EmailConfirmed') return current;
            return 'VerifyEmail';
          });
          setParams({ email: session.user.email });
        } else {
          setMyUid(session.user.id);
          setupFriendshipWatch(session.user.id);

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
        }
      } else {
        setMyUid(null);
        setSearchBadge(0);
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
          setMyUid(session.user.id);
          setupFriendshipWatch(session.user.id);

          setScreen((current) => {
            if (current === 'Welcome') return 'MainTabs';
            return current;
          });
        }
      }
    });

    const pingInterval = setInterval(async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (session) {
        supabase
          .from('users')
          .update({ last_seen: new Date().toISOString() })
          .eq('id', session.user.id)
          .then();
      }
    }, 60000);

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
          <View style={{ flex: 1 }}>
            {tab === 'Discover' && <DiscoverScreen navigation={nav} />}
            {tab === 'Search' && <SearchScreen navigation={nav} />}
            {tab === 'Feed' && <PostsScreen navigation={nav} />}
            {tab === 'Matches' && <MatchesScreen navigation={nav} />}
            {tab === 'Profile' && <ProfileScreen navigation={nav} />}
          </View>

          <TabBar
            active={tab}
            setActive={setTab}
            searchBadge={searchBadge}
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

      case 'UserProfile':
        return <UserProfileScreen navigation={nav} route={{ params }} />;

      default:
        return <WelcomeScreen navigation={nav} />;
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.snow }}>
      {renderScreen()}
    </View>
  );
}