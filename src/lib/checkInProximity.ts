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
