import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { QuizStep } from '@/components/OnboardingQuiz';
import { Appear } from '@/components/Motion';
import { usePlaces } from '@/context/PlacesContext';
import { cityKey } from '@/data/cities';
import { EMPTY_WORK_PREFERENCES, sortByPriorities } from '@/lib/onboardingQuiz';
import { districtForPlace } from '@/lib/placeLabel';
import { colors, shadows } from '@/theme/colors';
import { OnboardingHeader, useOnboardingDraft } from './_layout';

const STEPS = [
  'Şehrindeki mekânlar taranıyor',
  'Önceliklerine göre sıralanıyor',
  'Çalışma saatlerine göre ayarlanıyor',
  'Profilin hazırlanıyor',
];
const STEP_MS = 700;

/** Step 12: the answers turned into a first list of venues for this member. */
export default function OnboardingPlan() {
  const { draft } = useOnboardingDraft();
  const { places, labelFor } = usePlaces();
  const prefs = draft.workPreferences ?? EMPTY_WORK_PREFERENCES;
  const [done, setDone] = useState(0);
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(1, { duration: STEP_MS * STEPS.length, easing: Easing.linear });
    const timers = STEPS.map((_, index) => setTimeout(() => setDone(index + 1), STEP_MS * (index + 1)));
    return () => timers.forEach(clearTimeout);
  }, [progress]);
  const bar = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));
  const ready = done >= STEPS.length;

  const picks = useMemo(() => {
    const inCity = draft.city ? places.filter((place) => cityKey(place.city) === draft.city) : places;
    return sortByPriorities(inCity, prefs.priorities).slice(0, 3);
  }, [draft.city, places, prefs.priorities]);

  return (
    <QuizStep
      header={<OnboardingHeader step={12} onBack={() => router.back()} />}
      title={ready ? 'Senin için hazır' : 'Raslash’ı sana göre ayarlıyoruz'}
      subtitle={ready ? 'Önceliklerine göre şehrindeki ilk öneriler. Hepsi haritada seni bekliyor.' : undefined}
      canContinue={ready}
      onContinue={() => router.push('/onboarding/location')}
    >
      <View style={styles.track}><Animated.View style={[styles.fill, bar]} /></View>
      <View style={styles.steps}>
        {STEPS.map((label, index) => {
          const finished = index < done;
          return (
            <View key={label} style={styles.step}>
              <View style={[styles.dot, finished && styles.dotDone]}>
                {finished ? <Ionicons name="checkmark" size={13} color={colors.white} /> : null}
              </View>
              <Text style={[styles.stepText, finished && styles.stepTextDone]}>{label}</Text>
            </View>
          );
        })}
      </View>
      {ready && picks.length ? (
        <View style={styles.picks}>
          {picks.map((place, index) => (
            <Appear key={place.id} delay={index * 110}>
              <View style={styles.pick}>
                <Image source={{ uri: place.imageUrl }} style={styles.thumb} contentFit="cover" />
                <View style={styles.pickCopy}>
                  <Text style={styles.pickName} numberOfLines={1}>{labelFor(place)}</Text>
                  <Text style={styles.pickMeta} numberOfLines={1}>
                    {[place.category, districtForPlace(place)].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                {place.reviewCount > 0 ? (
                  <Text style={styles.score}>{`★ ${place.overall.toFixed(1)}`}</Text>
                ) : null}
              </View>
            </Appear>
          ))}
        </View>
      ) : null}
    </QuizStep>
  );
}

const styles = StyleSheet.create({
  track: { height: 8, borderRadius: 4, backgroundColor: colors.track, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: colors.ink },
  steps: { gap: 12 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.lineStrong,
    alignItems: 'center', justifyContent: 'center' },
  dotDone: { backgroundColor: colors.green, borderColor: colors.green },
  stepText: { fontFamily: 'DMSans_500Medium', fontSize: 15, color: colors.muted },
  stepTextDone: { color: colors.ink },
  picks: { gap: 10 },
  pick: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 20,
    backgroundColor: colors.white, ...shadows.soft },
  thumb: { width: 56, height: 56, borderRadius: 14, backgroundColor: colors.bgSoft },
  pickCopy: { flex: 1, minWidth: 0, gap: 2 },
  pickName: { fontFamily: 'DMSans_700Bold', fontSize: 15.5, color: colors.ink },
  pickMeta: { fontFamily: 'DMSans_400Regular', fontSize: 13, color: colors.muted },
  score: { fontFamily: 'DMSans_700Bold', fontSize: 14, color: colors.ink },
});
