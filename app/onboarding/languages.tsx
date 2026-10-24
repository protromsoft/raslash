import { router } from 'expo-router';
import { useState } from 'react';
import { QuizStep } from '@/components/OnboardingQuiz';
import { TagPicker } from '@/components/ProfileTags';
import { LANGUAGES, MAX_LANGUAGES } from '@/lib/profileTags';
import { OnboardingHeader, useDraftFlush, useOnboardingDraft } from './_layout';

/** Step 7: languages, shown on the profile. */
export default function OnboardingLanguages() {
  const { draft, patch } = useOnboardingDraft();
  const [languages, setLanguages] = useState(draft.languages ?? []);
  useDraftFlush({ languages });
  // Save before moving on: this step stays mounted under the next one.
  const next = () => { patch({ languages }); router.push('/onboarding/interests'); };
  return (
    <QuizStep
      header={<OnboardingHeader step={7} onBack={() => router.back()} />}
      title="Hangi dilleri konuşuyorsun?"
      subtitle="Profilinde görünür; aynı dili konuşanlar seni daha kolay bulur."
      canContinue={languages.length > 0}
      onContinue={next}
      onSkip={languages.length ? undefined : next}
    >
      <TagPicker label="Diller" list={LANGUAGES} value={languages} max={MAX_LANGUAGES} onChange={setLanguages} />
    </QuizStep>
  );
}
