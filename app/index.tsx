import { Redirect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Propeller } from '@/components/Propeller';
import { useApp } from '@/context/AppContext';
import { recordStartupStage } from '@/lib/sentry';
import { startupDestination } from '@/lib/startup';
import { easing } from '@/theme/motion';

/** Matches the propeller artboard (`#EFEDEA`) so native → JS handover is seamless. */
const SPLASH_BG = '#EFEDEA';

/**
 * Spin then coast: ~3.25 turns, hard decelerate into a stop, then the whole
 * screen fades only after the next route is ready. Network/store delays must
 * not make the logo disappear and leave the user staring at a blank screen.
 */
const SPIN_TURNS = 3.25;
const SPIN_MS = 2200;
const FADE_MS = 420;

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
  const [fadeComplete, setFadeComplete] = useState(splashShown);
  const destination = startupDestination({
    ready, syncing, hasSession: Boolean(session), authRequired, onboardingComplete,
  });
  const canLeave = minTimePassed && destination !== null;

  const rotation = useSharedValue(0);
  const fade = useSharedValue(1);

  useEffect(() => {
    if (splashShown) return;
    const timer = setTimeout(() => {
      splashShown = true;
      setMinTimePassed(true);
    }, SPIN_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!revealing) return;
    rotation.value = withTiming(360 * SPIN_TURNS, {
      duration: SPIN_MS,
      easing: spinEasing,
    });
    return () => cancelAnimation(rotation);
  }, [revealing, rotation]);

  useEffect(() => {
    if (!canLeave || fadeComplete) return;
    fade.value = withTiming(0, { duration: FADE_MS, easing: easing.in });
    const timer = setTimeout(() => setFadeComplete(true), FADE_MS);
    return () => {
      clearTimeout(timer);
      cancelAnimation(fade);
      fade.value = 1;
    };
  }, [canLeave, fadeComplete, fade]);

  useEffect(() => {
    if (!canLeave || !fadeComplete || !destination) return;
    recordStartupStage(destination === '/auth/login'
      ? 'routing_login'
      : destination === '/onboarding' ? 'routing_onboarding' : 'routing_main');
  }, [canLeave, fadeComplete, destination]);

  const screenStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
  }));

  const bladeStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  // `syncing` matters after a fresh sign-in: the session is already there but
  // the profile that says whether onboarding is done is still on its way, and
  // routing on the stale flag drops a returning member back into onboarding.
  if (!canLeave || !fadeComplete || !destination) {
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

  return <Redirect href={destination} />;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: SPLASH_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
