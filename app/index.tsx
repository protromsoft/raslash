import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useApp } from '@/context/AppContext';
import { colors } from '@/theme/colors';
import { duration, easing } from '@/theme/motion';

const SPLASH_MS = 1250;

function Pulse() {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [progress]);

  const style = useAnimatedStyle(() => ({
    opacity: 0.25 + progress.value * 0.6,
    transform: [{ scaleX: 0.4 + progress.value * 0.6 }],
  }));

  return (
    <View style={styles.track}>
      <Animated.View style={[styles.fill, style]} />
    </View>
  );
}

export default function Index() {
  const { ready, authRequired, session, onboardingComplete } = useApp();
  const [minTimePassed, setMinTimePassed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMinTimePassed(true), SPLASH_MS);
    return () => clearTimeout(timer);
  }, []);

  if (!ready || !minTimePassed) {
    return (
      <View style={styles.screen}>
        <Animated.Text
          entering={FadeInUp.duration(duration.hero).easing(easing.out)}
          style={styles.mark}
        >
          raslash
        </Animated.Text>
        <Animated.Text entering={FadeIn.delay(260).duration(duration.slow)} style={styles.tag}>
          Çalışırken yeni insanlarla tanış
        </Animated.Text>
        <Animated.View entering={FadeIn.delay(420).duration(duration.slow)}>
          <Pulse />
        </Animated.View>
      </View>
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
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 32,
  },
  mark: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 46,
    letterSpacing: -2,
    color: colors.ink,
  },
  tag: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 15,
    color: colors.muted,
    textAlign: 'center',
  },
  track: {
    width: 120,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.track,
    overflow: 'hidden',
    marginTop: 18,
  },
  fill: {
    width: '100%',
    height: '100%',
    borderRadius: 2,
    backgroundColor: colors.ink,
  },
});
