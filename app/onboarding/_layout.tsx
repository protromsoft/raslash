import { Stack } from 'expo-router';
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Profile } from '@/context/AppContext';
import { colors } from '@/theme/colors';

type Draft = Profile;

const emptyDraft: Draft = {
  firstName: '',
  lastName: '',
  age: '',
  profession: '',
  gender: '',
  bio: '',
  avatarUrl: '',
  linkedin: '',
  instagram: '',
};

type DraftState = {
  draft: Draft;
  patch: (next: Partial<Draft>) => void;
};

const DraftContext = createContext<DraftState | null>(null);

/**
 * Onboarding steps share one in-memory draft instead of passing every field
 * through navigation params, so steps can be reordered without breaking data.
 */
export function useOnboardingDraft() {
  const ctx = useContext(DraftContext);
  if (!ctx) throw new Error('useOnboardingDraft must be used inside the onboarding stack');
  return ctx;
}

export default function OnboardingLayout() {
  const [draft, setDraft] = useState<Draft>(emptyDraft);

  const value = useMemo<DraftState>(
    () => ({
      draft,
      patch: (next) => setDraft((prev) => ({ ...prev, ...next })),
    }),
    [draft],
  );

  return (
    <DraftContext.Provider value={value}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: 'slide_from_right',
          animationDuration: 280,
          gestureEnabled: true,
        }}
      >
        <Stack.Screen name="index" options={{ animation: 'fade' }} />
        <Stack.Screen name="location" options={{ animation: 'slide_from_bottom' }} />
      </Stack>
    </DraftContext.Provider>
  );
}
