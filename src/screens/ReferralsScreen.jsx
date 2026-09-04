import { Image } from 'expo-image';
// screens/ReferralsScreen.jsx
// "Invite friends, earn ₦100" — campaign hub.
// - Generates / displays the user's referral code (server-side, idempotent)
// - Daily + lifetime counters with a 3/day progress bar (UTC)
// - Recent referrals list with avatars and status pills
// - Native share sheet integration for the share button

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Share, Alert, Clipboard, Platform, RefreshControl, Animated} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme/ThemeContext';
import { supabase } from '../supabase/client';
import {
  getOrCreateMyReferralCode,
  getReferralStats,
  getRecentReferrals,
  buildReferralLink,
  formatNaira,
} from '../utils/referrals';
import { getPlaceholderUrl } from '../utils/placeholders';

const DAILY_CAP = 3;

function StatusPill({ status, colors }) {
  const isCompleted = status === 'completed';
  const isPending = status === 'pending';
  const bg = isCompleted
    ? 'rgba(39, 174, 96, 0.15)'
    : isPending
    ? 'rgba(242, 153, 74, 0.15)'
    : 'rgba(255, 77, 109, 0.15)';
  const fg = isCompleted
    ? '#1B7E3F'
    : isPending
    ? '#A86125'
    : '#B33320';
  const label = isCompleted ? 'Earned' : isPending ? 'Pending' : 'Capped';
  return (
    <View style={[pillStyles.wrap, { backgroundColor: bg }]}>
      <Text style={[pillStyles.text, { color: fg }]}>{label}</Text>
    </View>
  );
}

const pillStyles = StyleSheet.create({
  wrap: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  text: { fontSize: 11, fontWeight: '700' },
});

function ReferralRow({ item }) {
  const { colors, isDark } = useTheme();
  const u = item.referred || {};
  const avatar = Array.isArray(u.photo_urls) && u.photo_urls[0]
    ? u.photo_urls[0]
    : getPlaceholderUrl(u.name || 'User');
  const date = item.completed_at || item.created_at;
  const when = formatRelative(date);

  return (
    <View style={[rowStyles.row, { borderBottomColor: colors.fog }]}>
      <Image source={{ uri: avatar }} style={rowStyles.avatar} />
      <View style={rowStyles.center}>
        <Text style={[rowStyles.name, { color: colors.ink }]} numberOfLines={1}>
          {u.name || 'Someone'}
        </Text>
        <Text style={[rowStyles.meta, { color: colors.stone }]} numberOfLines={1}>
          @{u.username || 'pending'} · {when}
        </Text>
      </View>
      <View style={rowStyles.right}>
        <StatusPill status={item.status} colors={colors} />
        {item.status === 'completed' && (
          <Text style={[rowStyles.amount, { color: colors.ember }]}>
            +{formatNaira(item.reward_ngn || 100)}
          </Text>
        )}
      </View>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatar: { width: 42, height: 42, borderRadius: 21 },
  center: { flex: 1, gap: 2 },
  name: { fontSize: 15, fontWeight: '600' },
  meta: { fontSize: 12 },
  right: { alignItems: 'flex-end', gap: 4 },
  amount: { fontSize: 13, fontWeight: '800' },
});

function formatRelative(iso) {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const diff = Date.now() - t;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function ReferralsScreen({ navigation }) {
  const { colors, shadow, isDark } = useTheme();
  const s = getStyles(colors, shadow, isDark);

  const [code, setCode]             = useState(null);
  const [stats, setStats]           = useState({
    today_count: 0, lifetime_count: 0, lifetime_earnings: 0, pending_count: 0,
  });
  const [referrals, setReferrals]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const fadeAnim                    = useRef(new Animated.Value(0)).current;

  const load = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const uid = session.user.id;
      const [c, st, list] = await Promise.all([
        getOrCreateMyReferralCode(uid),
        getReferralStats(uid),
        getRecentReferrals(uid, 10),
      ]);
      setCode(c);
      setStats(st);
      setReferrals(list);
    } catch (e) {
      console.log('[ReferralsScreen] load error:', e?.message);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      await load();
      if (mounted) {
        setLoading(false);
        Animated.timing(fadeAnim, { toValue: 1, duration: 280, useNativeDriver: true }).start();
      }
    })();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const onCopy = useCallback(async () => {
    if (!code) return;
    try {
      await Clipboard.setString(code);
      Haptics.selectionAsync().catch(() => {});
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 1800);
    } catch (e) {
      Alert.alert('Copy failed', e?.message);
    }
  }, [code]);

  const onShare = useCallback(async () => {
    if (!code) return;
    const link = buildReferralLink(code);
    const message = `Join me on Cupid 💕 Use my code ${code} to find someone who gets you: ${link?.web}`;
    try {
      const result = await Share.share(
        Platform.select({
          ios: { message, url: link?.web },
          default: { message },
        })
      );
      if (result?.action === Share.sharedAction) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
    } catch (e) {
      Alert.alert('Share failed', e?.message);
    }
  }, [code]);

  const todayProgress = Math.min(stats.today_count, DAILY_CAP);
  const todayPct = todayProgress / DAILY_CAP;

  return (
    <Animated.View style={[s.root, { opacity: fadeAnim }]}>
      {/* Top bar */}
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => navigation?.goBack?.()} style={s.backBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={20} color={colors.graphite} />
        </TouchableOpacity>
        <Text style={s.topTitle}>Invite friends</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.ember}
          />
        }
      >
        {/* ── Hero banner ──────────────────────────────────────────────────── */}
        <LinearGradient
          colors={isDark ? ['#3A0E1B', '#5C1429'] : ['#FF8A9F', '#FF4D6D']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={s.hero}
        >
          <Text style={s.heroTitle}>Earn ₦100 per friend</Text>
          <Text style={s.heroSub}>
            For every friend who joins with your code and completes their profile,
            we'll add ₦100 to your wallet.
          </Text>
        </LinearGradient>

        {/* ── My code card ────────────────────────────────────────────────── */}
        <View style={[s.card, shadow.card]}>
          <Text style={s.cardLabel}>YOUR REFERRAL CODE</Text>
          <View style={s.codeRow}>
            <Text
              style={s.codeText}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {code || '••••••••'}
            </Text>
            <TouchableOpacity onPress={onCopy} style={s.copyBtn} activeOpacity={0.7}>
              <Ionicons
                name={codeCopied ? 'checkmark-circle' : 'copy-outline'}
                size={16}
                color={codeCopied ? '#1B7E3F' : colors.ember}
              />
              <Text style={[s.copyText, codeCopied && { color: '#1B7E3F' }]}>
                {codeCopied ? 'Copied' : 'Copy'}
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={s.shareBtn} onPress={onShare} activeOpacity={0.85}>
            <View style={s.shareBtnInner}>
              <Ionicons name="share-social" size={18} color={colors.white} />
              <Text style={s.shareBtnText}>Share my code</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* ── Stats card ─────────────────────────────────────────────────── */}
        <View style={[s.card, shadow.card]}>
          <View style={s.statsRow}>
            <View style={s.statCol}>
              <Text style={s.statValue}>{formatNaira(stats.lifetime_earnings)}</Text>
              <Text style={s.statLabel}>Wallet</Text>
            </View>
            <View style={[s.statDivider, { backgroundColor: colors.fog }]} />
            <View style={s.statCol}>
              <Text style={s.statValue}>{stats.lifetime_count}</Text>
              <Text style={s.statLabel}>Friends invited</Text>
            </View>
            <View style={[s.statDivider, { backgroundColor: colors.fog }]} />
            <View style={s.statCol}>
              <Text style={s.statValue}>{stats.pending_count}</Text>
              <Text style={s.statLabel}>In progress</Text>
            </View>
          </View>

          {/* Daily progress */}
          <View style={s.dailyWrap}>
            <View style={s.dailyHeader}>
              <Text style={s.dailyTitle}>Today</Text>
              <Text style={s.dailyCount}>
                {todayProgress}/{DAILY_CAP} referrals
              </Text>
            </View>
            <View style={[s.progressTrack, { backgroundColor: colors.fog }]}>
              <View
                style={[
                  s.progressFill,
                  { width: `${todayPct * 100}%`, backgroundColor: colors.ember },
                ]}
              />
            </View>
            <Text style={s.dailyHint}>
              {todayProgress >= DAILY_CAP
                ? 'You’ve hit today’s cap. Resets at 00:00 UTC.'
                : `${DAILY_CAP - todayProgress} more ${DAILY_CAP - todayProgress === 1 ? 'slot' : 'slots'} left today.`}
            </Text>
          </View>
        </View>

        {/* ── Recent referrals ───────────────────────────────────────────── */}
        <View style={[s.card, shadow.card, { paddingHorizontal: 0 }]}>
          <View style={s.recentHeader}>
            <Text style={s.recentTitle}>Recent referrals</Text>
            {loading && <ActivityIndicator size="small" color={colors.ember} />}
          </View>

          {referrals.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="gift-outline" size={32} color={colors.stone} />
              <Text style={s.emptyTitle}>No referrals yet</Text>
              <Text style={s.emptyBody}>
                Share your code to start earning. You’ll see each friend’s
                progress here as they sign up.
              </Text>
            </View>
          ) : (
            <View style={{ paddingHorizontal: 16 }}>
              {referrals.map((r) => (
                <ReferralRow key={r.id} item={r} />
              ))}
            </View>
          )}
        </View>

        {/* ── How it works ───────────────────────────────────────────────── */}
        <View style={[s.card, shadow.card]}>
          <Text style={s.howTitle}>How it works</Text>
          <View style={s.step}>
            <View style={[s.stepDot, { backgroundColor: colors.emberLight }]}>
              <Text style={[s.stepNum, { color: colors.ember }]}>1</Text>
            </View>
            <View style={s.stepBody}>
              <Text style={s.stepHeading}>Share your code</Text>
              <Text style={s.stepBody2}>
                Send it to friends via WhatsApp, SMS, or any share sheet.
              </Text>
            </View>
          </View>
          <View style={s.step}>
            <View style={[s.stepDot, { backgroundColor: colors.emberLight }]}>
              <Text style={[s.stepNum, { color: colors.ember }]}>2</Text>
            </View>
            <View style={s.stepBody}>
              <Text style={s.stepHeading}>They sign up + finish their profile</Text>
              <Text style={s.stepBody2}>
                Friends join Cupid with your code and complete their profile.
              </Text>
            </View>
          </View>
          <View style={s.step}>
            <View style={[s.stepDot, { backgroundColor: colors.emberLight }]}>
              <Text style={[s.stepNum, { color: colors.ember }]}>3</Text>
            </View>
            <View style={s.stepBody}>
              <Text style={s.stepHeading}>You earn ₦100</Text>
              <Text style={s.stepBody2}>
                Added to your wallet the moment their profile is complete.
                Cap: 3 per day.
              </Text>
            </View>
          </View>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </Animated.View>
  );
}

const getStyles = (colors, shadow, isDark) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.snow },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 56, paddingBottom: 12,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    borderWidth: 1, borderColor: colors.fog,
    alignItems: 'center', justifyContent: 'center',
  },
  topTitle: { fontSize: 17, fontWeight: '700', color: colors.ink },

  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingTop: 8, gap: 14 },

  // Hero
  hero: {
    borderRadius: 24, padding: 22, gap: 8,
    marginBottom: 2,
  },
  heroTitle: {
    color: '#FFF', fontSize: 26, fontWeight: '800', letterSpacing: -0.4,
  },
  heroSub: {
    color: 'rgba(255,255,255,0.92)', fontSize: 13, lineHeight: 19,
  },

  // Card
  card: {
    backgroundColor: colors.white, borderRadius: 20, padding: 18, gap: 14,
  },

  // Code
  cardLabel: {
    fontSize: 10, fontWeight: '700', color: colors.stone,
    letterSpacing: 1.2, textTransform: 'uppercase',
  },
  codeRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, gap: 12,
  },
  codeText: {
    flex: 1, fontSize: 24, fontWeight: '800', color: colors.ink,
    letterSpacing: 1.2, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  copyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  copyText: { fontSize: 12, fontWeight: '700', color: colors.ember },

  // Share
  shareBtn: { borderRadius: 14, overflow: 'hidden', backgroundColor: '#1A8FFD' },
  shareBtnInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14,
  },
  shareBtnText: { color: colors.white, fontSize: 15, fontWeight: '700' },

  // Stats
  statsRow: { flexDirection: 'row', alignItems: 'stretch' },
  statCol: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 4 },
  statDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch' },
  statValue: { fontSize: 18, fontWeight: '800', color: colors.ink },
  statLabel: { fontSize: 11, color: colors.stone, textAlign: 'center' },

  // Daily progress
  dailyWrap: { gap: 8, marginTop: 4 },
  dailyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dailyTitle: { fontSize: 13, fontWeight: '700', color: colors.ink },
  dailyCount: { fontSize: 12, fontWeight: '600', color: colors.stone },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  dailyHint: { fontSize: 12, color: colors.stone, lineHeight: 17 },

  // Recent
  recentHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingTop: 4, paddingBottom: 6,
  },
  recentTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  empty: { alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingVertical: 28 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: colors.ink, marginTop: 4 },
  emptyBody: { fontSize: 13, color: colors.stone, textAlign: 'center', lineHeight: 18 },

  // How it works
  howTitle: { fontSize: 15, fontWeight: '700', color: colors.ink, marginBottom: 4 },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  stepDot: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', marginTop: 2,
  },
  stepNum: { fontSize: 13, fontWeight: '800' },
  stepBody: { flex: 1, gap: 2, paddingBottom: 4 },
  stepHeading: { fontSize: 14, fontWeight: '600', color: colors.ink },
  stepBody2: { fontSize: 12, color: colors.stone, lineHeight: 18 },
});
