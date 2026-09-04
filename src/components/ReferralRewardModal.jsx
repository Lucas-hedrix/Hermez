// components/ReferralRewardModal.jsx
// Celebratory modal shown to a user when they earn a referral reward.
// Auto-dismisses after 5s, but the user can also tap "View wallet" to
// jump to the Referrals screen or tap outside to close.

import { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity,
  TouchableWithoutFeedback, Animated, Dimensions, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { formatNaira } from '../utils/referrals';

const AUTO_DISMISS_MS = 5000;
const { width: W } = Dimensions.get('window');

export default function ReferralRewardModal({ visible, amount, onClose, onViewWallet }) {
  const { colors, isDark } = useTheme();
  const s = getStyles(colors, isDark);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.7)).current;
  const confettiAnim = useRef(new Animated.Value(0)).current;
  const dismissTimer = useRef(null);

  // ── Entry / exit animations ────────────────────────────────────────────
  useEffect(() => {
    if (!visible) {
      fadeAnim.setValue(0);
      scaleAnim.setValue(0.7);
      confettiAnim.setValue(0);
      return;
    }

    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1, duration: 240, useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1, friction: 7, tension: 80, useNativeDriver: true,
      }),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(confettiAnim, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(confettiAnim, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    ).start();

    dismissTimer.current = setTimeout(() => {
      onClose?.();
    }, AUTO_DISMISS_MS);

    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!visible) return null;

  // Confetti dots — fixed positions, opacity oscillates with confettiAnim
  const confetti = [
    { left: '12%', top: '18%', color: '#FFD166', size: 8, delay: 0 },
    { left: '78%', top: '15%', color: '#EF476F', size: 10, delay: 100 },
    { left: '20%', top: '72%', color: '#06D6A0', size: 9, delay: 200 },
    { left: '82%', top: '70%', color: '#118AB2', size: 11, delay: 300 },
    { left: '50%', top: '8%',  color: '#FF8A9F', size: 7, delay: 400 },
    { left: '8%',  top: '45%', color: '#9B5DE5', size: 8, delay: 500 },
    { left: '90%', top: '40%', color: '#FFD166', size: 9, delay: 600 },
  ];

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <Animated.View style={[s.backdrop, { opacity: fadeAnim }]}>
          <TouchableWithoutFeedback>
            <Animated.View
              style={[
                s.card,
                shadow.card,
                { transform: [{ scale: scaleAnim }] },
              ]}
            >
              {/* Confetti dots */}
              {confetti.map((c, i) => (
                <Animated.View
                  key={i}
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    left: c.left,
                    top: c.top,
                    width: c.size,
                    height: c.size,
                    borderRadius: c.size / 2,
                    backgroundColor: c.color,
                    opacity: confettiAnim.interpolate({
                      inputRange: [0, 0.5, 1],
                      outputRange: [0.3, 1, 0],
                    }),
                    transform: [
                      {
                        translateY: confettiAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, -24],
                        }),
                      },
                    ],
                  }}
                />
              ))}

              {/* Trophy / sparkle icon */}
              <View style={s.iconWrap}>
                <Ionicons name="sparkles" size={32} color={colors.white} />
              </View>

              <Text style={s.title}>You earned {formatNaira(amount || 100)}!</Text>
              <Text style={s.subtitle}>
                A friend just completed their profile. Your wallet has been credited.
              </Text>

              <View style={s.btnRow}>
                <TouchableOpacity
                  style={[s.btn, s.btnPrimary]}
                  onPress={() => {
                    onViewWallet?.();
                    onClose?.();
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={s.btnPrimaryText}>View wallet</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.btn, s.btnGhost]}
                  onPress={onClose}
                  activeOpacity={0.85}
                >
                  <Text style={s.btnGhostText}>Nice!</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </TouchableWithoutFeedback>
        </Animated.View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const getStyles = (colors, isDark) => StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: Math.min(W - 48, 360),
    backgroundColor: isDark ? '#1F1F22' : colors.white,
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    overflow: 'hidden',
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.ember,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.ink,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: colors.stone,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 22,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimary: {
    backgroundColor: colors.ember,
  },
  btnPrimaryText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
  btnGhost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.fog,
  },
  btnGhostText: {
    color: colors.graphite,
    fontSize: 14,
    fontWeight: '600',
  },
});

const shadow = StyleSheet.create({
  card: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.18,
      shadowRadius: 24,
    },
    android: { elevation: 12 },
    default: {},
  }),
});
