import { router } from 'expo-router';
import { useState } from 'react';
import { OptionList, QuizStep } from '@/components/OnboardingQuiz';
import { OnboardingHeader, useDraftFlush, useOnboardingDraft } from './_layout';

const OPTIONS = [
  { key: 'yes', label: 'Evet, görünür olayım', icon: 'hand-left-outline' as const,
    hint: 'Check-in yaptığın mekânda Kişiler’de görünürsün ve mesaj isteği alabilirsin' },
  { key: 'later', label: 'Şimdilik sadece bakayım', icon: 'eye-outline' as const,
    hint: 'Görünmezsin; istediğin zaman Profil’den açabilirsin' },
];

/** Step 9: visibility to other members. Applied when onboarding finishes. */
export default function OnboardingMeet() {
  const { draft, patch } = useOnboardingDraft();
  const [meet, setMeet] = useState(draft.meetPeople ?? '');
  const answers = { meetPeople: meet };
  useDraftFlush(answers);
  return (
    <QuizStep
      header={<OnboardingHeader step={9} onBack={() => router.back()} />}
      title="Mekânda yeni insanlarla tanışmak ister misin?"
      subtitle="Konumun hiçbir zaman paylaşılmaz; yalnızca check-in yaptığın mekân görünür."
      canContinue={!!meet}
      onContinue={() => { patch(answers); router.push('/onboarding/name'); }}
    >
      <OptionList options={OPTIONS} value={meet ? [meet] : []}
        onChange={([next]) => setMeet((next as 'yes' | 'later' | undefined) ?? '')} />
    </QuizStep>
  );
}
