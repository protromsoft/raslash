import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { HeaderBar, Screen } from '@/components/Screen';
import { Button, Field, ScreenTitle } from '@/components/ui';
import { spacing } from '@/theme/spacing';
import { useDraftFlush, useOnboardingDraft } from './_layout';

const NAME_MAX = 24;

export default function OnboardingName() {
  const { draft, patch } = useOnboardingDraft();
  const [firstName, setFirstName] = useState(draft.firstName);

  const trimmed = firstName.trim();
  const canContinue = trimmed.length >= 2;
  useDraftFlush({ firstName: trimmed });

  const next = () => {
    if (!canContinue) return;
    patch({ firstName: trimmed });
    router.push('/onboarding/details');
  };

  return (
    <Screen
      scroll
      contentStyle={styles.content}
      footer={<Button label="Devam" disabled={!canContinue} onPress={next} />}
    >
      <HeaderBar onBack={() => router.back()} progress={0.2} />

      <ScreenTitle
        animate={false}
        title="Sana nasıl hitap edelim?"
        subtitle="Adın, check‑in yaptığın sohbetlerde görünür."
      />

      <View style={styles.form}>
        <Field
          variant="underline"
          value={firstName}
          onChangeText={setFirstName}
          placeholder="Adın"
          autoFocus
          autoCapitalize="words"
          autoComplete="given-name"
          textContentType="givenName"
          returnKeyType="done"
          maxLength={NAME_MAX}
          onSubmitEditing={next}
          accessibilityLabel="Adın"
          hint={firstName.length > 0 && !canContinue ? 'En az 2 harf yaz.' : undefined}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.xl },
  form: { gap: spacing.xl },
});
