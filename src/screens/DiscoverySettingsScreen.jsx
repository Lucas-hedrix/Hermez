// screens/DiscoverySettingsScreen.jsx — discovery/privacy preferences
import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import { radius } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import { supabase } from '../supabase/client';

const GENDER_OPTIONS = [
  { key: 'women',   label: 'Women' },
  { key: 'men',     label: 'Men' },
  { key: 'everyone', label: 'Everyone' },
];

export default function DiscoverySettingsScreen({ navigation }) {
  const { colors } = useTheme();
  const s = getStyles(colors);

  const [discoverable, setDiscoverable] = useState(true);
  const [hideLastSeen, setHideLastSeen] = useState(false);
  const [minAge, setMinAge] = useState(18);
  const [maxAge, setMaxAge] = useState(35);
  const [genderPref, setGenderPref] = useState('everyone');
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }
      setUserId(session.user.id);
      const { data } = await supabase.from('users').select('*').eq('id', session.user.id).single();
      if (data) {
        setDiscoverable(data.show_me_on_cupid ?? true);
        setHideLastSeen(data.hide_last_seen ?? false);
        setMinAge(data.min_age ?? 18);
        setMaxAge(data.max_age ?? 35);
        setGenderPref(data.preference ?? 'everyone');
      }
      setLoading(false);
    })();
  }, []);

  const updateField = useCallback(async (field, value) => {
    if (!userId) return;
    await supabase.from('users').update({ [field]: value }).eq('id', userId);
  }, [userId]);

  const toggleDiscoverable = async (val) => {
    setDiscoverable(val);
    await updateField('show_me_on_cupid', val);
  };

  const toggleHideLastSeen = async (val) => {
    setHideLastSeen(val);
    await updateField('hide_last_seen', val);
  };

  const onMinAge = (val) => {
    const v = Math.round(val);
    const next = Math.min(v, maxAge - 1);
    setMinAge(next);
    updateField('min_age', next);
  };

  const onMaxAge = (val) => {
    const v = Math.round(val);
    const next = Math.max(v, minAge + 1);
    setMaxAge(next);
    updateField('max_age', next);
  };

  const onGender = (key) => {
    setGenderPref(key);
    updateField('preference', key);
  };

  return (
    <View style={s.root}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation?.goBack()}>
          <Ionicons name="chevron-back" size={24} color={colors.ink} />
        </TouchableOpacity>
        <Text style={s.title}>Discovery</Text>
        <View style={s.headerSpacer} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 110 }}>
        <Text style={s.sectionTitle}>Visibility</Text>
        <View style={s.card}>
          <View style={s.settingRow}>
            <View style={s.settingRowLeft}>
              <View style={s.settingIconWrap}>
                <Ionicons name="flame-outline" size={18} color={colors.ember} />
              </View>
              <View>
                <Text style={s.settingLabel}>Show me on Cupid</Text>
                <Text style={s.settingSubLabel}>Others can discover your profile</Text>
              </View>
            </View>
            <Switch value={discoverable} onValueChange={toggleDiscoverable}
              trackColor={{ false: colors.fog, true: colors.ember }} thumbColor={colors.white} />
          </View>

          <View style={s.divider} />

          <View style={s.settingRow}>
            <View style={s.settingRowLeft}>
              <View style={s.settingIconWrap}>
                <Ionicons name="eye-off-outline" size={18} color={colors.ember} />
              </View>
              <View>
                <Text style={s.settingLabel}>Hide "Last seen"</Text>
                <Text style={s.settingSubLabel}>Don't show when you were last active</Text>
              </View>
            </View>
            <Switch value={hideLastSeen} onValueChange={toggleHideLastSeen}
              trackColor={{ false: colors.fog, true: colors.ember }} thumbColor={colors.white} />
          </View>
        </View>

        <Text style={s.sectionTitle}>Who you see</Text>
        <View style={s.card}>
          <View style={s.settingRow}>
            <View style={s.settingRowLeft}>
              <View style={s.settingIconWrap}>
                <Ionicons name="people-outline" size={18} color={colors.ember} />
              </View>
              <View>
                <Text style={s.settingLabel}>Show me</Text>
                <Text style={s.settingSubLabel}>Gender preference</Text>
              </View>
            </View>
          </View>
          <View style={s.genderRow}>
            {GENDER_OPTIONS.map(opt => (
              <TouchableOpacity key={opt.key} onPress={() => onGender(opt.key)} style={[
                s.genderChip,
                { backgroundColor: genderPref === opt.key ? colors.emberLight : colors.snow, borderColor: genderPref === opt.key ? colors.ember : colors.fog },
              ]}>
                <Text style={[s.genderText, { color: genderPref === opt.key ? colors.ember : colors.ink }]}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={s.divider} />

          <View style={s.ageHeader}>
            <Text style={s.settingLabel}>Age range</Text>
            <Text style={[s.settingSubLabel, { fontWeight: '700' }]}>{minAge} – {maxAge}</Text>
          </View>
          <View style={s.sliderRow}>
            <Text style={s.sliderLabel}>Min</Text>
            <Slider
              style={s.slider}
              minimumValue={18}
              maximumValue={80}
              step={1}
              value={minAge}
              onValueChange={onMinAge}
              minimumTrackTintColor={colors.ember}
              maximumTrackTintColor={colors.fog}
              thumbTintColor={colors.ember}
            />
          </View>
          <View style={s.sliderRow}>
            <Text style={s.sliderLabel}>Max</Text>
            <Slider
              style={s.slider}
              minimumValue={18}
              maximumValue={80}
              step={1}
              value={maxAge}
              onValueChange={onMaxAge}
              minimumTrackTintColor={colors.ember}
              maximumTrackTintColor={colors.fog}
              thumbTintColor={colors.ember}
            />
          </View>
        </View>

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
    overflow: 'hidden', paddingVertical: 6,
  },

  settingRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  settingRowLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 },
  settingIconWrap: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.emberLight, alignItems: 'center', justifyContent: 'center',
  },
  settingLabel: { fontSize: 15, fontWeight: '600', color: colors.ink },
  settingSubLabel: { fontSize: 12, color: colors.ash, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.fog, marginLeft: 64 },

  genderRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 14 },
  genderChip: {
    paddingVertical: 8, paddingHorizontal: 18, borderRadius: radius.full,
    borderWidth: 1.5, alignItems: 'center',
  },
  genderText: { fontSize: 14, fontWeight: '600' },

  ageHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 8,
  },
  sliderRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 4 },
  sliderLabel: { width: 36, fontSize: 13, color: colors.ash, fontWeight: '600' },
  slider: { flex: 1, height: 40 },
});
