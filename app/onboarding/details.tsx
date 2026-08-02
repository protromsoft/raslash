import { router } from 'expo-router';
import { useState } from 'react';
import { Keyboard, StyleSheet, View } from 'react-native';
import { HeaderBar, Screen } from '@/components/Screen';
import { Button, Chip, Field, ScreenTitle, Txt } from '@/components/ui';
import { spacing } from '@/theme/spacing';
import { useDraftFlush, useOnboardingDraft } from './_layout';

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

const MIN_AGE = 16;
const MAX_AGE = 99;

export default function OnboardingDetails() {
  const { draft, patch } = useOnboardingDraft();
  const [age, setAge] = useState(draft.age);
  const [profession, setProfession] = useState(draft.profession);

  const ageNumber = Number(age);
  const ageValid = age.length > 0 && ageNumber >= MIN_AGE && ageNumber <= MAX_AGE;
  const trimmedProfession = profession.trim();
  const canContinue = ageValid && trimmedProfession.length >= 2;

  useDraftFlush({ age: age.trim(), profession: trimmedProfession });

  const next = () => {
    if (!canContinue) return;
    patch({ age: age.trim(), profession: trimmedProfession });
    // The next step has no auto-focused field, so a keyboard carried over from
    // here would just hover over a screen with nothing focused.
    Keyboard.dismiss();
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
        animate={false}
        title="Biraz da kendinden bahset"
        subtitle="Yaşın ve ne iş yaptığın, doğru insanlarla eşleşmene yardım eder."
      />

      <View style={styles.form}>
        <Field
          variant="underline"
          value={age}
          onChangeText={(v) => setAge(v.replace(/[^0-9]/g, '').slice(0, 2))}
          placeholder="25"
          keyboardType="number-pad"
          autoFocus
          accessibilityLabel="Yaşın"
          hint={age && !ageValid ? `${MIN_AGE}–${MAX_AGE} arası bir yaş gir.` : undefined}
        />

        <View style={styles.block}>
          <Field
            label="Ne iş yapıyorsun?"
            value={profession}
            onChangeText={setProfession}
            placeholder="Ürün tasarımcısı"
            autoCapitalize="sentences"
            maxLength={40}
            returnKeyType="done"
            onSubmitEditing={next}
          />
          <Txt variant="label">Hızlı seç</Txt>
          <View style={styles.chips}>
            {SUGGESTIONS.map((item) => (
              <Chip
                key={item}
                label={item}
                active={trimmedProfession === item}
                onPress={() => setProfession(profession === item ? '' : item)}
              />
            ))}
          </View>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg },
  form: { gap: spacing.xl },
  block: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
