import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { HeaderBar, PhotoScreen } from '@/components/Screen';
import { Button, TextButton } from '@/components/ui';
import { useApp } from '@/context/AppContext';
import { requestNotificationAccess } from '@/lib/pushNotifications';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { useOnboardingDraft } from './_layout';

const NOTIFICATION_REQUEST_TIMEOUT_MS = 15_000;

export default function OnboardingNotifications() {
  const { draft, clear } = useOnboardingDraft();
  const { completeOnboarding, user } = useApp();
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

    clear();
    router.replace('/(tabs)');
  };

  return (
    <PhotoScreen
      source={require('../../assets/photos/notify.jpg')}
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
          Check-in’lerini{`\n`}kaçırma
        </Text>
        <Text style={styles.body} maxFontSizeMultiplier={1.4}>
          Aktif check-in’ini zamanında kapatman ve hesabındaki önemli gelişmeleri görmen için sana
          bildirim gönderebiliriz.
        </Text>
      </View>

      <View style={styles.actions}>
        {saveError ? <Text style={styles.error}>{saveError}</Text> : null}
        <Button label="Devam" tone="light" loading={busy} onPress={() => void finish(true)} />
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
