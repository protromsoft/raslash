import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  REMOVED_CONTENT_SHA256,
  REMOVED_NOTIFICATION_IDS,
  isRemovedNotificationIdentity,
  notificationFingerprintInput,
  removeTombstonedNotifications,
} from './notificationRemovalRules.ts';

const digest = async (value) => createHash('sha256').update(value, 'utf8').digest('hex');

test('the verified incident is narrowly scoped to 14 row IDs and two payloads', async () => {
  assert.equal(REMOVED_NOTIFICATION_IDS.size, 14);
  assert.equal(REMOVED_CONTENT_SHA256.size, 2);
  for (const id of REMOVED_NOTIFICATION_IDS) {
    assert.match(id, /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
    assert.equal(await isRemovedNotificationIdentity({ id }, digest), true);
  }
  for (const value of REMOVED_CONTENT_SHA256) assert.match(value, /^[0-9a-f]{64}$/);
  assert.equal(await isRemovedNotificationIdentity({ id: 'other' }, digest), false);
});

test('an exact deleted inbox UUID is removed even without title or body', async () => {
  const removed = new Set(['removed-row']);
  assert.equal(
    await isRemovedNotificationIdentity({ id: 'removed-row' }, digest, removed),
    true,
  );
  assert.equal(
    await isRemovedNotificationIdentity({ id: 'other-row' }, digest, removed),
    false,
  );
});

test('the digest catches the same push with trimmed and equivalent Unicode text', async () => {
  const incident = await digest(notificationFingerprintInput(' Duyuru ', ' Merhaba é '));
  const removedDigests = new Set([incident]);
  assert.equal(
    await isRemovedNotificationIdentity(
      { title: 'Duyuru', body: 'Merhaba e\u0301' },
      digest,
      new Set(),
      removedDigests,
    ),
    true,
  );
  assert.equal(
    await isRemovedNotificationIdentity(
      { title: 'Duyuru', body: 'Farklı mesaj' },
      digest,
      new Set(),
      removedDigests,
    ),
    false,
  );
});

test('filter preserves legitimate notifications and their ordering', async () => {
  const removedDigests = new Set([
    await digest(notificationFingerprintInput('Duyuru', 'Kaldırılan içerik')),
  ]);
  const rows = [
    { id: 'keep-1', title: 'Check-in', body: 'Güvenli bildirim' },
    { id: 'remove', title: 'Duyuru', body: 'Kaldırılan içerik' },
    { id: 'keep-2', title: 'Mekân', body: 'Onaylandı' },
  ];
  const result = await removeTombstonedNotifications(rows, digest, new Set(), removedDigests);
  assert.deepEqual(result.map((row) => row.id), ['keep-1', 'keep-2']);
});
