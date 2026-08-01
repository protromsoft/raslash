import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/ui';
import { colors } from '@/theme/colors';
import { duration, easing } from '@/theme/motion';
import { spacing } from '@/theme/spacing';

const { width: WIDTH } = Dimensions.get('window');

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
    body: 'Priz, Wi‑Fi ve konfor puanları gerçek kullanıcılardan. Google yorumu yok, sadece Raslash.',
  },
  {
    key: 'chat',
    image: require('../../assets/photos/chat.jpg'),
    title: 'Check‑in yap,\nsohbet açılsın',
    body: 'Mekana vardığında check‑in yap; o an oradaki herkesle aynı odada buluş.',
  },
];

export default function OnboardingWelcome() {
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList>(null);

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / WIDTH);
    if (next !== index) setIndex(next);
  };

  const isLast = index === slides.length - 1;

  const goNext = () => {
    if (isLast) {
      router.push('/onboarding/name');
      return;
    }
    listRef.current?.scrollToOffset({ offset: (index + 1) * WIDTH, animated: true });
    setIndex(index + 1);
  };

  return (
    <View style={styles.screen}>
      <FlatList
        ref={listRef}
        data={slides}
        keyExtractor={(item) => item.key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        renderItem={({ item }) => (
          <View style={styles.slide}>
            <Image source={item.image} style={StyleSheet.absoluteFill} contentFit="cover" />
            <LinearGradient
              colors={['rgba(12,11,10,0.15)', 'rgba(12,11,10,0.62)', 'rgba(12,11,10,0.96)']}
              locations={[0, 0.5, 1]}
              style={StyleSheet.absoluteFill}
            />
          </View>
        )}
      />

      <View
        pointerEvents="box-none"
        style={[styles.overlay, { paddingBottom: insets.bottom + spacing.lg }]}
      >
        <Animated.View key={index} entering={FadeInDown.duration(duration.slow).easing(easing.out)}>
          <Text style={styles.title}>{slides[index].title}</Text>
          <Text style={styles.body}>{slides[index].body}</Text>
        </Animated.View>

        <View style={styles.dots}>
          {slides.map((s, i) => (
            <View key={s.key} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>

        <Animated.View entering={FadeIn.delay(240).duration(duration.slow)}>
          <Button label={isLast ? 'Başlayalım' : 'Devam'} tone="light" onPress={goNext} />
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.night },
  slide: { width: WIDTH, flex: 1 },
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
    lineHeight: 39,
    letterSpacing: -1.1,
    color: colors.white,
  },
  body: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 16,
    lineHeight: 24,
    color: 'rgba(255,255,255,0.76)',
    marginTop: 10,
  },
  dots: {
    flexDirection: 'row',
    gap: 6,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.32)',
  },
  dotActive: {
    width: 24,
    backgroundColor: colors.white,
  },
});
