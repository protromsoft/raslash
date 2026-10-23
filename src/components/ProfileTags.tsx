import { StyleSheet, Text, View } from 'react-native';
import { PressableScale } from '@/components/Motion';
import { haptic } from '@/lib/haptics';
import { type ProfileTag, tagsFor, toggleTag } from '@/lib/profileTags';
import { colors, shadows } from '@/theme/colors';

/** Read-only chips ("🇹🇷 Türkçe"), as on a member's profile. */
export function TagChips({ keys, list }: { keys?: string[] | null; list: readonly ProfileTag[] }) {
  const tags = tagsFor(keys, list);
  if (!tags.length) return null;
  return (
    <View style={styles.wrap}>
      {tags.map((tag) => (
        <View key={tag.key} style={styles.chip}>
          <Text style={styles.emoji} maxFontSizeMultiplier={1.3}>{tag.emoji}</Text>
          <Text style={styles.label} maxFontSizeMultiplier={1.3}>{tag.label}</Text>
        </View>
      ))}
    </View>
  );
}

/** Multi-select chips for profile editing; stops adding at `max`. */
export function TagPicker({ label, list, value, max, onChange }: {
  label: string;
  list: readonly ProfileTag[];
  value: string[];
  max: number;
  onChange: (keys: string[]) => void;
}) {
  return (
    <View style={styles.picker}>
      <View style={styles.pickerHead}>
        <Text style={styles.pickerLabel}>{label}</Text>
        <Text style={styles.count}>{value.length}/{max}</Text>
      </View>
      <View style={styles.wrap} accessibilityRole="list" accessibilityLabel={label}>
        {list.map((tag) => {
          const selected = value.includes(tag.key);
          const full = !selected && value.length >= max;
          return (
            <PressableScale
              key={tag.key}
              onPress={() => {
                if (full) return;
                haptic('select');
                onChange(toggleTag(value, tag.key, max));
              }}
              scaleTo={0.95}
              style={[styles.chip, selected && styles.chipOn, full && styles.chipFull]}
              accessibilityRole="checkbox"
              accessibilityLabel={tag.label}
              accessibilityState={{ checked: selected, disabled: full }}
            >
              <Text style={styles.emoji} maxFontSizeMultiplier={1.3}>{tag.emoji}</Text>
              <Text style={[styles.label, selected && styles.labelOn]} maxFontSizeMultiplier={1.3}>{tag.label}</Text>
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: colors.white,
    ...shadows.soft,
  },
  chipOn: { backgroundColor: colors.ink },
  chipFull: { opacity: 0.45 },
  emoji: { fontSize: 16 },
  label: { fontFamily: 'DMSans_500Medium', fontSize: 14, color: colors.ink },
  labelOn: { color: colors.white },
  picker: { gap: 10 },
  pickerHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  pickerLabel: { fontFamily: 'DMSans_700Bold', fontSize: 14, color: colors.ink },
  count: { fontFamily: 'DMSans_400Regular', fontSize: 12, color: colors.muted },
});
