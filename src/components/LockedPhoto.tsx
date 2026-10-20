import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { colors } from '@/theme/colors';

/**
 * Stands in for a venue photo the viewer has no access to (photos are Pro).
 * Same footprint as the photo, never loads it, and opens the paywall on tap.
 * `label` false keeps small thumbnails to the lock icon alone.
 */
export function LockedPhoto({
  onPress,
  style,
  label = true,
  onLongPress,
}: {
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  label?: boolean;
  onLongPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      accessibilityRole="button"
      accessibilityLabel="Fotoğraf Pro üyelere açık"
      accessibilityHint="Raslash Pro ekranını açar"
      style={[style, styles.locked]}
    >
      <Ionicons name="lock-closed" size={label ? 22 : 18} color={colors.muted} />
      {label ? <Text style={styles.text}>Pro ile gör</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  locked: {
    backgroundColor: colors.bgSoft,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  text: { fontFamily: 'DMSans_700Bold', fontSize: 12, color: colors.muted },
});
