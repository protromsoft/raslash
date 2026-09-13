import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LEGACY_NOTIFICATIONS_CUTOFF_UTC,
  NOTIFICATION_CACHE_KEY,
  NOTIFICATION_RESET_FLAG,
  isLegacyNotification,
  resetLegacyNotificationsOnce,
} from './notificationResetMigration.ts';

function fakeStorage() {
  const entries = new Map([[NOTIFICATION_CACHE_KEY, '[{"id":"old"}]']]);
  return {
    entries,
    getItem: async (key) => entries.get(key) ?? null,
    removeItem: async (key) => { entries.delete(key); },
    setItem: async (key, value) => { entries.set(key, value); },
  };
}

test('the database UTC cutoff excludes old rows but preserves even microseconds-later rows', () => {
  assert.equal(LEGACY_NOTIFICATIONS_CUTOFF_UTC, '2026-09-12T12:29:35.359038Z');
  assert.equal(isLegacyNotification('2026-09-10T11:11:28.385838+00:00'), true);
  assert.equal(isLegacyNotification('2026-09-12T12:29:35.359038+00:00'), true);
  assert.equal(isLegacyNotification('2026-09-12T12:29:35.359039Z'), false);
  assert.equal(isLegacyNotification('2026-09-12T12:30:00Z'), false);
  assert.equal(isLegacyNotification('invalid'), false);
});

test('reset clears existing cache and tray exactly once, preserving new alerts later', async () => {
  const storage = fakeStorage();
  let dismissals = 0;
  let cancellations = 0;
  const cancel = async () => { cancellations += 1; };
  const dismiss = async () => { dismissals += 1; };
  assert.equal(await resetLegacyNotificationsOnce(storage, cancel, dismiss), true);
  assert.equal(storage.entries.has(NOTIFICATION_CACHE_KEY), false);
  assert.equal(storage.entries.get(NOTIFICATION_RESET_FLAG), 'done');
  storage.entries.set(NOTIFICATION_CACHE_KEY, '[{"id":"new"}]');
  assert.equal(await resetLegacyNotificationsOnce(storage, cancel, dismiss), false);
  assert.equal(storage.entries.get(NOTIFICATION_CACHE_KEY), '[{"id":"new"}]');
  assert.equal(dismissals, 1);
  assert.equal(cancellations, 1);
});

test('a failed device dismissal does not mark the reset complete', async () => {
  const storage = fakeStorage();
  await assert.rejects(resetLegacyNotificationsOnce(storage, async () => {}, async () => {
    throw new Error('native unavailable');
  }));
  assert.equal(storage.entries.has(NOTIFICATION_RESET_FLAG), false);
  assert.equal(await resetLegacyNotificationsOnce(storage, async () => {}, async () => {}), true);
});

test('a failed scheduled-notification cancel leaves the reset pending', async () => {
  const storage = fakeStorage();
  let dismissed = false;
  await assert.rejects(resetLegacyNotificationsOnce(storage, async () => {
    throw new Error('native unavailable');
  }, async () => { dismissed = true; }));
  assert.equal(dismissed, false);
  assert.equal(storage.entries.has(NOTIFICATION_RESET_FLAG), false);
});
