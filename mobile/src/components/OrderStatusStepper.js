import { StyleSheet, Text, View } from 'react-native';
import { COLORS, RADII } from '../constants/colors';
import { STATUS_STEPS, NON_FORWARD_STATUSES, formatStatusLabel, statusColorFor } from '../utils/orderStatus';

// Terminal-state badge (cancelled/returned) — mirrors web's chip fallback
// for NON_FORWARD_STATUSES.
export function StatusBadge({ status, label }) {
  const c = statusColorFor(status);
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <Text style={[styles.badgeText, { color: c.text }]}>{label ?? formatStatusLabel(status)}</Text>
    </View>
  );
}

// Horizontal 5-step progress row — mirrors web's StatusStepper (dots + fill
// line), driven entirely by `status`. Renders a NON_FORWARD_STATUSES badge
// instead if given a terminal status (same guard web's diagnosis fixed:
// never index statusSteps with a status outside it).
export default function OrderStatusStepper({ status }) {
  if (NON_FORWARD_STATUSES.includes(status)) {
    return <StatusBadge status={status} />;
  }

  const currentIndex = STATUS_STEPS.indexOf(status);

  return (
    <View style={styles.stepper}>
      {STATUS_STEPS.map((step, i) => {
        const isDone = i <= currentIndex;
        const isActive = i === currentIndex;
        const isLast = i === STATUS_STEPS.length - 1;
        return (
          <View key={step} style={styles.stepItem}>
            <View style={styles.dotRow}>
              <View style={[styles.dot, isDone && styles.dotDone]}>
                <Text style={[styles.dotText, isDone && styles.dotTextDone]}>
                  {isDone ? '✓' : i + 1}
                </Text>
              </View>
              {!isLast && <View style={[styles.line, isDone && styles.lineDone]} />}
            </View>
            <Text
              style={[styles.stepLabel, isActive && styles.stepLabelActive, isDone && !isActive && styles.stepLabelDone]}
              numberOfLines={1}
            >
              {formatStatusLabel(step)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const DOT_SIZE = 22;

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: RADII.pill,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  stepper: {
    flexDirection: 'row',
  },
  stepItem: {
    flex: 1,
    alignItems: 'center',
  },
  dotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    borderWidth: 2,
    borderColor: COLORS.border,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotDone: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary,
  },
  dotText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.tabInactive,
  },
  dotTextDone: {
    color: '#fff',
  },
  line: {
    flex: 1,
    height: 2,
    backgroundColor: COLORS.border,
    marginLeft: -1,
  },
  lineDone: {
    backgroundColor: COLORS.primary,
  },
  stepLabel: {
    fontSize: 9.5,
    color: COLORS.tabInactive,
    marginTop: 4,
    textAlign: 'center',
  },
  stepLabelDone: {
    color: COLORS.textMuted,
  },
  stepLabelActive: {
    color: COLORS.primary,
    fontWeight: '700',
  },
});
