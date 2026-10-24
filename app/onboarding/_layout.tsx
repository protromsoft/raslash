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
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BackButton } from '@/components/ui';
import { ONBOARDING_DRAFT_KEY as DRAFT_KEY, type Profile } from '@/context/AppContext';
import { SUPPORTED_CITIES, type CityKey } from '@/data/cities';
import { cleanWorkPreferences, EMPTY_WORK_PREFERENCES } from '@/lib/onboardingQuiz';
import { colors } from '@/theme/colors';

/**
 * Questions → profile → plan → permissions. Every step after the welcome
 * carousel shows where it is in this count.
 */
export const ONBOARDING_STEPS = 14;

/**
 * Back button plus a progress bar. With fourteen steps, segments got too thin
 * to read; one bar that fills up says "almost there" better.
 */
export function OnboardingHeader({
  step,
  onBack,
  tone = 'light',
  style,
}: {
  /** 1-based step that is currently shown. */
  step: number;
  onBack?: () => void;
  /** `dark` sits on a photo: light bars, dark back button. */
  tone?: 'light' | 'dark';
  style?: StyleProp<ViewStyle>;
}) {
  const onPhoto = tone === 'dark';
  return (
    <View style={[headerStyles.bar, style]}>
      {onBack ? <BackButton onPress={onBack} tone={tone} /> : <View style={{ width: 42 }} />}
      <View
        style={[headerStyles.track, { backgroundColor: onPhoto ? 'rgba(255,255,255,0.22)' : colors.track }]}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={`Adım ${step} / ${ONBOARDING_STEPS}`}
        accessibilityValue={{ min: 0, max: ONBOARDING_STEPS, now: step }}
      >
        <View
          style={[
            headerStyles.fill,
            {
              width: `${Math.min(100, Math.max(4, (step / ONBOARDING_STEPS) * 100))}%`,
              backgroundColor: onPhoto ? colors.white : colors.ink,
            },
          ]}
        />
      </View>
    </View>
  );
}

const headerStyles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  track: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
});

/** Answers that are not profile fields: applied when onboarding finishes. */
export type Draft = Profile & {
  /** The map's starting city. */
  city?: CityKey | '';
  /** 'yes' turns on map visibility and message requests. */
  meetPeople?: 'yes' | 'later' | '';
};

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
  languages: [],
  interests: [],
  workPreferences: EMPTY_WORK_PREFERENCES,
  city: '',
  meetPeople: '',
};

function parseStoredDraft(raw: string): Draft | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    type TextKey = 'firstName' | 'lastName' | 'age' | 'profession' | 'gender' | 'bio' | 'avatarUrl'
      | 'linkedin' | 'instagram';
    const text = (key: TextKey) =>
      typeof record[key] === 'string' ? (record[key] as string) : emptyDraft[key] ?? '';
    const keys = (key: 'languages' | 'interests') =>
      Array.isArray(record[key]) ? (record[key] as unknown[]).filter((k): k is string => typeof k === 'string') : [];
    const city = SUPPORTED_CITIES.find((item) => item.key === record.city)?.key ?? '';
    const meetPeople = record.meetPeople === 'yes' || record.meetPeople === 'later' ? record.meetPeople : '';
    return {
      firstName: text('firstName'),
      lastName: text('lastName'),
      age: text('age'),
      profession: text('profession'),
      gender: text('gender'),
      bio: text('bio'),
      avatarUrl: text('avatarUrl'),
      linkedin: text('linkedin'),
      instagram: text('instagram'),
      languages: keys('languages'),
      interests: keys('interests'),
      workPreferences: cleanWorkPreferences(record.workPreferences),
      city,
      meetPeople,
    };
  } catch {
    return null;
  }
}

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
        const restored = parseStoredDraft(stored);
        if (restored) store(restored);
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
        <Stack.Screen name="notifications" options={{ animation: 'slide_from_right' }} />
      </Stack>
    </DraftContext.Provider>
  );
}
