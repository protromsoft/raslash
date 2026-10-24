import { router } from 'expo-router';
import { useState } from 'react';
import { OptionList, QuizStep } from '@/components/OnboardingQuiz';
import { EMPTY_WORK_PREFERENCES, GOALS } from '@/lib/onboardingQuiz';
import { OnboardingHeader, useDraftFlush, useOnboardingDraft } from './_layout';

/** Step 1: what Raslash is for, for this member (several answers allowed). */
export default function OnboardingGoals() {
  const { draft } = useOnboardingDraft();
  const prefs = draft.workPreferences ?? EMPTY_WORK_PREFERENCES;
  const [goals, setGoals] = useState(prefs.goals);
  useDraftFlush({ workPreferences: { ...prefs, goals } });
  return (
    <QuizStep
      header={<OnboardingHeader step={1} onBack={() => router.back()} />}
      title="Raslash’ı en çok ne için kullanacaksın?"
      subtitle="Birden fazla seçebilirsin. Haritayı ve önerileri buna göre hazırlayacağız."
      canContinue={goals.length > 0}
      onContinue={() => router.push('/onboarding/work')}
    >
      <OptionList options={GOALS} value={goals} onChange={setGoals} multiple />
    </QuizStep>
  );
}
