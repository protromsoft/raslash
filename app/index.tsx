import { Redirect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  FadeIn,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { Logo, LOGO_INSET, LOGO_LETTERS, LOGO_RATIO, LogoLetter } from '@/components/Logo';
import { useApp } from '@/context/AppContext';
import { colors } from '@/theme/colors';
import { duration, easing } from '@/theme/motion';
import { spacing } from '@/theme/spacing';

/** Big enough to carry the screen, capped so it stays a mark and not a banner. */
const MARK_MAX_WIDTH = 372;

/**
 * The reveal: the six upright letters set themselves left to right, then the
 * skewed `s` — the slash the brand is named for — drops into the gap it left as
 * the closing beat. One motion only, a short fall into place.
 *
 * The sweep is done at 990ms, the slash lands at 1420ms and the tagline is up by
 * 1570ms. The mark then holds, sinks out, and the screen lifts from night to
 * paper before routing — so the cut into the app lands on a matching colour and
 * is never seen.
 */
const SLASH_INDEX = 2;
const LEAD_IN = 120;
const STEP = 90;
const SLASH_DELAY = 1000;
const TAGLINE_DELAY = 1150;

const OUTRO_DELAY = 2020;
const LIFT_DELAY = 2440;
const LIFT_MS = 360;

const SPLASH_MS = LIFT_DELAY + LIFT_MS;

/**
 * How far each letter falls before it settles, in points. The slash falls
 * further, which is what makes the last beat read as an accent. It falls
 * straight down: the letters are still translucent while they travel, so any
 * sideways drift smears the glyph across the neighbour already standing there.
 */
const FALL = 14;
const SLASH_FALL = 24;

function letterDelay(index: number) {
  if (index === SLASH_INDEX) return SLASH_DELAY;
  const position = index < SLASH_INDEX ? index : index - 1;
  return LEAD_IN + position * STEP;
}

/**
 * The letters are moved by a plain `Animated.View` wrapping a one-glyph `<Svg>`
 * rather than by animated SVG props: every letter is drawn on the full artwork
 * canvas, so stacking the seven reproduces the mark, and the motion stays on
 * view transforms that Reanimated drives natively on the New Architecture.
 */
function Letter({ index, width }: { index: number; width: number }) {
  const progress = useSharedValue(0);
  const isSlash = index === SLASH_INDEX;

  useEffect(() => {
    progress.value = withDelay(
      letterDelay(index),
      withTiming(1, { duration: duration.slow, easing: easing.out }),
    );
  }, [index, progress]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (isSlash ? -SLASH_FALL : -FALL) * (1 - progress.value) }],
  }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      <LogoLetter index={index} width={width} color={colors.white} />
    </Animated.View>
  );
}

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
  // Captured at mount: the reveal belongs to the first launch. A later pass
  // through here — a fresh sign-in still syncing — can be over in a frame or
  // two, and starting a reveal it has no time to finish would only flicker.
  const [revealing] = useState(!splashShown);
  // The status bar rides the background: light while the screen is night, dark
  // again as it lifts to paper, so it is never invisible against either.
  const [onDark, setOnDark] = useState(!splashShown);

  const outro = useSharedValue(1);
  const lift = useSharedValue(revealing ? 0 : 1);

  useEffect(() => {
    if (splashShown) return;
    const toPaper = setTimeout(() => setOnDark(false), LIFT_DELAY);
    const timer = setTimeout(() => {
      splashShown = true;
      setMinTimePassed(true);
    }, SPLASH_MS);
    return () => {
      clearTimeout(toPaper);
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!revealing) return;
    outro.value = withDelay(
      OUTRO_DELAY,
      withTiming(0, { duration: duration.slow, easing: easing.in }),
    );
    lift.value = withDelay(LIFT_DELAY, withTiming(1, { duration: LIFT_MS, easing: easing.inOut }));
  }, [revealing, outro, lift]);

  const screenStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(lift.value, [0, 1], [colors.night, colors.bg]),
  }));

  const contentStyle = useAnimatedStyle(() => ({ opacity: outro.value }));

  // `syncing` matters after a fresh sign-in: the session is already there but
  // the profile that says whether onboarding is done is still on its way, and
  // routing on the stale flag drops a returning member back into onboarding.
  if (!ready || !minTimePassed || (session && syncing)) {
    const markWidth = Math.min(width - spacing.xl * 2, MARK_MAX_WIDTH);
    const markHeight = markWidth * LOGO_RATIO;

    return (
      <Animated.View style={[styles.screen, screenStyle]}>
        <StatusBar style={onDark ? 'light' : 'dark'} />

        <Animated.View style={[styles.stack, contentStyle]}>
          {/* The canvas is mostly air, so its padding is pulled back off the
              layout and the tagline spaces against the letterforms instead. */}
          <View
            style={[
              styles.mark,
              {
                width: markWidth,
                height: markHeight,
                marginTop: -markHeight * LOGO_INSET.top,
                marginBottom: -markHeight * LOGO_INSET.bottom,
              },
            ]}
            accessible
            accessibilityRole="image"
            accessibilityLabel="raslash"
          >
            {revealing ? (
              LOGO_LETTERS.map((letter, index) => (
                <Letter key={letter.key} index={index} width={markWidth} />
              ))
            ) : (
              <Logo width={markWidth} />
            )}
          </View>

          <Animated.Text
            entering={FadeIn.delay(revealing ? TAGLINE_DELAY : 0).duration(duration.slow)}
            style={[styles.tag, revealing && styles.tagOnNight]}
          >
            Çalışırken yeni insanlarla tanış
          </Animated.Text>
        </Animated.View>
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
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  stack: {
    alignItems: 'center',
    gap: spacing.lg,
  },
  mark: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tag: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 15,
    color: colors.muted,
    textAlign: 'center',
  },
  tagOnNight: { color: colors.mutedSoft },
});
