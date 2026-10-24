import type { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

/**
 * Languages and interests a member can show on their profile. The database
 * stores only the keys (profiles.languages / profiles.interests, `[a-z_]`);
 * labels live here so they can change without a migration. Languages show
 * their code (TR, EN…) and interests an Ionicon: emoji flags rendered as
 * missing glyphs in testing.
 */
export type ProfileTag = { key: string; label: string; icon?: ComponentProps<typeof Ionicons>['name'] };

export const LANGUAGES: readonly ProfileTag[] = [
  { key: 'tr', label: 'Türkçe' },
  { key: 'en', label: 'İngilizce' },
  { key: 'de', label: 'Almanca' },
  { key: 'fr', label: 'Fransızca' },
  { key: 'es', label: 'İspanyolca' },
  { key: 'it', label: 'İtalyanca' },
  { key: 'ru', label: 'Rusça' },
  { key: 'ar', label: 'Arapça' },
  { key: 'pt', label: 'Portekizce' },
  { key: 'nl', label: 'Felemenkçe' },
  { key: 'ja', label: 'Japonca' },
  { key: 'ko', label: 'Korece' },
  { key: 'zh', label: 'Çince' },
];

export const INTERESTS: readonly ProfileTag[] = [
  { key: 'coffee', label: 'Kahve', icon: 'cafe-outline' },
  { key: 'design', label: 'Tasarım', icon: 'color-palette-outline' },
  { key: 'software', label: 'Yazılım', icon: 'code-slash-outline' },
  { key: 'ai', label: 'Yapay zekâ', icon: 'hardware-chip-outline' },
  { key: 'startups', label: 'Girişimcilik', icon: 'rocket-outline' },
  { key: 'marketing', label: 'Pazarlama', icon: 'megaphone-outline' },
  { key: 'freelance', label: 'Freelance', icon: 'briefcase-outline' },
  { key: 'photography', label: 'Fotoğraf', icon: 'camera-outline' },
  { key: 'music', label: 'Müzik', icon: 'headset-outline' },
  { key: 'books', label: 'Kitap', icon: 'book-outline' },
  { key: 'film', label: 'Sinema', icon: 'film-outline' },
  { key: 'art', label: 'Sanat', icon: 'brush-outline' },
  { key: 'games', label: 'Oyun', icon: 'game-controller-outline' },
  { key: 'travel', label: 'Seyahat', icon: 'airplane-outline' },
  { key: 'sports', label: 'Spor', icon: 'basketball-outline' },
  { key: 'running', label: 'Koşu', icon: 'walk-outline' },
  { key: 'yoga', label: 'Yoga', icon: 'body-outline' },
  { key: 'food', label: 'Yemek', icon: 'restaurant-outline' },
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
