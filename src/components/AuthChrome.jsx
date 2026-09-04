import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Animated,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

const { height: SCREEN_H } = Dimensions.get('window');

const GOOGLE_MARK =
  'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c1/Google_%22G%22_logo.svg/120px-Google_%22G%22_logo.svg.png';

function AuthHeroInner({
  background,
  onBack,
  title,
  subtitle,
  children,
  compact = false,
}) {
  const insets = useSafeAreaInsets();
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.08,
          duration: 18000,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: 18000,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [scale]);

  const heroMin = compact ? SCREEN_H * 0.22 : SCREEN_H * 0.34;

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      <Animated.View
        style={[StyleSheet.absoluteFill, { transform: [{ scale }] }]}
        pointerEvents="none"
      >
        <Image source={background} style={StyleSheet.absoluteFill} contentFit="cover" />
      </Animated.View>

      <LinearGradient
        colors={[
          'rgba(18, 10, 12, 0.28)',
          'rgba(18, 10, 12, 0.08)',
          'rgba(12, 8, 10, 0.55)',
          'rgba(8, 6, 8, 0.94)',
        ]}
        locations={[0, 0.28, 0.58, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            {
              paddingTop: Math.max(insets.top, 16) + 8,
              paddingBottom: Math.max(insets.bottom, 16) + 8,
            },
          ]}
          // "always" so the Create / Sign In button fires on the first
          // tap even when the soft keyboard is up. With the default
          // ("never") iOS Safari's first tap just dismisses the keyboard
          // and the user has to tap a second time, which feels broken
          // in PWA mode where there's no visual "tap anywhere to
          // dismiss" hint.
          keyboardShouldPersistTaps="always"
          showsVerticalScrollIndicator={false}
          automaticallyAdjustKeyboardInsets
        >
          <View style={[styles.hero, { minHeight: heroMin }]}>
            <View style={styles.topBar}>
              {onBack ? (
                <TouchableOpacity
                  style={styles.backBtn}
                  onPress={onBack}
                  activeOpacity={0.8}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="chevron-back" size={20} color="#fff" />
                </TouchableOpacity>
              ) : (
                <View style={styles.backBtnSpacer} />
              )}

              <View style={styles.brandRow}>
                <Image
                  source={require('../../assets/icon.png')}
                  style={styles.brandMark}
                  contentFit="contain"
                />
                <Text style={styles.brand}>CUPID</Text>
              </View>

              <View style={styles.backBtnSpacer} />
            </View>

            <View style={styles.heroCopy}>
              <Text style={styles.title}>{title}</Text>
              {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
            </View>
          </View>

          <View style={styles.sheetOuter}>
            <BlurView intensity={48} tint="dark" style={styles.sheetBlur}>
              <View style={styles.sheetInner}>{children}</View>
            </BlurView>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

export function AuthHeroLayout(props) {
  return (
    <SafeAreaProvider>
      <AuthHeroInner {...props} />
    </SafeAreaProvider>
  );
}

export function AuthField({
  icon,
  style,
  onFocus,
  onBlur,
  right,
  ...props
}) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.field, focused && styles.fieldFocused, style]}>
      {icon ? (
        <Ionicons
          name={icon}
          size={18}
          color={focused ? '#FF8A9F' : 'rgba(255,255,255,0.45)'}
          style={styles.fieldIcon}
        />
      ) : null}
      <TextInput
        style={styles.input}
        placeholderTextColor="rgba(255,255,255,0.38)"
        selectionColor="#FF8A9F"
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        {...props}
      />
      {right}
    </View>
  );
}

export function AuthPrimaryButton({ label, onPress, loading, disabled }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
      style={[styles.ctaWrap, (disabled || loading) && styles.ctaDisabled]}
    >
      <LinearGradient
        colors={['#FF6B85', '#E54263']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.cta}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Text style={styles.ctaText}>{label}</Text>
            <Ionicons name="arrow-forward" size={18} color="#fff" />
          </>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
}

export function AuthGoogleButton({ onPress, loading }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={loading}
      activeOpacity={0.8}
      style={styles.googleBtn}
    >
      {loading ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <>
          <Image source={{ uri: GOOGLE_MARK }} style={styles.googleMark} />
          <Text style={styles.googleText}>Continue with Google</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

export function AuthDivider({ label = 'or continue with' }) {
  return (
    <View style={styles.divider}>
      <View style={styles.dividerLine} />
      <Text style={styles.dividerText}>{label.toUpperCase()}</Text>
      <View style={styles.dividerLine} />
    </View>
  );
}

export function AuthSwitchRow({ prompt, action, onPress }) {
  return (
    <View style={styles.switchRow}>
      <Text style={styles.switchPrompt}>{prompt} </Text>
      <TouchableOpacity onPress={onPress} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
        <Text style={styles.switchAction}>{action}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0A0708',
  },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 20,
    justifyContent: 'flex-end',
  },
  hero: {
    flexGrow: 1,
    justifyContent: 'space-between',
    paddingBottom: 22,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  backBtnSpacer: { width: 40, height: 40 },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  brandMark: { width: 22, height: 22, borderRadius: 7 },
  brand: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2.4,
  },
  heroCopy: { paddingHorizontal: 4 },
  title: {
    color: '#fff',
    fontSize: 36,
    fontWeight: '700',
    letterSpacing: -0.9,
    lineHeight: 40,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },
  subtitle: {
    marginTop: 8,
    color: 'rgba(255,255,255,0.78)',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '400',
  },
  sheetOuter: {
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(16,12,14,0.62)',
  },
  sheetBlur: { overflow: 'hidden' },
  sheetInner: {
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 18,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 54,
    borderRadius: 16,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    marginBottom: 12,
  },
  fieldFocused: {
    borderColor: 'rgba(255,138,159,0.7)',
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  fieldIcon: { marginRight: 10 },
  input: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
  },
  ctaWrap: {
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 6,
    shadowColor: '#FF4D6D',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 8,
  },
  ctaDisabled: { opacity: 0.65 },
  cta: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 20,
  },
  ctaText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  googleBtn: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 16,
  },
  googleMark: { width: 18, height: 18 },
  googleText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 18,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  dividerText: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.42)',
    fontWeight: '700',
    letterSpacing: 1.1,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 18,
  },
  switchPrompt: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.58)',
  },
  switchAction: {
    fontSize: 14,
    color: '#FF8A9F',
    fontWeight: '700',
  },
});
