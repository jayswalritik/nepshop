import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { COLORS, SHADOWS, SPACING } from '../constants/colors';

// Floating chat button for the customer Home screen. It is rendered INSIDE the
// Home screen, which the tab navigator lays out above the (non-absolute) tab
// bar — so the tab bar (which already carries the bottom safe-area inset) sits
// just below this button; `bottom: SPACING.lg` floats it a small gap above the
// bar. The wrapper is a transparent, zero-chrome absolute box anchored by right
// + bottom only (no width/flex/background) with pointerEvents 'box-none', so it
// is NOT a bar and never covers content — only the circular button itself is a
// touch target. The parent decides visibility (debounced on scroll) and flips
// `visible`; this component animates the slide/fade over 150ms.
export default function ChatFab({ visible = true }) {
  const anim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: visible ? 1 : 0,
      duration: 150,
      useNativeDriver: true,
    }).start();
  }, [visible, anim]);

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [96, 0] });

  return (
    <Animated.View
      pointerEvents={visible ? 'box-none' : 'none'}
      style={[styles.wrap, { opacity: anim, transform: [{ translateY }] }]}
    >
      <Pressable
        style={styles.fab}
        onPress={() => router.push('/(customer)/chat')}
        accessibilityRole="button"
        accessibilityLabel="Open shopping assistant chat"
        hitSlop={8}
      >
        <Ionicons name="chatbubble-ellipses" size={26} color="#fff" />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    // Transparent, no width/flex — anchored by right + bottom only so it hugs
    // the button and never forms a full-width strip over content.
    position: 'absolute',
    right: SPACING.lg,
    bottom: SPACING.lg,
    backgroundColor: 'transparent',
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.card,
  },
});
