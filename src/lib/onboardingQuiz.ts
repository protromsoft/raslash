/**
 * The personalisation questions of onboarding. Answers are saved on the
 * profile (`profiles.work_preferences`, keys only; labels live here) and used
 * by the map: priorities weight the "En iyi puan" order, the city becomes the
 * map's starting city, and "meet people" turns on visibility.
 */
import type { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

/** Ionicons, not emoji: they render the same on every device and font setup. */
export type QuizOption = { key: string; label: string; icon: ComponentProps<typeof Ionicons>['name']; hint?: string };

export const GOALS: readonly QuizOption[] = [
  { key: 'focus', label: 'Odaklanıp çalışmak', icon: 'headset-outline', hint: 'Sessiz, verimli bir köşe' },
  { key: 'meet', label: 'Yeni insanlarla tanışmak', icon: 'people-outline', hint: 'Aynı mekândakilerle bağlantı' },
  { key: 'study', label: 'Ders çalışmak', icon: 'book-outline', hint: 'Sınav, ödev, proje' },
  { key: 'meetings', label: 'Toplantı ve görüşmeler', icon: 'chatbubbles-outline', hint: 'Müşteri, ekip, mülakat' },
  { key: 'explore', label: 'Yeni mekânlar keşfetmek', icon: 'compass-outline', hint: 'Her hafta farklı bir yer' },
];

export const WORK_STYLES: readonly QuizOption[] = [
  { key: 'remote', label: 'Uzaktan çalışıyorum', icon: 'home-outline' },
  { key: 'freelance', label: 'Freelance çalışıyorum', icon: 'laptop-outline' },
  { key: 'founder', label: 'Kendi işimi kuruyorum', icon: 'rocket-outline' },
  { key: 'student', label: 'Öğrenciyim', icon: 'school-outline' },
  { key: 'hybrid', label: 'Ofis + dışarıda, hibrit', icon: 'swap-horizontal-outline' },
];

/** `scores` names the rating it weights; null means it does not change the order. */
export const PRIORITIES: readonly (QuizOption & { scores: 'wifi' | 'outlets' | 'comfort' | null })[] = [
  { key: 'wifi', label: 'Hızlı Wi‑Fi', icon: 'wifi-outline', scores: 'wifi' },
  { key: 'outlets', label: 'Bol priz', icon: 'flash-outline', scores: 'outlets' },
  { key: 'comfort', label: 'Rahat oturma', icon: 'happy-outline', scores: 'comfort' },
  { key: 'quiet', label: 'Sessiz ortam', icon: 'volume-mute-outline', scores: 'comfort' },
  { key: 'coffee', label: 'İyi kahve', icon: 'cafe-outline', scores: null },
  { key: 'people', label: 'Kalabalık ve sosyal', icon: 'people-outline', scores: null },
];
export const MAX_PRIORITIES = 3;

export const WORK_TIMES: readonly QuizOption[] = [
  { key: 'morning', label: 'Sabah', icon: 'sunny-outline', hint: '08–12' },
  { key: 'afternoon', label: 'Öğleden sonra', icon: 'partly-sunny-outline', hint: '12–17' },
  { key: 'evening', label: 'Akşam', icon: 'moon-outline', hint: '17 sonrası' },
  { key: 'weekend', label: 'Hafta sonu', icon: 'calendar-outline', hint: 'Cumartesi, pazar' },
];

export type WorkPreferences = {
  goals: string[];
  workStyle: string;
  priorities: string[];
  workTimes: string[];
};

export const EMPTY_WORK_PREFERENCES: WorkPreferences = { goals: [], workStyle: '', priorities: [], workTimes: [] };

const known = (list: readonly QuizOption[], keys: unknown, max = list.length) =>
  (Array.isArray(keys) ? list.filter((option) => keys.includes(option.key)).map((option) => option.key) : [])
    .slice(0, max);

/** Only known keys, in list order; anything else from storage or the server is dropped. */
export function cleanWorkPreferences(value: unknown): WorkPreferences {
  const record = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const style = typeof record.workStyle === 'string' && WORK_STYLES.some((o) => o.key === record.workStyle)
    ? record.workStyle : '';
  return {
    goals: known(GOALS, record.goals),
    workStyle: style,
    priorities: known(PRIORITIES, record.priorities, MAX_PRIORITIES),
    workTimes: known(WORK_TIMES, record.workTimes),
  };
}

type Scored = { wifi: number; comfort: number; outlets: number; overall: number; reviewCount: number };

/**
 * A place's rating as this member weighs it: each chosen priority that maps to
 * a rating counts double. Places without ratings stay at 0 so rated ones lead.
 */
export function priorityScore(place: Scored, priorities: readonly string[] = []) {
  if (!place.reviewCount) return 0;
  const weights = { wifi: 1, comfort: 1, outlets: 1 };
  for (const key of priorities) {
    const target = PRIORITIES.find((option) => option.key === key)?.scores;
    if (target) weights[target] += 1;
  }
  const total = weights.wifi + weights.comfort + weights.outlets;
  return (place.wifi * weights.wifi + place.comfort * weights.comfort + place.outlets * weights.outlets) / total;
}

/** "En iyi puan" order for this member: weighted score, then number of ratings. */
export function sortByPriorities<T extends Scored>(places: readonly T[], priorities: readonly string[] = []) {
  return [...places].sort((a, b) =>
    priorityScore(b, priorities) - priorityScore(a, priorities) || b.reviewCount - a.reviewCount);
}
