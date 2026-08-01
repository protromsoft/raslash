import { useEffect, useState, type ReactNode } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, shadows } from '@/theme/colors';
import { duration, easing, spring } from '@/theme/motion';
import { type as t } from '@/theme/typography';
import { radii, spacing } from '@/theme/spacing';

const DISMISS_DISTANCE = 110;
const DISMISS_VELOCITY = 900;

/**
 * Runs `fn` once the sheet's native `Modal` is off screen. Navigating while a
 * modal is still dismissing makes the next screen fail to present on iOS, so
 * every "close this sheet and go somewhere" action goes through here.
 */
export function afterSheetClose(fn: () => void) {
  setTimeout(fn, duration.base + 60);
}

/**
 * Bottom sheet used for every modal decision in the app.
 *
 * Drag the grabber (or the header) downward to dismiss — the panel tracks the
 * finger and springs shut past a distance / velocity threshold.
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

  /** 0 = closed (fully below the screen), 1 = open. */
  const progress = useSharedValue(0);
  /** Extra downward offset while the user is dragging. */
  const dragY = useSharedValue(0);
  /** Measured panel height so the sheet slides its own distance, not a guess. */
  const panelH = useSharedValue(height * 0.5);
  const measured = useSharedValue(0);

  const dismiss = () => {
    onClose();
  };

  useEffect(() => {
    if (visible) {
      setMounted(true);
      dragY.value = 0;
      progress.value = withTiming(1, { duration: duration.slow, easing: easing.out });
      return;
    }
    progress.value = withTiming(0, { duration: duration.base, easing: easing.in }, (done) => {
      if (done) {
        dragY.value = 0;
        runOnJS(setMounted)(false);
      }
    });
  }, [visible, progress, dragY]);

  /** Content scroll offset — dragging only dismisses from the top of the list. */
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });

  // Lets the pan run alongside the inner list, so a downward drag at the top of
  // the content closes the sheet instead of fighting the scroll view.
  const scrollGesture = Gesture.Native();

  const pan = Gesture.Pan()
    .enabled(dismissable)
    .activeOffsetY(8)
    .failOffsetX([-24, 24])
    .simultaneousWithExternalGesture(scrollGesture)
    .onUpdate((e) => {
      if (scrollY.value > 1) return;
      dragY.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      const shouldClose =
        dragY.value > 0 &&
        (e.translationY > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY);
      if (shouldClose) {
        // Continue from where the finger left off so the exit never jumps: the
        // drag offset folds into `progress`, then `onClose` unmounts.
        const travelled = Math.min(dragY.value / Math.max(panelH.value, 1), 1);
        dragY.value = 0;
        progress.value = 1 - travelled;
        progress.value = withTiming(
          0,
          { duration: duration.base, easing: easing.out },
          (done) => {
            if (done) runOnJS(dismiss)();
          },
        );
      } else {
        dragY.value = withSpring(0, spring.gentle);
      }
    });

  const backdropStyle = useAnimatedStyle(() => {
    const dragFade = Math.max(0, 1 - dragY.value / Math.max(panelH.value, 1));
    return { opacity: progress.value * dragFade };
  });

  const panelStyle = useAnimatedStyle(() => ({
    // Hidden until the first layout lands, otherwise the guessed height would
    // show the panel starting from the wrong offset for a frame.
    opacity: measured.value,
    transform: [{ translateY: (1 - progress.value) * panelH.value + dragY.value }],
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
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]} pointerEvents="box-none">
          <Pressable
            style={styles.backdrop}
            onPress={dismissable ? onClose : undefined}
            accessibilityLabel="Kapat"
          />
        </Animated.View>

        <Animated.View
          style={[styles.wrap, { paddingBottom: bottomPad }, panelStyle]}
          onLayout={(e) => {
            panelH.value = e.nativeEvent.layout.height;
            measured.value = 1;
          }}
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
