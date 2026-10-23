/**
 * Languages and interests a member can show on their profile. The database
 * stores only the keys (profiles.languages / profiles.interests, `[a-z_]`);
 * labels and emoji live here so they can change without a migration.
 */
export type ProfileTag = { key: string; label: string; emoji: string };

export const LANGUAGES: readonly ProfileTag[] = [
  { key: 'tr', label: 'Türkçe', emoji: '🇹🇷' },
  { key: 'en', label: 'İngilizce', emoji: '🇬🇧' },
  { key: 'de', label: 'Almanca', emoji: '🇩🇪' },
  { key: 'fr', label: 'Fransızca', emoji: '🇫🇷' },
  { key: 'es', label: 'İspanyolca', emoji: '🇪🇸' },
  { key: 'it', label: 'İtalyanca', emoji: '🇮🇹' },
  { key: 'ru', label: 'Rusça', emoji: '🇷🇺' },
  { key: 'ar', label: 'Arapça', emoji: '🇸🇦' },
  { key: 'pt', label: 'Portekizce', emoji: '🇵🇹' },
  { key: 'nl', label: 'Felemenkçe', emoji: '🇳🇱' },
  { key: 'ja', label: 'Japonca', emoji: '🇯🇵' },
  { key: 'ko', label: 'Korece', emoji: '🇰🇷' },
  { key: 'zh', label: 'Çince', emoji: '🇨🇳' },
];

export const INTERESTS: readonly ProfileTag[] = [
  { key: 'coffee', label: 'Kahve', emoji: '☕' },
  { key: 'design', label: 'Tasarım', emoji: '🎨' },
  { key: 'software', label: 'Yazılım', emoji: '💻' },
  { key: 'ai', label: 'Yapay zekâ', emoji: '🤖' },
  { key: 'startups', label: 'Girişimcilik', emoji: '🚀' },
  { key: 'marketing', label: 'Pazarlama', emoji: '📣' },
  { key: 'freelance', label: 'Freelance', emoji: '🧳' },
  { key: 'photography', label: 'Fotoğraf', emoji: '📷' },
  { key: 'music', label: 'Müzik', emoji: '🎧' },
  { key: 'books', label: 'Kitap', emoji: '📚' },
  { key: 'film', label: 'Sinema', emoji: '🎬' },
  { key: 'art', label: 'Sanat', emoji: '🖼️' },
  { key: 'games', label: 'Oyun', emoji: '🎮' },
  { key: 'travel', label: 'Seyahat', emoji: '✈️' },
  { key: 'sports', label: 'Spor', emoji: '🏀' },
  { key: 'running', label: 'Koşu', emoji: '🏃' },
  { key: 'yoga', label: 'Yoga', emoji: '🧘' },
  { key: 'food', label: 'Yemek', emoji: '🍜' },
];

export const MAX_LANGUAGES = 8;
export const MAX_INTERESTS = 10;

/** Known tags in list order; unknown or repeated keys are dropped. */
export function tagsFor(keys: readonly string[] | null | undefined, list: readonly ProfileTag[]): ProfileTag[] {
  const wanted = new Set(Array.isArray(keys) ? keys : []);
  return list.filter((tag) => wanted.has(tag.key));
}

/** Keys safe to save: known, unique, in list order, at most `max`. */
export function cleanTagKeys(keys: readonly string[] | null | undefined, list: readonly ProfileTag[], max: number): string[] {
  return tagsFor(keys, list).slice(0, max).map((tag) => tag.key);
}

/** Adds or removes `key`; adding past `max` leaves the selection unchanged. */
export function toggleTag(keys: readonly string[], key: string, max: number): string[] {
  if (keys.includes(key)) return keys.filter((k) => k !== key);
  return keys.length >= max ? [...keys] : [...keys, key];
}
