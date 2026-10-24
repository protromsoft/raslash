import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Alert } from 'react-native';
import { endRemoteCheckIn } from '@/lib/checkIns';

/**
 * Ends a check-in when the member leaves the venue, even with the app closed.
 * The OS watches a circle around the venue (region monitoring / geofencing)
 * and wakes this task on exit; no continuous tracking runs. It needs "Always"
 * location, asked for once with an explanation after a check-in.
 */
export const CHECK_IN_GEOFENCE_TASK = 'raslash-check-in-geofence';
/** Generous: GPS inside buildings drifts, and leaving by mistake is worse. */
export const CHECK_IN_GEOFENCE_RADIUS_M = 300;
/** Same keys PlacesContext uses for the active check-in. */
const CHECK_IN_STORAGE_KEY = 'raslash.activeCheckIn';
const ASKED_KEY = 'raslash.backgroundLocationAsked';

/** A running app (suspended in memory, then woken) updates its own state here. */
const exitListeners = new Set<(placeId: string) => void>();
export function onGeofenceExit(listener: (placeId: string) => void) {
  exitListeners.add(listener);
  return () => { exitListeners.delete(listener); };
}

type StoredCheckIn = { placeId?: string; userId?: string; reminderNotificationId?: string };

/** The task body, exported for tests. Ends only the check-in the region belongs to. */
export async function handleGeofenceExit(placeId: string) {
  const raw = await AsyncStorage.getItem(CHECK_IN_STORAGE_KEY);
  const stored = raw ? (JSON.parse(raw) as StoredCheckIn) : null;
  await stopCheckInGeofence();
  if (!stored?.placeId || stored.placeId !== placeId) return;
  await AsyncStorage.removeItem(CHECK_IN_STORAGE_KEY);
  if (stored.reminderNotificationId) {
    await Notifications.cancelScheduledNotificationAsync(stored.reminderNotificationId).catch(() => undefined);
  }
  if (stored.userId) await endRemoteCheckIn(placeId, stored.userId).catch(() => undefined);
  exitListeners.forEach((listener) => listener(placeId));
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Mekândan ayrıldın',
      body: 'Check-in’in kapatıldı. Puan vermek için dokun.',
      data: { type: 'left_venue', placeId },
    },
    trigger: null,
  }).catch(() => undefined);
}

// Must be defined at module load (imported from the root layout), so a
// background wake-up finds it before any screen mounts.
if (!TaskManager.isTaskDefined(CHECK_IN_GEOFENCE_TASK)) {
  TaskManager.defineTask<{ eventType: Location.GeofencingEventType; region: Location.LocationRegion }>(
    CHECK_IN_GEOFENCE_TASK,
    async ({ data, error }) => {
      if (error || !data) return;
      if (data.eventType !== Location.GeofencingEventType.Exit || !data.region?.identifier) return;
      await handleGeofenceExit(data.region.identifier);
    },
  );
}

export async function stopCheckInGeofence() {
  try {
    if (await Location.hasStartedGeofencingAsync(CHECK_IN_GEOFENCE_TASK)) {
      await Location.stopGeofencingAsync(CHECK_IN_GEOFENCE_TASK);
    }
  } catch {
    // Nothing was running, or the platform has no geofencing (Expo Go).
  }
}

/** Watches the venue if "Always" location is already granted. */
export async function startCheckInGeofence(place: { id: string; latitude: number; longitude: number }) {
  try {
    const background = await Location.getBackgroundPermissionsAsync();
    if (background.status !== 'granted') return false;
    await Location.startGeofencingAsync(CHECK_IN_GEOFENCE_TASK, [{
      identifier: place.id,
      latitude: place.latitude,
      longitude: place.longitude,
      radius: CHECK_IN_GEOFENCE_RADIUS_M,
      notifyOnEnter: false,
      notifyOnExit: true,
    }]);
    return true;
  } catch {
    return false;
  }
}

/**
 * After a check-in: watch the venue, and the first time explain and ask for
 * "Always" location. Asked once; Ayarlar can change it later.
 */
export async function enableLeaveDetection(place: { id: string; latitude: number; longitude: number }) {
  if (await startCheckInGeofence(place)) return;
  const asked = await AsyncStorage.getItem(ASKED_KEY).catch(() => '1');
  if (asked) return;
  await AsyncStorage.setItem(ASKED_KEY, '1').catch(() => undefined);
  const foreground = await Location.getForegroundPermissionsAsync().catch(() => null);
  if (foreground?.status !== 'granted') return;
  Alert.alert(
    'Çıkınca check-in kapansın mı?',
    'Mekândan ayrıldığında check-in’ini uygulama kapalıyken de kapatabilmemiz için konum iznini “Her Zaman” yapmamız gerekiyor. Konumun takip edilmez; yalnızca mekânın çevresinden çıktığını telefonun kendisi bildirir.',
    [
      { text: 'Şimdi değil', style: 'cancel' },
      {
        text: 'İzin ver',
        onPress: () => {
          void Location.requestBackgroundPermissionsAsync()
            .then((result) => (result.status === 'granted' ? startCheckInGeofence(place) : false))
            .catch(() => false);
        },
      },
    ],
  );
}
