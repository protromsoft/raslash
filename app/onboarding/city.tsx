import { router } from 'expo-router';
import { useState } from 'react';
import { OptionList, QuizStep } from '@/components/OnboardingQuiz';
import { SUPPORTED_CITIES, type CityKey } from '@/data/cities';
import { OnboardingHeader, useDraftFlush, useOnboardingDraft } from './_layout';

const CITY_OPTIONS = SUPPORTED_CITIES.map((city) => ({
  key: city.key,
  label: city.label,
  icon: 'location-outline' as const,
}));

/** Step 6: the city the map opens on. */
export default function OnboardingCity() {
  const { draft } = useOnboardingDraft();
  const [city, setCity] = useState<CityKey | ''>(draft.city ?? '');
  useDraftFlush({ city });
  return (
    <QuizStep
      header={<OnboardingHeader step={6} onBack={() => router.back()} />}
      title="Hangi şehirdesin?"
      subtitle="Harita bu şehirle açılacak. İstediğin zaman değiştirebilirsin."
      canContinue={!!city}
      onContinue={() => router.push('/onboarding/languages')}
    >
      <OptionList options={CITY_OPTIONS} value={city ? [city] : []}
        onChange={([next]) => setCity((next as CityKey | undefined) ?? '')} />
    </QuizStep>
  );
}
