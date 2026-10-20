import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Button, TextButton, Txt } from '@/components/ui';
import { useApp } from '@/context/AppContext';
import { completeEmailSignIn, EMAIL_LINK_INVALID } from '@/lib/emailAuth';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';

export default function EmailCallbackScreen() {
  const url = Linking.useLinkingURL();
  const { ready, syncing, session } = useApp();
  const [result, setResult] = useState<{ url: string; userId?: string; error?: string } | null>(null);

  useEffect(() => {
    if (!ready || !url) return;
    let active = true;
    void completeEmailSignIn(url).then((outcome) => {
      if (active) setResult(outcome.ok ? { url, userId: outcome.userId } : { url, error: outcome.message });
    });
    return () => { active = false; };
  }, [ready, url]);

  useEffect(() => {
    if (result?.url === url && result?.userId === session?.user.id && result?.userId && ready && !syncing) {
      // Root's profile gate, not this callback, decides onboarding vs main.
      router.replace('/');
    }
  }, [ready, syncing, session?.user.id, result, url]);

  const error = result?.url === url ? result?.error : undefined;
  const missingLink = ready && !url;
  return (
    <Screen contentStyle={styles.screen}>
      <View style={styles.body}>
        <Txt variant="h2">{error || missingLink ? 'Bağlantıyı açamadık' : 'Giriş tamamlanıyor'}</Txt>
        {error || missingLink ? <>
          <Txt accessibilityLiveRegion="polite">{error ?? EMAIL_LINK_INVALID}</Txt>
          <Button label="Yeni bağlantı iste" onPress={() => router.replace('/auth/email-link')} />
          <TextButton label="Şifreyle giriş" onPress={() => router.replace('/auth/login')} />
        </> : <>
          <ActivityIndicator color={colors.ink} size="large" />
          <Txt accessibilityLiveRegion="polite">Hesabını güvenli şekilde açıyoruz.</Txt>
        </>}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center' },
  body: { gap: spacing.lg },
});
