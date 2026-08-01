import { LinearGradient } from 'expo-linear-gradient';
import { Image, type ImageSource } from 'expo-image';
import { useEffect, type ReactNode } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ModalGrabber, sheetTopPad } from '@/components/ModalGrabber';
import { BackButton, ProgressBar } from '@/components/ui';
import { colors } from '@/theme/colors';
import { duration, easing } from '@/theme/motion';
import { spacing, TAB_BAR_HEIGHT } from '@/theme/spacing';

/** Breathing room between a pinned footer and the keyboard (or the screen edge). */
const FOOTER_GAP = spacing.md;

/**
 * Footer pinned under the content, lifted by its own bottom padding: the
 * safe-area inset while the keyboard is hidden, and the keyboard overlap plus a
 * small gap while it is open. iOS reports the overlap, on Android the window is
 * resized for us so only the inset has to be dropped.
 */
function KeyboardFooter({
  children,
  padded,
  background,
}: {
  children: ReactNode;
  padded: boolean;
  background: string;
}) {
  const insets = useSafeAreaInsets();
  const overlap = useSharedValue(0);
  const open = useSharedValue(0);

  useEffect(() => {
    const ease = (ms: number) => ({ duration: ms, easing: easing.out });

    if (Platform.OS === 'ios') {
      const show = Keyboard.addListener('keyboardWillShow', (e) => {
        const ms = e.duration || duration.base;
        overlap.value = withTiming(e.endCoordinates.height, ease(ms));
        open.value = withTiming(1, ease(ms));
      });
      const hide = Keyboard.addListener('keyboardWillHide', (e) => {
        const ms = e.duration || duration.base;
        overlap.value = withTiming(0, ease(ms));
        open.value = withTiming(0, ease(ms));
      });
      return () => {
        show.remove();
        hide.remove();
      };
    }

    const show = Keyboard.addListener('keyboardDidShow', () => {
      open.value = withTiming(1, ease(duration.fast));
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      open.value = withTiming(0, ease(duration.fast));
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [open, overlap]);

  const insetBottom = insets.bottom;
  const animatedStyle = useAnimatedStyle(() => ({
    paddingBottom: overlap.value + FOOTER_GAP + (1 - open.value) * insetBottom,
  }));

  return (
    <Animated.View
      style={[
        { paddingHorizontal: padded ? spacing.lg : 0, backgroundColor: background },
        animatedStyle,
      ]}
    >
      {children}
    </Animated.View>
  );
}

type ScreenProps = {
  children: ReactNode;
  /** Wrap content in a keyboard-aware scroll view. */
  scroll?: boolean;
  /** Keep the keyboard from covering focused inputs. */
  keyboard?: boolean;
  /**
   * Action area pinned below the content that follows the keyboard, so the
   * primary button stays reachable while typing.
   */
  footer?: ReactNode;
  padded?: boolean;
  /** Add bottom padding for the floating tab bar. */
  tabBarPadding?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  tone?: 'light' | 'night';
  topInset?: boolean;
  /**
   * Screen is presented as a modal card: draws the grabber and uses compact top
   * padding, so content isn't pushed down by a second safe-area inset.
   */
  sheet?: boolean;
};

export function Screen({
  children,
  scroll = false,
  keyboard = false,
  footer,
  padded = true,
  tabBarPadding = false,
  style,
  contentStyle,
  tone = 'light',
  topInset = true,
  sheet = false,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const hasFooter = footer != null;

  const padding: ViewStyle = {
    paddingTop: !topInset ? 0 : sheet ? sheetTopPad(insets.top) : insets.top + spacing.sm,
    paddingBottom:
      (tabBarPadding ? TAB_BAR_HEIGHT + 24 : 0) + (hasFooter ? 0 : insets.bottom) + spacing.md,
    paddingHorizontal: padded ? spacing.lg : 0,
  };

  const bg = tone === 'night' ? colors.night : colors.bg;

  const inner = scroll ? (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.grow, padding, contentStyle]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      showsVerticalScrollIndicator={false}
      automaticallyAdjustKeyboardInsets={Platform.OS === 'ios' && !hasFooter}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, padding, contentStyle]}>{children}</View>
  );

  const chrome = sheet ? <ModalGrabber /> : null;

  // The footer replaces the keyboard avoider: its own padding lifts it above the
  // keyboard, and the scrollable content above shrinks with it.
  if (hasFooter) {
    return (
      <View style={[styles.flex, { backgroundColor: bg }, style]}>
        {chrome}
        {inner}
        <KeyboardFooter padded={padded} background={bg}>
          {footer}
        </KeyboardFooter>
      </View>
    );
  }

  // A scrolling screen already gets `automaticallyAdjustKeyboardInsets` on iOS;
  // adding KeyboardAvoidingView on top would count the keyboard height twice.
  const needsAvoider = keyboard && !(scroll && Platform.OS === 'ios');

  const body = needsAvoider ? (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {inner}
    </KeyboardAvoidingView>
  ) : (
    inner
  );

  return (
    <View style={[styles.flex, { backgroundColor: bg }, style]}>
      {chrome}
      {body}
    </View>
  );
}

/** Legacy name — now just a flat warm canvas. */
export function ScreenAtmosphere({ children }: { children?: ReactNode }) {
  return <View style={[styles.flex, { backgroundColor: colors.bg }]}>{children}</View>;
}

/**
 * Full-bleed photo screen: image, dark scrim, content pinned to the bottom.
 * Used for onboarding storytelling and the paywall.
 */
export function PhotoScreen({
  source,
  children,
  header,
  align = 'bottom',
  sheet = false,
}: {
  source: ImageSource | number;
  children: ReactNode;
  header?: ReactNode;
  align?: 'bottom' | 'center';
  /** Compact top chrome when presented as a modal card (e.g. paywall). */
  sheet?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const top = sheet ? sheetTopPad(insets.top) : insets.top + spacing.sm;
  return (
    <View style={[styles.flex, { backgroundColor: colors.night }]}>
      <Image source={source} style={StyleSheet.absoluteFill} contentFit="cover" transition={420} />
      <LinearGradient
        colors={['rgba(12,11,10,0.20)', 'rgba(12,11,10,0.55)', 'rgba(12,11,10,0.95)']}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
      {sheet ? (
        <View style={styles.photoGrabber} pointerEvents="none">
          <ModalGrabber tone="light" />
        </View>
      ) : null}
      {header ? <View style={[styles.photoHeader, { paddingTop: top }]}>{header}</View> : null}
      <View
        style={[
          styles.photoBody,
          align === 'center' && { justifyContent: 'center' },
          { paddingBottom: insets.bottom + spacing.lg, paddingTop: top + 72 },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

/** Compact top bar with a back button and an optional step progress bar. */
export function HeaderBar({
  onBack,
  progress,
  right,
  tone = 'light',
  style,
}: {
  onBack?: () => void;
  progress?: number;
  right?: ReactNode;
  tone?: 'light' | 'dark';
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.headerBar, style]}>
      {onBack ? <BackButton onPress={onBack} tone={tone} /> : <View style={{ width: 42 }} />}
      {progress != null ? (
        <ProgressBar progress={progress} tone={tone === 'dark' ? 'light' : 'dark'} />
      ) : (
        <View style={styles.flex} />
      )}
      {right ?? <View style={{ width: 42 }} />}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  grow: { flexGrow: 1 },
  photoGrabber: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 3,
  },
  photoHeader: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    top: 0,
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  photoBody: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
});
