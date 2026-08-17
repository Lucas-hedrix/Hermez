// SparkBurst — one-shot celebratory burst for the "animation = consequence" idea.
//
// AnimatedSparkles loops forever (good for loading); this fires ONCE each time
// the `trigger` counter changes — the right shape for a tap. Drop it as an
// absolutely-positioned overlay centered on the thing that was tapped:
//
//   <View>
//     <Ionicons name="sparkles" ... />
//     <View style={StyleSheet.absoluteFill} pointerEvents="none">
//       <SparkBurst trigger={burst} color={colors.ember} />
//     </View>
//   </View>
//
// Kept generic (color / count / distance / icon) for reuse in later phases.
import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  interpolate,
  Easing,
} from 'react-native-reanimated';

const DURATION = 620;

// One fanned particle. dx/dy (its final offset) are precomputed in JS so the
// worklet only multiplies by progress — no trig on the UI thread.
function Particle({ trigger, dx, dy, color, size }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!trigger) return; // don't fire on first mount
    progress.value = 0;
    progress.value = withTiming(1, { duration: DURATION, easing: Easing.out(Easing.quad) });
  }, [trigger]);

  const style = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      opacity: interpolate(p, [0, 0.15, 1], [0, 1, 0]),
      transform: [
        { translateX: dx * p },
        { translateY: dy * p },
        { scale: interpolate(p, [0, 0.3, 1], [0.2, 1, 0.5]) },
      ],
    };
  });

  return (
    <Animated.View style={[styles.particle, style]} pointerEvents="none">
      <Ionicons name="sparkles" size={size} color={color} />
    </Animated.View>
  );
}

export default function SparkBurst({
  trigger = 0,
  color = '#FF4D6D',
  count = 5,
  distance = 26,
  size = 11,
  style,
}) {
  // Central icon pop (scale 1 → 1.35 → 0), fired on the same trigger.
  const pop = useSharedValue(0);
  useEffect(() => {
    if (!trigger) return;
    pop.value = 0;
    pop.value = withSequence(
      withTiming(1, { duration: 180, easing: Easing.out(Easing.back(2)) }),
      withTiming(0, { duration: 300, easing: Easing.in(Easing.quad) })
    );
  }, [trigger]);

  const popStyle = useAnimatedStyle(() => ({
    opacity: pop.value,
    transform: [{ scale: interpolate(pop.value, [0, 1], [0.6, 1.35]) }],
  }));

  // Even fan of particles around the circle, precomputed offsets.
  const particles = Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
    return { key: i, dx: Math.cos(angle) * distance, dy: Math.sin(angle) * distance };
  });

  return (
    <View style={[styles.root, style]} pointerEvents="none">
      <Animated.View style={[styles.center, popStyle]} pointerEvents="none">
        <Ionicons name="sparkles" size={size + 7} color={color} />
      </Animated.View>
      {particles.map((p) => (
        <Particle key={p.key} trigger={trigger} dx={p.dx} dy={p.dy} color={color} size={size} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', justifyContent: 'center' },
  center: { position: 'absolute' },
  particle: { position: 'absolute' },
});
