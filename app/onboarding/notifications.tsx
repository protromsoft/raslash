import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ArtScreen } from '@/components/OnboardingArt';
import { Button, TextButton } from '@/components/ui';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from '@/context/AppContext';
import { MAP_CITY_KEY } from '@/lib/mapCity';
import { isPaywallEnabled } from '@/lib/purchases';
import { socialAction } from '@/lib/socialDiscovery';
import { requestNotificationAccess } from '@/lib/pushNotifications';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { OnboardingHeader, useOnboardingDraft } from './_layout';

const NOTIFICATION_REQUEST_TIMEOUT_MS = 15_000;

export default function OnboardingNotifications() {
  const { draft, clear } = useOnboardingDraft();
  const { completeOnboarding, user, isSubscribed } = useApp();
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState('');
  const busyRef = useRef(false);

  const finish = async (askForNotifications: boolean) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setSaveError('');

    if (askForNotifications) {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          requestNotificationAccess(user?.id),
          new Promise<void>((resolve) => {
            timeout = setTimeout(resolve, NOTIFICATION_REQUEST_TIMEOUT_MS);
          }),
        ]);
      } catch (error) {
        console.warn('notification permission request failed', error);
        // Notifications are optional and can be enabled from Profile later.
      } finally {
        if (timeout) clearTimeout(timeout);
      }
    }

    try {
      await completeOnboarding(draft);
    } catch (error) {
      console.warn('onboarding save failed', error);
      setSaveError('Bilgilerin kaydedilemedi. Bağlantını kontrol edip tekrar dene.');
      busyRef.current = false;
      setBusy(false);
      return;
    }

    // Answers that are not profile fields: the map's city and visibility.
    // Both are best effort; onboarding is already saved.
    if (draft.city) await AsyncStorage.setItem(MAP_CITY_KEY, draft.city).catch(() => undefined);
    if (draft.meetPeople === 'yes') {
      await socialAction('set_preferences', { map_visible: true, allow_dm_requests: true }).catch(() => undefined);
    }

    clear();
    router.replace('/(tabs)');
    // The end of onboarding offers Pro once; it can be closed.
    if (isPaywallEnabled && !isSubscribed) setTimeout(() => router.push('/paywall'), 450);
  };

  return (
    <ArtScreen
      art="hello"
      header={
        <OnboardingHeader
          step={14}
          onBack={() => router.back()}
                    style={styles.header}
        />
      }
    >
      <View>
        <Text style={styles.title} maxFontSizeMultiplier={1.3}>
          Check-in’lerini{`\n`}kaçırma
        </Text>
        <Text style={styles.body} maxFontSizeMultiplier={1.4}>
          Aktif check-in’ini zamanında kapatman ve hesabındaki önemli gelişmeleri görmen için sana
          bildirim gönderebiliriz.
        </Text>
      </View>

      <View style={styles.actions}>
        {saveError ? <Text style={styles.error}>{saveError}</Text> : null}
        <Button label="Devam" loading={busy} onPress={() => void finish(true)} />
        <TextButton label="Şimdilik geç" onPress={() => void finish(false)} />
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
  error: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 13,
    lineHeight: 19,
    color: colors.danger,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
});
