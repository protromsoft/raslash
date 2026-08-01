import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { Appear } from '@/components/Motion';
import { HeaderBar, Screen } from '@/components/Screen';
import { Button, Field, ScreenTitle } from '@/components/ui';
import { spacing } from '@/theme/spacing';
import { useOnboardingDraft } from './_layout';

export default function OnboardingName() {
  const { draft, patch } = useOnboardingDraft();
  const [firstName, setFirstName] = useState(draft.firstName);

  const canContinue = firstName.trim().length >= 2;

  const next = () => {
    patch({ firstName: firstName.trim() });
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
        title="Sana nasıl hitap edelim?"
        subtitle="Adın, check‑in yaptığın sohbetlerde görünür."
      />

      <Appear delay={80} style={styles.form}>
        <Field
          variant="underline"
          value={firstName}
          onChangeText={setFirstName}
          placeholder="Adın"
          autoFocus
          autoCapitalize="words"
          returnKeyType="done"
          maxLength={24}
          onSubmitEditing={() => canContinue && next()}
        />
      </Appear>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.xl },
  form: { gap: spacing.xl },
});
