import { isSupabaseConfigured, supabase } from '@/lib/supabase';

const BUCKET = 'avatars';

/** Local device URIs (and anything that is not already a public http(s) URL). */
export function isLocalAvatarUri(uri: string | undefined | null): boolean {
  const value = uri?.trim() ?? '';
  if (!value) return false;
  return !(value.startsWith('https://') || value.startsWith('http://'));
}

function guessContentType(uri: string, mimeType?: string | null) {
  if (mimeType && mimeType.startsWith('image/')) return mimeType;
  const lower = uri.toLowerCase();
  if (lower.includes('.png')) return 'image/png';
  if (lower.includes('.webp')) return 'image/webp';
  if (lower.includes('.heic')) return 'image/heic';
  return 'image/jpeg';
}

function extensionFor(contentType: string) {
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/webp') return 'webp';
  if (contentType === 'image/heic') return 'heic';
  return 'jpg';
}

/**
 * Uploads a local picker URI to Storage and returns a public https URL.
 * Already-remote URLs and empty values pass through unchanged.
 */
export async function resolveAvatarUrl(
  userId: string,
  avatarUrl: string | undefined,
  opts?: { mimeType?: string | null },
): Promise<string> {
  const uri = avatarUrl?.trim() ?? '';
  if (!uri || !isLocalAvatarUri(uri)) return uri;
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase yapılandırılmamış; fotoğraf yüklenemedi.');
  }

  const contentType = guessContentType(uri, opts?.mimeType);
  const ext = extensionFor(contentType);
  const path = `${userId}/avatar.${ext}`;

  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error('Seçilen fotoğraf okunamadı.');
  }
  const body = await response.arrayBuffer();
  if (body.byteLength === 0) {
    throw new Error('Seçilen fotoğraf boş geldi.');
  }
  if (body.byteLength > 5 * 1024 * 1024) {
    throw new Error('Fotoğraf 5 MB’dan büyük olamaz.');
  }

  const { error } = await supabase.storage.from(BUCKET).upload(path, body, {
    contentType,
    upsert: true,
    cacheControl: '3600',
  });
  if (error) {
    // Bucket / policy missing is the usual cause until avatars_storage.sql runs.
    throw new Error(
      error.message.toLowerCase().includes('bucket')
        ? 'Fotoğraf deposu henüz hazır değil. supabase/avatars_storage.sql dosyasını çalıştır.'
        : `Fotoğraf yüklenemedi: ${error.message}`,
    );
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  // Bust CDN / Image caches when the same path is overwritten.
  return `${data.publicUrl}?v=${Date.now()}`;
}
