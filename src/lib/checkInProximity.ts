import * as Location from 'expo-location';
import { haversineKm } from '@/lib/presence';

/** Check-in için izin verilen mesafe (metre). */
export const CHECK_IN_RADIUS_M = 150;

export type ProximityResult = 'near' | 'far' | 'unavailable';

export async function measureProximityTo(place: {
  latitude: number;
  longitude: number;
}): Promise<{ status: ProximityResult; distanceM: number | null }> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      return { status: 'unavailable', distanceM: null };
    }
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
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
