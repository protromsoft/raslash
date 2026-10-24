import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Appear, PressableScale } from '@/components/Motion';
import { Screen } from '@/components/Screen';
import { Button, TextButton } from '@/components/ui';
import { haptic } from '@/lib/haptics';
import type { QuizOption } from '@/lib/onboardingQuiz';
import { colors, shadows } from '@/theme/colors';
import { spacing } from '@/theme/spacing';

/** One onboarding question: header, title, the answers, and Devam pinned below. */
export function QuizStep({ header, title, subtitle, children, canContinue = true, onContinue, onSkip,
  continueLabel = 'Devam' }: {
  header: ReactNode;
  title: string;
  subtitle?: string;
  children: ReactNode;
  canContinue?: boolean;
  onContinue: () => void;
  /** Shown as "Şimdilik geç" for optional questions. */
  onSkip?: () => void;
  continueLabel?: string;
}) {
  return (
    <Screen
      scroll
      contentStyle={styles.content}
      footer={
        <View style={styles.footer}>
          <Button label={continueLabel} disabled={!canContinue} onPress={onContinue} />
          {onSkip ? <TextButton label="Şimdilik geç" onPress={onSkip} /> : null}
        </View>
      }
    >
      {header}
      <View style={styles.copy}>
        <Text style={styles.title} accessibilityRole="header" maxFontSizeMultiplier={1.3}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle} maxFontSizeMultiplier={1.4}>{subtitle}</Text> : null}
      </View>
      {children}
    </Screen>
  );
}

/**
 * Answer cards. Single choice replaces the answer; multiple choice toggles and
 * stops adding at `max` (the full ones dim instead of silently ignoring taps).
 */
export function OptionList({ options, value, onChange, multiple = false, max }: {
  options: readonly QuizOption[];
  value: string[];
  onChange: (next: string[]) => void;
  multiple?: boolean;
  max?: number;
}) {
  const limit = multiple ? max ?? options.length : 1;
  return (
    <View style={styles.list} accessibilityRole={multiple ? 'list' : 'radiogroup'}>
      {options.map((option, index) => {
        const selected = value.includes(option.key);
        const full = multiple && !selected && value.length >= limit;
        return (
          <Appear key={option.key} delay={40 + index * 35}>
            <PressableScale
              onPress={() => {
                if (full) return;
                haptic('select');
                if (!multiple) onChange([option.key]);
                else onChange(selected ? value.filter((k) => k !== option.key) : [...value, option.key]);
              }}
              scaleTo={0.98}
              style={[styles.option, selected && styles.optionOn, full && styles.optionFull]}
              accessibilityRole={multiple ? 'checkbox' : 'radio'}
              accessibilityLabel={option.hint ? `${option.label}, ${option.hint}` : option.label}
              accessibilityState={{ checked: selected, selected, disabled: full }}
            >
              <View style={[styles.emojiWrap, selected && styles.emojiWrapOn]}>
                <Ionicons name={option.icon} size={21} color={selected ? colors.white : colors.ink} />
              </View>
              <View style={styles.optionCopy}>
                <Text style={[styles.optionLabel, selected && styles.optionLabelOn]} maxFontSizeMultiplier={1.3}>
                  {option.label}
                </Text>
                {option.hint ? (
                  <Text style={[styles.optionHint, selected && styles.optionHintOn]} maxFontSizeMultiplier={1.3}>
                    {option.hint}
                  </Text>
                ) : null}
              </View>
              <View style={[styles.check, selected && styles.checkOn, !multiple && styles.radio]}>
                {selected ? <Ionicons name="checkmark" size={15} color={colors.ink} /> : null}
              </View>
            </PressableScale>
          </Appear>
        );
      })}
      {multiple && max && max < options.length ? (
        <Text style={styles.limit}>{`En fazla ${max} seçebilirsin · ${value.length}/${max}`}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg, paddingBottom: spacing.lg },
  footer: { gap: 2 },
  copy: { gap: 8 },
  title: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 30, lineHeight: 35, letterSpacing: -0.9, color: colors.ink },
  subtitle: { fontFamily: 'DMSans_400Regular', fontSize: 15.5, lineHeight: 22, color: colors.muted },
  list: { gap: 10 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 68,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 22,
    backgroundColor: colors.white,
    ...shadows.soft,
  },
  optionOn: { backgroundColor: colors.ink },
  optionFull: { opacity: 0.45 },
  emojiWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  emojiWrapOn: { backgroundColor: 'rgba(255,255,255,0.12)' },
  optionCopy: { flex: 1, minWidth: 0, gap: 2 },
  optionLabel: { fontFamily: 'DMSans_700Bold', fontSize: 16, color: colors.ink },
  optionLabelOn: { color: colors.white },
  optionHint: { fontFamily: 'DMSans_400Regular', fontSize: 13, color: colors.muted },
  optionHintOn: { color: 'rgba(255,255,255,0.7)' },
  check: {
    width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: colors.lineStrong,
    alignItems: 'center', justifyContent: 'center',
  },
  radio: { borderRadius: 12 },
  checkOn: { backgroundColor: colors.white, borderColor: colors.white },
  limit: { fontFamily: 'DMSans_500Medium', fontSize: 12.5, color: colors.muted, textAlign: 'center', marginTop: 4 },
});
