// navigation/AppNavigator.jsx
import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme';
import { supabase } from '../supabase/client';

// Screens
import WelcomeScreen      from '../screens/WelcomeScreen';
import LoginScreen        from '../screens/LoginScreen';
import RegisterScreen     from '../screens/RegisterScreen';
import ProfileSetupScreen from '../screens/ProfileSetupScreen';
import DiscoverScreen     from '../screens/DiscoverScreen';
import MatchesScreen      from '../screens/MatchesScreen';
import ChatScreen         from '../screens/ChatScreen';
import MatchScreen        from '../screens/MatchScreen';
import ProfileScreen      from '../screens/ProfileScreen';
import PostsScreen        from '../screens/PostsScreen';
import SearchScreen       from '../screens/SearchScreen';
import FriendChatScreen   from '../screens/FriendChatScreen';
import EditProfileScreen  from '../screens/EditProfileScreen';
import UserProfileScreen  from '../screens/UserProfileScreen';

// ── Bottom tab bar ──────────────────────────────────────────────────────────
function TabBar({ active, setActive, searchBadge }) {
  const tabs = [
    { id: 'Discover', icon: 'flame-sharp',        iconOff: 'flame-outline',         label: 'Discover' },
    { id: 'Search',   icon: 'search-circle',       iconOff: 'search-circle-outline', label: 'Search',  badge: searchBadge },
    { id: 'Feed',     icon: 'newspaper',           iconOff: 'newspaper-outline',     label: 'Feed'     },
    { id: 'Matches',  icon: 'chatbubbles-sharp',   iconOff: 'chatbubbles-outline',   label: 'Matches'  },
    { id: 'Profile',  icon: 'person-circle',       iconOff: 'person-circle-outline', label: 'Profile'  },
  ];
  return (
    <View style={tb.bar}>
      {tabs.map(tab => {
        const isActive = active === tab.id;
        return (
          <TouchableOpacity key={tab.id} style={tb.btn} onPress={() => setActive(tab.id)} activeOpacity={0.75}>
            <View style={tb.iconWrap}>
              <Ionicons
                name={isActive ? tab.icon : tab.iconOff}
                size={22}
                color={isActive ? colors.ember : '#B0ABAB'}
              />
              {tab.badge > 0 && (
                <View style={tb.badge}><Text style={tb.badgeText}>{tab.badge}</Text></View>
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

const tb = StyleSheet.create({
  bar: {
    flexDirection: 'row', borderTopWidth: 1, borderColor: '#E8E4E4',
    backgroundColor: '#fff', paddingBottom: 24, paddingTop: 8,
  },
  btn:      { flex: 1, alignItems: 'center', gap: 2, position: 'relative' },
  iconWrap: { position: 'relative' },
  badge: {
    position: 'absolute', top: -4, right: -8,
    minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: '#E8472A', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText:   { color: '#fff', fontSize: 9, fontWeight: '800' },
  label:       { fontSize: 9, color: '#B0ABAB', fontWeight: '500' },
  labelActive: { color: '#E8472A', fontWeight: '700' },
  indicator: {
    position: 'absolute', top: -9, width: 4, height: 4, borderRadius: 2, backgroundColor: '#E8472A',
  },
});

// ── Root Navigator ──────────────────────────────────────────────────────────
export default function AppNavigator() {
  const [screen,      setScreen]      = useState('Welcome');
  const [params,      setParams]      = useState({});
  const [tab,         setTab]         = useState('Discover');
  const [searchBadge, setSearchBadge] = useState(0);  // pending friend requests badge
  const [myUid,       setMyUid]       = useState(null);

  const navigate = (name, p = {}) => { setScreen(name); setParams(p); };
  const goBack = () => {
    if (['Login', 'Register', 'ProfileSetup'].includes(screen)) setScreen('Welcome');
    else setScreen('MainTabs');
  };
  const nav      = { navigate, goBack };

  // ── Watch for incoming friend requests to show badge ──────────────────────
  useEffect(() => {
    let channel;
    
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session) {
        setMyUid(session.user.id);
        setupFriendshipWatch(session.user.id);
      } else {
        setMyUid(null);
        setSearchBadge(0);
        setScreen('Welcome'); // Force back to Welcome when signed out
        if (channel) {
          supabase.removeChannel(channel);
          channel = null;
        }
      }
    });

    // Check initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setMyUid(session.user.id);
        setupFriendshipWatch(session.user.id);
      }
    });

    const setupFriendshipWatch = async (uid) => {
      if (channel) return; // already watching
      
      // Update last_seen on mount
      supabase.from('users').update({ last_seen: new Date().toISOString() }).eq('id', uid).then();

      // Initial count of pending incoming requests
      const { count } = await supabase
        .from('friendships')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_id', uid)
        .eq('status', 'pending');
      setSearchBadge(count ?? 0);

      // Realtime updates
      channel = supabase.channel('nav-friendship-watch')
        .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'friendships', filter: `recipient_id=eq.${uid}` },
          () => setSearchBadge(c => c + 1)
        )
        .on('postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'friendships' },
          () => {
            // Recalculate badge when a request is accepted
            supabase.from('friendships')
              .select('id', { count: 'exact', head: true })
              .eq('recipient_id', uid).eq('status', 'pending')
              .then(({ count: c }) => setSearchBadge(c ?? 0));
          }
        ).subscribe();
    };

    // Periodic last_seen ping
    const pingInterval = setInterval(async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        supabase.from('users').update({ last_seen: new Date().toISOString() }).eq('id', session.user.id).then();
      }
    }, 60000); // 1 minute

    return () => { 
      if (channel) supabase.removeChannel(channel); 
      authListener?.subscription.unsubscribe();
      clearInterval(pingInterval);
    };
  }, []);

  const renderScreen = () => {
    if (screen === 'MainTabs') {
      return (
        <View style={{ flex: 1 }}>
          <View style={{ flex: 1 }}>
            {tab === 'Discover' && <DiscoverScreen navigation={nav} />}
            {tab === 'Search'   && <SearchScreen   navigation={nav} />}
            {tab === 'Feed'     && <PostsScreen     navigation={nav} />}
            {tab === 'Matches'  && <MatchesScreen   navigation={nav} />}
            {tab === 'Profile'  && <ProfileScreen   navigation={nav} />}
          </View>
          <TabBar active={tab} setActive={setTab} searchBadge={searchBadge} />
        </View>
      );
    }
    switch (screen) {
      case 'Welcome':      return <WelcomeScreen      navigation={nav} />;
      case 'Login':        return <LoginScreen         navigation={nav} />;
      case 'Register':     return <RegisterScreen      navigation={nav} />;
      case 'ProfileSetup': return <ProfileSetupScreen  navigation={nav} />;
      case 'Chat':         return <ChatScreen          navigation={nav} route={{ params }} />;
      case 'Match':        return <MatchScreen         navigation={nav} route={{ params }} />;
      case 'FriendChat':   return <FriendChatScreen    navigation={nav} route={{ params }} />;
      case 'EditProfile':  return <EditProfileScreen   navigation={nav} />;
      case 'UserProfile':  return <UserProfileScreen   navigation={nav} route={{ params }} />;
      default:             return <WelcomeScreen       navigation={nav} />;
    }
  };

  return <View style={{ flex: 1 }}>{renderScreen()}</View>;
}
