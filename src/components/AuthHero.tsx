import { Image, type ImageSource } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/theme/colors';
import { duration, easing } from '@/theme/motion';
import { radii, spacing } from '@/theme/spacing';

const HERO_HEIGHT = Math.min(Dimensions.get('window').height * 0.36, 320);

/** Rounded photo banner with the wordmark, shared by login and signup. */
export function AuthHero({
  source,
  tagline,
}: {
  source: ImageSource | number;
  tagline: string;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.hero, { height: HERO_HEIGHT + insets.top }]}>
      <Image source={source} style={StyleSheet.absoluteFill} contentFit="cover" transition={400} />
      <LinearGradient
        colors={['rgba(12,11,10,0.25)', 'rgba(12,11,10,0.82)']}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.heroBody, { paddingTop: insets.top + spacing.md }]}>
        <Animated.Text
          entering={FadeInDown.duration(duration.slow).easing(easing.out)}
          style={styles.mark}
        >
          raslash
        </Animated.Text>
        <Animated.Text entering={FadeIn.delay(200).duration(duration.slow)} style={styles.tagline}>
          {tagline}
        </Animated.Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    borderBottomLeftRadius: radii.xxl,
    borderBottomRightRadius: radii.xxl,
    overflow: 'hidden',
    backgroundColor: colors.night,
  },
  heroBody: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: spacing.lg,
    gap: 6,
  },
  mark: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 38,
    letterSpacing: -1.6,
    color: colors.white,
  },
  tagline: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 15,
    lineHeight: 21,
    color: 'rgba(255,255,255,0.78)',
    maxWidth: 280,
  },
});
