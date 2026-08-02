import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack } from 'expo-router';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { View } from 'react-native';
import { ONBOARDING_DRAFT_KEY as DRAFT_KEY, type Profile } from '@/context/AppContext';
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
  clear: () => void;
};

const DraftContext = createContext<DraftState | null>(null);

/**
 * Onboarding steps share one draft instead of passing every field through
 * navigation params, so steps can be reordered without breaking data. It is
 * mirrored to storage as well: someone who is interrupted halfway through and
 * kills the app gets their answers back instead of retyping them.
 */
export function useOnboardingDraft() {
  const ctx = useContext(DraftContext);
  if (!ctx) throw new Error('useOnboardingDraft must be used inside the onboarding stack');
  return ctx;
}

/**
 * Writes a step's answers back into the draft when it leaves, so the back
 * button and the swipe-back gesture keep them just like "Devam" does.
 */
export function useDraftFlush(values: Partial<Draft>) {
  const { patch } = useOnboardingDraft();
  const latest = useRef(values);
  latest.current = values;
  useEffect(() => () => patch(latest.current), [patch]);
}

export default function OnboardingLayout() {
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [hydrated, setHydrated] = useState(false);
  const current = useRef(draft);
  // Steps flush their inputs back into the draft as they unmount. Once the
  // draft has been handed over to the profile that flush must not resurrect it.
  const closed = useRef(false);

  const store = useCallback((next: Draft) => {
    current.current = next;
    setDraft(next);
  }, []);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(DRAFT_KEY)
      .then((stored) => {
        // A step may already have written to the draft while the read was in
        // flight; that answer is newer than anything on disk.
        if (!mounted || !stored || current.current !== emptyDraft) return;
        store({ ...emptyDraft, ...(JSON.parse(stored) as Partial<Draft>) });
      })
      .catch(() => undefined)
      .finally(() => {
        if (mounted) setHydrated(true);
      });
    return () => {
      mounted = false;
    };
  }, [store]);

  const patch = useCallback(
    (next: Partial<Draft>) => {
      if (closed.current) return;
      const merged = { ...current.current, ...next };
      store(merged);
      AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(merged)).catch(() => undefined);
    },
    [store],
  );

  const clear = useCallback(() => {
    closed.current = true;
    store(emptyDraft);
    AsyncStorage.removeItem(DRAFT_KEY).catch(() => undefined);
  }, [store]);

  const value = useMemo<DraftState>(() => ({ draft, patch, clear }), [draft, patch, clear]);

  // Steps seed their inputs from the draft on mount, so nothing may render
  // before the stored answers are back.
  if (!hydrated) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  // One motion per step change: the card slides, its content rides along
  // already composed. Entrance animations on the content underneath would land
  // a second, vertical motion on top of the slide and read as a stutter.
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
