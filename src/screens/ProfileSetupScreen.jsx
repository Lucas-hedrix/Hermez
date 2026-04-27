// screens/ProfileSetupScreen.jsx
import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Dimensions, Image, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, shadow } from '../theme';
import { InputField, SelectPill, PrimaryButton, GhostButton } from '../components/UI';
import { supabase } from '../supabase/client';
import { pickAndUploadPhoto } from '../supabase/storage';

const { width: W } = Dimensions.get('window');

const GENDERS = ['Woman', 'Man', 'Non-binary', 'Other'];
const INTERESTS = [
  { label: 'Women', value: 'women' },
  { label: 'Men', value: 'men' },
  { label: 'Everyone', value: 'everyone' },
];
const STEP_TITLES = ['About you', 'Your photos', 'Preferences', 'Interests & Sign'];
const STEP_SUBS = [
  'Tell people who you are',
  'Add at least one photo',
  'Who are you looking for?',
  'What do you like?',
];

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

export default function ProfileSetupScreen({ navigation }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [bio, setBio] = useState('');
  const [interest, setInterest] = useState('everyone');
  const [minAge, setMinAge] = useState('18');
  const [maxAge, setMaxAge] = useState('35');
  const [photos, setPhotos] = useState([null, null, null, null]);
  const [uploadingIdx, setUploadingIdx] = useState(null);
  const [saving, setSaving] = useState(false);
  const [hobbies, setHobbies] = useState([]);
  const [sign, setSign] = useState('');

  const next = async () => {
    if (step < 3) {
      setStep(s => s + 1);
    } else {
      try {
        setSaving(true);
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { Alert.alert('Session expired', 'Please sign in again.'); return; }

        const validPhotos = photos.filter(Boolean);

        const { error } = await supabase
          .from('users')
          .update({
            name: name.trim() || session.user.user_metadata?.name || 'You',
            age: parseInt(age, 10) || 18,
            gender,
            bio: bio.trim(),
            preference: interest,
            min_age: parseInt(minAge, 10) || 18,
            max_age: parseInt(maxAge, 10) || 35,
            photo_urls: validPhotos,
            hobbies: hobbies,
            astrology_sign: sign,
            profile_complete: true,
          })
          .eq('id', session.user.id);

        if (error) throw new Error(error.message);
        navigation?.navigate('MainTabs');
      } catch (err) {
        Alert.alert('Error saving profile', err.message);
      } finally {
        setSaving(false);
      }
    }
  };
  const back = () => { if (step > 0) setStep(s => s - 1); else navigation?.goBack(); };

  const pickPhoto = async (index) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      setUploadingIdx(index);
      const url = await pickAndUploadPhoto(session.user.id);
      if (url) {
        setPhotos(prev => { const n = [...prev]; n[index] = url; return n; });
      }
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setUploadingIdx(null);
    }
  };

  return (
    <View style={s.root}>
      {/* Top bar */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.backBtn} onPress={back}>
          <Ionicons name="chevron-back" size={20} color={colors.graphite} />
        </TouchableOpacity>
        {/* Progress dots */}
        <View style={s.dots}>
          {STEP_TITLES.map((_, i) => (
            <View key={i} style={[s.dot, i === step && s.dotActive, i < step && s.dotDone]} />
          ))}
        </View>
        <Text style={s.stepCount}>{step + 1}/4</Text>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Step heading */}
        <Text style={s.stepTitle}>{STEP_TITLES[step]}</Text>
        <Text style={s.stepSub}>{STEP_SUBS[step]}</Text>

        {/* ── STEP 0: Basic info ── */}
        {step === 0 && (
          <View style={s.stepBody}>
            <InputField label="First name" value={name} onChangeText={setName} placeholder="Your name" autoCapitalize="words" />
            <InputField label="Age" value={age} onChangeText={setAge} placeholder="e.g. 25" keyboardType="number-pad" maxLength={2} />
            <View style={s.fieldWrap}>
              <Text style={s.fieldLabel}>I am</Text>
              <View style={s.pillRow}>
                {GENDERS.map(g => (
                  <SelectPill key={g} label={g} selected={gender === g} onPress={() => setGender(g)} />
                ))}
              </View>
            </View>
            <View style={s.fieldWrap}>
              <Text style={s.fieldLabel}>Bio</Text>
              <View style={s.textAreaWrap}>
                <InputField
                  value={bio}
                  onChangeText={setBio}
                  placeholder="Tell people a little about yourself…"
                  multiline
                  maxLength={300}
                  inputStyle={s.textArea}
                />
                <Text style={s.charCount}>{bio.length}/300</Text>
              </View>
            </View>
          </View>
        )}

        {/* ── STEP 1: Photos ── */}
        {step === 1 && (
          <View style={s.stepBody}>
            <Text style={s.photoHint}>Your first photo is your main profile photo</Text>
            <View style={s.photoGrid}>
              {photos.map((uri, i) => (
                <TouchableOpacity
                  key={i}
                  style={[s.photoSlot, i === 0 && s.photoSlotLarge, uri && s.photoSlotFilled]}
                  onPress={() => pickPhoto(i)}
                  activeOpacity={0.8}
                  disabled={uploadingIdx !== null}
                >
                  {uploadingIdx === i
                    ? <View style={s.photoPlaceholder}>
                        <ActivityIndicator color={colors.ember} />
                      </View>
                    : uri
                      ? <Image source={{ uri }} style={[s.photoImg, i === 0 && s.photoImgLarge]} />
                      : <View style={s.photoPlaceholder}>
                          <Text style={[s.photoPlus, i === 0 && s.photoPlusLarge]}>+</Text>
                          {i === 0 && <Text style={s.photoMainLabel}>Main photo</Text>}
                        </View>
                  }
                  {i === 0 && uri && uploadingIdx !== 0 && (
                    <View style={s.mainBadge}><Text style={s.mainBadgeText}>Main</Text></View>
                  )}
                </TouchableOpacity>
              ))}
            </View>
            <Text style={s.photoTip}>
              Tip: Profiles with 3+ photos get 4× more matches.{'\n'}
              Use recent, clear photos of just you.
            </Text>
          </View>
        )}

        {/* ── STEP 2: Preferences ── */}
        {step === 2 && (
          <View style={s.stepBody}>
            <View style={s.fieldWrap}>
              <Text style={s.fieldLabel}>I'm interested in</Text>
              <View style={s.pillRow}>
                {INTERESTS.map(p => (
                  <SelectPill key={p.value} label={p.label} selected={interest === p.value} onPress={() => setInterest(p.value)} />
                ))}
              </View>
            </View>

            <View style={s.fieldWrap}>
              <Text style={s.fieldLabel}>Age range</Text>
              <View style={s.ageRangeRow}>
                <View style={s.ageBox}>
                  <Text style={s.ageBoxLabel}>From</Text>
                  <InputField
                    value={minAge}
                    onChangeText={setMinAge}
                    keyboardType="number-pad"
                    maxLength={2}
                    inputStyle={s.ageInput}
                    style={{ marginBottom: 0 }}
                  />
                </View>
                <Text style={s.ageDash}>—</Text>
                <View style={s.ageBox}>
                  <Text style={s.ageBoxLabel}>To</Text>
                  <InputField
                    value={maxAge}
                    onChangeText={setMaxAge}
                    keyboardType="number-pad"
                    maxLength={2}
                    inputStyle={s.ageInput}
                    style={{ marginBottom: 0 }}
                  />
                </View>
              </View>
            </View>

            {/* Preview card */}
            <Text style={[s.fieldLabel, { marginTop: 8 }]}>How you'll appear to others</Text>
            <View style={[s.previewCard, shadow.card]}>
              {photos[0]
                ? <Image source={{ uri: photos[0] }} style={s.previewImg} />
                : <View style={[s.previewImg, s.previewImgEmpty]}>
                    <Text style={s.previewEmoji}>😊</Text>
                  </View>
              }
              <View style={s.previewOverlay} />
              <View style={s.previewInfo}>
                <Text style={s.previewName}>{name || 'Your name'}, {age || '??'}</Text>
                <Text style={s.previewBio} numberOfLines={2}>{bio || 'Your bio will appear here.'}</Text>
              </View>
            </View>
          </View>
        )}

        {/* ── STEP 3: Interests & Star Sign ── */}
        {step === 3 && (
          <View style={s.stepBody}>
            <View style={s.fieldWrap}>
              <Text style={s.fieldLabel}>Star sign</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
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
              </ScrollView>
            </View>

            <View style={s.fieldWrap}>
              <Text style={s.fieldLabel}>Hobbies & interests</Text>
              <Text style={s.photoHint}>Pick up to 10</Text>
              <View style={s.hobbyGrid}>
                {HOBBIES.map(h => {
                  const selected = hobbies.includes(h);
                  const disabled = !selected && hobbies.length >= 10;
                  return (
                    <TouchableOpacity
                      key={h}
                      style={[s.hobbyPill, selected && s.hobbyPillActive, disabled && s.hobbyPillDisabled]}
                      onPress={() => {
                        if (disabled) return;
                        setHobbies(prev => prev.includes(h) ? prev.filter(x => x !== h) : [...prev, h]);
                      }}
                      activeOpacity={disabled ? 1 : 0.7}
                    >
                      <Text style={[s.hobbyText, selected && s.hobbyTextActive]}>{h}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>
        )}

        <View style={s.navBtns}>
          <PrimaryButton
            label={saving ? 'Saving…' : step < 3 ? 'Continue →' : 'Start matching ✦'}
            onPress={next}
            disabled={saving}
          />
          {step === 1 && (
            <GhostButton label="I'll add photos later" onPress={next} style={{ marginTop: 8 }} />
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const PHOTO_SIZE = (W - 56 - 8) / 3;

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 56, paddingBottom: 12,
  },
  backBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.fog, alignItems: 'center', justifyContent: 'center' },
  backArrow: { fontSize: 18, color: colors.graphite },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 28, height: 4, borderRadius: 2, backgroundColor: colors.fog },
  dotActive: { backgroundColor: colors.ember },
  dotDone: { backgroundColor: colors.ember + '55' },
  stepCount: { fontSize: 13, color: colors.stone, fontWeight: '500', minWidth: 28, textAlign: 'right' },

  scroll: { flex: 1 },
  scrollContent: { padding: 24, paddingBottom: 48 },

  stepTitle: { fontSize: 34, fontFamily: 'serif', color: colors.ink, letterSpacing: -0.8, marginBottom: 6 },
  stepSub: { fontSize: 15, color: colors.stone, marginBottom: 32 },

  stepBody: { gap: 4 },

  fieldWrap: { marginBottom: 22 },
  fieldLabel: { fontSize: 11, fontWeight: '600', color: colors.stone, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

  textAreaWrap: { position: 'relative' },
  textArea: { minHeight: 100, textAlignVertical: 'top' },
  charCount: { position: 'absolute', bottom: 10, right: 12, fontSize: 11, color: colors.ash },

  // Photos
  photoHint: { fontSize: 13, color: colors.stone, marginBottom: 20, lineHeight: 18 },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  photoSlot: {
    width: PHOTO_SIZE, height: PHOTO_SIZE * 1.3,
    borderRadius: radius.lg, borderWidth: 1.5,
    borderColor: colors.fog, borderStyle: 'dashed',
    overflow: 'hidden', backgroundColor: colors.snow,
  },
  photoSlotLarge: { width: (W - 56) * 0.56, height: (W - 56) * 0.56 * 1.3 },
  photoSlotFilled: { borderStyle: 'solid', borderColor: colors.ember },
  photoImg: { width: '100%', height: '100%', resizeMode: 'cover' },
  photoImgLarge: {},
  photoPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  photoPlus: { fontSize: 28, color: colors.ash },
  photoPlusLarge: { fontSize: 38, color: colors.ember + '80' },
  photoMainLabel: { fontSize: 10, color: colors.ash, textAlign: 'center' },
  mainBadge: {
    position: 'absolute', top: 8, left: 8,
    backgroundColor: colors.ember, borderRadius: radius.full,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  mainBadgeText: { color: colors.white, fontSize: 10, fontWeight: '700' },
  photoTip: { fontSize: 12, color: colors.ash, lineHeight: 18, textAlign: 'center' },

  // Preferences
  ageRangeRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  ageBox: { flex: 1, gap: 4 },
  ageBoxLabel: { fontSize: 11, color: colors.ash, fontWeight: '500' },
  ageInput: { textAlign: 'center', fontSize: 20, fontWeight: '600', color: colors.ink },
  ageDash: { fontSize: 20, color: colors.ash, marginTop: 20 },

  // Preview card
  previewCard: {
    height: 240, borderRadius: radius.xl, overflow: 'hidden', marginTop: 8, marginBottom: 24,
  },
  previewImg: { ...StyleSheet.absoluteFillObject, resizeMode: 'cover' },
  previewImgEmpty: { backgroundColor: colors.emberLight, alignItems: 'center', justifyContent: 'center' },
  previewEmoji: { fontSize: 60 },
  previewOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    // swap for LinearGradient in production
  },
  previewInfo: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 18, backgroundColor: 'rgba(0,0,0,0.45)' },
  previewName: { fontSize: 22, fontWeight: '700', color: colors.white },
  previewBio: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 4 },

  navBtns: { marginTop: 16, gap: 4 },
  
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
