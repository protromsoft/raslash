import { router } from 'expo-router';
import { useState } from 'react';
import { OptionList, QuizStep } from '@/components/OnboardingQuiz';
import { EMPTY_WORK_PREFERENCES, MAX_PRIORITIES, PRIORITIES } from '@/lib/onboardingQuiz';
import { OnboardingHeader, useDraftFlush, useOnboardingDraft } from './_layout';

/** Step 3: what matters in a venue; weights the "En iyi puan" order on the map. */
export default function OnboardingPriorities() {
  const { draft } = useOnboardingDraft();
  const prefs = draft.workPreferences ?? EMPTY_WORK_PREFERENCES;
  const [priorities, setPriorities] = useState(prefs.priorities);
  useDraftFlush({ workPreferences: { ...prefs, priorities } });
  return (
    <QuizStep
      header={<OnboardingHeader step={3} onBack={() => router.back()} />}
      title="Bir mekânda senin için en önemlisi ne?"
      subtitle="Mekânları sıralarken bunları öne alacağız."
      canContinue={priorities.length > 0}
      onContinue={() => router.push('/onboarding/insight')}
    >
      <OptionList options={PRIORITIES} value={priorities} onChange={setPriorities} multiple max={MAX_PRIORITIES} />
    </QuizStep>
  );
}
