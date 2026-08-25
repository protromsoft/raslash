import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Linking,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, {
  Extrapolation,
  FadeIn,
  FadeInDown,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandMark } from '@/components/BrandMark';
import { Button } from '@/components/ui';
import { PRIVACY_POLICY_URL, TERMS_OF_USE_URL } from '@/lib/legal';
import { colors } from '@/theme/colors';
import { duration, easing } from '@/theme/motion';
import { spacing } from '@/theme/spacing';

const slides = [
  {
    key: 'meet',
    image: require('../../assets/photos/meet.jpg'),
    title: 'Çalışırken yeni\ninsanlarla tanış',
    body: 'Aynı mekanda çalışan insanları gör, sohbete katıl, işini yaparken çevreni büyüt.',
  },
  {
    key: 'spots',
    image: require('../../assets/photos/spots.jpg'),
    title: 'Çalışmaya uygun\nmekanları bul',
    body: 'İnternet hızı, priz sayısı ve mekan rahatlığı gibi durumları gerçek kullanıcılardan öğren!',
  },
  {
    key: 'chat',
    image: require('../../assets/photos/chat.jpg'),
    title: 'Check‑in yap,\nsohbet açılsın',
    body: 'Mekanlarda check-in yap, sohbete katıl ve mekanın müdavimliği için yarış!',
  },
];

const DOT_SIZE = 7;
const DOT_ACTIVE_WIDTH = 24;

/** One pager dot, widening as its page comes under the finger. */
function Dot({ at, offset, width }: { at: number; offset: SharedValue<number>; width: number }) {
  const style = useAnimatedStyle(() => {
    const page = offset.value / width;
    const range = [at - 1, at, at + 1];
    return {
      width: interpolate(
        page,
        range,
        [DOT_SIZE, DOT_ACTIVE_WIDTH, DOT_SIZE],
        Extrapolation.CLAMP,
      ),
      opacity: interpolate(page, range, [0.32, 1, 0.32], Extrapolation.CLAMP),
    };
  });

  return <Animated.View style={[styles.dot, style]} />;
}

export default function OnboardingWelcome() {
  const insets = useSafeAreaInsets();
  // Read per render rather than at import time, so a rotation or a foldable
  // unfolding can't leave the pages measured against a stale width.
  const { width, fontScale } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList>(null);

  // The dots follow the finger off a shared value rather than state: it keeps
  // them moving without a React render per scroll frame, and it keeps the
  // scroll position away from `index` entirely — see `settle`.
  const offset = useSharedValue(0);

  // Display type keeps its own line height, which the OS does not scale for us.
  const typeScale = Math.min(fontScale, 1.25);
  const logoWidth = Math.min(188, width * 0.52);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    offset.value = e.nativeEvent.contentOffset.x;
  };

  /**
   * The copy replays its entrance every time `index` changes, so `index` may
   * only change once per slide — and only once the page has come to rest.
   * Reading it out of every scroll frame instead would knock it back to the
   * page a programmatic scroll started from (that offset is still reported for
   * the first frames of the animation) and play the entrance two or three
   * times over.
   */
  const settle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const page = Math.round(e.nativeEvent.contentOffset.x / width);
    if (page >= 0 && page < slides.length) setIndex(page);
  };

  const isLast = index === slides.length - 1;

  const goNext = () => {
    if (isLast) {
      router.push('/onboarding/name');
      return;
    }
    listRef.current?.scrollToOffset({ offset: (index + 1) * width, animated: true });
    setIndex(index + 1);
  };

  // Opening the carousel is the app's first moment and earns the full lift.
  // Changing slides is already a horizontal motion, and a vertical one layered
  // on top of it is what reads as a stutter, so later slides only cross-fade.
  const opened = useRef(false);
  useEffect(() => {
    opened.current = true;
  }, []);
  const copyEnters = opened.current
    ? FadeIn.duration(duration.base)
    : FadeInDown.duration(duration.slow).easing(easing.out);

  return (
    <View style={styles.screen}>
      <FlatList
        ref={listRef}
        data={slides}
        keyExtractor={(item) => item.key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        // Keeps the dots moving with the finger instead of snapping at the end.
        onScroll={onScroll}
        onMomentumScrollEnd={settle}
        scrollEventThrottle={16}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width }]}>
            <Image
              source={item.image}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              accessibilityIgnoresInvertColors
            />
            <LinearGradient
              colors={['rgba(12,11,10,0.15)', 'rgba(12,11,10,0.62)', 'rgba(12,11,10,0.96)']}
              locations={[0, 0.5, 1]}
              style={StyleSheet.absoluteFill}
            />
          </View>
        )}
      />

      <LinearGradient
        colors={['rgba(12,11,10,0.55)', 'rgba(12,11,10,0)']}
        style={[styles.topScrim, { height: insets.top + 140 }]}
        pointerEvents="none"
      />

      <Animated.View
        entering={FadeIn.duration(duration.slow)}
        pointerEvents="none"
        style={[styles.logoWrap, { top: insets.top + spacing.sm }]}
      >
        <BrandMark width={logoWidth} color={colors.white} />
      </Animated.View>

      <View
        pointerEvents="box-none"
        style={[styles.overlay, { paddingBottom: insets.bottom + spacing.lg }]}
      >
        <Animated.View key={index} entering={copyEnters}>
          <Text style={[styles.title, { lineHeight: 39 * typeScale }]} maxFontSizeMultiplier={1.25}>
            {slides[index].title}
          </Text>
          <Text style={[styles.body, { lineHeight: 24 * typeScale }]} maxFontSizeMultiplier={1.35}>
            {slides[index].body}
          </Text>
        </Animated.View>

        <View style={styles.dots} accessible accessibilityLabel={`${index + 1} / ${slides.length}`}>
          {slides.map((s, i) => (
            <Dot key={s.key} at={i} offset={offset} width={width} />
          ))}
        </View>

        <Animated.View entering={FadeIn.delay(240).duration(duration.slow)}>
          <Button label={isLast ? 'Başlayalım' : 'Devam'} tone="light" onPress={goNext} />
          <Text style={styles.legal} maxFontSizeMultiplier={1.25}>
            Devam ederek{' '}
            <Text
              accessibilityRole="link"
              onPress={() => void Linking.openURL(TERMS_OF_USE_URL).catch(() => undefined)}
              style={styles.legalLink}
            >
              Kullanım Koşulları’nı
            </Text>{' '}
            ve{' '}
            <Text
              accessibilityRole="link"
              onPress={() => void Linking.openURL(PRIVACY_POLICY_URL).catch(() => undefined)}
              style={styles.legalLink}
            >
              Gizlilik Politikası’nı
            </Text>{' '}
            kabul etmiş olursun.
          </Text>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.night },
  slide: { flex: 1 },
  topScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  logoWrap: {
    position: 'absolute',
    left: spacing.md,
  },
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
  },
  title: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 34,
    letterSpacing: -1.1,
    color: colors.white,
  },
  body: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 16,
    color: 'rgba(255,255,255,0.76)',
    marginTop: 10,
  },
  dots: {
    flexDirection: 'row',
    gap: 6,
  },
  dot: {
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: colors.white,
  },
  legal: {
    marginTop: 12,
    paddingHorizontal: spacing.sm,
    fontFamily: 'DMSans_400Regular',
    fontSize: 11.5,
    lineHeight: 17,
    color: 'rgba(255,255,255,0.68)',
    textAlign: 'center',
  },
  legalLink: {
    fontFamily: 'DMSans_700Bold',
    color: colors.white,
    textDecorationLine: 'underline',
  },
});
