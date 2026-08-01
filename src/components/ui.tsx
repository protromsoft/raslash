import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { Image } from 'expo-image';
import { Appear, PressableScale, useProgressStyle, Animated } from '@/components/Motion';
import { colors, shadows } from '@/theme/colors';
import { type as t } from '@/theme/typography';
import { radii, spacing } from '@/theme/spacing';

type IconName = ComponentProps<typeof Ionicons>['name'];

/* ---------------------------------------------------------------- Text ---- */

type TxtVariant = keyof typeof t;

export function Txt({
  variant = 'body',
  style,
  children,
  ...rest
}: {
  variant?: TxtVariant;
  style?: StyleProp<TextStyle>;
  children?: ReactNode;
} & Omit<ComponentProps<typeof Text>, 'style'>) {
  return (
    <Text {...rest} style={[t[variant] as TextStyle, style]}>
      {children}
    </Text>
  );
}

/* ------------------------------------------------------------- Buttons ---- */

type ButtonTone = 'dark' | 'light' | 'outline' | 'ghost';

export function Button({
  label,
  onPress,
  disabled,
  loading,
  tone = 'dark',
  icon,
  iconRight,
  style,
  full = true,
}: {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  tone?: ButtonTone;
  icon?: IconName;
  iconRight?: IconName;
  style?: StyleProp<ViewStyle>;
  full?: boolean;
}) {
  const toneStyle = {
    dark: styles.btnDark,
    light: styles.btnLight,
    outline: styles.btnOutline,
    ghost: styles.btnGhost,
  }[tone];

  const labelColor =
    tone === 'dark' ? colors.white : tone === 'ghost' ? colors.muted : colors.ink;

  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled || loading}
      style={[styles.btn, toneStyle, full && styles.btnFull, style]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {loading ? (
        <ActivityIndicator color={labelColor} />
      ) : (
        <View style={styles.btnRow}>
          {icon ? <Ionicons name={icon} size={18} color={labelColor} /> : null}
          <Text style={[t.button, { color: labelColor }]}>{label}</Text>
          {iconRight ? <Ionicons name={iconRight} size={18} color={labelColor} /> : null}
        </View>
      )}
    </PressableScale>
  );
}

/** Legacy alias kept so older screens keep working. */
export function PrimaryButton(props: {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  return <Button {...props} tone="dark" />;
}

export function TextButton({
  label,
  onPress,
  style,
  onDark,
}: {
  label: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  /** Use light text when placed over a photo or dark surface. */
  onDark?: boolean;
}) {
  return (
    <PressableScale onPress={onPress} style={[styles.textBtn, style]} scaleTo={0.96}>
      <Text style={[styles.textBtnLabel, onDark && { color: 'rgba(255,255,255,0.72)' }]}>
        {label}
      </Text>
    </PressableScale>
  );
}

export function IconButton({
  icon,
  onPress,
  tone = 'light',
  size = 42,
  style,
  accessibilityLabel,
}: {
  icon: IconName;
  onPress?: () => void;
  tone?: 'light' | 'dark' | 'blur';
  size?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const bg =
    tone === 'dark' ? colors.ink : tone === 'blur' ? 'rgba(255,255,255,0.86)' : colors.white;
  const fg = tone === 'dark' ? colors.white : colors.ink;
  return (
    <PressableScale
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? icon}
      style={[
        styles.iconBtn,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: bg },
        style,
      ]}
    >
      <Ionicons name={icon} size={size * 0.46} color={fg} />
    </PressableScale>
  );
}

export function BackButton({ onPress, tone }: { onPress: () => void; tone?: 'light' | 'dark' }) {
  return <IconButton icon="chevron-back" onPress={onPress} tone={tone} accessibilityLabel="Geri" />;
}

/* ------------------------------------------------------------ Progress ---- */

export function ProgressBar({
  progress,
  tone = 'dark',
  style,
}: {
  progress: number;
  tone?: 'dark' | 'light';
  style?: StyleProp<ViewStyle>;
}) {
  const fillStyle = useProgressStyle(progress);
  return (
    <View
      style={[
        styles.progressTrack,
        tone === 'light' && { backgroundColor: 'rgba(255,255,255,0.22)' },
        style,
      ]}
    >
      <Animated.View
        style={[
          styles.progressFill,
          tone === 'light' && { backgroundColor: colors.white },
          fillStyle,
        ]}
      />
    </View>
  );
}

/* --------------------------------------------------------------- Input ---- */

export function Field({
  label,
  hint,
  error,
  style,
  inputStyle,
  variant = 'boxed',
  ...props
}: TextInputProps & {
  label?: string;
  hint?: string;
  error?: string;
  style?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  variant?: 'boxed' | 'underline';
}) {
  const [focused, setFocused] = useState(false);

  if (variant === 'underline') {
    return (
      <View style={[styles.fieldWrap, style]}>
        <TextInput
          placeholderTextColor={colors.mutedSoft}
          {...props}
          onFocus={(e) => {
            setFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            props.onBlur?.(e);
          }}
          style={[
            styles.underlineInput,
            focused && { borderBottomColor: colors.ink },
            inputStyle,
          ]}
        />
        {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
        {error ? <Text style={styles.fieldError}>{error}</Text> : null}
      </View>
    );
  }

  return (
    <View style={[styles.fieldWrap, style]}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <View
        style={[
          styles.inputShell,
          focused && styles.inputShellFocused,
          !!error && styles.inputShellError,
        ]}
      >
        <TextInput
          placeholderTextColor={colors.mutedSoft}
          {...props}
          onFocus={(e) => {
            setFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            props.onBlur?.(e);
          }}
          style={[styles.input, props.multiline && styles.inputMultiline, inputStyle]}
        />
      </View>
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

/* --------------------------------------------------------- Selection ------ */

export function SelectionRow({
  label,
  description,
  selected,
  onPress,
  icon,
}: {
  label: string;
  description?: string;
  selected: boolean;
  onPress: () => void;
  icon?: IconName;
}) {
  return (
    <PressableScale
      onPress={onPress}
      style={[styles.selectRow, selected && styles.selectRowActive]}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
    >
      {icon ? (
        <Ionicons name={icon} size={20} color={selected ? colors.white : colors.ink} />
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={[styles.selectLabel, selected && { color: colors.white }]}>{label}</Text>
        {description ? (
          <Text style={[styles.selectDesc, selected && { color: 'rgba(255,255,255,0.65)' }]}>
            {description}
          </Text>
        ) : null}
      </View>
      <View style={[styles.radio, selected && styles.radioActive]}>
        {selected ? <Ionicons name="checkmark" size={13} color={colors.ink} /> : null}
      </View>
    </PressableScale>
  );
}

/** Legacy alias. */
export function SelectionCard(props: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return <SelectionRow {...props} />;
}

/* --------------------------------------------------------- Containers ----- */

export function Card({
  children,
  style,
  onPress,
  padded = true,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  padded?: boolean;
}) {
  const content = (
    <View style={[styles.card, padded && styles.cardPadded, style]}>{children}</View>
  );
  if (!onPress) return content;
  return (
    <PressableScale onPress={onPress} scaleTo={0.985}>
      {content}
    </PressableScale>
  );
}

/** Legacy alias. */
export function GlassPanel({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <Card style={style}>{children}</Card>;
}

export function Chip({
  label,
  icon,
  active,
  tone = 'light',
  onPress,
  style,
}: {
  label: string;
  icon?: IconName;
  active?: boolean;
  tone?: 'light' | 'dark';
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const dark = tone === 'dark' || active;
  const body = (
    <View style={[styles.chip, dark ? styles.chipDark : styles.chipLight, style]}>
      {icon ? (
        <Ionicons name={icon} size={14} color={dark ? colors.white : colors.ink} />
      ) : null}
      <Text style={[styles.chipLabel, dark && { color: colors.white }]}>{label}</Text>
    </View>
  );
  if (!onPress) return body;
  return (
    <PressableScale onPress={onPress} scaleTo={0.94}>
      {body}
    </PressableScale>
  );
}

export function SectionHeader({
  title,
  action,
  onAction,
  style,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.sectionHeader, style]}>
      <Text style={t.h3}>{title}</Text>
      {action ? (
        <PressableScale onPress={onAction} hitSlop={8} scaleTo={0.94}>
          <Text style={styles.sectionAction}>{action}</Text>
        </PressableScale>
      ) : null}
    </View>
  );
}

export function ScreenTitle({
  title,
  subtitle,
  align = 'center',
  delay = 0,
}: {
  title: string;
  subtitle?: string;
  align?: 'center' | 'left';
  delay?: number;
}) {
  return (
    <Appear delay={delay} style={[styles.titleBlock, align === 'left' && { alignItems: 'flex-start' }]}>
      <Text style={[t.h1, align === 'center' && { textAlign: 'center' }]}>{title}</Text>
      {subtitle ? (
        <Text style={[t.body, align === 'center' && { textAlign: 'center' }, styles.titleSub]}>
          {subtitle}
        </Text>
      ) : null}
    </Appear>
  );
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.divider, style]} />;
}

/* ------------------------------------------------------------- Avatars ---- */

export function Avatar({
  uri,
  name,
  size = 40,
  ring,
  style,
}: {
  uri?: string;
  name?: string;
  size?: number;
  ring?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const initial = (name?.trim()?.[0] ?? '?').toUpperCase();
  return (
    <View
      style={[
        { width: size, height: size, borderRadius: size / 2 },
        ring && styles.avatarRing,
        style,
      ]}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: '100%', height: '100%', borderRadius: size / 2 }}
          contentFit="cover"
          transition={220}
        />
      ) : (
        <View
          style={[
            styles.avatarFallback,
            { width: '100%', height: '100%', borderRadius: size / 2 },
          ]}
        >
          <Text style={[styles.avatarInitial, { fontSize: size * 0.38 }]}>{initial}</Text>
        </View>
      )}
    </View>
  );
}

export function AvatarStack({
  people,
  size = 24,
  max = 3,
}: {
  people: { avatarUrl?: string; firstName?: string }[];
  size?: number;
  max?: number;
}) {
  const shown = people.slice(0, max);
  return (
    <View style={styles.stack}>
      {shown.map((p, i) => (
        <Avatar
          key={`${p.firstName}-${i}`}
          uri={p.avatarUrl}
          name={p.firstName}
          size={size}
          ring
          style={i > 0 ? { marginLeft: -size * 0.34 } : undefined}
        />
      ))}
    </View>
  );
}

/* --------------------------------------------------------- Empty state ---- */

export function EmptyState({
  icon = 'sparkles-outline',
  title,
  body,
  action,
  onAction,
}: {
  icon?: IconName;
  title: string;
  body?: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <Appear style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={24} color={colors.muted} />
      </View>
      <Text style={[t.h3, { textAlign: 'center' }]}>{title}</Text>
      {body ? <Text style={[t.body, { textAlign: 'center' }]}>{body}</Text> : null}
      {action ? (
        <Button label={action} onPress={onAction} tone="outline" full={false} style={{ marginTop: 6 }} />
      ) : null}
    </Appear>
  );
}

/* ---------------------------------------------------------------- Misc ---- */

export function Badge({
  label,
  tone = 'neutral',
  icon,
}: {
  label: string;
  tone?: 'neutral' | 'live' | 'warm' | 'dark';
  icon?: IconName;
}) {
  const map = {
    neutral: { bg: colors.bgSoft, fg: colors.inkSoft },
    live: { bg: colors.greenSoft, fg: '#2F7F51' },
    warm: { bg: colors.amberSoft, fg: '#9A6224' },
    dark: { bg: colors.ink, fg: colors.white },
  }[tone];
  return (
    <View style={[styles.badge, { backgroundColor: map.bg }]}>
      {icon ? <Ionicons name={icon} size={11} color={map.fg} /> : null}
      <Text style={[styles.badgeLabel, { color: map.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  /* buttons */
  btn: {
    minHeight: 56,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  btnFull: {
    alignSelf: 'stretch',
  },
  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  btnDark: {
    backgroundColor: colors.ink,
    ...shadows.soft,
  },
  btnLight: {
    backgroundColor: colors.white,
    ...shadows.soft,
  },
  btnOutline: {
    backgroundColor: 'transparent',
    borderWidth: 1.4,
    borderColor: colors.lineStrong,
  },
  btnGhost: {
    backgroundColor: 'transparent',
    minHeight: 48,
  },
  textBtn: {
    alignItems: 'center',
    paddingVertical: 14,
  },
  textBtnLabel: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 15,
    color: colors.muted,
  },
  iconBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.soft,
  },

  /* progress */
  progressTrack: {
    flex: 1,
    height: 4,
    borderRadius: 999,
    backgroundColor: colors.track,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.ink,
    borderRadius: 999,
  },

  /* inputs */
  fieldWrap: {
    gap: 8,
  },
  fieldLabel: {
    fontFamily: 'DMSans_500Medium',
    color: colors.muted,
    fontSize: 13,
  },
  fieldHint: {
    fontFamily: 'DMSans_400Regular',
    color: colors.muted,
    fontSize: 12,
  },
  fieldError: {
    fontFamily: 'DMSans_500Medium',
    color: colors.danger,
    fontSize: 13,
  },
  inputShell: {
    backgroundColor: colors.white,
    borderRadius: radii.md,
    borderWidth: 1.4,
    borderColor: 'transparent',
    ...shadows.soft,
  },
  inputShellFocused: {
    borderColor: colors.ink,
  },
  inputShellError: {
    borderColor: colors.danger,
  },
  input: {
    minHeight: 56,
    paddingHorizontal: spacing.md,
    fontFamily: 'DMSans_500Medium',
    fontSize: 16,
    color: colors.ink,
  },
  inputMultiline: {
    minHeight: 110,
    paddingTop: 16,
    paddingBottom: 16,
    textAlignVertical: 'top',
  },
  underlineInput: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 34,
    letterSpacing: -1,
    color: colors.ink,
    textAlign: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1.5,
    borderBottomColor: colors.lineStrong,
  },

  /* selection */
  selectRow: {
    minHeight: 64,
    borderRadius: radii.md,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    ...shadows.soft,
  },
  selectRowActive: {
    backgroundColor: colors.ink,
  },
  selectLabel: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 16,
    color: colors.ink,
  },
  selectDesc: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 13,
    color: colors.muted,
    marginTop: 2,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: {
    backgroundColor: colors.white,
    borderColor: colors.white,
  },

  /* containers */
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    ...shadows.card,
  },
  cardPadded: {
    padding: spacing.md,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radii.pill,
  },
  chipLight: {
    backgroundColor: colors.white,
    ...shadows.soft,
  },
  chipDark: {
    backgroundColor: colors.ink,
    ...shadows.soft,
  },
  chipLabel: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 14,
    color: colors.ink,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionAction: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 14,
    color: colors.muted,
  },
  titleBlock: {
    alignItems: 'center',
    gap: 10,
  },
  titleSub: {
    maxWidth: 320,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.lineStrong,
  },

  /* avatars */
  avatarRing: {
    borderWidth: 2,
    borderColor: colors.white,
    backgroundColor: colors.white,
  },
  avatarFallback: {
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontFamily: 'DMSans_700Bold',
    color: colors.white,
  },
  stack: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  /* empty */
  empty: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 40,
    paddingHorizontal: spacing.lg,
  },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.bgSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },

  /* badge */
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: radii.pill,
  },
  badgeLabel: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 11,
  },
});
