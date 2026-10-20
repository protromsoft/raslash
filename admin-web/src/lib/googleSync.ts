import { isSupabaseConfigured, supabase } from './supabase';

export type SyncProgress = {
  phase: string;
  kept: number;
  filteredOut: number;
};

type SyncPlacesResponse = {
  imported?: number;
  pending?: number;
  filteredOut?: number;
  requests?: number;
  message?: string;
};

/** The edge function scans one city per call; three at once would time out. */
export const SYNC_CITIES = [
  { key: 'istanbul', label: 'İstanbul' },
  { key: 'ankara', label: 'Ankara' },
  { key: 'izmir', label: 'İzmir' },
] as const;
export type SyncCity = (typeof SYNC_CITIES)[number]['key'];

export function isGoogleSyncConfigured() {
  return isSupabaseConfigured && Boolean(supabase);
}

async function functionErrorMessage(error: unknown) {
  const context = (error as { context?: unknown } | null)?.context;
  if (context instanceof Response) {
    try {
      const payload = (await context.clone().json()) as SyncPlacesResponse;
      if (payload.message) return payload.message;
    } catch {
      // Fall back to the SDK error below when the response has no JSON body.
    }
  }
  return error instanceof Error ? error.message : 'Google Places eşitlemesi başarısız oldu.';
}

export async function syncGooglePlacesToSupabase(
  onProgress?: (progress: SyncProgress) => void,
  cities: readonly SyncCity[] = SYNC_CITIES.map((c) => c.key),
): Promise<{ kept: number; filteredOut: number; upserted: number }> {
  if (!isGoogleSyncConfigured() || !supabase) {
    throw new Error('Supabase bağlantısı eksik. Admin paneli ortam değişkenlerini kontrol et.');
  }

  let kept = 0;
  let filteredOut = 0;
  for (const city of cities) {
    const label = SYNC_CITIES.find((c) => c.key === city)?.label ?? city;
    onProgress?.({ phase: `${label} taranıyor…`, kept, filteredOut });
    const { data, error } = await supabase.functions.invoke<SyncPlacesResponse>('sync-places', {
      body: { city },
    });
    if (error) throw new Error(await functionErrorMessage(error));

    const imported = Number(data?.imported);
    const dropped = Number(data?.filteredOut ?? 0);
    if (!Number.isFinite(imported) || imported < 0 || !Number.isFinite(dropped) || dropped < 0) {
      throw new Error(data?.message || 'Sunucu geçersiz bir eşitleme sonucu döndürdü.');
    }
    kept += imported;
    filteredOut += dropped;
  }

  onProgress?.({
    phase: 'Supabase kayıtları güncellendi · yeni mekânlar onay bekliyor',
    kept,
    filteredOut,
  });
  return { kept, filteredOut, upserted: kept };
}
