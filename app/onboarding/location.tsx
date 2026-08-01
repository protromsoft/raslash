import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { PhotoScreen } from '@/components/Screen';
import { Button, TextButton } from '@/components/ui';
import { useApp } from '@/context/AppContext';
import { colors } from '@/theme/colors';
import { duration, easing } from '@/theme/motion';
import { spacing } from '@/theme/spacing';
import { useOnboardingDraft } from './_layout';

export default function OnboardingLocation() {
  const { draft } = useOnboardingDraft();
  const { completeOnboarding } = useApp();
  const [busy, setBusy] = useState(false);

  const finish = async () => {
    setBusy(true);
    try {
      await completeOnboarding(draft);
      router.replace('/(tabs)');
    } finally {
      setBusy(false);
    }
  };

  const allowAndFinish = async () => {
    setBusy(true);
    try {
      await Location.requestForegroundPermissionsAsync();
    } catch {
      // Permission denial is fine — check-in falls back to a manual confirm.
    }
    await completeOnboarding(draft);
    setBusy(false);
    router.replace('/(tabs)');
  };

  return (
    <PhotoScreen source={require('../../assets/photos/location.jpg')}>
      <Animated.View entering={FadeInDown.duration(duration.slow).easing(easing.out)}>
        <Text style={styles.title}>Konumunu aç,{'\n'}yakınındakileri gör</Text>
        <Text style={styles.body}>
          Konum sadece yakınındaki mekanları sıralamak ve check‑in yaptığında doğru yerde olduğunu
          doğrulamak için kullanılır.
        </Text>
      </Animated.View>

      <Animated.View
        entering={FadeIn.delay(220).duration(duration.slow)}
        style={styles.actions}
      >
        <Button label="Konuma izin ver" tone="light" loading={busy} onPress={() => void allowAndFinish()} />
        <TextButton label="Şimdilik geç" onDark onPress={() => void finish()} />
      </Animated.View>
      <View style={{ height: spacing.xs }} />
    </PhotoScreen>
  );
}

const styles = StyleSheet.create({
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
  actions: { gap: 2 },
});
