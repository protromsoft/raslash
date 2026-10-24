import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { PressableScale } from '@/components/Motion';
import { haptic } from '@/lib/haptics';
import { type ProfileTag, tagsFor, toggleTag } from '@/lib/profileTags';
import { colors, shadows } from '@/theme/colors';

/** An interest's icon, or a language's code ("TR") in a small badge. */
function TagMark({ tag, selected = false }: { tag: ProfileTag; selected?: boolean }) {
  if (tag.icon) return <Ionicons name={tag.icon} size={16} color={selected ? colors.white : colors.ink} />;
  return (
    <View style={[styles.code, selected && styles.codeOn]}>
      <Text style={[styles.codeText, selected && styles.codeTextOn]} maxFontSizeMultiplier={1.2}>{tag.key.toUpperCase()}</Text>
    </View>
  );
}

/** Read-only chips ("TR Türkçe"), as on a member’s profile. */
export function TagChips({ keys, list }: { keys?: string[] | null; list: readonly ProfileTag[] }) {
  const tags = tagsFor(keys, list);
  if (!tags.length) return null;
  return (
    <View style={styles.wrap}>
      {tags.map((tag) => (
        <View key={tag.key} style={styles.chip}>
          <TagMark tag={tag} />
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
              <TagMark tag={tag} selected={selected} />
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
  code: { minWidth: 26, paddingHorizontal: 5, height: 20, borderRadius: 6, backgroundColor: colors.bg,
    alignItems: 'center', justifyContent: 'center' },
  codeOn: { backgroundColor: 'rgba(255,255,255,0.16)' },
  codeText: { fontFamily: 'DMSans_700Bold', fontSize: 10.5, letterSpacing: 0.4, color: colors.ink },
  codeTextOn: { color: colors.white },
  label: { fontFamily: 'DMSans_500Medium', fontSize: 14, color: colors.ink },
  labelOn: { color: colors.white },
  picker: { gap: 10 },
  pickerHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  pickerLabel: { fontFamily: 'DMSans_700Bold', fontSize: 14, color: colors.ink },
  count: { fontFamily: 'DMSans_400Regular', fontSize: 12, color: colors.muted },
});
