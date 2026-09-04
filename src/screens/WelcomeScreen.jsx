import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, Animated, Easing } from 'react-native';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { radius, fonts } from '../theme';

const { width: W, height: H } = Dimensions.get('window');

const IMAGES = [
  'https://lh3.googleusercontent.com/aida-public/AB6AXuAfKxp6zG-Df576tEkwQu9GDJEKjniVZ0EboBoBxYdI616hHzrIhBdPIZFAstc093xLdJI6ceWvGb8pdDKcQqEHH34ZK74e5L4d0fYJi3M8j_CNesfJ1ITVyPVmM2HUSu4bzXiu0ZMPWaImgAnfUwNbNE5vQjRRc-vp8756ZT7v79dKQkhoe00P_HXYIJ9B2r7ACK59Y7Ra38n1Lry5MbTPuUxZS7m-GwHtFpCCMgy2NiwgJOgwMQr9wys3NGLB1PPBqXp62sHNOoc',
  'https://lh3.googleusercontent.com/aida-public/AB6AXuBlgXKLnYHOWRRGlqs1lgqeY0vOM4SsMqAAiV6Annn2wFFP60i_WMgosN6Y_1sDRSpmXOWORmZ5rwLP52JbArnvRG9x_M0vnXlM2esGHUwJ7H7e1feoiF0DSfhGCSvOS8VKq2MHdkcqZbaLlBPziCUGbKlDIvTVXjW5bb4AWETnVaR7o6NTyBSmo4dQsrv5QSu7vgPCQL7_v0GoSxr9zmTC2gT1XwMVjmUnZiRR8iubc9cZwTZ667-Gb2DNVf5tNVW2kaspAUq8N4M',
  'https://lh3.googleusercontent.com/aida-public/AB6AXuDUS0xeVDyayG_u3018Xpv0BykLtG8atbRQ4vhF8QcJIE0gY3WZrwv5K3p57fXlzGfR4sb_gpj_4bAIOZu_pzzPgipyUWid9ZlUhpB7iRd3scPcCm1KBtOZJvWliSriQY5U2KhmFE7E25-peogWC2vZgAgg8_ME9JvLHvrz57dBNBiYcIcUWB04MSmE7dAqqREwEK6cj6JUXgGilz5AEmbusH0n6M7EabBYktnV04YSpUcPPuxEN6muUxYfhoPKAXfCgxjsb_UM4Jg',
  'https://lh3.googleusercontent.com/aida-public/AB6AXuA_GB0s8jRy0GvrfATMgXl_2dJlnHAotiwKvv85sKiGfP8eVsJOUDoKImJINMDJwV48VrvA4zDukbjTYMcJmNxo4CNVaAn70qea77bUkJgpixqQCbvnLCkUJz7dtugWl5hqy-Q6HYhxxjDrGAfdAdTAvxiL-brNRk7AchGjeVboaEfqMUmisDkCI-_oMXthi7GH-yIv9htXNduNpEBq43L9aNt7cDzw3-8j5dKdIA1z_OM4E14OzGX4Fek6dyJOSw-mEshV8y_uhQ4'
];

export default function WelcomeScreen({ navigation }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const opacities = useRef(IMAGES.map((_, i) => new Animated.Value(i === 0 ? 1 : 0))).current;
  const scales = useRef(IMAGES.map((_, i) => new Animated.Value(i === 0 ? 1.05 : 1))).current;

  useEffect(() => {
    // Initial scale for the first image
    Animated.timing(scales[0], { toValue: 1.05, duration: 6000, useNativeDriver: true }).start();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const nextIndex = (activeIndex + 1) % IMAGES.length;
      
      // Reset scale of the next image
      scales[nextIndex].setValue(1);
      
      Animated.parallel([
        Animated.timing(opacities[activeIndex], { toValue: 0, duration: 1500, useNativeDriver: true }),
        Animated.timing(opacities[nextIndex], { toValue: 1, duration: 1500, useNativeDriver: true }),
        Animated.timing(scales[nextIndex], { toValue: 1.05, duration: 6000, easing: Easing.out(Easing.ease), useNativeDriver: true })
      ]).start();
      
      setActiveIndex(nextIndex);
    }, 5000);
    
    return () => clearInterval(interval);
  }, [activeIndex]);

  // Rotate animation for the liquid border gradient
  const rotateAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 4000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
  }, []);

  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg']
  });

  return (
    <View style={styles.root}>
      {/* Background Carousel */}
      <View style={StyleSheet.absoluteFill}>
        {IMAGES.map((uri, index) => (
          <Animated.Image
            key={index}
            source={{ uri }}
            style={[
              StyleSheet.absoluteFill,
              { opacity: opacities[index], transform: [{ scale: scales[index] }] }
            ]}
            contentFit="cover"
          />
        ))}
      </View>

      {/* Overlay Scrim */}
      <LinearGradient
        colors={['transparent', 'rgba(33, 49, 69, 0.4)', 'rgba(33, 49, 69, 0.9)']}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.main}>
        {/* Card Wrapper with padding to accommodate the liquid border */}
        <View style={styles.cardWrapper}>
          {/* Animated Border */}
          <View style={styles.animatedBorderContainer}>
            <Animated.View style={[styles.animatedBorder, { transform: [{ rotate: spin }] }]}>
              <LinearGradient
                colors={['transparent','#ffffffff', ]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>
          </View>

          {/* Glass Content */}
          <View style={styles.glassContentWrapper}>
            <BlurView intensity={5} style={styles.glassContent}>
              <Text style={styles.brandTitle}>Cupid</Text>
              <Text style={styles.headline}>Find your connection.</Text>
              <Text style={styles.subtext}>Discover people who share your vibe.</Text>

              <TouchableOpacity 
                style={styles.primaryBtn} 
                activeOpacity={0.9}
                onPress={() => navigation?.navigate('Register')}
              >
                <LinearGradient
                  colors={['rgba(10, 132, 255, 0.8)', 'rgba(10, 132, 255, 0.3)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.btnGradient}
                >
                  <Text style={styles.primaryBtnText}>Create Account</Text>
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.secondaryBtn} 
                activeOpacity={0.8}
                onPress={() => navigation?.navigate('Login')}
              >
                <Text style={styles.secondaryBtnText}>I already have an account</Text>
              </TouchableOpacity>

              {/* Indicators */}
              <View style={styles.indicators}>
                {IMAGES.map((_, i) => (
                  <Animated.View 
                    key={i} 
                    style={[
                      styles.dot, 
                      i === activeIndex ? styles.dotActive : null
                    ]} 
                  />
                ))}
              </View>
            </BlurView>
          </View>
        </View>

        {/* Brand Footer */}
        <View style={styles.footer}>
          <Text style={styles.legalText}>By continuing you agree to our Terms & Privacy Policy</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#213145',
  },
  main: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  cardWrapper: {
    width: '100%',
    borderRadius: 40,
    marginBottom: 24,
    position: 'relative',
    overflow: 'hidden',
    padding: 2, // Space for the animated border
  },
  animatedBorderContainer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    borderRadius: 40,
  },
  animatedBorder: {
    width: '200%',
    height: '200%',
    position: 'absolute',
    top: '-50%',
    left: '-50%',
    opacity: 0.6,
  },
  glassContentWrapper: {
    borderRadius: 38,
    overflow: 'hidden',
  },
  glassContent: {
    padding: 24,
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 1,
  },
  brandTitle: {
    fontSize: 40,
    fontFamily: fonts.display,
    color: '#da2e55',
    marginBottom: 8,
    letterSpacing: -1,
  },
  headline: {
    fontSize: 24,
    fontFamily: fonts.display,
    color: '#ffffff',
    marginBottom: 4,
    textAlign: 'center',
  },
  subtext: {
    fontSize: 16,
    color: '#dce9ff',
    marginBottom: 32,
    textAlign: 'center',
    maxWidth: 280,
  },
  primaryBtn: {
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
    elevation: 8,
    shadowColor: '#0A84FF',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(10, 132, 255, 0.3)',
  },
  btnGradient: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  secondaryBtn: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  indicators: {
    flexDirection: 'row',
    marginTop: 24,
    gap: 8,
    height: 8,
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
  dotActive: {
    width: 16,
    backgroundColor: '#ffffff',
  },
  footer: {
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.8,
    marginBottom: 8,
  },
  legalText: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
    lineHeight: 16,
  },
});
