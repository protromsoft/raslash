import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, FadeIn, ReduceMotion, useAnimatedReaction, useAnimatedStyle, useSharedValue,
  withSpring, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { boundedSheetHeight, sheetSnapStop } from '@/lib/discoveryGestures';
import { haptic } from '@/lib/haptics';
import { spring } from '@/theme/motion';

type SheetPan = ReturnType<typeof Gesture.Pan>;
type Controls = { pan: SheetPan; revealStyle: StyleProp<ViewStyle> };
const settle = { ...spring.sheet, reduceMotion: ReduceMotion.System };

/** The gesture lives ONLY on the handle/header, never on the map or lists. */
export function MapSheet({ height, minimum = height, middle, maximum = height, position, onSnap, onStop, style, testID, children }: {
  height: number; minimum?: number; maximum?: number; position?: SharedValue<number>;
  /** Optional third stop between minimum and maximum. */
  middle?: number;
  onSnap?: (expanded: boolean) => void;
  /** The height the sheet settled on after a drag (one of the stops). */
  onStop?: (height: number) => void;
  style?: StyleProp<ViewStyle>; testID?: string;
  children: (controls: Controls) => ReactNode;
}) {
  const ownPosition = useSharedValue(height);
  const current = position ?? ownPosition;
  const start = useSharedValue(height);
  const dragging = useSharedValue(false);
  const target = useSharedValue(height);
  const snapRef = useRef(onSnap);
  snapRef.current = onSnap;
  const stopRef = useRef(onStop);
  stopRef.current = onStop;
  const hasMiddle = middle != null && middle > minimum + 1 && middle < maximum - 1;
  const mid = hasMiddle ? middle : -1;
  // A mode/size/data change may happen mid-gesture. Invalidate that drag so
  // its eventual release cannot apply old bounds to the new panel.
  // The spring is started on the UI thread when the goal changes: started from
  // a JS effect in the same commit as a content swap (list → place card) it was
  // sometimes dropped, leaving the card stuck at the list height.
  const goal = useSharedValue(boundedSheetHeight(height, minimum, maximum));
  useEffect(() => {
    goal.value = boundedSheetHeight(height, minimum, maximum);
  }, [height, minimum, maximum, goal]);
  useAnimatedReaction(() => goal.value, (next, previous) => {
    // A different panel can mount with the map's shared position still at the
    // previous panel's height. Settle that first frame too; otherwise an empty
    // people panel only resizes after another gesture or a later data change.
    if (next === previous || (previous === null && current.value === next)) return;
    dragging.value = false;
    target.value = next;
    current.value = withSpring(next, settle);
  }, [current, target, dragging]);
  const commit = useCallback((next: number) => {
    if (height !== next) haptic('select');
    snapRef.current?.(next === maximum);
    stopRef.current?.(next);
  }, [height, maximum]);
  const pan = useMemo(() => Gesture.Pan().enabled(maximum - minimum > 1).maxPointers(1)
    .activeOffsetY([-8, 8]).failOffsetX([-18, 18])
    .onStart(() => {
      cancelAnimation(current);
      start.value = current.value;
      dragging.value = true;
    })
    .onUpdate((event) => {
      if (dragging.value) current.value = boundedSheetHeight(start.value - event.translationY, minimum, maximum);
    })
    .onEnd((event, success) => {
      if (!success || !dragging.value) return;
      const stops = mid > 0 ? [minimum, mid, maximum] : [minimum, maximum];
      const next = sheetSnapStop(start.value, current.value, event.translationY, event.velocityY, stops);
      target.value = next;
      current.value = withSpring(next, settle);
      scheduleOnRN(commit, next);
    })
    .onFinalize(() => {
      dragging.value = false;
      // Cancellation/failure settles back without changing navigation/state.
      current.value = withSpring(target.value, settle);
    }), [commit, current, start, target, dragging, minimum, mid, maximum]);
  const animatedStyle = useAnimatedStyle(() => ({ height: current.value }));
  const revealStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.max(0, (current.value - minimum) / Math.max(1, Math.min(70, maximum - minimum)))),
  }));
  return <Animated.View testID={testID} entering={FadeIn.duration(180).reduceMotion(ReduceMotion.System)}
    style={[style, animatedStyle]}>{children({ pan, revealStyle })}</Animated.View>;
}

export function MapSheetHandle({ pan, children }: { pan: SheetPan; children: ReactNode }) {
  return <GestureDetector gesture={pan} touchAction="pan-x">
    <Animated.View collapsable={false}>{children}</Animated.View>
  </GestureDetector>;
}
