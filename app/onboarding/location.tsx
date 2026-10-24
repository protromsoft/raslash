import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ArtScreen } from '@/components/OnboardingArt';
import { Button, TextButton } from '@/components/ui';
import { requestForegroundLocationAccess } from '@/lib/locationPermission';
import { colors } from '@/theme/colors';
import { OnboardingHeader } from './_layout';

const LOCATION_REQUEST_TIMEOUT_MS = 15_000;

export default function OnboardingLocation() {
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const continueToNotifications = async (askForLocation: boolean) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
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

    // This screen remains mounted underneath the notifications step. Reset
    // the guard before navigating so a swipe/back from the next step does not
    // leave both actions permanently disabled.
    busyRef.current = false;
    setBusy(false);
    router.push('./notifications');
  };

  return (
    <ArtScreen
      art="walk"
      header={
        <OnboardingHeader
          step={13}
          onBack={() => router.back()}
                    style={styles.header}
        />
      }
    >
      <View>
        <Text style={styles.title} maxFontSizeMultiplier={1.3}>
          Yakındaki mekânları{'\n'}keşfet
        </Text>
        <Text style={styles.body} maxFontSizeMultiplier={1.4}>
          Konum sadece yakınındaki mekânları sıralamak ve check‑in yaptığında doğru yerde olduğunu
          doğrulamak için kullanılır.
        </Text>
      </View>

      <View style={styles.actions}>
        <Button
          label="Devam"
          loading={busy}
          onPress={() => void continueToNotifications(true)}
        />
        <TextButton
          label="Şimdilik geç"
          onPress={() => void continueToNotifications(false)}
        />
      </View>
    </ArtScreen>
  );
}

const styles = StyleSheet.create({
  header: { flex: 1 },
  title: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 34,
    lineHeight: 39,
    letterSpacing: -1.1,
    color: colors.ink,
  },
  body: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 16,
    lineHeight: 24,
    color: colors.muted,
    marginTop: 10,
  },
  actions: { gap: 2 },
});
