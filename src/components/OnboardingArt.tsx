import LottieView from 'lottie-react-native';
import { useEffect, useRef, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';

/**
 * Onboarding illustrations: line-art Lottie animations by Olena Tieriekhova
 * (LottieFiles, Lottie Simple License), recoloured to the app's ink and green.
 */
export const ONBOARDING_ART = {
  /** A man with glasses at his laptop, a colleague explaining. */
  meet: require('../../assets/lottie/office-work.json'),
  /** Working on a laptop with a coffee, a cat on the desk. */
  spots: require('../../assets/lottie/work-from-home.json'),
  /** Waving hello, tablet in hand. */
  hello: require('../../assets/lottie/hello.json'),
  /** Ticking off a checklist with a giant pencil. */
  plan: require('../../assets/lottie/get-things-done.json'),
  /** Walking somewhere. */
  walk: require('../../assets/lottie/walking-woman.json'),
} as const;

export type OnboardingArtName = keyof typeof ONBOARDING_ART;

/**
 * One looping illustration; still (first frame) when Reduce Motion is on or
 * while `paused` (a carousel page that is off screen).
 */
export function OnboardingArt({ name, paused = false, style }: {
  name: OnboardingArtName;
  paused?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const reducedMotion = useReducedMotion();
  const ref = useRef<LottieView>(null);
  const still = paused || reducedMotion;
  useEffect(() => {
    if (still) ref.current?.pause();
    else ref.current?.resume();
  }, [still]);
  return (
    <LottieView
      ref={ref}
      source={ONBOARDING_ART[name]}
      autoPlay={!still}
      loop
      resizeMode="contain"
      style={[styles.art, style]}
    />
  );
}

/**
 * The illustrated counterpart of `PhotoScreen`: cream background, the
 * animation filling the space under the header, copy and actions at the bottom.
 */
export function ArtScreen({ art, header, children }: {
  art: OnboardingArtName;
  header?: ReactNode;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.lg }]}>
      {header ? <View style={styles.header}>{header}</View> : null}
      <View style={styles.stage} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <OnboardingArt name={art} />
      </View>
      <View style={styles.body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: spacing.lg, flexDirection: 'row' },
  stage: { flex: 1, minHeight: 160, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, justifyContent: 'center' },
  art: { width: '100%', height: '100%' },
  body: { paddingHorizontal: spacing.lg, gap: spacing.lg },
});
