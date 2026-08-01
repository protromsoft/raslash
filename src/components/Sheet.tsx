import { useEffect, useState, type ReactNode } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, shadows } from '@/theme/colors';
import { duration, easing } from '@/theme/motion';
import { type as t } from '@/theme/typography';
import { radii, spacing } from '@/theme/spacing';

/**
 * Bottom sheet used for every modal decision in the app.
 *
 * Motion is driven by a shared value rather than SlideInDown/SlideOutDown:
 * layout animations measure against the root window, which is the wrong frame
 * inside a native Modal and left the panel hanging past the bottom edge.
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
  const progress = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      progress.value = withTiming(1, { duration: duration.base, easing: easing.out });
      return;
    }
    progress.value = withTiming(0, { duration: duration.fast, easing: easing.inOut }, (done) => {
      if (done) runOnJS(setMounted)(false);
    });
  }, [visible, progress]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const panelStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 40 }],
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

        <Animated.View style={[styles.wrap, { paddingBottom: bottomPad }, panelStyle]}>
          <View style={[styles.sheet, { maxHeight }, contentStyle]}>
            <View style={styles.handle} />
            {title ? <Text style={[t.h2, styles.title]}>{title}</Text> : null}
            {subtitle ? <Text style={[t.body, styles.subtitle]}>{subtitle}</Text> : null}
            {scroll ? (
              <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                bounces={false}
              >
                {children}
              </ScrollView>
            ) : (
              children
            )}
          </View>
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
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
    ...shadows.lifted,
  },
  // Without flexShrink the scroll view keeps its full content height and the
  // sheet's maxHeight would clip the last rows instead of scrolling them.
  scroll: {
    flexShrink: 1,
  },
  scrollContent: {
    gap: spacing.sm,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.track,
    marginBottom: spacing.sm,
  },
  title: {
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
});
