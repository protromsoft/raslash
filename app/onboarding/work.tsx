import { router } from 'expo-router';
import { useState } from 'react';
import { OptionList, QuizStep } from '@/components/OnboardingQuiz';
import { EMPTY_WORK_PREFERENCES, WORK_STYLES } from '@/lib/onboardingQuiz';
import { OnboardingHeader, useDraftFlush, useOnboardingDraft } from './_layout';

/** Step 2: how the member works. */
export default function OnboardingWork() {
  const { draft } = useOnboardingDraft();
  const prefs = draft.workPreferences ?? EMPTY_WORK_PREFERENCES;
  const [style, setStyle] = useState(prefs.workStyle);
  useDraftFlush({ workPreferences: { ...prefs, workStyle: style } });
  return (
    <QuizStep
      header={<OnboardingHeader step={2} onBack={() => router.back()} />}
      title="Nasıl çalışıyorsun?"
      subtitle="Sana benzer şekilde çalışan insanlarla aynı mekânlarda karşılaşman daha olası."
      canContinue={!!style}
      onContinue={() => router.push('/onboarding/priorities')}
    >
      <OptionList options={WORK_STYLES} value={style ? [style] : []} onChange={([next]) => setStyle(next ?? '')} />
    </QuizStep>
  );
}
