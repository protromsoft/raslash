import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthHero } from '@/components/AuthHero';
import { Appear } from '@/components/Motion';
import { Button, Field, TextButton, Txt } from '@/components/ui';
import { signIn } from '@/lib/auth';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const canSubmit = email.trim().includes('@') && password.length >= 6 && !busy;

  const onSubmit = async () => {
    setBusy(true);
    setError('');
    const result = await signIn(email, password);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    router.replace('/');
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
            source={require('../../assets/photos/welcome.jpg')}
            tagline="Yakınındaki mekanlarda çalışan insanlarla tanış."
          />

          <View style={[styles.body, { paddingBottom: insets.bottom + spacing.md }]}>
            <Appear>
              <Txt variant="h2">Tekrar hoş geldin</Txt>
              <Txt variant="body" style={{ marginTop: 4 }}>
                Hesabınla devam et, kaldığın yerden başla.
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
                returnKeyType="next"
              />
              <Field
                label="Şifre"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="password"
                placeholder="••••••"
                returnKeyType="go"
                onSubmitEditing={() => canSubmit && void onSubmit()}
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
            </Appear>

            <Appear delay={140} style={styles.actions}>
              <Button
                label="Giriş yap"
                disabled={!canSubmit}
                loading={busy}
                onPress={() => void onSubmit()}
              />
              <TextButton
                label="Hesabın yok mu? Kayıt ol"
                onPress={() => router.push('/auth/signup')}
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
