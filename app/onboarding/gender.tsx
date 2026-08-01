import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Appear } from '@/components/Motion';
import { HeaderBar, Screen } from '@/components/Screen';
import { Button, ScreenTitle, SelectionRow } from '@/components/ui';
import { stagger } from '@/theme/motion';
import { spacing } from '@/theme/spacing';
import { useOnboardingDraft } from './_layout';

const options = [
  { value: 'Kadın', icon: 'female-outline' as const },
  { value: 'Erkek', icon: 'male-outline' as const },
  { value: 'Belirtmek istemiyorum', icon: 'ellipsis-horizontal' as const },
];

export default function OnboardingGender() {
  const { draft, patch } = useOnboardingDraft();
  const [gender, setGender] = useState(draft.gender);

  const next = () => {
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
        title="Cinsiyetin nedir?"
        subtitle="Bunu profilinde göstermiyoruz; sadece topluluk dengesini kurmak için kullanıyoruz."
      />

      <View style={styles.options}>
        {options.map((option, i) => (
          <Appear key={option.value} delay={stagger(i, 60)}>
            <SelectionRow
              label={option.value}
              icon={option.icon}
              selected={gender === option.value}
              onPress={() => setGender(option.value)}
            />
          </Appear>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg },
  options: { gap: spacing.sm, marginTop: spacing.sm },
});
