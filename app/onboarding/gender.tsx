import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { HeaderBar, Screen } from '@/components/Screen';
import { Button, ScreenTitle, SelectionRow } from '@/components/ui';
import { spacing } from '@/theme/spacing';
import { useDraftFlush, useOnboardingDraft } from './_layout';

const options = [
  { value: 'Kadın', icon: 'female-outline' as const },
  { value: 'Erkek', icon: 'male-outline' as const },
  { value: 'Belirtmek istemiyorum', icon: 'ellipsis-horizontal' as const },
];

export default function OnboardingGender() {
  const { draft, patch } = useOnboardingDraft();
  const [gender, setGender] = useState(draft.gender);

  useDraftFlush({ gender });

  const next = () => {
    if (!gender) return;
    patch({ gender });
    router.push('/onboarding/location');
  };

  return (
    <Screen
      scroll
      contentStyle={styles.content}
      footer={<Button label="Devam" disabled={!gender} onPress={next} />}
    >
      <HeaderBar onBack={() => router.back()} progress={0.8} />

      <ScreenTitle
        animate={false}
        title="Cinsiyetin nedir?"
        subtitle="Bunu profilinde göstermiyoruz; sadece topluluk dengesini kurmak için kullanıyoruz."
      />

      <View style={styles.options} accessibilityRole="radiogroup">
        {options.map((option) => (
          <SelectionRow
            key={option.value}
            label={option.value}
            icon={option.icon}
            selected={gender === option.value}
            onPress={() => setGender(option.value)}
          />
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg },
  options: { gap: spacing.sm, marginTop: spacing.sm },
});
