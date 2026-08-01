import { Platform, StyleSheet, View } from 'react-native';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';

/**
 * Compact top chrome for stack screens presented as modal cards.
 * Use `tone="light"` when the grabber sits on a photo or dark surface.
 */
export function ModalGrabber({ tone = 'dark' }: { tone?: 'dark' | 'light' }) {
  return (
    <View style={styles.wrap} pointerEvents="none">
      <View style={[styles.handle, tone === 'light' && styles.handleLight]} />
    </View>
  );
}

/**
 * Top padding for modal-presented screens. The iOS modal card already starts
 * below the status bar, so adding `insets.top` there doubles the gap.
 */
export function sheetTopPad(insetsTop: number) {
  if (Platform.OS === 'ios') return spacing.sm;
  return Math.max(insetsTop, spacing.sm) + spacing.xs;
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  handle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.mutedSoft,
  },
  handleLight: {
    backgroundColor: 'rgba(255,255,255,0.65)',
  },
});
