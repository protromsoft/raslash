import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, StyleSheet, Text, TextInput, View } from 'react-native';
import { AuthHero } from '@/components/AuthHero';
import { Appear } from '@/components/Motion';
import { Screen } from '@/components/Screen';
import { Button, Field, TextButton, Txt } from '@/components/ui';
import { useApp } from '@/context/AppContext';
import { signIn } from '@/lib/auth';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PASSWORD_MIN = 6;

export default function LoginScreen() {
  const { session } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  const emailValid = EMAIL_RE.test(email.trim());
  const canSubmit = emailValid && password.length >= PASSWORD_MIN && !busy;

  /**
   * Supabase publishes the new session to the app context asynchronously.
   * Leaving before it lands drops the user on `/`, which still sees a signed
   * out app and bounces them straight back here with empty fields.
   */
  useEffect(() => {
    if (!signedIn) return;
    if (session) {
      router.replace('/');
      return;
    }
    // Safety net: a lost auth event must not leave the user on a dead spinner.
    const timer = setTimeout(() => router.replace('/'), 2500);
    return () => clearTimeout(timer);
  }, [session, signedIn]);

  const onSubmit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError('');
    const result = await signIn(email, password);
    if (!result.ok) {
      setBusy(false);
      setError(result.message);
      return;
    }
    setSignedIn(true);
  };

  return (
    <Screen
      scroll
      padded={false}
      topInset={false}
      footer={
        <View style={styles.actions}>
          <Button
            label="Giriş yap"
            disabled={!canSubmit}
            loading={busy || signedIn}
            onPress={() => void onSubmit()}
          />
          <TextButton
            label="Hesabın yok mu? Kayıt ol"
            onPress={() => {
              Keyboard.dismiss();
              router.push('/auth/signup');
            }}
          />
        </View>
      }
    >
      <AuthHero
        source={require('../../assets/photos/welcome.jpg')}
        tagline="Yakınındaki mekanlarda çalışan insanlarla tanış."
      />

      <View style={styles.body}>
        <Appear>
          <Txt variant="h2">Tekrar hoş geldin</Txt>
          <Txt variant="body" style={{ marginTop: 4 }}>
            Hesabınla devam et, kaldığın yerden başla.
          </Txt>
        </Appear>

        <Appear delay={80} style={styles.form}>
          <Field
            label="E-posta"
            value={email}
            onChangeText={(v) => {
              setEmail(v);
              setError('');
            }}
            onBlur={() => setEmailTouched(true)}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            placeholder="ornek@mail.com"
            returnKeyType="next"
            // Keep the keyboard up so the jump to the password field reads as
            // one move instead of a close-and-reopen.
            submitBehavior="submit"
            onSubmitEditing={() => passwordRef.current?.focus()}
            error={
              emailTouched && email.length > 0 && !emailValid
                ? 'Geçerli bir e‑posta gir.'
                : undefined
            }
          />
          <Field
            ref={passwordRef}
            label="Şifre"
            value={password}
            onChangeText={(v) => {
              setPassword(v);
              setError('');
            }}
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            placeholder="••••••"
            returnKeyType="go"
            onSubmitEditing={() => void onSubmit()}
          />
          {error ? (
            <Text style={styles.error} accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}
        </Appear>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  // Deliberately not `flex: 1`: the scroll container is only as tall as the
  // viewport, so a flexed body collapses to nothing once the keyboard shrinks
  // it below the height of the hero.
  body: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.lg,
  },
  form: { gap: spacing.md },
  actions: { gap: 2, paddingHorizontal: spacing.lg },
  error: {
    fontFamily: 'DMSans_500Medium',
    color: colors.danger,
    fontSize: 14,
  },
});
