/**
 * First-launch reset after the 2026-09-12 notification incident. This is
 * deliberately versioned and never clears notifications on later launches.
 */
export const NOTIFICATION_RESET_FLAG = 'raslash.notificationsReset.2026-09-12.v1';
export const NOTIFICATION_CACHE_KEY = 'raslash.notifications';

// UTC database time immediately before the guarded 44-row production purge.
// Rows at or before this time must not be rehydrated from stale responses.
export const LEGACY_NOTIFICATIONS_CUTOFF_UTC = '2026-09-12T12:29:35.359038Z';

type ResetStorage = {
  getItem(key: string): Promise<string | null>;
  removeItem(key: string): Promise<void>;
  setItem(key: string, value: string): Promise<void>;
};

/** Returns true only when this launch performed the reset. */
export async function resetLegacyNotificationsOnce(
  storage: ResetStorage,
  cancelScheduled: () => Promise<void>,
  dismissPresented: () => Promise<void>,
): Promise<boolean> {
  if (await storage.getItem(NOTIFICATION_RESET_FLAG) === 'done') return false;
  // Complete the local and native cleanup before recording success. A failure
  // leaves the flag unset so the next launch can retry the reset.
  await storage.removeItem(NOTIFICATION_CACHE_KEY);
  await cancelScheduled();
  await dismissPresented();
  await storage.setItem(NOTIFICATION_RESET_FLAG, 'done');
  return true;
}

export function isLegacyNotification(createdAt: string): boolean {
  if (!Number.isFinite(Date.parse(createdAt))) return false;
  const utcWithFraction = (value: string) => {
    const match = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,9}))?(?:Z|\+00:00)$/.exec(value);
    return match ? `${match[1]}.${(match[2] ?? '').padEnd(9, '0')}` : null;
  };
  const createdUtc = utcWithFraction(createdAt);
  const cutoffUtc = utcWithFraction(LEGACY_NOTIFICATIONS_CUTOFF_UTC);
  if (createdUtc && cutoffUtc) return createdUtc <= cutoffUtc;
  // Non-UTC offsets are not expected from production PostgREST, but remain
  // comparable with millisecond precision as a defensive fallback.
  return Date.parse(createdAt) <= Date.parse(LEGACY_NOTIFICATIONS_CUTOFF_UTC);
}
