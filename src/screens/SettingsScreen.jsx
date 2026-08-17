// screens/SettingsScreen.jsx — central settings hub
import { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Switch, Image, Platform, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radius, chatFonts, chatThemes } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import { pickPhotoAsset } from '../supabase/storage';

const ACCENT_COLORS = [
  { key: 'pink',   hex: '#FF4D6D' },
  { key: 'purple', hex: '#9B51E0' },
  { key: 'blue',   hex: '#2F80ED' },
  { key: 'green',  hex: '#27AE60' },
  { key: 'orange', hex: '#F2994A' },
];

export default function SettingsScreen({ navigation }) {
  const {
    colors, isDark, toggleTheme,
    accentColor, changeAccentColor,
    chatFont, changeChatFont,
    chatTheme, changeChatTheme,
  } = useTheme();
  const s = getStyles(colors);

  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = () => {
    Alert.alert(
      'Sign out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: async () => {
            setLoggingOut(true);
            try {
              const { supabase } = await import('../supabase/client');
              await supabase.auth.signOut();
            } catch (e) {
              console.error('Logout error', e);
            } finally {
              setLoggingOut(false);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={s.root}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation?.goBack()}>
          <Ionicons name="chevron-back" size={24} color={colors.ink} />
        </TouchableOpacity>
        <Text style={s.title}>Settings</Text>
        <View style={s.headerSpacer} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 110 }}
      >
        {/* Preferences */}
        <Text style={s.sectionTitle}>Preferences</Text>

        <View style={s.card}>
          <View style={s.settingRow}>
            <View style={s.settingRowLeft}>
              <View style={s.settingIconWrap}>
                <Ionicons name="moon-outline" size={18} color={colors.ember} />
              </View>
              <View>
                <Text style={s.settingLabel}>Night Mode</Text>
                <Text style={s.settingSubLabel}>Toggle dark theme</Text>
              </View>
            </View>
            <Switch value={isDark} onValueChange={toggleTheme}
              trackColor={{ false: colors.fog, true: colors.ember }} thumbColor={colors.white} />
          </View>

          <View style={s.divider} />

          <View style={s.settingRow}>
            <View style={s.settingRowLeft}>
              <View style={s.settingIconWrap}>
                <Ionicons name="color-palette-outline" size={18} color={colors.ember} />
              </View>
              <View>
                <Text style={s.settingLabel}>Accent Color</Text>
                <Text style={s.settingSubLabel}>Choose your app theme color</Text>
              </View>
            </View>
          </View>

          <View style={s.colorRow}>
            {ACCENT_COLORS.map(c => (
              <TouchableOpacity key={c.key} onPress={() => changeAccentColor(c.key)} style={[
                s.colorDot,
                { backgroundColor: c.hex, borderColor: accentColor === c.key ? colors.ink : 'transparent' },
              ]}>
                {accentColor === c.key && <Ionicons name="checkmark" size={20} color="#FFF" />}
              </TouchableOpacity>
            ))}
          </View>

          <View style={s.divider} />

          <View style={s.settingRow}>
            <View style={s.settingRowLeft}>
              <View style={s.settingIconWrap}>
                <Ionicons name="text-outline" size={18} color={colors.ember} />
              </View>
              <View>
                <Text style={s.settingLabel}>Chat Font</Text>
                <Text style={s.settingSubLabel}>Choose your message font style</Text>
              </View>
            </View>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.fontScroll} contentContainerStyle={s.fontScrollContent}>
            {Object.entries(chatFonts).map(([key, font]) => (
              <TouchableOpacity key={key} onPress={() => changeChatFont(key)} style={[
                s.fontDot,
                { backgroundColor: chatFont === key ? colors.emberLight : colors.snow, borderColor: chatFont === key ? colors.ember : colors.fog },
              ]}>
                <Text style={[
                  s.fontPreview,
                  { fontFamily: Platform.OS === 'ios' ? font.ios : font.android, color: chatFont === key ? colors.ember : colors.ink },
                ]}>Aa</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <Text style={s.selectedLabel}>{chatFonts[chatFont]?.label || 'System'}</Text>

          <View style={s.divider} />

          <View style={s.settingRow}>
            <View style={s.settingRowLeft}>
              <View style={s.settingIconWrap}>
                <Ionicons name="image-outline" size={18} color={colors.ember} />
              </View>
              <View>
                <Text style={s.settingLabel}>Chat Background</Text>
                <Text style={s.settingSubLabel}>Choose your chat background theme</Text>
              </View>
            </View>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.themeScroll} contentContainerStyle={s.themeScrollContent}>
            {Object.entries(chatThemes).map(([key, theme]) => (
              <TouchableOpacity key={key} onPress={() => changeChatTheme(key)} style={[
                s.themeThumb,
                { backgroundColor: chatTheme === key ? colors.emberLight : colors.snow, borderColor: chatTheme === key ? colors.ember : colors.fog },
              ]}>
                <Image source={theme.uri} style={s.themeImage} />
                {chatTheme === key && (
                  <View style={s.themeCheck}>
                    <Ionicons name="checkmark" size={16} color="#FFF" />
                  </View>
                )}
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={async () => {
              const asset = await pickPhotoAsset();
              if (asset?.uri) {
                changeChatTheme(`custom:${asset.uri}`);
              }
            }} style={[s.themeThumb, { backgroundColor: colors.snow, borderColor: colors.fog, borderStyle: 'dashed' }]}>
              <Ionicons name="add" size={28} color={colors.ash} />
            </TouchableOpacity>
          </ScrollView>
          <Text style={s.selectedLabel}>{chatThemes[chatTheme]?.label || 'Theme 2'}</Text>
        </View>

        {/* Discovery */}
        <Text style={s.sectionTitle}>Discovery</Text>
        <View style={s.card}>
          <TouchableOpacity style={s.navRow} onPress={() => navigation?.navigate('DiscoverySettings')}>
            <View style={s.settingRowLeft}>
              <View style={s.settingIconWrap}>
                <Ionicons name="compass-outline" size={18} color={colors.ember} />
              </View>
              <View>
                <Text style={s.settingLabel}>Discovery settings</Text>
                <Text style={s.settingSubLabel}>Age, distance, gender</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.ash} />
          </TouchableOpacity>
        </View>

        {/* Account */}
        <Text style={s.sectionTitle}>Account</Text>
        <View style={s.card}>
          <TouchableOpacity style={s.navRow} onPress={() => navigation?.navigate('EditProfile')}>
            <View style={s.settingRowLeft}>
              <View style={s.settingIconWrap}>
                <Ionicons name="create-outline" size={18} color={colors.ember} />
              </View>
              <View>
                <Text style={s.settingLabel}>Edit profile</Text>
                <Text style={s.settingSubLabel}>Photos, bio, interests</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.ash} />
          </TouchableOpacity>

          <View style={s.divider} />

          <TouchableOpacity style={s.navRow} onPress={() => navigation?.navigate('PrivacySettings')}>
            <View style={s.settingRowLeft}>
              <View style={s.settingIconWrap}>
                <Ionicons name="lock-closed-outline" size={18} color={colors.ember} />
              </View>
              <View>
                <Text style={s.settingLabel}>Privacy & safety</Text>
                <Text style={s.settingSubLabel}>Block list, data</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.ash} />
          </TouchableOpacity>

          <View style={s.divider} />

          <TouchableOpacity style={s.navRow} onPress={() => navigation?.navigate('HelpSupport')}>
            <View style={s.settingRowLeft}>
              <View style={s.settingIconWrap}>
                <Ionicons name="help-circle-outline" size={18} color={colors.ember} />
              </View>
              <View>
                <Text style={s.settingLabel}>Help & support</Text>
                <Text style={s.settingSubLabel}>FAQ, contact us</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.ash} />
          </TouchableOpacity>
        </View>

        {/* App */}
        <Text style={s.sectionTitle}>App</Text>
        <View style={s.card}>
          <TouchableOpacity style={s.navRow} onPress={() => navigation?.navigate('About')}>
            <View style={s.settingRowLeft}>
              <View style={s.settingIconWrap}>
                <Ionicons name="information-circle-outline" size={18} color={colors.ember} />
              </View>
              <View>
                <Text style={s.settingLabel}>About</Text>
                <Text style={s.settingSubLabel}>Version, terms, privacy</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.ash} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={s.logoutBtn} onPress={handleLogout} disabled={loggingOut}>
          <Ionicons name="log-out-outline" size={18} color={colors.danger} style={{ marginRight: 8 }} />
          <Text style={s.logoutText}>{loggingOut ? 'Signing out…' : 'Sign out'}</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const getStyles = (colors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.snow },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 50, paddingBottom: 14,
    backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.fog,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.fog,
  },
  headerSpacer: { width: 40 },
  title: { fontSize: 22, fontWeight: '800', color: colors.ink, letterSpacing: -0.5 },

  sectionTitle: {
    fontSize: 13, fontWeight: '700', color: colors.ash,
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginHorizontal: 20, marginTop: 24, marginBottom: 10,
  },

  card: {
    marginHorizontal: 16, backgroundColor: colors.white,
    borderRadius: radius.lg, borderWidth: 1, borderColor: colors.fog,
    overflow: 'hidden',
  },

  settingRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  settingRowLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 },
  settingIconWrap: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.emberLight, alignItems: 'center', justifyContent: 'center',
  },
  settingLabel: { fontSize: 15, fontWeight: '600', color: colors.ink },
  settingSubLabel: { fontSize: 12, color: colors.ash, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.fog, marginLeft: 64 },

  colorRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingBottom: 16 },
  colorDot: {
    width: 36, height: 36, borderRadius: 18,
    borderWidth: 2, alignItems: 'center', justifyContent: 'center',
  },

  fontScroll: { marginTop: 4, marginBottom: 8, marginHorizontal: 16 },
  fontScrollContent: { gap: 10, paddingVertical: 8 },
  fontDot: {
    width: 44, height: 44, borderRadius: 22,
    borderWidth: 2, alignItems: 'center', justifyContent: 'center',
  },
  fontPreview: { fontSize: 16, fontWeight: '700' },
  selectedLabel: { marginHorizontal: 20, marginTop: 4, marginBottom: 12, fontSize: 12, color: colors.ash },

  themeScroll: { marginTop: 4, marginBottom: 8, marginHorizontal: 16 },
  themeScrollContent: { gap: 10, paddingVertical: 8 },
  themeThumb: {
    width: 80, height: 60, borderRadius: 12,
    borderWidth: 2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    position: 'relative',
  },
  themeImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  themeCheck: {
    position: 'absolute', top: 4, right: 4,
    backgroundColor: colors.ember, borderRadius: 10, width: 20, height: 20,
    alignItems: 'center', justifyContent: 'center',
  },

  navRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
  },

  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginHorizontal: 16, marginTop: 24, paddingVertical: 14,
    borderRadius: radius.lg, backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.danger,
  },
  logoutText: { color: colors.danger, fontSize: 15, fontWeight: '700' },
});
