import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { getUnreadCount } from '../utils/notifications';
import { COLORS, RADII } from '../constants/colors';

// Small header-icon bell + unread badge — mirrors frontend/src/components/
// UnreadBadge.jsx's red pill, 9+ cap, hidden entirely at 0. No dropdown
// (unlike web): tapping always pushes the notifications screen.
//
// Self-contained: fetches its own unread count on every focus of whichever
// screen it's mounted in (standing rule — no polling). Mounted on five
// screens total (Account, Home, Orders, Deliveries, Return Pickups); each
// mount doing its own single fetch-per-focus is intentional and fine — this
// isn't the web dashboard's one-poller-per-dashboard constraint, there's no
// interval here to duplicate.
//
// `color` lets a host header override the icon's tint (default COLORS.primary
// reads fine on the white ScreenHeader background used by four of the five
// mounts; Home's dark gradient header passes color="#fff" instead — see
// mobile/app/(customer)/home.js).
export default function NotificationBellIcon({ onPress, color = COLORS.primary }) {
  const [count, setCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      getUnreadCount().then((result) => {
        if (result.success) setCount(result.count);
      });
    }, [])
  );

  return (
    <Pressable onPress={onPress} hitSlop={10} style={styles.wrap}>
      <Ionicons name="notifications-outline" size={22} color={color} />
      {count > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{count > 9 ? '9+' : count}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: RADII.pill,
    backgroundColor: COLORS.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    color: '#fff',
    fontSize: 9.5,
    fontWeight: '700',
  },
});
