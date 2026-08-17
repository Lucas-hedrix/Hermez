import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View, ActivityIndicator } from 'react-native';
import { BlurView } from 'expo-blur';
import { useTheme } from '../theme/ThemeContext';
import { radius } from '../theme';

export default function GlassButton({
  onPress,
  title,
  icon,
  disabled,
  loading,
  style,
  textStyle,
  tint = 'light', // 'light' | 'dark' | 'default'
  color, // optional custom color for border/text
  glassColor, // optional base color for the glassy background
  intensity = 60,
}) {
  const { colors } = useTheme();
  
  const defaultColor = color || colors.ember;

  const hexToRgba = (hex, alpha) => {
    if (!hex) return null;
    if (hex.startsWith('rgba') || hex.startsWith('rgb')) return hex;
    let r = 0, g = 0, b = 0;
    if (hex.length === 4) {
      r = parseInt(hex[1] + hex[1], 16);
      g = parseInt(hex[2] + hex[2], 16);
      b = parseInt(hex[3] + hex[3], 16);
    } else if (hex.length === 7) {
      r = parseInt(hex.slice(1, 3), 16);
      g = parseInt(hex.slice(3, 5), 16);
      b = parseInt(hex.slice(5, 7), 16);
    }
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const backgroundColor = glassColor 
    ? hexToRgba(glassColor, 0.4) 
    : (tint === 'dark' ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.2)');

  const borderColor = glassColor
    ? hexToRgba(glassColor, 0.6)
    : (tint === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.4)');
  
  return (
    <TouchableOpacity
      style={[s.container, style, disabled && s.disabled]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.7}
    >
      <BlurView intensity={intensity} tint={tint} style={s.blurView}>
        <View style={[
          s.inner, 
          { backgroundColor, borderColor }
        ]}>
          {loading ? (
            <ActivityIndicator color={defaultColor} />
          ) : (
            <>
              {icon && icon}
              <Text style={[s.text, { color: defaultColor }, textStyle]}>{title}</Text>
            </>
          )}
        </View>
      </BlurView>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  container: {
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  disabled: {
    opacity: 0.5,
  },
  blurView: {
    flex: 1,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    gap: 8,
    borderWidth: 1,
    borderRadius: radius.full,
  },
  text: {
    fontSize: 16,
    fontWeight: '700',
  },
});
