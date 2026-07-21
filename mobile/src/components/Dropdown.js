import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, RADII, SHADOWS, SPACING } from '../constants/colors';

// A real dropdown/select, since React Native has no native <select> — tap
// the field to open a modal sheet listing every option. No new dependency:
// built on the core Modal component.
export default function Dropdown({ value, onChange, options, placeholder = 'Select', error }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable style={[styles.field, error && styles.fieldError]} onPress={() => setOpen(true)}>
        <Text style={[styles.fieldText, !value && styles.placeholderText]} numberOfLines={1}>
          {value || placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={COLORS.textMuted} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <SafeAreaView edges={['bottom']} style={styles.sheetWrap}>
            <Pressable style={styles.sheet} onPress={() => {}}>
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>{placeholder}</Text>
                <Pressable onPress={() => setOpen(false)} hitSlop={8}>
                  <Ionicons name="close" size={22} color={COLORS.textMuted} />
                </Pressable>
              </View>
              <FlatList
                data={options}
                keyExtractor={(item) => item}
                style={styles.optionList}
                renderItem={({ item }) => (
                  <Pressable
                    style={styles.option}
                    onPress={() => { onChange(item); setOpen(false); }}
                  >
                    <Text style={[styles.optionText, value === item && styles.optionTextActive]}>
                      {item}
                    </Text>
                    {value === item && <Ionicons name="checkmark" size={18} color={COLORS.primary} />}
                  </Pressable>
                )}
              />
            </Pressable>
          </SafeAreaView>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADII.md,
    paddingHorizontal: SPACING.md + 2,
    paddingVertical: SPACING.md,
    marginBottom: 6,
    backgroundColor: COLORS.background,
  },
  fieldError: {
    borderColor: COLORS.danger,
  },
  fieldText: {
    fontSize: 15,
    color: COLORS.text,
    flex: 1,
  },
  placeholderText: {
    color: COLORS.tabInactive,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.45)',
    justifyContent: 'flex-end',
  },
  sheetWrap: {
    maxHeight: '70%',
  },
  // `sheetWrap` caps the sheet at 70% of the screen, but that cap only clips —
  // it doesn't bound the FlatList's viewport, because RN children default to
  // flexShrink: 0 (unlike web). The list therefore laid out at its full content
  // height and got cut off with nothing to scroll. flexShrink here (and on the
  // list below) lets both actually shrink to the cap, which is what gives the
  // FlatList a bounded height to scroll inside.
  sheet: {
    flexShrink: 1,
    backgroundColor: COLORS.background,
    borderTopLeftRadius: RADII.xl,
    borderTopRightRadius: RADII.xl,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
    ...SHADOWS.floating,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  sheetTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  optionList: {
    flexGrow: 0,
    flexShrink: 1,
    paddingHorizontal: SPACING.lg,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  optionText: {
    fontSize: 14,
    color: COLORS.text,
  },
  optionTextActive: {
    fontWeight: '700',
    color: COLORS.primary,
  },
});
