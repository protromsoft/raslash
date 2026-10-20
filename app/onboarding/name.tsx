import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Keyboard, StyleSheet, Text, TextInput, View } from 'react-native';
import { PressableScale } from '@/components/Motion';
import { Screen } from '@/components/Screen';
import { Button, Chip, Field, Txt } from '@/components/ui';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { OnboardingHeader, useDraftFlush, useOnboardingDraft } from './_layout';

const NAME_MAX = 24;
const PROFESSION_MAX = 40;
const MIN_AGE = 16;
const MAX_AGE = 99;

const SUGGESTIONS = ['Yazılımcı', 'Girişimci', 'Freelancer', 'Öğrenci'];

// "Belirtme" is only the short label; the stored value stays the one the
// earlier gender step saved, so existing profiles keep matching.
const GENDERS = [
  { label: 'Kadın', value: 'Kadın' },
  { label: 'Erkek', value: 'Erkek' },
  { label: 'Belirtme', value: 'Belirtmek istemiyorum' },
];

/**
 * Name, age, profession and gender on one screen. These used to be three
 * steps; the draft fields and their validation are unchanged.
 */
export default function OnboardingProfile() {
  const { draft, patch } = useOnboardingDraft();
  const [firstName, setFirstName] = useState(draft.firstName);
  const [age, setAge] = useState(draft.age);
  const [profession, setProfession] = useState(draft.profession);
  const [gender, setGender] = useState(draft.gender);
  const ageRef = useRef<TextInput>(null);
  const professionRef = useRef<TextInput>(null);

  const trimmedName = firstName.trim();
  const nameValid = trimmedName.length >= 2;
  const ageNumber = Number(age);
  const ageValid = age.length > 0 && ageNumber >= MIN_AGE && ageNumber <= MAX_AGE;
  const trimmedProfession = profession.trim();
  const professionValid = trimmedProfession.length >= 2;
  const canContinue = nameValid && ageValid && professionValid && !!gender;

  const answers = {
    firstName: trimmedName,
    age: age.trim(),
    profession: trimmedProfession,
    gender,
  };
  useDraftFlush(answers);

  const next = () => {
    if (!canContinue) return;
    patch(answers);
    // The next step has no auto-focused field, so a keyboard carried over from
    // here would just hover over a screen with nothing focused.
    Keyboard.dismiss();
    router.push('/onboarding/social');
  };

  const problems = [
    firstName.length > 0 && !nameValid ? 'Adın için en az 2 harf yaz.' : '',
    age.length > 0 && !ageValid ? `${MIN_AGE}–${MAX_AGE} arası bir yaş gir.` : '',
  ].filter(Boolean);

  return (
    <Screen
      scroll
      contentStyle={styles.content}
      footer={<Button label="Devam" disabled={!canContinue} onPress={next} />}
    >
      <OnboardingHeader step={1} onBack={() => router.back()} />

      <Txt variant="h1">Seni tanıyalım</Txt>

      <View style={styles.form}>
        <Field
          label="Adın"
          value={firstName}
          onChangeText={setFirstName}
          placeholder="Adın"
          autoCapitalize="words"
          autoComplete="given-name"
          textContentType="givenName"
          returnKeyType="next"
          submitBehavior="submit"
          maxLength={NAME_MAX}
          onSubmitEditing={() => ageRef.current?.focus()}
        />

        <View style={styles.row}>
          <Field
            ref={ageRef}
            label="Yaş"
            value={age}
            onChangeText={(v) => setAge(v.replace(/[^0-9]/g, '').slice(0, 2))}
            placeholder="27"
            keyboardType="number-pad"
            accessibilityLabel="Yaşın"
            style={styles.ageField}
          />
          <Field
            ref={professionRef}
            label="Ne iş yapıyorsun?"
            value={profession}
            onChangeText={setProfession}
            placeholder="Tasarımcı"
            autoCapitalize="sentences"
            maxLength={PROFESSION_MAX}
            returnKeyType="done"
            onSubmitEditing={() => Keyboard.dismiss()}
            style={styles.professionField}
          />
        </View>

        {problems.length > 0 ? (
          <Text style={styles.problem} accessibilityLiveRegion="polite">
            {problems.join(' ')}
          </Text>
        ) : null}

        <View style={styles.chips}>
          {SUGGESTIONS.map((item) => (
            <Chip
              key={item}
              label={item}
              active={trimmedProfession === item}
              onPress={() => setProfession(trimmedProfession === item ? '' : item)}
            />
          ))}
        </View>

        <View style={styles.genderBlock}>
          <Text style={styles.label}>Cinsiyet</Text>
          <View style={styles.segmented} accessibilityRole="radiogroup" accessibilityLabel="Cinsiyet">
            {GENDERS.map((option) => {
              const selected = gender === option.value;
              return (
                <PressableScale
                  key={option.value}
                  onPress={() => {
                    Keyboard.dismiss();
                    setGender(option.value);
                  }}
                  scaleTo={0.97}
                  accessibilityRole="radio"
                  accessibilityLabel={option.value}
                  accessibilityState={{ selected, checked: selected }}
                  style={[styles.segment, selected && styles.segmentActive]}
                >
                  <Text
                    style={[styles.segmentLabel, selected && styles.segmentLabelActive]}
                    numberOfLines={1}
                  >
                    {option.label}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
          <Txt variant="caption">
            Cinsiyetini profilinde göstermiyoruz; sadece topluluk dengesi için kullanıyoruz.
          </Txt>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg },
  form: { gap: spacing.md },
  row: { flexDirection: 'row', gap: 10 },
  ageField: { flex: 1, minWidth: 0 },
  professionField: { flex: 2, minWidth: 0 },
  problem: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 13,
    color: colors.danger,
    marginTop: -6,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  genderBlock: { gap: 8 },
  label: {
    fontFamily: 'DMSans_500Medium',
    color: colors.muted,
    fontSize: 13,
  },
  segmented: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 22,
    backgroundColor: colors.bgSoft,
  },
  segment: {
    flex: 1,
    minHeight: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  segmentActive: { backgroundColor: colors.ink },
  segmentLabel: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 14,
    color: colors.inkSoft,
  },
  segmentLabelActive: { color: colors.white },
});
