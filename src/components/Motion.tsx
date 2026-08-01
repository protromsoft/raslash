import { useEffect, type ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { duration, easing, spring } from '@/theme/motion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type PressableScaleProps = PressableProps & {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** How far the element shrinks while pressed. */
  scaleTo?: number;
  dimTo?: number;
};

/** Pressable with a spring press-in scale, used for every tappable surface. */
export function PressableScale({
  children,
  style,
  scaleTo = 0.97,
  dimTo = 0.92,
  disabled,
  ...rest
}: PressableScaleProps) {
  const pressed = useSharedValue(0);

  // Opacity is driven only from here: mixing an animated and a static value for
  // the same property lets a UI-thread update wipe out the disabled dimming.
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * (1 - scaleTo) }],
    opacity: (disabled ? 0.4 : 1) - pressed.value * (1 - dimTo),
  }));

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={(e) => {
        pressed.value = withSpring(1, spring.press);
        rest.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        pressed.value = withSpring(0, spring.press);
        rest.onPressOut?.(e);
      }}
      style={[style, animatedStyle]}
    >
      {children}
    </AnimatedPressable>
  );
}

/** Fades + lifts content in on mount. */
export function Appear({
  children,
  delay = 0,
  distance = 14,
  style,
}: {
  children: ReactNode;
  delay?: number;
  distance?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Animated.View
      style={style}
      entering={FadeInDown.delay(delay)
        .duration(duration.slow)
        .easing(easing.out)
        .withInitialValues({ transform: [{ translateY: distance }] })}
    >
      {children}
    </Animated.View>
  );
}

/** Plain cross-fade, for content that shouldn't move. */
export function FadeInView({
  children,
  delay = 0,
  style,
}: {
  children: ReactNode;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Animated.View style={style} entering={FadeIn.delay(delay).duration(duration.base)}>
      {children}
    </Animated.View>
  );
}

/** Animates a 0..1 value into a width percentage (progress bars). */
export function useProgressStyle(progress: number) {
  const target = Math.min(Math.max(progress, 0), 1);
  const value = useSharedValue(target);

  useEffect(() => {
    value.value = withTiming(target, { duration: duration.slow, easing: easing.out });
  }, [target, value]);

  return useAnimatedStyle(() => ({ width: `${value.value * 100}%` }));
}

export { Animated };
