import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { HeaderBar, PhotoScreen } from '@/components/Screen';
import { Button, TextButton } from '@/components/ui';
import { useApp } from '@/context/AppContext';
import { requestForegroundLocationAccess } from '@/lib/locationPermission';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { useOnboardingDraft } from './_layout';

const LOCATION_REQUEST_TIMEOUT_MS = 15_000;

export default function OnboardingLocation() {
  const { draft, clear } = useOnboardingDraft();
  const { completeOnboarding } = useApp();
  const [busy, setBusy] = useState(false);
  const [permissionError, setPermissionError] = useState('');

  /** The last step only leaves onboarding after the profile is durably saved. */
  const finish = async (askForLocation: boolean) => {
    if (busy) return;
    setBusy(true);
    setPermissionError('');
    if (askForLocation) {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        // Location improves nearby results but is not required to finish
        // onboarding. The timeout also prevents a native permission request
        // that never settles from trapping users on this screen.
        await Promise.race([
          requestForegroundLocationAccess(),
          new Promise<void>((resolve) => {
            timeout = setTimeout(resolve, LOCATION_REQUEST_TIMEOUT_MS);
          }),
        ]);
      } catch (error) {
        console.warn('location permission request failed', error);
        // Permission is optional; users can grant it later from the map.
      } finally {
        if (timeout) clearTimeout(timeout);
      }
    }
    try {
      await completeOnboarding(draft);
    } catch (e) {
      console.warn('onboarding save failed', e);
      setPermissionError('Bilgilerin kaydedilemedi. Bağlantını kontrol edip tekrar dene.');
      setBusy(false);
      return;
    }
    // The answers now live on the profile; keeping the draft around would
    // refill the steps if the user ever restarts onboarding.
    clear();
    setBusy(false);
    router.replace('/(tabs)');
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
          Yakındaki mekânları{'\n'}keşfet
        </Text>
        <Text style={styles.body} maxFontSizeMultiplier={1.4}>
          Konum sadece yakınındaki mekanları sıralamak ve check‑in yaptığında doğru yerde olduğunu
          doğrulamak için kullanılır.
        </Text>
      </View>

      <View style={styles.actions}>
        {permissionError ? <Text style={styles.error}>{permissionError}</Text> : null}
        <Button
          label="Devam"
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
  error: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 13,
    lineHeight: 19,
    color: colors.white,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
});
