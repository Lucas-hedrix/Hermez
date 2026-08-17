// SparksInbox — pending incoming/outgoing sparks (Chat tab)
import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radius } from '../theme';
import GlassButton from './GlassButton';
import { useTheme } from '../theme/ThemeContext';
import { getSparkTemplate, SPARK_ICON } from '../constants/sparks';
import {
  fetchIncomingSparks,
  fetchOutgoingSparks,
  acceptSpark,
  ignoreSpark,
} from '../services/sparks';
import AnimatedSparkles from './AnimatedSparkles';
import { supabase } from '../supabase/client';
import { getPlaceholderUrl } from '../utils/placeholders';

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function SparkCard({
  spark,
  person,
  variant,
  onAccept,
  onIgnore,
  onOpenProfile,
  colors,
  s,
}) {
  const template = getSparkTemplate(spark.spark_type);
  const photo = person?.photo_urls?.[0];

  return (
    <View style={[s.card, variant === 'incoming' && s.cardIncoming]}>
      <TouchableOpacity style={s.personRow} onPress={() => onOpenProfile?.(person)} activeOpacity={0.8}>
        <View style={[s.avatar, { borderColor: template.color + '55' }]}>
          {photo ? (
            <Image source={{ uri: photo }} style={StyleSheet.absoluteFillObject} />
          ) : (
            <Image source={{ uri: getPlaceholderUrl(person?.name) }} style={StyleSheet.absoluteFillObject} />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.personName}>{person?.name || 'Cupid user'}</Text>
          <View style={s.typeRow}>
            <Ionicons name={template.icon} size={12} color={template.color} />
            <Text style={[s.typeLabel, { color: template.color }]}>{template.label}</Text>
            <Text style={s.time}>• {timeAgo(spark.created_at)}</Text>
          </View>
        </View>
      </TouchableOpacity>

      <Text style={s.message}>"{spark.custom_message || template.preview}"</Text>

      {variant === 'incoming' && (
        <View style={s.actions}>
          <TouchableOpacity style={s.ignoreBtn} onPress={() => onIgnore(spark)}>
            <Text style={s.ignoreText}>Pass</Text>
          </TouchableOpacity>
          <GlassButton
            title="Accept"
            icon={<Ionicons name={SPARK_ICON} size={18} color={colors.ember} />}
            onPress={() => onAccept(spark)}
            style={{ flex: 1.4 }}
            tint="light"
          />
        </View>
      )}

      {variant === 'outgoing' && (
        <View style={s.pendingPill}>
          <Ionicons name="time-outline" size={12} color={colors.stone} />
          <Text style={s.pendingText}>Waiting for response</Text>
        </View>
      )}
    </View>
  );
}

export default function SparksInbox({ navigation, myUid, onSparkCountChange }) {
  const { colors, shadow } = useTheme();
  const s = getStyles(colors, shadow);

  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actingId, setActingId] = useState(null);

  const load = useCallback(async () => {
    if (!myUid) return;
    try {
      const [inc, out] = await Promise.all([
        fetchIncomingSparks(myUid),
        fetchOutgoingSparks(myUid),
      ]);
      setIncoming(inc);
      setOutgoing(out);
      onSparkCountChange?.(inc.length);
    } catch (e) {
      console.log('[SparksInbox]', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [myUid, onSparkCountChange]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!myUid) return;

    const channel = supabase
      .channel(`sparks-inbox-${myUid}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sparks' },
        () => load()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [myUid, load]);

  const handleAccept = async (spark) => {
    setActingId(spark.id);
    try {
      const { friendship } = await acceptSpark(spark, myUid);
      await load();
      const other = spark.sender;
      if (other && friendship) {
        navigation?.navigate('FriendChat', {
          friendship,
          otherUser: other,
          myUid,
        });
      }
    } catch (e) {
      const { Alert } = await import('react-native');
      Alert.alert('Error', e.message);
    } finally {
      setActingId(null);
    }
  };

  const handleIgnore = async (spark) => {
    setActingId(spark.id);
    try {
      await ignoreSpark(spark.id, myUid);
      await load();
    } catch (e) {
      const { Alert } = await import('react-native');
      Alert.alert('Error', e.message);
    } finally {
      setActingId(null);
    }
  };

  const openProfile = (person) => {
    if (person?.id) {
      navigation?.navigate('UserProfile', { userId: person.id });
    }
  };

  if (loading) {
    return (
      <View style={s.center}>
        <AnimatedSparkles size={44} color={colors.ember} />
        <Text style={s.loadingText}>Loading sparks…</Text>
      </View>
    );
  }

  const empty = incoming.length === 0 && outgoing.length === 0;

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.ember} />
      }
      contentContainerStyle={s.scroll}
    >
      {empty ? (
        <View style={s.empty}>
          <View style={s.emptyIcon}>
            <Ionicons name={SPARK_ICON} size={44} color={colors.ember} />
          </View>
          <Text style={s.emptyTitle}>No sparks yet</Text>
          <Text style={s.emptySub}>
            Send sparks from Discover or someone's profile. When they accept, you can chat instantly.
          </Text>
        </View>
      ) : null}

      {incoming.length > 0 && (
        <>
          <View style={s.sectionHead}>
            <Text style={s.sectionTitle}>Incoming</Text>
            <View style={s.countBadge}>
              <Text style={s.countText}>{incoming.length}</Text>
            </View>
          </View>
          {incoming.map((spark) => (
            <View key={spark.id} style={{ opacity: actingId === spark.id ? 0.6 : 1 }}>
              <SparkCard
                spark={spark}
                person={spark.sender}
                variant="incoming"
                onAccept={handleAccept}
                onIgnore={handleIgnore}
                onOpenProfile={openProfile}
                colors={colors}
                s={s}
              />
            </View>
          ))}
        </>
      )}

      {outgoing.length > 0 && (
        <>
          <View style={[s.sectionHead, { marginTop: 8 }]}>
            <Text style={s.sectionTitle}>Sent</Text>
            <Text style={s.sectionSub}>Pending</Text>
          </View>
          {outgoing.map((spark) => (
            <SparkCard
              key={spark.id}
              spark={spark}
              person={spark.recipient}
              variant="outgoing"
              onOpenProfile={openProfile}
              colors={colors}
              s={s}
            />
          ))}
        </>
      )}
    </ScrollView>
  );
}

const getStyles = (colors, shadow) =>
  StyleSheet.create({
    scroll: { paddingBottom: 24 },
    center: { alignItems: 'center', paddingVertical: 48, gap: 12 },
    loadingText: { color: colors.stone, fontSize: 14 },
    sectionHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginHorizontal: 16,
      marginBottom: 10,
    },
    sectionTitle: { fontSize: 17, fontWeight: '800', color: colors.ink },
    sectionSub: { fontSize: 12, color: colors.ash, fontWeight: '600' },
    countBadge: {
      backgroundColor: colors.ember,
      minWidth: 22,
      height: 22,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 6,
    },
    countText: { color: '#fff', fontSize: 11, fontWeight: '800' },
    card: {
      marginHorizontal: 16,
      marginBottom: 12,
      padding: 16,
      borderRadius: radius.xl,
      backgroundColor: colors.white,
      borderWidth: 1,
      borderColor: colors.fog,
      ...shadow.soft,
    },
    cardIncoming: {
      borderColor: colors.ember + '40',
    },
    personRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
    avatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
      overflow: 'hidden',
      backgroundColor: colors.emberLight,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    personName: { fontSize: 16, fontWeight: '800', color: colors.ink },
    typeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
    typeLabel: { fontSize: 11, fontWeight: '800' },
    time: { fontSize: 11, color: colors.ash },
    message: { fontSize: 14, color: colors.graphite, lineHeight: 20, marginBottom: 12 },
    actions: { flexDirection: 'row', gap: 10 },
    ignoreBtn: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: colors.fog,
      alignItems: 'center',
    },
    ignoreText: { fontSize: 14, fontWeight: '700', color: colors.stone },
    acceptBtnWrap: { flex: 1.4, borderRadius: radius.full, overflow: 'hidden' },
    acceptBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 12,
    },
    acceptText: { color: '#fff', fontSize: 14, fontWeight: '800' },
    pendingPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      alignSelf: 'flex-start',
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: radius.full,
      backgroundColor: colors.fog,
    },
    pendingText: { fontSize: 12, color: colors.stone, fontWeight: '600' },
    empty: {
      marginHorizontal: 16,
      marginTop: 12,
      padding: 28,
      borderRadius: radius.xl,
      backgroundColor: colors.white,
      borderWidth: 1,
      borderColor: colors.fog,
      alignItems: 'center',
    },
    emptyIcon: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: colors.emberLight,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
    },
    emptyTitle: { fontSize: 18, fontWeight: '800', color: colors.ink, marginBottom: 8 },
    emptySub: { fontSize: 14, color: colors.stone, textAlign: 'center', lineHeight: 21 },
  });
