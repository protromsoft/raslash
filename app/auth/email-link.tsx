import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, StyleSheet, View } from 'react-native';
import { AuthHero } from '@/components/AuthHero';
import { Appear } from '@/components/Motion';
import { Screen } from '@/components/Screen';
import { Button, Field, TextButton, Txt } from '@/components/ui';
import { emailLinkRetryAt, sendEmailSignInLink, validAuthEmail } from '@/lib/emailAuth';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';

export default function EmailLinkScreen() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const busyRef = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    const tick = () => setRemaining(Math.max(0, Math.ceil((emailLinkRetryAt() - Date.now()) / 1000)));
    tick();
    const interval = setInterval(tick, 1000);
    return () => { mounted.current = false; clearInterval(interval); };
  }, []);

  const send = async () => {
    if (busyRef.current || remaining > 0 || !validAuthEmail(email)) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    Keyboard.dismiss();
    const result = await sendEmailSignInLink(email);
    busyRef.current = false;
    if (!mounted.current) return;
    setBusy(false);
    setRemaining(Math.max(0, Math.ceil(((result.retryAt ?? 0) - Date.now()) / 1000)));
    if (result.ok) setSent(true);
    else setError(result.message);
  };

  return (
    <Screen scroll padded={false} topInset={false} footer={
      <View style={styles.actions}>
        <Button label={remaining > 0 ? `Yeniden gönder (${remaining} sn)` : sent ? 'Yeni bağlantı gönder' : 'Giriş bağlantısı gönder'}
          disabled={!validAuthEmail(email) || remaining > 0} loading={busy} onPress={() => void send()} />
        <TextButton label="Şifreyle girişe dön" onPress={() => router.replace('/auth/login')} />
      </View>
    }>
      <AuthHero source={require('../../assets/photos/welcome.jpg')} tagline="Tek bir bağlantıyla kaldığın yerden devam et." />
      <Appear style={styles.body}>
        <Txt variant="h2">Şifresiz giriş</Txt>
        <Txt>Kayıtlı e-postana tek kullanımlık bir giriş bağlantısı göndereceğiz.</Txt>
        <Field label="E-posta" value={email} onChangeText={(value) => { setEmail(value); setSent(false); setError(''); }}
          editable={!busy} autoCapitalize="none" autoCorrect={false} keyboardType="email-address"
          autoComplete="email" textContentType="emailAddress" placeholder="ornek@mail.com"
          returnKeyType="go" onSubmitEditing={() => void send()} />
        {sent ? <Txt accessibilityLiveRegion="polite" style={styles.success}>Bağlantı gönderildi. Gelen kutunu ve spam klasörünü kontrol et.</Txt> : null}
        <Txt>Bağlantıyı istediğin bu telefonda aç. Birden fazla bağlantı istediysen yalnızca en son geleni kullan.</Txt>
        {error ? <Txt accessibilityLiveRegion="polite" style={styles.error}>{error}</Txt> : null}
        <TextButton label="Henüz hesabın yok mu? Kayıt ol" onPress={() => router.push('/auth/signup')} />
      </Appear>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.lg, gap: spacing.md },
  actions: { gap: 2, paddingHorizontal: spacing.lg },
  error: { color: colors.danger },
  success: { color: colors.green },
});
