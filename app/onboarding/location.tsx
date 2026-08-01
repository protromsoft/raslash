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

  /**
   * Last onboarding step, so it always lands on the map: a failed profile save
   * (offline, Supabase down) must not leave the user stuck on a spinner with no
   * back button. The profile is kept locally and retried on the next save.
   */
  const finish = async (askForLocation: boolean) => {
    if (busy) return;
    setBusy(true);
    if (askForLocation) {
      try {
        await Location.requestForegroundPermissionsAsync();
      } catch {
        // Denial is fine — check-in falls back to a manual confirm.
      }
    }
    try {
      await completeOnboarding(draft);
    } catch (e) {
      console.warn('onboarding save failed', e);
    } finally {
      setBusy(false);
      router.replace('/(tabs)');
    }
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
        <Button label="Konuma izin ver" tone="light" loading={busy} onPress={() => void finish(true)} />
        <TextButton label="Şimdilik geç" onDark onPress={() => void finish(false)} />
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
