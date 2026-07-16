import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { COLORS } from '../constants/colors';

// Lightweight confirmation banner — no toast library, just the built-in
// Animated API. Parent owns `toast` state ({ type, message } | null) and
// clears it via onHide once the fade-out finishes.
export default function Toast({ toast, onHide }) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!toast) return undefined;
    const seq = Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(2200),
      Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]);
    seq.start(({ finished }) => {
      if (finished && onHide) onHide();
    });
    return () => seq.stop();
  }, [toast]);

  if (!toast) return null;

  const variantStyle =
    toast.type === 'error' ? styles.error : toast.type === 'info' ? styles.info : styles.success;

  return (
    <Animated.View style={[styles.toast, variantStyle, { opacity }]}>
      <Text style={styles.text}>{toast.message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 24,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    zIndex: 50,
  },
  success: { backgroundColor: COLORS.success },
  error: { backgroundColor: COLORS.danger },
  info: { backgroundColor: COLORS.primary },
  text: { color: '#fff', fontSize: 13, fontWeight: '600', textAlign: 'center' },
});
