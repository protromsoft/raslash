import { Redirect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { Propeller } from '@/components/Propeller';
import { useApp } from '@/context/AppContext';
import { colors } from '@/theme/colors';
import { easing } from '@/theme/motion';

/** Matches the propeller artboard (`#EFEDEA`) so native → JS handover is seamless. */
const SPLASH_BG = '#EFEDEA';

/**
 * Spin then coast: ~3.25 turns, hard decelerate into a stop, then the whole
 * screen fades out before routing. Timing is shared with `SPLASH_MS` so the
 * fade always finishes before we leave `/`.
 */
const SPIN_TURNS = 3.25;
const SPIN_MS = 2200;
/** Starts a touch before the spin ends so the fade and last degrees overlap. */
const FADE_DELAY = 1950;
const FADE_MS = 420;
const SPLASH_MS = FADE_DELAY + FADE_MS;

/** Fast at first, long soft landing — reads as a blade winding down. */
const spinEasing = Easing.bezier(0.08, 0.82, 0.12, 1);

/**
 * The branded splash is a first-launch moment, not a loading spinner. `/` is
 * also the landing spot after signing in, and replaying the animation there
 * would just stall someone who already knows the app.
 */
let splashShown = false;

export default function Index() {
  const { ready, syncing, authRequired, session, onboardingComplete } = useApp();
  const { width } = useWindowDimensions();
  const [minTimePassed, setMinTimePassed] = useState(splashShown);
  const [revealing] = useState(!splashShown);

  const rotation = useSharedValue(0);
  const fade = useSharedValue(1);

  useEffect(() => {
    if (splashShown) return;
    const timer = setTimeout(() => {
      splashShown = true;
      setMinTimePassed(true);
    }, SPLASH_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!revealing) return;
    rotation.value = withTiming(360 * SPIN_TURNS, {
      duration: SPIN_MS,
      easing: spinEasing,
    });
    fade.value = withDelay(
      FADE_DELAY,
      withTiming(0, { duration: FADE_MS, easing: easing.in }),
    );
  }, [revealing, rotation, fade]);

  const screenStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
  }));

  const bladeStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  // `syncing` matters after a fresh sign-in: the session is already there but
  // the profile that says whether onboarding is done is still on its way, and
  // routing on the stale flag drops a returning member back into onboarding.
  if (!ready || !minTimePassed || (session && syncing)) {
    const size = Math.min(width * 0.42, 180);

    return (
      <Animated.View style={[styles.screen, revealing ? screenStyle : null]}>
        <StatusBar style="dark" />
        {revealing ? (
          <Animated.View style={bladeStyle}>
            <Propeller size={size} />
          </Animated.View>
        ) : (
          <Propeller size={size} />
        )}
      </Animated.View>
    );
  }

  if (authRequired && !session) {
    return <Redirect href="/auth/login" />;
  }

  if (!onboardingComplete) {
    return <Redirect href="/onboarding" />;
  }

  return <Redirect href="/(tabs)" />;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: SPLASH_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
