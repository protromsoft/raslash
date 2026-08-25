import * as Location from 'expo-location';
import { Alert, Linking } from 'react-native';

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
