import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, Dimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import GlassButton from './GlassButton';

const { width, height } = Dimensions.get('window');

export default function UpdateModal({
  visible,
  isHardUpdate, // true = forced, false = dismissible
  updateUrl,
  onDismiss,
}) {
  const handleUpdate = () => {
    if (updateUrl) {
      Linking.openURL(updateUrl).catch((err) =>
        console.error('Failed to open update url', err)
      );
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={isHardUpdate ? undefined : onDismiss} // Prevent android back button if hard update
    >
      <View style={s.overlay}>
        <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFillObject} />

        <View style={s.contentWrap}>
          <LinearGradient
            colors={['rgba(255,255,255,0.1)', 'rgba(255,255,255,0.05)']}
            style={s.card}
          >
            <View style={s.iconWrap}>
              <Ionicons name="cloud-download-outline" size={32} color="#FF4D6D" />
            </View>

            <Text style={s.title}>
              {isHardUpdate ? 'Update Required' : 'Update Available'}
            </Text>
            <Text style={s.desc}>
              {isHardUpdate
                ? 'Your version of Cupid is no longer supported. Please download the latest update to continue.'
                : 'A new version of Cupid is available! Get the latest features and bug fixes.'}
            </Text>

            <View style={s.buttons}>
              <GlassButton
                title="Download Update"
                onPress={handleUpdate}
                glassColor="#FF4D6D"
                color="#fff"
                style={s.btn}
              />
              {!isHardUpdate && (
                <GlassButton
                  title="Maybe Later"
                  onPress={onDismiss}
                  tint="dark"
                  color="rgba(255,255,255,0.6)"
                  style={s.btn}
                />
              )}
            </View>
          </LinearGradient>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  contentWrap: {
    width: width * 0.85,
    borderRadius: 24,
    overflow: 'hidden',
  },
  card: {
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 24,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255, 77, 109, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
    textAlign: 'center',
  },
  desc: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  buttons: {
    width: '100%',
    gap: 12,
  },
  btn: {
    width: '100%',
  },
});
