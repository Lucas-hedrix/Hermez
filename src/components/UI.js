import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Image } from 'react-native';
import { colors, radius, shadow, fonts } from '../theme';

// ─── PrimaryButton ─────────────────────────────────────────────────────────
export function PrimaryButton({ label, onPress, loading, style }) {
  return (
    <TouchableOpacity style={[styles.primary, style]} onPress={onPress} activeOpacity={0.85} disabled={loading}>
      {loading
        ? <ActivityIndicator color={colors.white} />
        : <Text style={styles.primaryText}>{label}</Text>}
    </TouchableOpacity>
  );
}

// ─── GhostButton ───────────────────────────────────────────────────────────
export function GhostButton({ label, onPress, style }) {
  return (
    <TouchableOpacity style={[styles.ghost, style]} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.ghostText}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── InputField ────────────────────────────────────────────────────────────
import { TextInput } from 'react-native';
export function InputField({ label, style, inputStyle, ...props }) {
  return (
    <View style={[styles.fieldWrap, style]}>
      {label && <Text style={styles.fieldLabel}>{label}</Text>}
      <TextInput
        style={[styles.fieldInput, inputStyle]}
        placeholderTextColor={colors.ash}
        {...props}
      />
    </View>
  );
}

// ─── SelectPill ────────────────────────────────────────────────────────────
export function SelectPill({ label, selected, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.pill, selected && styles.pillActive]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Text style={[styles.pillText, selected && styles.pillTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Avatar ────────────────────────────────────────────────────────────────
export function Avatar({ uri, name, size = 48, style }) {
  if (uri) {
    return <Image source={{ uri }} style={[{ width: size, height: size, borderRadius: size / 2 }, style]} />;
  }
  return (
    <View style={[styles.avatarFallback, { width: size, height: size, borderRadius: size / 2 }, style]}>
      <Text style={[styles.avatarInitial, { fontSize: size * 0.38 }]}>{name?.[0]?.toUpperCase() || '?'}</Text>
    </View>
  );
}

// ─── ScreenHeader ──────────────────────────────────────────────────────────
export function ScreenHeader({ title, onBack, rightEl }) {
  return (
    <View style={styles.header}>
      {onBack
        ? <TouchableOpacity style={styles.backBtn} onPress={onBack}>
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
        : <View style={{ width: 36 }} />}
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={{ width: 36 }}>{rightEl}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Buttons
  primary: {
    backgroundColor: colors.ember,
    borderRadius: radius.full,
    paddingVertical: 16,
    paddingHorizontal: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: colors.white, fontSize: 16, fontWeight: '600', letterSpacing: 0.2 },
  ghost: {
    borderWidth: 1.5,
    borderColor: colors.ember,
    borderRadius: radius.full,
    paddingVertical: 14,
    paddingHorizontal: 28,
    alignItems: 'center',
  },
  ghostText: { color: colors.ember, fontSize: 15, fontWeight: '500' },

  // Input
  fieldWrap: { marginBottom: 16 },
  fieldLabel: { fontSize: 11, fontWeight: '600', color: colors.stone, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  fieldInput: {
    borderWidth: 1,
    borderColor: colors.fog,
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.snow,
  },

  // Pills
  pill: {
    paddingVertical: 9,
    paddingHorizontal: 18,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.fog,
    backgroundColor: colors.white,
  },
  pillActive: { backgroundColor: colors.ember, borderColor: colors.ember },
  pillText: { fontSize: 14, color: colors.stone },
  pillTextActive: { color: colors.white, fontWeight: '500' },

  // Avatar
  avatarFallback: { backgroundColor: colors.emberLight, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: colors.ember, fontWeight: '700' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    borderWidth: 1, borderColor: colors.fog,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.white,
  },
  backArrow: { fontSize: 18, color: colors.graphite },
  headerTitle: { fontSize: 17, fontWeight: '600', color: colors.ink },
});
