import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

/**
 * Live venue photos: camera shots shared in a place chat (readable only while
 * checked in) and one optional photo on a rating. Both buckets are private and
 * a Pro feature: sending and viewing need photo access. Paths and rules must
 * match supabase/migrations/20261021090000_add_place_photos.sql and
 * 20261021120000_photos_require_pro.sql.
 */
export const CHAT_PHOTO_BUCKET = 'chat-photos';
export const REVIEW_PHOTO_BUCKET = 'review-photos';

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const SIGNED_URL_TTL_S = 3600;
/** Re-sign a little before expiry so a URL never dies while an image loads. */
const SIGNED_URL_MARGIN_MS = 5 * 60_000;

/** `<place_id>/<user_id>/<uuid>.jpg` — the storage policy reads both folders. */
export function chatPhotoPath(placeId: string, userId: string, id: string = Crypto.randomUUID()) {
  return `${placeId}/${userId}/${id}.jpg`;
}

/** `<user_id>/<uuid>.jpg` — uploads are limited to the member's own folder. */
export function reviewPhotoPath(userId: string, id: string = Crypto.randomUUID()) {
  return `${userId}/${id}.jpg`;
}

/**
 * Opens the camera (never the library, so every photo is a live shot at the
 * venue) and returns the local file URI, or null when cancelled or denied.
 * EXIF is dropped so no location leaves the device.
 */
export async function takeCameraPhoto(): Promise<string | null> {
  try {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        'Kamera izni gerekli',
        perm.canAskAgain
          ? 'Mekândan anlık fotoğraf paylaşmak için kamera iznine ihtiyacımız var.'
          : 'Kamera izni kapalı. Ayarlardan açıp tekrar deneyebilirsin.',
      );
      return null;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.6,
      exif: false,
      allowsEditing: false,
    });
    if (result.canceled) return null;
    return result.assets[0]?.uri ?? null;
  } catch (error) {
    // The simulator has no camera; a real device can still fail to open it.
    console.warn('camera failed', error);
    Alert.alert('Kamera açılamadı', 'Biraz sonra tekrar dener misin?');
    return null;
  }
}

/** Uploads a local JPEG to Storage. Never overwrites: every path is a fresh uuid. */
export async function uploadJpeg(bucket: string, path: string, uri: string) {
  if (!isSupabaseConfigured || !supabase) throw new Error('Fotoğraf servisine ulaşılamadı.');
  const response = await fetch(uri);
  if (!response.ok) throw new Error('Fotoğraf okunamadı.');
  const body = await response.arrayBuffer();
  if (body.byteLength === 0) throw new Error('Fotoğraf boş geldi.');
  if (body.byteLength > MAX_PHOTO_BYTES) throw new Error('Fotoğraf 5 MB’dan büyük olamaz.');
  const { error } = await supabase.storage.from(bucket).upload(path, body, {
    contentType: 'image/jpeg',
    upsert: false,
  });
  if (error) throw new Error(`Fotoğraf yüklenemedi: ${error.message}`);
}

/**
 * Mirrors `private.has_photo_access()`: Pro, admin or App Review access. Only
 * decides what the app shows; Storage and the message RPC enforce the rule.
 */
export function hasPhotoAccess(input: {
  isSubscribed: boolean;
  isAdmin: boolean;
  appReviewAccess?: unknown;
}) {
  return input.isSubscribed || input.isAdmin || input.appReviewAccess === true;
}

type SignedRow = { path: string | null; signedUrl: string | null; error?: string | null };

/**
 * Per-path cache of signed URLs. `resolve` signs every missing path in one
 * batch, shares an in-flight batch with concurrent callers and returns only
 * the paths that have a usable URL. A failed batch is simply retried on the
 * next call.
 */
const SIGN_REQUEST_TIMEOUT_MS = 6000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('signed url request timed out')), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

export function createSignedUrlCache(
  sign: (paths: string[]) => Promise<SignedRow[]>,
  opts: { ttlMs?: number; now?: () => number; timeoutMs?: number } = {},
) {
  const ttlMs = opts.ttlMs ?? SIGNED_URL_TTL_S * 1000 - SIGNED_URL_MARGIN_MS;
  const now = opts.now ?? Date.now;
  const cache = new Map<string, { url: string; expiresAt: number }>();
  const inflight = new Map<string, Promise<void>>();

  const fresh = (path: string) => {
    const entry = cache.get(path);
    return entry && entry.expiresAt > now() ? entry.url : undefined;
  };

  async function resolve(paths: string[]): Promise<Record<string, string>> {
    const unique = [...new Set(paths.filter(Boolean))];
    const missing = unique.filter((path) => !fresh(path) && !inflight.has(path));
    if (missing.length > 0) {
      // A request that never settles must not block every later resolve:
      // after SIGN_REQUEST_TIMEOUT_MS it is dropped and the next call re-signs.
      const batch = withTimeout(sign(missing), opts.timeoutMs ?? SIGN_REQUEST_TIMEOUT_MS)
        .then((rows) => {
          const expiresAt = now() + ttlMs;
          for (const row of rows) {
            if (row.path && row.signedUrl && !row.error) cache.set(row.path, { url: row.signedUrl, expiresAt });
          }
        })
        .catch((error) => console.warn('signed photo urls failed', error))
        .finally(() => missing.forEach((path) => inflight.delete(path)));
      missing.forEach((path) => inflight.set(path, batch));
    }
    await Promise.all(unique.map((path) => inflight.get(path)).filter(Boolean));
    const urls: Record<string, string> = {};
    for (const path of unique) {
      const url = fresh(path);
      if (url) urls[path] = url;
    }
    return urls;
  }

  return { resolve, get: fresh };
}

/** Signs paths of one private bucket in a single Storage request. */
export function createBucketSignedUrlCache(bucket: string) {
  return createSignedUrlCache(async (paths) => {
    if (!isSupabaseConfigured || !supabase) return [];
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrls(paths, SIGNED_URL_TTL_S);
    if (error) throw error;
    return (data ?? []) as SignedRow[];
  });
}

/** Both photo buckets are private: shown through short-lived signed URLs. */
export const chatPhotoUrls = createBucketSignedUrlCache(CHAT_PHOTO_BUCKET);
export const reviewPhotoUrls = createBucketSignedUrlCache(REVIEW_PHOTO_BUCKET);
