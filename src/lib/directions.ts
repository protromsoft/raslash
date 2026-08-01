import { Linking, Platform } from 'react-native';

type Target = {
  name?: string;
  latitude: number;
  longitude: number;
};

/**
 * Opens turn-by-turn directions in the platform's map app.
 *
 * Uses universal https links on purpose: iOS hands maps.apple.com to Apple Maps
 * and Android hands google.com/maps to Google Maps, so we avoid custom schemes
 * that would need LSApplicationQueriesSchemes / Android package queries.
 */
export async function openDirections({ name, latitude, longitude }: Target) {
  const destination = `${latitude},${longitude}`;
  const label = encodeURIComponent(name?.trim() || 'Mekan');

  const url =
    Platform.OS === 'ios'
      ? `https://maps.apple.com/?daddr=${destination}&q=${label}&dirflg=d`
      : `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`;

  try {
    await Linking.openURL(url);
  } catch {
    await Linking.openURL(
      `https://www.google.com/maps/dir/?api=1&destination=${destination}`,
    ).catch(() => undefined);
  }
}
