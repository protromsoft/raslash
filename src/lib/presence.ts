import { AppState, type AppStateStatus } from 'react-native';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

const STALE_MS = 2 * 60 * 1000;

/**
 * The presence table is optional (supabase/presence.sql). If the project hasn't
 * run that migration we stop calling it instead of warning on every heartbeat.
 */
let presenceDisabled = false;

function disablePresenceIfMissing(message: string, scope: string) {
  const missing = message.includes('map_presence') || message.includes('schema cache');
  if (missing && !presenceDisabled) {
    presenceDisabled = true;
    console.warn(
      `[presence] disabled for this session — run supabase/presence.sql to enable live counts (${scope}: ${message})`,
    );
    return;
  }
  if (!missing) console.warn(`presence ${scope}`, message);
}

export function haversineKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export async function upsertPresence(input: {
  userId: string;
  latitude: number;
  longitude: number;
  appState: 'active' | 'background';
}) {
  if (!isSupabaseConfigured || !supabase || presenceDisabled) return;
  const { error } = await supabase.from('map_presence').upsert(
    {
      user_id: input.userId,
      latitude: input.latitude,
      longitude: input.longitude,
      app_state: input.appState,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
  if (error) disablePresenceIfMissing(error.message, 'upsert');
}

export async function countActiveInBounds(bounds: {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}) {
  if (!isSupabaseConfigured || !supabase || presenceDisabled) return null;
  const since = new Date(Date.now() - STALE_MS).toISOString();
  const { data, error } = await supabase
    .from('map_presence')
    .select('user_id')
    .gte('updated_at', since)
    .gte('latitude', bounds.minLat)
    .lte('latitude', bounds.maxLat)
    .gte('longitude', bounds.minLng)
    .lte('longitude', bounds.maxLng);
  if (error) {
    disablePresenceIfMissing(error.message, 'count');
    return null;
  }
  return data?.length ?? 0;
}

export function currentAppPresenceState(state: AppStateStatus = AppState.currentState) {
  return state === 'active' ? 'active' : 'background';
}

export function isPopularPlace(place: {
  overall: number;
  reviewCount: number;
  checkedInCount: number;
}) {
  return (
    (place.overall >= 4.2 && place.reviewCount > 0) ||
    place.checkedInCount >= 3 ||
    (place.overall >= 4 && place.reviewCount >= 2)
  );
}
