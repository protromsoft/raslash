import * as Location from 'expo-location';
import { haversineKm } from '@/lib/presence';
import {
  getForegroundPosition,
  requestForegroundLocationAccess,
} from '@/lib/locationPermission';
import { hasValidCoordinates } from '@/lib/placeData';

/** Check-in için izin verilen mesafe (metre). */
export const CHECK_IN_RADIUS_M = 150;

export type ProximityResult = 'near' | 'far' | 'unavailable';

export async function measureProximityTo(place: {
  latitude: number;
  longitude: number;
}): Promise<{ status: ProximityResult; distanceM: number | null }> {
  try {
    if (!hasValidCoordinates(place)) return { status: 'unavailable', distanceM: null };
    const permission = await requestForegroundLocationAccess();
    if (!permission.granted || !(await Location.hasServicesEnabledAsync())) {
      return { status: 'unavailable', distanceM: null };
    }
    const pos = await getForegroundPosition({
      timeoutMs: 12_000,
      maxLastKnownAgeMs: 60_000,
      requiredLastKnownAccuracyM: 100,
    });
    const km = haversineKm(
      { latitude: pos.coords.latitude, longitude: pos.coords.longitude },
      { latitude: place.latitude, longitude: place.longitude },
    );
    const distanceM = Math.round(km * 1000);
    return {
      status: distanceM <= CHECK_IN_RADIUS_M ? 'near' : 'far',
      distanceM,
    };
  } catch {
    return { status: 'unavailable', distanceM: null };
  }
}

/** Beyond this (plus the fix's own uncertainty) the member has left the venue. */
export const LEFT_VENUE_M = 350;
/** Fixes vaguer than this cannot tell "left" from "inside a big building". */
const MAX_AWAY_ACCURACY_M = 200;

/** A precise enough fix that is clearly outside the venue. */
export function isAwayFromVenue(distanceM: number, accuracyM: number | null | undefined) {
  const accuracy = Number.isFinite(accuracyM) ? Math.max(0, accuracyM as number) : Infinity;
  if (!Number.isFinite(distanceM) || accuracy > MAX_AWAY_ACCURACY_M) return false;
  return distanceM - accuracy > LEFT_VENUE_M;
}

/**
 * Where the member is relative to `place`, without ever asking for permission
 * (this runs in the background of an open app). Null when unknown.
 */
export async function checkAwayFrom(place: { latitude: number; longitude: number }): Promise<boolean | null> {
  try {
    if (!hasValidCoordinates(place)) return null;
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const pos = await getForegroundPosition({
      timeoutMs: 10_000,
      maxLastKnownAgeMs: 60_000,
      requiredLastKnownAccuracyM: MAX_AWAY_ACCURACY_M,
    });
    const km = haversineKm({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }, place);
    return isAwayFromVenue(km * 1000, pos.coords.accuracy);
  } catch {
    return null;
  }
}
