import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, StyleSheet, Text, TextInput } from 'react-native';
import { Appear, PressableScale } from '@/components/Motion';
import { Screen } from '@/components/Screen';
import { SocialAuthButtons } from '@/components/SocialAuthButtons';
import { Button, Field, Txt } from '@/components/ui';
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
      contentStyle={styles.content}
      // Only the primary action is pinned: a tall pinned footer left the form
      // fields behind it on small phones, especially with the keyboard open.
      footer={
        <Button
          label="Giriş yap"
          disabled={!canSubmit}
          loading={busy || signedIn}
          onPress={() => void onSubmit()}
        />
      }
    >
      <Appear style={styles.intro}>
        <Text style={styles.wordmark} accessibilityRole="header" accessibilityLabel="RASLASH">
          RASLASH
        </Text>
        <Txt variant="h1">Yakınında çalışan insanlarla tanış.</Txt>
      </Appear>

      <Appear delay={80} style={styles.form}>
        <SocialAuthButtons
          mode="login"
          disabled={busy || signedIn}
          onSuccess={() => setSignedIn(true)}
        />
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
        <PressableScale
          onPress={() => {
            if (busy || signedIn) return;
            Keyboard.dismiss();
            router.push('/auth/email-link');
          }}
          scaleTo={0.96}
          hitSlop={8}
          style={styles.magicLink}
          accessibilityRole="button"
        >
          <Text style={styles.magicLinkText}>Şifresiz bağlantıyla gir</Text>
        </PressableScale>
      </Appear>

      <PressableScale
        onPress={() => {
          Keyboard.dismiss();
          router.push('/auth/signup');
        }}
        scaleTo={0.96}
        style={styles.signup}
        accessibilityRole="button"
        accessibilityLabel="Hesabın yok mu? Kayıt ol"
      >
        <Text style={styles.signupText}>
          Hesabın yok mu? <Text style={styles.signupStrong}>Kayıt ol</Text>
        </Text>
      </PressableScale>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg },
  intro: { gap: 10, marginTop: spacing.xl },
  wordmark: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 15,
    letterSpacing: 2,
    color: colors.ink,
  },
  form: { gap: spacing.md },
  magicLink: { alignSelf: 'flex-end', paddingVertical: 6 },
  magicLinkText: { fontFamily: 'DMSans_700Bold', fontSize: 14, color: colors.inkSoft },
  signup: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', marginTop: 'auto' },
  signupText: { fontFamily: 'DMSans_400Regular', fontSize: 15, color: colors.inkSoft },
  signupStrong: { fontFamily: 'DMSans_700Bold', color: colors.ink },
  error: {
    fontFamily: 'DMSans_500Medium',
    color: colors.danger,
    fontSize: 14,
  },
});
