import React, { useRef } from 'react';
import { Modal, TouchableOpacity, View, Text, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';

export default function AttachmentSheet({ visible, onClose, title = 'Share', options = [] }) {
  const { colors } = useTheme();
  const s = getStyles(colors);
  const pendingPressRef = useRef(null);

  const runPendingPress = () => {
    const onPress = pendingPressRef.current;
    pendingPressRef.current = null;
    onPress?.();
  };

  const handlePress = (onPress) => {
    // iOS cannot reliably present the system image picker while this modal is
    // still being dismissed. Queue the action for Modal.onDismiss instead.
    pendingPressRef.current = onPress;
    onClose?.();

    if (Platform.OS !== 'ios') {
      // onDismiss is iOS-only in React Native. Keep Android's delayed handoff
      // so its picker still opens after the sheet has begun closing.
      setTimeout(runPendingPress, 350);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      onDismiss={Platform.OS === 'ios' ? runPendingPress : undefined}
    >
      <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={onClose}>
        <View style={s.sheet} onStartShouldSetResponder={() => true}>
          <View style={s.handle} />
          <Text style={s.title}>{title}</Text>
          <View style={s.options}>
            {options.map((option) => (
              <TouchableOpacity
                key={option.key}
                style={s.option}
                onPress={() => handlePress(option.onPress)}
              >
                <View style={[s.iconBg, { backgroundColor: option.bgColor || colors.ember + '20' }]}>
                  <Ionicons name={option.icon} size={24} color={option.iconColor || colors.ember} />
                </View>
                <Text style={s.optionText}>{option.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const getStyles = (colors) => StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: colors.fog,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: 20,
    textAlign: 'center',
  },
  options: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    flexWrap: 'wrap',
    gap: 12,
  },
  option: {
    alignItems: 'center',
    gap: 8,
    minWidth: 72,
  },
  iconBg: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.stone,
  },
});
