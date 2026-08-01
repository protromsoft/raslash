import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Appear } from '@/components/Motion';
import { HeaderBar, Screen } from '@/components/Screen';
import { Button, Chip, Field, ScreenTitle, Txt } from '@/components/ui';
import { spacing } from '@/theme/spacing';
import { useOnboardingDraft } from './_layout';

const SUGGESTIONS = [
  'Tasarımcı',
  'Yazılımcı',
  'Girişimci',
  'Pazarlama',
  'Freelancer',
  'Öğrenci',
  'İçerik üretici',
  'Danışman',
];

export default function OnboardingDetails() {
  const { draft, patch } = useOnboardingDraft();
  const [age, setAge] = useState(draft.age);
  const [profession, setProfession] = useState(draft.profession);

  const ageNumber = Number(age);
  const ageValid = Number.isFinite(ageNumber) && ageNumber >= 16 && ageNumber <= 99;
  const canContinue = ageValid && profession.trim().length >= 2;

  const next = () => {
    patch({ age: age.trim(), profession: profession.trim() });
    router.push('/onboarding/social');
  };

  return (
    <Screen
      scroll
      contentStyle={styles.content}
      footer={<Button label="Devam" disabled={!canContinue} onPress={next} />}
    >
      <HeaderBar onBack={() => router.back()} progress={0.4} />

      <ScreenTitle
        title="Biraz da kendinden bahset"
        subtitle="Yaşın ve ne iş yaptığın, doğru insanlarla eşleşmene yardım eder."
      />

      <Appear delay={80} style={styles.form}>
        <Field
          variant="underline"
          value={age}
          onChangeText={(v) => setAge(v.replace(/[^0-9]/g, '').slice(0, 2))}
          placeholder="25"
          keyboardType="number-pad"
          autoFocus
          hint={age && !ageValid ? '16–99 arası bir yaş gir.' : undefined}
        />

        <View style={styles.block}>
          <Field
            label="Ne iş yapıyorsun?"
            value={profession}
            onChangeText={setProfession}
            placeholder="Ürün tasarımcısı"
            autoCapitalize="sentences"
          />
          <Txt variant="label">Hızlı seç</Txt>
          <View style={styles.chips}>
            {SUGGESTIONS.map((item) => (
              <Chip
                key={item}
                label={item}
                active={profession === item}
                onPress={() => setProfession(item)}
              />
            ))}
          </View>
        </View>
      </Appear>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg },
  form: { gap: spacing.xl },
  block: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
