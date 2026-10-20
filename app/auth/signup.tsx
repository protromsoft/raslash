import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, StyleSheet, Text, TextInput, View } from 'react-native';
import { Appear } from '@/components/Motion';
import { Screen } from '@/components/Screen';
import { SocialAuthButtons } from '@/components/SocialAuthButtons';
import { Button, Field, TextButton, Txt } from '@/components/ui';
import { useApp } from '@/context/AppContext';
import { signUp } from '@/lib/auth';
import { setOnboardingCompleted } from '@/lib/profile';
import { supabase } from '@/lib/supabase';
import { colors } from '@/theme/colors';
import { radii, spacing } from '@/theme/spacing';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PASSWORD_MIN = 8;

export default function SignupScreen() {
  const { restartOnboarding, session } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [awaitingConfirm, setAwaitingConfirm] = useState(false);
  const [socialSignedIn, setSocialSignedIn] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  const emailValid = EMAIL_RE.test(email.trim());
  const canSubmit = emailValid && password.length >= PASSWORD_MIN && !busy;

  useEffect(() => {
    if (!socialSignedIn) return;
    if (session) {
      router.replace('/');
      return;
    }
    const timer = setTimeout(() => router.replace('/'), 2500);
    return () => clearTimeout(timer);
  }, [session, socialSignedIn]);

  const backToLogin = () => {
    Keyboard.dismiss();
    if (router.canGoBack()) router.back();
    else router.replace('/auth/login');
  };

  const onSubmit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError('');
    const result = await signUp(email, password);
    if (!result.ok) {
      setBusy(false);
      setError(result.message);
      return;
    }

    // With e-mail confirmation switched on, Supabase creates the user but no
    // session. Nothing can be written yet and onboarding would have no one to
    // save to, so say so instead of silently returning to the login screen.
    const session = (await supabase?.auth.getSession())?.data.session ?? null;
    if (!session) {
      setBusy(false);
      setAwaitingConfirm(true);
      return;
    }

    try {
      await setOnboardingCompleted(result.user.id, false);
    } catch {
      // Column may not be migrated yet; the local flag still drives the flow.
    }
    await restartOnboarding();
    setBusy(false);
    router.replace('/onboarding');
  };

  return (
    <Screen
      scroll
      contentStyle={styles.content}
      footer={
        <View style={styles.actions}>
          {awaitingConfirm ? (
            <Button label="Giriş ekranına dön" onPress={backToLogin} />
          ) : (
            <>
              <Button
                label="Hesabı oluştur"
                disabled={!canSubmit}
                loading={busy}
                onPress={() => void onSubmit()}
              />
              <TextButton
                label="Zaten hesabın var mı? Giriş yap"
                // Signup was pushed from login, so go back instead of stacking
                // a second login screen on top of the first.
                onPress={backToLogin}
              />
            </>
          )}
        </View>
      }
    >
      <Appear style={styles.intro}>
        <Text style={styles.wordmark} accessibilityRole="header" accessibilityLabel="RASLASH">
          RASLASH
        </Text>
        <Txt variant="h1">Aramıza katıl.</Txt>
      </Appear>

      {awaitingConfirm ? (
        <Appear delay={80} style={styles.notice}>
          <Ionicons name="mail-unread-outline" size={22} color={colors.ink} />
          <Txt variant="body" style={styles.noticeText}>
            {`${email.trim()} adresine bir doğrulama bağlantısı gönderdik. Bağlantıya dokunduktan sonra giriş yapıp profilini oluşturabilirsin.`}
          </Txt>
        </Appear>
      ) : (
        <Appear delay={80} style={styles.form}>
          <SocialAuthButtons
            mode="signup"
            disabled={busy || socialSignedIn}
            onSuccess={() => setSocialSignedIn(true)}
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
            autoComplete="new-password"
            textContentType="newPassword"
            placeholder={`En az ${PASSWORD_MIN} karakter`}
            returnKeyType="go"
            onSubmitEditing={() => void onSubmit()}
          />
          {error ? (
            <Text style={styles.error} accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}
        </Appear>
      )}
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
  actions: { gap: 2 },
  notice: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    backgroundColor: colors.bgSoft,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  noticeText: { flex: 1 },
  error: {
    fontFamily: 'DMSans_500Medium',
    color: colors.danger,
    fontSize: 14,
  },
});
