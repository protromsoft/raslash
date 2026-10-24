import { router } from 'expo-router';
import { useState } from 'react';
import { QuizStep } from '@/components/OnboardingQuiz';
import { TagPicker } from '@/components/ProfileTags';
import { INTERESTS, MAX_INTERESTS } from '@/lib/profileTags';
import { OnboardingHeader, useDraftFlush, useOnboardingDraft } from './_layout';

/** Step 8: interests, shown on the profile. */
export default function OnboardingInterests() {
  const { draft, patch } = useOnboardingDraft();
  const [interests, setInterests] = useState(draft.interests ?? []);
  useDraftFlush({ interests });
  // Save before moving on: this step stays mounted under the next one.
  const next = () => { patch({ interests }); router.push('/onboarding/meet'); };
  return (
    <QuizStep
      header={<OnboardingHeader step={8} onBack={() => router.back()} />}
      title="Nelerle ilgileniyorsun?"
      subtitle="Ortak ilgi alanları, aynı mekândaki insanlarla sohbeti kolaylaştırır."
      canContinue={interests.length > 0}
      onContinue={next}
      onSkip={interests.length ? undefined : next}
    >
      <TagPicker label="İlgi alanları" list={INTERESTS} value={interests} max={MAX_INTERESTS} onChange={setInterests} />
    </QuizStep>
  );
}
