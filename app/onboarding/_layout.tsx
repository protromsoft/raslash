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
import { colors } from '@/theme/colors';

/** Profile → photo & links → permissions. */
export const ONBOARDING_STEPS = 3;

/**
 * Back button plus one bar per onboarding step. Segments instead of a filling
 * bar: three steps read as "1 of 3" at a glance, a percentage does not.
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
        style={headerStyles.segments}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={`Adım ${step} / ${ONBOARDING_STEPS}`}
      >
        {Array.from({ length: ONBOARDING_STEPS }, (_, index) => (
          <View
            key={index}
            style={[
              headerStyles.segment,
              {
                backgroundColor:
                  index < step
                    ? onPhoto
                      ? colors.white
                      : colors.ink
                    : onPhoto
                      ? 'rgba(255,255,255,0.22)'
                      : colors.track,
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const headerStyles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  segments: { flex: 1, flexDirection: 'row', gap: 6 },
  segment: { flex: 1, height: 4, borderRadius: 2 },
});

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

function parseStoredDraft(raw: string): Draft | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    const text = (key: keyof Draft) =>
      typeof record[key] === 'string' ? record[key] : emptyDraft[key] ?? '';
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
