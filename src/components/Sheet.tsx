import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, shadows } from '@/theme/colors';
import { duration, easing, spring } from '@/theme/motion';
import { type as t } from '@/theme/typography';
import { radii, spacing } from '@/theme/spacing';

const DISMISS_DISTANCE = 96;
const DISMISS_VELOCITY = 800;

/** Slide timings — every other sheet delay is derived from these two. */
const ENTER_MS = duration.slow;
const EXIT_MS = duration.base;
/** Floor for a drag-out, so releasing near the bottom doesn't look like a cut. */
const MIN_EXIT_MS = 130;
/** React commit + native Modal teardown once the slide-out has finished. */
const UNMOUNT_GRACE = 80;
/** Extra travel so the panel's drop shadow clears the bottom edge too. */
const SHADOW_CLEARANCE = 32;

/**
 * Runs `fn` once the sheet's native `Modal` is off screen. Navigating while a
 * modal is still dismissing makes the next screen fail to present on iOS, so
 * every "close this sheet and go somewhere" action goes through here.
 *
 * The delay tracks `EXIT_MS` above; a drag-out is always shorter than that, so
 * this stays correct for both ways of closing.
 */
export function afterSheetClose(fn: () => void) {
  setTimeout(fn, EXIT_MS + UNMOUNT_GRACE);
}

/**
 * Modal-safe replacement for `Appear`. Reanimated's `entering`/`exiting` layout
 * animations freeze (and on Android sometimes crash) inside a native `Modal`,
 * so sheet content animates itself from a shared value instead.
 */
export function SheetAppear({
  children,
  delay = 0,
  distance = 12,
  style,
}: {
  children: ReactNode;
  delay?: number;
  distance?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const shown = useSharedValue(0);

  useEffect(() => {
    shown.value = withDelay(
      delay,
      withTiming(1, { duration: duration.base, easing: easing.out }),
    );
  }, [delay, shown]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ translateY: (1 - shown.value) * distance }],
  }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}

/**
 * Bottom sheet used for every modal decision in the app.
 *
 * Drag the grabber (or the header) downward to dismiss — the panel tracks the
 * finger and slides shut past a distance / velocity threshold.
 */
export function Sheet({
  visible,
  onClose,
  children,
  title,
  subtitle,
  dismissable = true,
  scroll = true,
  contentStyle,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  subtitle?: string;
  dismissable?: boolean;
  /** Let long content scroll instead of growing past the screen. */
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);

  /** How far below its resting place the panel sits, in px. 0 = fully open. */
  const offset = useSharedValue(height);
  /** Measured panel height; the slide distance and backdrop fade derive from it. */
  const panelH = useSharedValue(height);
  /** 0 until the first layout lands, so nothing paints at a guessed offset. */
  const measured = useSharedValue(0);
  /** Panel offset the current drag started from. */
  const dragFrom = useSharedValue(0);
  /** Content scroll offset — dragging only dismisses from the top of the list. */
  const scrollY = useSharedValue(0);

  /** Whether `panelH` currently holds a real measurement. */
  const laidOut = useRef(false);
  /** Whether the entrance already started for the current open cycle. */
  const entered = useRef(false);
  /** A drag already ran the slide-out, so the close effect only has to unmount. */
  const draggedShut = useRef(false);

  // Both the visibility effect and the first `onLayout` can be the one that gets
  // to start the entrance, and their order is not guaranteed — whoever is second
  // must not restart the slide.
  const slideIn = useCallback(() => {
    if (entered.current) return;
    entered.current = true;
    offset.value = withTiming(0, { duration: ENTER_MS, easing: easing.out });
  }, [offset]);

  const unmount = useCallback(() => {
    laidOut.current = false;
    measured.value = 0;
    // The ScrollView is recreated on the next open; a stale offset here would
    // make drag-to-dismiss silently refuse to start.
    scrollY.value = 0;
    setMounted(false);
  }, [measured, scrollY]);

  const finishDrag = useCallback(() => {
    draggedShut.current = true;
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (visible) {
      draggedShut.current = false;
      setMounted(true);
      // First open: `onLayout` starts the slide once the real height is known.
      // Re-opening before the previous exit unmounted: the height still holds.
      if (laidOut.current) slideIn();
      return;
    }
    entered.current = false;
    if (!mounted) return;
    if (draggedShut.current) {
      draggedShut.current = false;
      unmount();
      return;
    }
    offset.value = withTiming(
      panelH.value + SHADOW_CLEARANCE,
      { duration: EXIT_MS, easing: easing.in },
      (done) => {
        if (done) runOnJS(unmount)();
      },
    );
  }, [visible, mounted, slideIn, unmount, offset, panelH]);

  const onPanelLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h <= 0) return;
    panelH.value = h;
    if (laidOut.current) return;
    laidOut.current = true;
    if (!visible || entered.current) return;
    // Park the panel exactly one panel-height below the fold and only then
    // reveal it, so the entrance never starts from a guessed offset.
    offset.value = h + SHADOW_CLEARANCE;
    measured.value = 1;
    slideIn();
  };

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });

  // Lets the pan run alongside the inner list, so a downward drag at the top of
  // the content closes the sheet instead of fighting the scroll view.
  const scrollGesture = Gesture.Native();

  let pan = Gesture.Pan()
    .enabled(dismissable)
    .activeOffsetY(10)
    .failOffsetY(-12)
    .failOffsetX([-24, 24])
    .onStart((e) => {
      // Discount the slop the finger already covered, so the panel doesn't jump
      // by the activation threshold the moment the gesture takes over.
      dragFrom.value = offset.value - e.translationY;
    })
    .onUpdate((e) => {
      if (scrollY.value > 1) {
        // The list is scrolled, so the panel stays put — but keep re-anchoring,
        // otherwise scrolling back to the top mid-gesture would snap it down by
        // the whole accumulated translation.
        dragFrom.value = -e.translationY;
        return;
      }
      // One panel-height down the sheet has already cleared the screen, and
      // tracking the finger past that only buys a blank screen that takes the
      // same distance to drag back. Re-anchoring at the limit rather than
      // clamping keeps an upward drag answering on the very next frame.
      const travel = Math.max(panelH.value, 1) + SHADOW_CLEARANCE;
      const next = dragFrom.value + e.translationY;
      if (next > travel) {
        dragFrom.value = travel - e.translationY;
        offset.value = travel;
        return;
      }
      offset.value = Math.max(0, next);
    })
    .onEnd((e) => {
      const travel = Math.max(panelH.value, 1) + SHADOW_CLEARANCE;
      const at = offset.value;
      if (at > 0 && (at > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY)) {
        // Time the rest of the trip by what is left of it, so a release near the
        // bottom finishes quickly instead of crawling for a fixed 260ms.
        const remaining = Math.min(Math.max((travel - at) / travel, 0), 1);
        offset.value = withTiming(
          travel,
          {
            duration: Math.max(MIN_EXIT_MS, Math.round(EXIT_MS * remaining)),
            easing: easing.out,
          },
          (done) => {
            if (done) runOnJS(finishDrag)();
          },
        );
        return;
      }
      offset.value = withSpring(0, spring.gentle);
    })
    .onFinalize((_e, success) => {
      // A cancelled gesture never reaches `onEnd`; without this the panel would
      // stay parked halfway down.
      if (!success && offset.value > 0) offset.value = withSpring(0, spring.gentle);
    });

  if (scroll) pan = pan.simultaneousWithExternalGesture(scrollGesture);

  const backdropStyle = useAnimatedStyle(() => {
    const k = Math.min(Math.max(offset.value / Math.max(panelH.value, 1), 0), 1);
    return { opacity: measured.value * (1 - k) };
  });

  const panelStyle = useAnimatedStyle(() => ({
    // Hidden until the first layout lands, otherwise the guessed height would
    // show the panel starting from the wrong offset for a frame.
    opacity: measured.value,
    transform: [{ translateY: offset.value }],
  }));

  if (!mounted) return null;

  const bottomPad = Math.max(insets.bottom, spacing.md);
  const maxHeight = height - insets.top - bottomPad - spacing.lg;

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      {/* While closing, nothing here should still swallow taps — otherwise a
          quick close/reopen leaves an invisible overlay eating the next touch. */}
      <View style={styles.root} pointerEvents={visible ? 'box-none' : 'none'}>
        <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]} pointerEvents="box-none">
          <Pressable
            style={styles.backdrop}
            onPress={dismissable ? onClose : undefined}
            accessibilityRole="button"
            accessibilityLabel="Kapat"
          />
        </Animated.View>

        <Animated.View
          style={[styles.wrap, { paddingBottom: bottomPad }, panelStyle]}
          onLayout={onPanelLayout}
        >
          <GestureDetector gesture={pan}>
            <View style={[styles.sheet, { maxHeight }, contentStyle]}>
              <View
                style={styles.header}
                accessibilityRole="adjustable"
                accessibilityLabel="Aşağı çekerek kapat"
              >
                <View style={styles.handle} />
                {title ? <Text style={[t.h2, styles.title]}>{title}</Text> : null}
                {subtitle ? <Text style={[t.body, styles.subtitle]}>{subtitle}</Text> : null}
              </View>

              {scroll ? (
                <GestureDetector gesture={scrollGesture}>
                  <Animated.ScrollView
                    style={styles.scroll}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    onScroll={onScroll}
                    scrollEventThrottle={16}
                    bounces={false}
                  >
                    {children}
                  </Animated.ScrollView>
                </GestureDetector>
              ) : (
                children
              )}
            </View>
          </GestureDetector>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(12,11,10,0.45)',
  },
  wrap: {
    paddingHorizontal: spacing.sm,
  },
  sheet: {
    backgroundColor: colors.bg,
    borderRadius: radii.xxl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
    ...shadows.lifted,
  },
  header: {
    alignItems: 'stretch',
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    gap: spacing.sm,
  },
  scroll: {
    flexShrink: 1,
  },
  scrollContent: {
    gap: spacing.sm,
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.mutedSoft,
    marginBottom: 2,
  },
  title: {
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
});
