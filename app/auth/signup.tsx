import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthHero } from '@/components/AuthHero';
import { Appear } from '@/components/Motion';
import { Button, Field, TextButton, Txt } from '@/components/ui';
import { useApp } from '@/context/AppContext';
import { signUp } from '@/lib/auth';
import { setOnboardingCompleted } from '@/lib/profile';
import { supabase } from '@/lib/supabase';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';

export default function SignupScreen() {
  const insets = useSafeAreaInsets();
  const { restartOnboarding } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const canSubmit = email.trim().includes('@') && password.length >= 6 && !busy;

  const onSubmit = async () => {
    setBusy(true);
    setError('');
    const result = await signUp(email, password);
    if (!result.ok) {
      setBusy(false);
      setError(result.message);
      return;
    }
    try {
      await setOnboardingCompleted(result.user.id, false);
    } catch {
      // Column may not be migrated yet; the local flag still drives the flow.
    }
    await restartOnboarding();
    setBusy(false);
    const session = (await supabase?.auth.getSession())?.data.session;
    router.replace(session ? '/onboarding' : '/auth/login');
  };

  return (
    <View style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <AuthHero
            source={require('../../assets/photos/chat.jpg')}
            tagline="Kayıt ol, çalıştığın mekandaki sohbete katıl."
          />

          <View style={[styles.body, { paddingBottom: insets.bottom + spacing.md }]}>
            <Appear>
              <Txt variant="h2">Aramıza katıl</Txt>
              <Txt variant="body" style={{ marginTop: 4 }}>
                Birkaç adımda profilini oluşturalım.
              </Txt>
            </Appear>

            <Appear delay={70} style={styles.form}>
              <Field
                label="E-posta"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                placeholder="ornek@mail.com"
              />
              <Field
                label="Şifre"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="new-password"
                placeholder="En az 6 karakter"
                hint="En az 6 karakter kullan."
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
            </Appear>

            <Appear delay={140} style={styles.actions}>
              <Button
                label="Hesabı oluştur"
                disabled={!canSubmit}
                loading={busy}
                onPress={() => void onSubmit()}
              />
              <TextButton
                label="Zaten hesabın var mı? Giriş yap"
                onPress={() => router.replace('/auth/login')}
              />
            </Appear>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  scroll: { flexGrow: 1 },
  body: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.lg,
  },
  form: { gap: spacing.md },
  actions: { gap: 2, marginTop: 'auto' },
  error: {
    fontFamily: 'DMSans_500Medium',
    color: colors.danger,
    fontSize: 14,
  },
});
