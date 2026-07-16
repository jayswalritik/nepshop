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
//
// Each step's connector is split into a left half and a right half, with
// the (fixed-size) dot centered between them — NOT a dot followed by a
// single trailing line, which pushed the dot to the left edge of its
// column while the label below (centered separately) stayed centered.
// Splitting the line in half per item keeps the dot genuinely centered in
// its flex:1 column, so it lines up with the label under it.
//
// Fill semantics: circles 1..currentIndex are filled: dot i is filled iff
// i <= currentIndex. A connector SEGMENT between dot k and dot k+1 is
// filled only once dot k+1 itself is reached — i.e. segment k is filled
// iff (k+1) <= currentIndex, equivalently k < currentIndex. The dot's own
// "isDone" must NOT be used to fill the segment leaving it (that was the
// fill-ahead bug: a segment lit up as soon as the step it starts FROM was
// reached, one step too early).
export default function OrderStatusStepper({ status }) {
  if (NON_FORWARD_STATUSES.includes(status)) {
    return <StatusBadge status={status} />;
  }

  const currentIndex = STATUS_STEPS.indexOf(status);
  const segmentFilled = (k) => k + 1 <= currentIndex;

  return (
    <View style={styles.stepper}>
      {STATUS_STEPS.map((step, i) => {
        const isDone = i <= currentIndex;
        const isActive = i === currentIndex;
        const isFirst = i === 0;
        const isLast = i === STATUS_STEPS.length - 1;
        const leftFilled = !isFirst && segmentFilled(i - 1);
        const rightFilled = !isLast && segmentFilled(i);

        return (
          <View key={step} style={styles.stepItem}>
            <View style={styles.connectorRow}>
              <View style={[styles.lineHalf, isFirst && styles.lineHalfHidden, leftFilled && styles.lineHalfDone]} />
              <View style={[styles.dot, isDone && styles.dotDone]}>
                <Text style={[styles.dotText, isDone && styles.dotTextDone]}>
                  {isDone ? '✓' : i + 1}
                </Text>
              </View>
              <View style={[styles.lineHalf, isLast && styles.lineHalfHidden, rightFilled && styles.lineHalfDone]} />
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
  connectorRow: {
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
  // Each half spans from the column edge to the dot's edge — two adjacent
  // items' touching halves together form one full connector segment
  // between their dots.
  lineHalf: {
    flex: 1,
    height: 2,
    backgroundColor: COLORS.border,
  },
  // The stub before the first dot / after the last dot has no segment to
  // represent — invisible rather than colored either way.
  lineHalfHidden: {
    backgroundColor: 'transparent',
  },
  lineHalfDone: {
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
