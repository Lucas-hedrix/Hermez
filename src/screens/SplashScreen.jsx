import React, { useEffect, useRef, useState } from 'react';
import { Text, StyleSheet, Animated, Easing, View, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { fonts } from '../theme';
import { useOtaUpdate } from '../context/OtaUpdateContext';

export default function SplashScreen({ onFinish, sessionCheckDone }) {
  const containerOpacityAnim = useRef(new Animated.Value(1)).current;
  const [isFadingOut, setIsFadingOut] = useState(false);
  const { checkComplete } = useOtaUpdate();

  // Animations
  const boltScaleAnim = useRef(new Animated.Value(1)).current;
  const rippleAnim1 = useRef(new Animated.Value(0)).current;
  const rippleAnim2 = useRef(new Animated.Value(0)).current;
  const rippleAnim3 = useRef(new Animated.Value(0)).current;
  const slideUpAnim = useRef(new Animated.Value(50)).current;
  const textOpacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Bolt pulsing
    Animated.loop(
      Animated.sequence([
        Animated.timing(boltScaleAnim, { toValue: 1.1, duration: 750, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        Animated.timing(boltScaleAnim, { toValue: 1, duration: 750, useNativeDriver: true, easing: Easing.inOut(Easing.ease) })
      ])
    ).start();

    // Ripples
    const createRipple = (anim, delay) => {
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, {
            toValue: 1,
            duration: 2000,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true
          }),
          // Instant reset
          Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true })
        ])
      ).start();
    };
    
    createRipple(rippleAnim1, 0);
    createRipple(rippleAnim2, 500);
    createRipple(rippleAnim3, 1000);

    // Text slide up
    setTimeout(() => {
      Animated.parallel([
        Animated.spring(slideUpAnim, {
          toValue: 0,
          friction: 8,
          tension: 40,
          useNativeDriver: true,
        }),
        Animated.timing(textOpacityAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        })
      ]).start();
    }, 500);

  }, []);

  useEffect(() => {
    if (!sessionCheckDone || !checkComplete || isFadingOut) return;

    setIsFadingOut(true);
    const splashDelay = Platform.OS === 'web' ? 1200 : 4000;
    setTimeout(() => {
      Animated.timing(containerOpacityAnim, {
        toValue: 0,
        duration: 600,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }).start(() => {
        onFinish();
      });
    }, splashDelay);
  }, [sessionCheckDone, checkComplete, isFadingOut, containerOpacityAnim, onFinish]);

  const renderRipple = (anim) => {
    const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 2.5] });
    const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 0] });
    return <Animated.View style={[styles.ripple, { transform: [{ scale }], opacity }]} />;
  };

  return (
    <Animated.View 
      style={[
        styles.container, 
        { opacity: containerOpacityAnim },
        StyleSheet.absoluteFill
      ]}
      pointerEvents={Platform.OS === 'web' ? "none" : (isFadingOut ? "none" : "auto")}
    >
      {/* Ambient background glow mapped from radial gradient */}
      <LinearGradient
        colors={['#213145', '#0b1c30']}
        style={StyleSheet.absoluteFill}
      />
      
      <View style={styles.content}>
        {/* Central Icon Area with Ripples */}
        <View style={styles.iconContainer}>
          {renderRipple(rippleAnim1)}
          {renderRipple(rippleAnim2)}
          {renderRipple(rippleAnim3)}
          
          <Animated.View style={{ transform: [{ scale: boltScaleAnim }], zIndex: 10 }}>
            <MaterialIcons name="bolt" size={80} color="#00d4ff" style={styles.boltIcon} />
          </Animated.View>
        </View>

        {/* Typography / Tagline */}
        <Animated.View style={[styles.textContainer, { opacity: textOpacityAnim, transform: [{ translateY: slideUpAnim }] }]}>
          <Text style={styles.title}>Cupid</Text>
          <Text style={styles.subtitle}>find your vibe</Text>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    zIndex: 9999,
    elevation: 9999,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  iconContainer: {
    width: 128,
    height: 128,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
  },
  ripple: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: 'rgba(0, 212, 255, 0.3)',
  },
  boltIcon: {
    textShadowColor: 'rgba(0, 212, 255, 0.6)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
  },
  textContainer: {
    alignItems: 'center',
  },
  title: {
    fontSize: 40,
    fontFamily: fonts.display,
    color: '#ffffff',
    letterSpacing: -1,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 18,
    fontFamily: fonts.display,
    color: '#ffb2b9',
    marginTop: 8,
    letterSpacing: 0.5,
    opacity: 0.9,
    textAlign: 'center',
  },
});
