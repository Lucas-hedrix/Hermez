// SparkSheet — bottom sheet to pick a spark template and send
import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import GlassButton from './GlassButton';
import { radius } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import { SPARK_TEMPLATES, SPARK_ICON } from '../constants/sparks';
import { sendSpark } from '../services/sparks';
import { supabase } from '../supabase/client';

export default function SparkSheet({
  visible,
  onClose,
  receiverId,
  receiverName = 'them',
  onSent,
}) {
  const { colors, shadow } = useTheme();
  const s = getStyles(colors);

  const [selected, setSelected] = useState(null);
  const [customText, setCustomText] = useState('');
  const [sending, setSending] = useState(false);

  const reset = () => {
    setSelected(null);
    setCustomText('');
    setSending(false);
  };

  const handleClose = () => {
    reset();
    onClose?.();
  };

  const handleSend = async () => {
    if (!selected || !receiverId) return;
    if (selected === 'custom' && !customText.trim()) return;

    setSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Please sign in to send a spark');

      await sendSpark({
        senderId: session.user.id,
        receiverId,
        sparkType: selected,
        customMessage: customText,
      });

      onSent?.();
      handleClose();
    } catch (e) {
      Alert.alert('Could not send spark', e.message);
    } finally {
      setSending(false);
    }
  };

  const template = SPARK_TEMPLATES.find((t) => t.id === selected);
  const canSend =
    selected &&
    (selected !== 'custom' || customText.trim().length > 0) &&
    !sending;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={s.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={handleClose} />

        <View style={s.sheet}>
          <BlurView intensity={70} tint="dark" style={StyleSheet.absoluteFill} />
          <View
            style={[StyleSheet.absoluteFill, { backgroundColor: '#131317' }]}
          />

          <View style={s.handle} />
          <View style={s.headerRow}>
            <View style={s.flashIcon}>
              <Ionicons name={SPARK_ICON} size={24} color={colors.ember} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>Send a Spark</Text>
              <Text style={s.subtitle}>
                A light nudge to {receiverName} — no pressure to match
              </Text>
            </View>
            <TouchableOpacity onPress={handleClose} hitSlop={12}>
              <Ionicons name="close" size={24} color={colors.stone} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.grid}>
            {SPARK_TEMPLATES.map((t) => {
              const active = selected === t.id;
              return (
                <TouchableOpacity
                  key={t.id}
                  style={[
                    s.chip,
                    active && { borderColor: t.color, backgroundColor: t.color + '22' },
                  ]}
                  onPress={() => setSelected(t.id)}
                  activeOpacity={0.85}
                >
                  <Ionicons name={t.icon} size={20} color={active ? t.color : colors.ash} />
                  <Text style={[s.chipLabel, active && { color: t.color }]}>{t.label}</Text>
                  {t.preview ? (
                    <Text style={s.chipPreview} numberOfLines={2}>
                      {t.preview}
                    </Text>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {selected === 'custom' && (
            <TextInput
              style={s.customInput}
              placeholder="Write your spark message…"
              placeholderTextColor={colors.ash}
              value={customText}
              onChangeText={setCustomText}
              multiline
              maxLength={200}
            />
          )}

          {template?.preview && selected !== 'custom' ? (
            <Text style={s.previewQuote}>"{template.preview}"</Text>
          ) : null}

          <TouchableOpacity
            style={[s.sendBtn, !canSend && s.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!canSend || sending}
            activeOpacity={0.8}
          >
            <View
              style={[
                s.sendGradient,
                { backgroundColor: canSend ? colors.ember : colors.ash }
              ]}
            >
              {sending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name={SPARK_ICON} size={22} color="#fff" />
                  <Text style={s.sendText}>Send Spark</Text>
                </>
              )}
            </View>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const getStyles = (colors) =>
  StyleSheet.create({
    overlay: { flex: 1, justifyContent: 'flex-end' },
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
    sheet: {
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      paddingHorizontal: 20,
      paddingBottom: Platform.OS === 'ios' ? 36 : 24,
      maxHeight: '88%',
      overflow: 'hidden',
      borderTopWidth: 1,
      borderLeftWidth: 1,
      borderRightWidth: 1,
      borderColor: 'rgba(255,255,255,0.1)',
    },
    handle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: 'rgba(255,255,255,0.25)',
      alignSelf: 'center',
      marginTop: 12,
      marginBottom: 16,
    },
    headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 16 },
    flashIcon: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor: colors.emberLight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: { fontSize: 20, fontWeight: '800', color: colors.ink },
    subtitle: { fontSize: 13, color: colors.stone, marginTop: 4, lineHeight: 18 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingBottom: 12 },
    chip: {
      width: '47%',
      padding: 14,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.fog,
      backgroundColor: colors.white + '99',
      gap: 6,
    },
    chipLabel: { fontSize: 14, fontWeight: '800', color: colors.ink },
    chipPreview: { fontSize: 11, color: colors.stone, lineHeight: 15 },
    customInput: {
      borderWidth: 1,
      borderColor: colors.fog,
      borderRadius: radius.md,
      padding: 14,
      fontSize: 15,
      color: colors.ink,
      minHeight: 80,
      textAlignVertical: 'top',
      marginBottom: 12,
      backgroundColor: colors.white + 'AA',
    },
    previewQuote: {
      fontSize: 13,
      color: colors.stone,
      fontStyle: 'italic',
      textAlign: 'center',
      marginBottom: 14,
      paddingHorizontal: 8,
    },
    sendBtn: { borderRadius: radius.full, overflow: 'hidden' },
    sendBtnDisabled: { opacity: 0.5 },
    sendGradient: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 16,
    },
    sendText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  });
