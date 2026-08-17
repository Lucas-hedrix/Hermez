import React, { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';

export default function AnimatedSparkles({ size = 36, color, style }) {
  const { colors } = useTheme();
  const iconColor = color || colors.ember;

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const pulse = Animated.sequence([
      Animated.timing(pulseAnim, {
        toValue: 1.2,
        duration: 800,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(pulseAnim, {
        toValue: 1,
        duration: 800,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      })
    ]);

    const glow = Animated.sequence([
      Animated.timing(glowAnim, {
        toValue: 1,
        duration: 800,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(glowAnim, {
        toValue: 0.4,
        duration: 800,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      })
    ]);

    Animated.loop(Animated.parallel([pulse, glow])).start();
  }, [pulseAnim, glowAnim]);

  return (
    <Animated.View
      style={[
        {
          transform: [{ scale: pulseAnim }],
          opacity: glowAnim,
          shadowColor: iconColor,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.8,
          shadowRadius: 10,
          elevation: 5,
        },
        style
      ]}
    >
      <Ionicons name="sparkles" size={size} color={iconColor} />
    </Animated.View>
  );
}
