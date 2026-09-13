import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Linking, Platform } from 'react-native';
import {
  isRemovedNotificationIdentity,
  removeTombstonedNotifications,
  type NotificationIdentity,
} from '@/lib/notificationRemovalRules';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export const NOTIFICATION_CHANNEL_ID = 'activity';

const STORED_PUSH_TOKEN_KEY = 'raslash.expoPushToken';

export type NotificationPermissionState = 'granted' | 'denied' | 'undetermined';

export type NotificationAccessResult = {
  status: NotificationPermissionState;
  tokenRegistered: boolean;
};

const digestSha256 = (value: string) =>
  Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value);

export const isRemovedNotification = (input: NotificationIdentity) =>
  isRemovedNotificationIdentity(input, digestSha256);

export const filterRemovedNotifications = <T extends NotificationIdentity>(items: T[]) =>
  removeTombstonedNotifications(items, digestSha256);

Notifications.setNotificationHandler({
  handleNotification: async ({ request }) => {
    const removed = await isRemovedNotification({
      title: request.content.title,
      body: request.content.body,
    });
    return {
      shouldPlaySound: !removed,
      shouldSetBadge: false,
      shouldShowBanner: !removed,
      shouldShowList: !removed,
    };
  },
});

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNEL_ID, {
    name: 'Raslash etkinlikleri',
    description: 'Check-in hatırlatmaları ve hesap bildirimleri',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 180, 250],
    lightColor: '#111110',
  });
}

function normalizePermission(
  permission: Notifications.NotificationPermissionsStatus,
): NotificationPermissionState {
  if (permission.granted) return 'granted';
  if (permission.status === Notifications.PermissionStatus.DENIED) return 'denied';
  return 'undetermined';
}

export async function getNotificationPermissionStatus(): Promise<NotificationPermissionState> {
  if (Platform.OS === 'web') return 'denied';
  try {
    return normalizePermission(await Notifications.getPermissionsAsync());
  } catch {
    return 'undetermined';
  }
}

async function savePushToken(userId: string): Promise<boolean> {
  if (!Device.isDevice || !isSupabaseConfigured || !supabase) return false;

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (typeof projectId !== 'string' || projectId.length === 0) return false;

  try {
    const expoPushToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    const now = new Date().toISOString();
    const { error } = await supabase.from('push_devices').upsert(
      {
        user_id: userId,
        expo_push_token: expoPushToken,
        platform: Platform.OS,
        device_name: Device.modelName ?? null,
        enabled: true,
        updated_at: now,
        last_seen_at: now,
      },
      { onConflict: 'user_id,expo_push_token' },
    );
    if (error) throw error;
    await AsyncStorage.setItem(STORED_PUSH_TOKEN_KEY, expoPushToken);
    return true;
  } catch (error) {
    console.warn('Push token could not be registered', error);
    return false;
  }
}

/** Requests the native prompt only after the user taps the onboarding/profile action. */
export async function requestNotificationAccess(
  userId?: string | null,
): Promise<NotificationAccessResult> {
  if (Platform.OS === 'web') return { status: 'denied', tokenRegistered: false };

  await ensureAndroidChannel();
  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted && permission.canAskAgain) {
    permission = await Notifications.requestPermissionsAsync();
  }
  const status = normalizePermission(permission);
  const tokenRegistered = status === 'granted' && userId ? await savePushToken(userId) : false;
  return { status, tokenRegistered };
}

/** Refreshes a token at launch without ever showing a permission prompt. */
export async function syncGrantedPushToken(userId?: string | null) {
  if (!userId) return false;
  await ensureAndroidChannel();
  const status = await getNotificationPermissionStatus();
  return status === 'granted' ? savePushToken(userId) : false;
}

export async function unregisterPushToken(userId?: string | null) {
  const expoPushToken = await AsyncStorage.getItem(STORED_PUSH_TOKEN_KEY);
  if (userId && expoPushToken && isSupabaseConfigured && supabase) {
    const { error } = await supabase
      .from('push_devices')
      .delete()
      .eq('user_id', userId)
      .eq('expo_push_token', expoPushToken);
    if (error) console.warn('Push token could not be removed', error);
  }
  await AsyncStorage.removeItem(STORED_PUSH_TOKEN_KEY);
}

export async function openNotificationSettings() {
  await Linking.openSettings();
}

export async function scheduleCheckInReminder(input: {
  placeId: string;
  placeName: string;
  delayMs: number;
}) {
  if ((await getNotificationPermissionStatus()) !== 'granted') return undefined;
  await ensureAndroidChannel();
  try {
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Hâlâ mekânda mısın?',
        body: `${input.placeName} check-in’in devam ediyor.`,
        sound: true,
        data: {
          type: 'still_here',
          placeId: input.placeId,
          url: `/place/${input.placeId}`,
        },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: Math.max(1, Math.round(input.delayMs / 1000)),
        repeats: false,
        channelId: NOTIFICATION_CHANNEL_ID,
      },
    });
  } catch (error) {
    console.warn('Check-in reminder could not be scheduled', error);
    return undefined;
  }
}

export async function cancelScheduledNotification(identifier?: string) {
  if (!identifier) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(identifier);
  } catch {
    // It may already have fired or been removed by the operating system.
  }
}

export async function dismissPresentedNotifications() {
  try {
    await Notifications.dismissAllNotificationsAsync();
  } catch {
    // The in-app history can still be cleared if the OS tray is unavailable.
  }
}

/** Strict first-launch reset: propagate failures so the migration can retry. */
export async function resetPresentedNotificationsForMigration() {
  if (Platform.OS === 'web') return;
  await Notifications.dismissAllNotificationsAsync();
}

/** Prevent pre-reset local reminders from appearing after the inbox is cleared. */
export async function cancelScheduledNotificationsForMigration() {
  if (Platform.OS === 'web') return;
  await Notifications.cancelAllScheduledNotificationsAsync();
}

/** Removes only incident-matched notifications already displayed by the OS. */
export async function dismissRemovedPresentedNotifications() {
  if (Platform.OS === 'web') return;
  try {
    const presented = await Notifications.getPresentedNotificationsAsync();
    for (const note of presented) {
      try {
        if (await isRemovedNotification({
          title: note.request.content.title,
          body: note.request.content.body,
        })) {
          await Notifications.dismissNotificationAsync(note.request.identifier);
        }
      } catch (error) {
        // One inaccessible alert should not keep the other offending ones up.
        console.warn('Notification incident cleanup could not dismiss alert', error);
      }
    }
  } catch (error) {
    console.warn('Notification incident cleanup could not inspect device tray', error);
  }
}

/** Handles a just-received notification without clearing unrelated alerts. */
export async function dismissRemovedIncomingNotification(note: Notifications.Notification) {
  try {
    if (!(await isRemovedNotification({
      title: note.request.content.title,
      body: note.request.content.body,
    }))) return;
    await Notifications.dismissNotificationAsync(note.request.identifier);
  } catch (error) {
    console.warn('Notification incident cleanup could not dismiss alert', error);
  }
}

export function getNotificationOpenData(notification: Notifications.Notification) {
  const data = notification.request.content.data;
  return {
    type: data?.type === 'still_here' ? 'still_here' : undefined,
    placeId: typeof data?.placeId === 'string' ? data.placeId : undefined,
  } as const;
}

export { Notifications };
