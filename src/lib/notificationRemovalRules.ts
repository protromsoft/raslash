/**
 * Incident-specific tombstones. Populate only after confirming the exact
 * offending rows in production. The server purge removes existing records;
 * these prevent old device caches and already-delivered push notifications
 * from resurfacing when the updated app opens.
 *
 * UUIDs cover the in-app inbox. Push payloads did not carry inbox UUIDs, so
 * their title/body pair must be matched by SHA-256 instead. Never put the
 * offensive text or a broad profanity regex in the application bundle.
 */
// 2026-09-10 incident: two explicit abusive system broadcasts, seven inbox
// records apiece. IDs are server row IDs; digests cover already-delivered
// native pushes, whose payloads did not contain the row IDs.
export const REMOVED_NOTIFICATION_IDS: ReadonlySet<string> = new Set([
  '2fd71c3a-fa0f-4499-a69b-10ca624a92f9',
  '45f4b15a-0bf8-4489-81ca-d77bde2251eb',
  '7e5dfab6-b2ad-4e37-9521-06c928fb5971',
  'b6b1315a-7382-4827-b9d8-aea514479c39',
  'cb48ed1a-1012-43a9-8603-69529d487627',
  'eeea786e-9c13-4898-a529-6bdee2442a0a',
  'f69410ac-c028-482b-a83f-c8f7bff0dbe5',
  '06e5505d-539d-4a11-946c-c12602a1da29',
  '2a897538-8cba-43d5-96a3-708f399ad311',
  '305f2539-3d9d-429d-8453-8feaa50fc5c7',
  '65290fe8-24a4-4450-b748-a4390157b25a',
  '72d6190a-a00b-4a92-9e5a-ce22659af31c',
  '855d02cd-b44c-47f8-b204-778991d5700e',
  '8c9c8b37-5c16-4d8c-9970-b6098b1d379b',
]);
export const REMOVED_CONTENT_SHA256: ReadonlySet<string> = new Set([
  'e091a538dc504d01f9faf7cad4988d3770e258e887a757c56914c5051a31c9c2',
  'ea93d9b11bde85bdddfb99a3149c3d956ce160f39a44dc714a7e412b92ea1384',
]);

export type NotificationIdentity = {
  id?: string | null;
  title?: string | null;
  body?: string | null;
};

/** The sender trims both fields; NFC removes equivalent Unicode variations. */
export function notificationFingerprintInput(title: string, body: string) {
  return `${title.trim().normalize('NFC')}\u0000${body.trim().normalize('NFC')}`;
}

export async function isRemovedNotificationIdentity(
  input: NotificationIdentity,
  digestSha256: (value: string) => Promise<string>,
  removedIds: ReadonlySet<string> = REMOVED_NOTIFICATION_IDS,
  removedDigests: ReadonlySet<string> = REMOVED_CONTENT_SHA256,
): Promise<boolean> {
  if (input.id && removedIds.has(input.id)) return true;
  if (removedDigests.size === 0 || typeof input.title !== 'string' || typeof input.body !== 'string') {
    return false;
  }
  const digest = await digestSha256(notificationFingerprintInput(input.title, input.body));
  return removedDigests.has(digest.toLowerCase());
}

export async function removeTombstonedNotifications<T extends NotificationIdentity>(
  notifications: T[],
  digestSha256: (value: string) => Promise<string>,
  removedIds: ReadonlySet<string> = REMOVED_NOTIFICATION_IDS,
  removedDigests: ReadonlySet<string> = REMOVED_CONTENT_SHA256,
): Promise<T[]> {
  const removed = await Promise.all(
    notifications.map((note) => isRemovedNotificationIdentity(note, digestSha256, removedIds, removedDigests)),
  );
  return notifications.filter((_, index) => !removed[index]);
}
