import { router } from 'expo-router';
import { useState } from 'react';
import { OptionList, QuizStep } from '@/components/OnboardingQuiz';
import { EMPTY_WORK_PREFERENCES, WORK_TIMES } from '@/lib/onboardingQuiz';
import { OnboardingHeader, useDraftFlush, useOnboardingDraft } from './_layout';

/** Step 5: when the member usually works. */
export default function OnboardingTimes() {
  const { draft, patch } = useOnboardingDraft();
  const prefs = draft.workPreferences ?? EMPTY_WORK_PREFERENCES;
  const [times, setTimes] = useState(prefs.workTimes);
  const answers = { workPreferences: { ...prefs, workTimes: times } };
  useDraftFlush(answers);
  return (
    <QuizStep
      header={<OnboardingHeader step={5} onBack={() => router.back()} />}
      title="Genelde ne zaman çalışırsın?"
      subtitle="Mekânların en dolu ve en sakin saatlerini buna göre göstereceğiz."
      canContinue={times.length > 0}
      onContinue={() => { patch(answers); router.push('/onboarding/city'); }}
    >
      <OptionList options={WORK_TIMES} value={times} onChange={setTimes} multiple />
    </QuizStep>
  );
}
