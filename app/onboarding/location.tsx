import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { HeaderBar, PhotoScreen } from '@/components/Screen';
import { Button, TextButton } from '@/components/ui';
import { useApp } from '@/context/AppContext';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { useOnboardingDraft } from './_layout';

export default function OnboardingLocation() {
  const { draft, clear } = useOnboardingDraft();
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
      // The answers now live on the profile; keeping the draft around would
      // refill the steps if the user ever restarts onboarding.
      clear();
      setBusy(false);
      router.replace('/(tabs)');
    }
  };

  return (
    <PhotoScreen
      source={require('../../assets/photos/location.jpg')}
      header={
        <HeaderBar
          onBack={() => router.back()}
          progress={1}
          tone="dark"
          style={styles.header}
        />
      }
    >
      <View>
        <Text style={styles.title} maxFontSizeMultiplier={1.3}>
          Konumunu aç,{'\n'}yakınındakileri gör
        </Text>
        <Text style={styles.body} maxFontSizeMultiplier={1.4}>
          Konum sadece yakınındaki mekanları sıralamak ve check‑in yaptığında doğru yerde olduğunu
          doğrulamak için kullanılır.
        </Text>
      </View>

      <View style={styles.actions}>
        <Button
          label="Konuma izin ver"
          tone="light"
          loading={busy}
          onPress={() => void finish(true)}
        />
        <TextButton label="Şimdilik geç" onDark onPress={() => void finish(false)} />
      </View>
      <View style={{ height: spacing.xs }} />
    </PhotoScreen>
  );
}

const styles = StyleSheet.create({
  header: { flex: 1 },
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
