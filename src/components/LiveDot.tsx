import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { colors } from '@/theme/colors';

type LiveDotProps = {
  size?: number;
  color?: string;
  /** Keep non-live states (such as syncing or error) visually static. */
  pulse?: boolean;
};

/** A fixed-size status dot with a quiet, UI-thread-driven ripple behind it. */
export function LiveDot({ size = 7, color = colors.green, pulse = true }: LiveDotProps) {
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!pulse || reducedMotion) {
      cancelAnimation(progress);
      progress.value = 0;
      return;
    }

    progress.value = withRepeat(
      withTiming(1, { duration: 1900, easing: Easing.out(Easing.cubic) }),
      -1,
      false,
    );

    return () => cancelAnimation(progress);
  }, [progress, pulse, reducedMotion]);

  const rippleStyle = useAnimatedStyle(() => ({
    opacity: 0.38 * (1 - progress.value),
    transform: [{ scale: 1 + progress.value * 2 }],
  }));

  const circle = { width: size, height: size, borderRadius: size / 2, backgroundColor: color };

  return (
    <View style={[styles.container, { width: size, height: size }]} pointerEvents="none" accessible={false}>
      {pulse && !reducedMotion ? (
        <Animated.View style={[styles.ripple, circle, rippleStyle]} />
      ) : null}
      <View style={circle} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center' },
  ripple: { position: 'absolute' },
});
