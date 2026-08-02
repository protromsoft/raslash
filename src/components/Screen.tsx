import { LinearGradient } from 'expo-linear-gradient';
import { Image, type ImageSource } from 'expo-image';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
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

/** Breathing room kept between a focused input and the top of the footer. */
const REVEAL_GAP = spacing.sm;

/**
 * How far the bottom of the screen has to be pushed up to clear the keyboard,
 * animated in step with it.
 *
 * iOS measures the keyboard from the bottom of the screen, so its height
 * already swallows the home indicator and the safe-area inset drops out. On
 * Android the app runs edge-to-edge (unavoidable from SDK 54 on), so the window
 * is never resized for us and the reported height stops at the navigation bar —
 * that inset has to stay on top of it.
 *
 * The starting value is read from `Keyboard.metrics()` instead of assuming a
 * closed keyboard: moving between two auto-focusing steps keeps the keyboard up
 * the whole time, and no show event is fired for the screen that mounts into it.
 */
function useKeyboardLift(resting: number, onShow?: (target: number, from: number) => void) {
  const raise = Platform.OS === 'ios' ? 0 : resting;
  const restingLift = () => {
    const metrics = Keyboard.metrics();
    return Keyboard.isVisible() && metrics ? metrics.height + raise : resting;
  };

  const [seed] = useState(restingLift);
  const lift = useSharedValue(seed);

  const showRef = useRef(onShow);
  showRef.current = onShow;

  useEffect(() => {
    const ease = (ms?: number) => ({ duration: ms || duration.base, easing: easing.out });
    const ios = Platform.OS === 'ios';

    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', (e) => {
      const from = lift.value;
      const to = e.endCoordinates.height + raise;
      lift.value = withTiming(to, ease(e.duration));
      showRef.current?.(to, from);
    });
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', (e) => {
      lift.value = withTiming(resting, ease(e.duration));
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [lift, raise, resting]);

  // A late safe-area measurement — or Android handing the navigation bar inset
  // back after the keyboard closes — must not leave the footer misplaced.
  useEffect(() => {
    if (Keyboard.isVisible()) return;
    lift.value = withTiming(resting, { duration: duration.fast, easing: easing.out });
  }, [lift, resting]);

  return lift;
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

  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(0);

  /**
   * The footer shrinks the scroll view instead of overlaying it, so the input
   * the user just tapped can end up below the fold. Nothing in React Native
   * scrolls it back into view once `automaticallyAdjustKeyboardInsets` is off,
   * so measure it against the viewport the footer is about to leave behind.
   */
  const revealFocusedInput = useCallback((liftTarget: number, liftNow: number) => {
    const list = scrollRef.current;
    const input = TextInput.State.currentlyFocusedInput();
    const viewport = list?.getNativeScrollRef();
    if (!list || !input || !viewport) return;

    const pending = Math.max(0, liftTarget - liftNow);
    requestAnimationFrame(() => {
      viewport.measureInWindow((_x, viewportY, _width, viewportHeight) => {
        input.measureInWindow((_inputX, inputY, _inputWidth, inputHeight) => {
          const visibleBottom = viewportY + viewportHeight - pending;
          const overflow = inputY + inputHeight + REVEAL_GAP - visibleBottom;
          if (overflow > 1) {
            list.scrollTo({ y: scrollY.current + overflow, animated: true });
          }
        });
      });
    });
  }, []);

  const lift = useKeyboardLift(
    insets.bottom,
    hasFooter && scroll ? revealFocusedInput : undefined,
  );

  const footerStyle = useAnimatedStyle(() => ({ paddingBottom: lift.value + FOOTER_GAP }));
  // Android never resizes the window, so a scrolling screen without a footer
  // needs the keyboard's height added to the end of its content instead.
  const spacerStyle = useAnimatedStyle(() => ({
    height: Math.max(0, lift.value - insets.bottom),
  }));

  const padding: ViewStyle = {
    paddingTop: !topInset ? 0 : sheet ? sheetTopPad(insets.top) : insets.top + spacing.sm,
    paddingBottom:
      (tabBarPadding ? TAB_BAR_HEIGHT + 24 : 0) + (hasFooter ? 0 : insets.bottom) + spacing.md,
    paddingHorizontal: padded ? spacing.lg : 0,
  };

  const bg = tone === 'night' ? colors.night : colors.bg;
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollY.current = e.nativeEvent.contentOffset.y;
  };

  const inner = scroll ? (
    <ScrollView
      ref={scrollRef}
      style={styles.flex}
      contentContainerStyle={[styles.grow, padding, contentStyle]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      showsVerticalScrollIndicator={false}
      automaticallyAdjustKeyboardInsets={Platform.OS === 'ios' && !hasFooter}
      onScroll={hasFooter ? onScroll : undefined}
      scrollEventThrottle={16}
    >
      {children}
      {!hasFooter && keyboard && Platform.OS === 'android' ? (
        <Animated.View style={spacerStyle} />
      ) : null}
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
        <Animated.View
          style={[
            { paddingHorizontal: padded ? spacing.lg : 0, backgroundColor: bg },
            footerStyle,
          ]}
        >
          {footer}
        </Animated.View>
      </View>
    );
  }

  // A scrolling screen already gets `automaticallyAdjustKeyboardInsets` on iOS;
  // adding KeyboardAvoidingView on top would count the keyboard height twice.
  const needsAvoider = keyboard && Platform.OS === 'ios' && !scroll;

  const body = needsAvoider ? (
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
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
