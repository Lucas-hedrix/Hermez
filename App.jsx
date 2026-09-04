import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';
// App.jsx — entry point
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import { ThemeProvider } from './src/theme/ThemeContext';
import { useEffect, useState } from 'react';
import Constants from 'expo-constants';
import { supabase } from './src/supabase/client';
import UpdateModal from './src/components/UpdateModal';
import { Platform } from 'react-native';
import * as Font from 'expo-font';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { OtaUpdateProvider } from './src/context/OtaUpdateContext';

function compareVersions(v1, v2) {
  const p1 = v1.split('.').map(Number);
  const p2 = v2.split('.').map(Number);
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const n1 = p1[i] || 0;
    const n2 = p2[i] || 0;
    if (n1 > n2) return 1;
    if (n1 < n2) return -1;
  }
  return 0;
}

export default function App() {
  const iconFonts = { ...Ionicons.font, ...MaterialIcons.font };
  const [fontsLoaded] = Font.useFonts(iconFonts);
  
  const [updateVisible, setUpdateVisible] = useState(false);
  const [isHardUpdate, setIsHardUpdate] = useState(false);
  const [updateUrl, setUpdateUrl] = useState('');

  useEffect(() => {
    async function checkAppVersion() {
      try {
        const currentVersion = Constants.expoConfig?.version || '1.0.0';
        
        const { data, error } = await supabase
          .from('app_settings')
          .select('*')
          .eq('id', 1)
          .maybeSingle();
          
        if (error || !data) return;

        if (compareVersions(data.latest_version, currentVersion) > 0) {
          const finalUrl = data.update_url.replace('{version}', data.latest_version);
          setUpdateUrl(finalUrl);
          
          const releaseDate = new Date(data.release_date);
          const now = new Date();
          const diffTime = Math.abs(now - releaseDate);
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          
          if (diffDays >= 3) {
            setIsHardUpdate(true);
            setUpdateVisible(true);
          } else {
            // Soft update: show once per session or day
            setIsHardUpdate(false);
            setUpdateVisible(true);
          }

          // Optionally send in-app notification if user is logged in
          const { data: sessionData } = await supabase.auth.getSession();
          if (sessionData?.session?.user) {
            const userId = sessionData.session.user.id;
            
            // Check if we already notified them about THIS version
            const notifKey = `notified_version_${data.latest_version}`;
            const { data: storage } = await supabase.from('notifications').select('id').eq('user_id', userId).eq('type', 'system').like('message', `%${data.latest_version}%`).limit(1);
            
            if (!storage || storage.length === 0) {
              await supabase.from('notifications').insert({
                user_id: userId,
                type: 'system',
                title: 'Update Available!',
                message: `Version ${data.latest_version} is out now. Please update to get the latest features.`,
                read: false
              });
            }
          }
        }
      } catch (err) {
        console.log('Update check error:', err);
      }
    }
    
    checkAppVersion();
  }, []);

  // Never block the web shell on icon font downloads — it can hang on mobile browsers.
  if (!fontsLoaded && Platform.OS !== 'web') {
    return null;
  }

  return (
    <SafeAreaProvider style={{ flex: 1 }}>
      <ThemeProvider>
        <OtaUpdateProvider>
          <StatusBar style="auto" />
          <AppNavigator />
          <UpdateModal
            visible={updateVisible}
            isHardUpdate={isHardUpdate}
            updateUrl={updateUrl}
            onDismiss={() => setUpdateVisible(false)}
          />
        </OtaUpdateProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
