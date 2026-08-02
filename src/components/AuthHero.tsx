import { Image, type ImageSource } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandMark } from '@/components/BrandMark';
import { colors } from '@/theme/colors';
import { duration, easing } from '@/theme/motion';
import { radii, spacing } from '@/theme/spacing';

/** Rounded photo banner with the brand lockup, shared by login and signup. */
export function AuthHero({
  source,
  tagline,
}: {
  source: ImageSource | number;
  tagline: string;
}) {
  const insets = useSafeAreaInsets();
  // Measured per render so the banner is right on every device size.
  const { height, width } = useWindowDimensions();
  const heroHeight = Math.min(height * 0.36, 320);
  const markWidth = Math.min(176, width * 0.48);

  return (
    <View style={[styles.hero, { height: heroHeight + insets.top }]}>
      <Image source={source} style={StyleSheet.absoluteFill} contentFit="cover" transition={400} />
      <LinearGradient
        colors={['rgba(12,11,10,0.25)', 'rgba(12,11,10,0.82)']}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.heroBody, { paddingTop: insets.top + spacing.md }]}>
        <Animated.View entering={FadeInDown.duration(duration.slow).easing(easing.out)}>
          <BrandMark width={markWidth} color={colors.white} />
        </Animated.View>
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
  tagline: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 15,
    lineHeight: 21,
    color: 'rgba(255,255,255,0.78)',
    maxWidth: 280,
  },
});
