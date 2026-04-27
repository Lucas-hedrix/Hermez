// screens/EditProfileScreen.jsx
import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, shadow } from '../theme';
import { supabase } from '../supabase/client';
import { detectRegion } from '../supabase/storage';

const HOBBIES = [
  'Reading', 'Cooking', 'Fitness', 'Travel', 'Music', 'Art',
  'Gaming', 'Dancing', 'Photography', 'Hiking', 'Movies', 'Sports',
  'Yoga', 'Fashion', 'Technology', 'Food', 'Nature', 'Writing',
  'Swimming', 'Cycling',
];

const SIGNS = [
  { sign: 'Aries',       symbol: '♈' },
  { sign: 'Taurus',      symbol: '♉' },
  { sign: 'Gemini',      symbol: '♊' },
  { sign: 'Cancer',      symbol: '♋' },
  { sign: 'Leo',         symbol: '♌' },
  { sign: 'Virgo',       symbol: '♍' },
  { sign: 'Libra',       symbol: '♎' },
  { sign: 'Scorpio',     symbol: '♏' },
  { sign: 'Sagittarius', symbol: '♐' },
  { sign: 'Capricorn',   symbol: '♑' },
  { sign: 'Aquarius',    symbol: '♒' },
  { sign: 'Pisces',      symbol: '♓' },
];

export default function EditProfileScreen({ navigation }) {
  const [name,    setName]    = useState('');
  const [bio,     setBio]     = useState('');
  const [region,  setRegion]  = useState('');
  const [hobbies, setHobbies] = useState([]);
  const [sign,    setSign]    = useState('');
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [uid,     setUid]     = useState(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }
      setUid(session.user.id);

      const { data } = await supabase.from('users').select('name, bio, region, hobbies, astrology_sign').eq('id', session.user.id).single();
      if (data) {
        setName(data.name   ?? '');
        setBio(data.bio     ?? '');
        setHobbies(Array.isArray(data.hobbies) ? data.hobbies : []);
        setSign(data.astrology_sign ?? '');

        // Auto-detect region if empty
        if (!data.region) {
          const detected = await detectRegion();
          if (detected) setRegion(detected);
        } else {
          setRegion(data.region);
        }
      }
      setLoading(false);
    })();
  }, []);

  const toggleHobby = (h) => {
    setHobbies(prev =>
      prev.includes(h) ? prev.filter(x => x !== h) : [...prev, h]
    );
  };

  const save = async () => {
    if (!name.trim()) { Alert.alert('Name required', 'Please enter your name.'); return; }
    try {
      setSaving(true);
      const { error } = await supabase.from('users').update({
        name:           name.trim(),
        bio:            bio.trim(),
        region,
        hobbies,
        astrology_sign: sign,
      }).eq('id', uid);
      if (error) throw error;
      Alert.alert('Saved!', 'Your profile has been updated.', [
        { text: 'OK', onPress: () => navigation?.goBack() },
      ]);
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.snow }}>
        <ActivityIndicator color={colors.ember} />
      </View>
    );
  }

  return (
    <View style={s.root}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation?.goBack()}>
          <Ionicons name="chevron-back" size={22} color={colors.graphite} />
        </TouchableOpacity>
        <Text style={s.title}>Edit profile</Text>
        <TouchableOpacity style={s.saveBtn} onPress={save} disabled={saving}>
          {saving ? <ActivityIndicator color={colors.white} size="small" /> : <Text style={s.saveBtnText}>Save</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

        {/* Basic info */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>Basic info</Text>
          <View style={s.fieldWrap}>
            <Text style={s.fieldLabel}>Name</Text>
            <TextInput style={s.input} value={name} onChangeText={setName} placeholder="Your name" placeholderTextColor={colors.ash} />
          </View>
          <View style={s.fieldWrap}>
            <Text style={s.fieldLabel}>Bio</Text>
            <TextInput
              style={[s.input, s.inputMulti]}
              value={bio}
              onChangeText={setBio}
              placeholder="Tell people about yourself…"
              placeholderTextColor={colors.ash}
              multiline
              maxLength={300}
              textAlignVertical="top"
            />
            <Text style={s.charCount}>{bio.length}/300</Text>
          </View>
          <View style={s.fieldWrap}>
            <Text style={s.fieldLabel}>Based in</Text>
            <View style={[s.input, s.regionRow]}>
              <Ionicons name="globe-outline" size={16} color={colors.ash} />
              <Text style={{ flex: 1, color: region ? colors.ink : colors.ash, fontSize: 15 }}>
                {region || 'Detecting location…'}
              </Text>
            </View>
            <Text style={s.hint}>Detected from your network — shown as region only (e.g. Europe)</Text>
          </View>
        </View>

        {/* Astrology sign */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>Star sign</Text>
          <Text style={s.sectionSub}>Used to suggest compatible matches</Text>
          <View style={s.signGrid}>
            {SIGNS.map(({ sign: sg, symbol }) => (
              <TouchableOpacity
                key={sg}
                style={[s.signPill, sign === sg && s.signPillActive]}
                onPress={() => setSign(sg)}
              >
                <Text style={s.signSymbol}>{symbol}</Text>
                <Text style={[s.signName, sign === sg && s.signNameActive]}>{sg}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Hobbies */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>Hobbies & interests</Text>
          <Text style={s.sectionSub}>Pick up to 10</Text>
          <View style={s.hobbyGrid}>
            {HOBBIES.map(h => {
              const selected = hobbies.includes(h);
              const disabled = !selected && hobbies.length >= 10;
              return (
                <TouchableOpacity
                  key={h}
                  style={[s.hobbyPill, selected && s.hobbyPillActive, disabled && s.hobbyPillDisabled]}
                  onPress={() => !disabled && toggleHobby(h)}
                  activeOpacity={disabled ? 1 : 0.7}
                >
                  <Text style={[s.hobbyText, selected && s.hobbyTextActive]}>{h}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.snow },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 54, paddingBottom: 12,
    backgroundColor: colors.white, borderBottomWidth: 1, borderColor: colors.fog,
  },
  backBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.fog, alignItems: 'center', justifyContent: 'center' },
  title:   { fontSize: 17, fontWeight: '700', color: colors.ink },
  saveBtn: { backgroundColor: colors.ember, borderRadius: radius.full, paddingVertical: 8, paddingHorizontal: 18, minWidth: 60, alignItems: 'center' },
  saveBtnText: { color: colors.white, fontWeight: '700', fontSize: 14 },

  scroll:  { padding: 16, paddingBottom: 40 },

  section:     { backgroundColor: colors.white, borderRadius: radius.lg, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: colors.fog },
  sectionLabel:{ fontSize: 11, fontWeight: '700', color: colors.stone, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  sectionSub:  { fontSize: 12, color: colors.ash, marginBottom: 14 },

  fieldWrap: { marginBottom: 16 },
  fieldLabel:{ fontSize: 12, fontWeight: '600', color: colors.stone, marginBottom: 6 },
  input:     { borderWidth: 1, borderColor: colors.fog, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.ink, backgroundColor: colors.snow },
  inputMulti:{ minHeight: 90, paddingTop: 12 },
  regionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
  charCount: { fontSize: 11, color: colors.ash, textAlign: 'right', marginTop: 4 },
  hint:      { fontSize: 11, color: colors.ash, marginTop: 5, lineHeight: 15 },

  signGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  signPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.full,
    borderWidth: 1, borderColor: colors.fog, backgroundColor: colors.snow,
  },
  signPillActive: { backgroundColor: colors.ember, borderColor: colors.ember },
  signSymbol:     { fontSize: 16 },
  signName:       { fontSize: 12, fontWeight: '600', color: colors.graphite },
  signNameActive: { color: colors.white },

  hobbyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  hobbyPill: {
    paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.full,
    borderWidth: 1, borderColor: colors.fog, backgroundColor: colors.snow,
  },
  hobbyPillActive:  { backgroundColor: colors.emberLight, borderColor: colors.ember },
  hobbyPillDisabled:{ opacity: 0.4 },
  hobbyText:        { fontSize: 13, color: colors.graphite, fontWeight: '500' },
  hobbyTextActive:  { color: colors.ember, fontWeight: '600' },
});
