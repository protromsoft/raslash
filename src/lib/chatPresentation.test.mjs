import assert from 'node:assert/strict';
import test from 'node:test';
import { buildChatRows } from './chatPresentation.ts';
import { avatarAppearance } from './avatarAppearance.ts';

const message = (overrides = {}) => ({
  id: 'm1', userId: 'u1', author: 'Ali', text: 'Merhaba',
  createdAt: '2026-10-03T12:00:00Z', ...overrides,
});

test('historical photo survives when its author has checked out', () => {
  const rows = buildChatRows([message({ avatarUrl: 'https://example.com/photo.jpg' })], []);
  assert.equal(rows[0].message.avatarUrl, 'https://example.com/photo.jpg');
});

test('late presence hydrates realtime messages without replacing text or ids', () => {
  const original = message({ author: 'Misafir' });
  const [row] = buildChatRows([original], [
    { id: 'u1', firstName: 'Ali', avatarUrl: 'https://example.com/ali.jpg' },
  ]);
  assert.equal(row.message.author, 'Ali');
  assert.equal(row.message.avatarUrl, 'https://example.com/ali.jpg');
  assert.equal(row.message.text, original.text);
  assert.equal(row.message.id, original.id);
  assert.equal(original.author, 'Misafir', 'input must not mutate');
});

test('a removed photo is not resurrected from a message snapshot', () => {
  const [row] = buildChatRows([message({ avatarUrl: 'https://example.com/old.jpg' })], [
    { id: 'u1', firstName: 'Ali', avatarUrl: '' },
  ]);
  assert.equal(row.message.avatarUrl, '');
});

test('two people with the same first name retain separate avatars', () => {
  const rows = buildChatRows([message(), message({ id: 'm2', userId: 'u2' })], []);
  assert.equal(rows[1].grouped, false);
});

test('same user within five minutes is grouped; different names do not change identity', () => {
  const rows = buildChatRows([
    message(), message({ id: 'm2', author: 'Ali updated', createdAt: '2026-10-03T12:04:59Z' }),
  ], []);
  assert.equal(rows[1].grouped, true);
});

test('out of order, invalid, five-minute, and unidentified messages do not group', () => {
  for (const createdAt of ['2026-10-03T11:59:59Z', 'bad', '2026-10-03T12:05:00Z']) {
    assert.equal(buildChatRows([message(), message({ id: 'm2', createdAt })], [])[1].grouped, false);
  }
  assert.equal(buildChatRows([message({ userId: undefined }), message({ userId: undefined })], [])[1].grouped, false);
});

test('initials handle Turkish names, missing names, and whitespace', () => {
  assert.equal(avatarAppearance('  ilker ').initial, 'İ');
  assert.equal(avatarAppearance('ışıl').initial, 'I');
  assert.equal(avatarAppearance('').initial, '?');
  assert.equal(avatarAppearance().initial, '?');
  assert.equal(avatarAppearance('Ali').backgroundColor, avatarAppearance(' Ali ').backgroundColor);
});

test('avatar supports local picker URLs and trims photos but rejects invalid schemes', () => {
  for (const uri of ['https://example.com/a.jpg', 'file:///photo.jpg', 'content://photo/1']) {
    assert.equal(avatarAppearance('Ali', ` ${uri} `).uri, uri);
  }
  assert.equal(avatarAppearance('Ali', 'javascript:alert(1)').uri, undefined);
  assert.equal(avatarAppearance('Ali', ' ').uri, undefined);
});
