import * as Location from 'expo-location';
import { Alert, Linking } from 'react-native';
import { hasValidCoordinates } from '@/lib/placeData';

export type ForegroundLocationAccess = {
  granted: boolean;
  canAskAgain: boolean;
};

/**
 * Requests iOS/Android foreground location only when it is not already granted.
 * Callers still decide whether denial blocks the current action.
 */
export async function requestForegroundLocationAccess(): Promise<ForegroundLocationAccess> {
  let permission = await Location.getForegroundPermissionsAsync();
  if (permission.status !== 'granted' && permission.canAskAgain) {
    permission = await Location.requestForegroundPermissionsAsync();
  }
  return {
    granted: permission.status === 'granted',
    canAskAgain: permission.canAskAgain,
  };
}

type ForegroundPositionOptions = {
  timeoutMs?: number;
  /** A recent cached fix is safer than trapping the UI on an unavailable GPS. */
  maxLastKnownAgeMs?: number;
  requiredLastKnownAccuracyM?: number;
};

/**
 * Gets a bounded foreground fix and falls back to a recent, sufficiently
 * accurate cached position. Expo notes that a fresh fix can take several
 * seconds indoors; without a bound the map/check-in CTA can remain busy forever.
 */
export async function getForegroundPosition({
  timeoutMs = 12_000,
  maxLastKnownAgeMs = 60_000,
  requiredLastKnownAccuracyM = 150,
}: ForegroundPositionOptions = {}): Promise<Location.LocationObject> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const current = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const position = await Promise.race([
      current,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error('location_timeout')), timeoutMs);
      }),
    ]);
    if (!hasValidCoordinates(position.coords)) throw new Error('location_invalid');
    return position;
  } catch (currentError) {
    try {
      const cached = await Location.getLastKnownPositionAsync({
        maxAge: maxLastKnownAgeMs,
        requiredAccuracy: requiredLastKnownAccuracyM,
      });
      if (cached && hasValidCoordinates(cached.coords)) return cached;
    } catch {
      // Preserve the fresh-fix failure below; it is the useful diagnostic.
    }
    throw currentError;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

/** Gives a denied user a recoverable path without ever throwing from the UI event. */
export function showLocationSettingsAlert() {
  Alert.alert(
    'Konum izni gerekli',
    'Yakındaki mekânları sıralamak ve kendi konumuna gitmek için konum iznini Ayarlar’dan açabilirsin.',
    [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Ayarları Aç',
        onPress: () => {
          void Linking.openSettings().catch(() => undefined);
        },
      },
    ],
  );
}
