const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');

function load() {
  const filename = path.resolve(__dirname, 'placeStories.ts');
  const code = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(code, { exports: mod.exports, require: (name) => {
    throw new Error(`Unmocked import: ${name}`);
  } }, { filename });
  return mod.exports;
}

const stories = load();
const NOW = Date.parse('2026-10-21T12:00:00Z');
const ago = (minutes) => new Date(NOW - minutes * 60_000).toISOString();
const msg = (id, userId, minutes, extra = {}) => ({
  id, userId, author: userId.toUpperCase(), text: '', createdAt: ago(minutes), ...extra,
});
const plain = (value) => JSON.parse(JSON.stringify(value));

test('only messages with a photo (stored or on-device) are story items', () => {
  assert.equal(stories.isPhotoMessage({ photoPath: 'p/u/a.jpg' }), true);
  assert.equal(stories.isPhotoMessage({ localPhotoUri: 'file:///a.jpg' }), true);
  assert.equal(stories.isPhotoMessage({}), false);
});

test('photos group per person within the last 24 hours, oldest item first', () => {
  const grouped = stories.groupPhotoStories([
    msg('a2', 'ali', 30, { photoPath: 'x/ali/2.jpg', text: '  ikinci  ' }),
    msg('t1', 'ali', 20, { text: 'sadece metin' }),
    msg('b1', 'banu', 5, { photoPath: 'x/banu/1.jpg' }),
    msg('a1', 'ali', 90, { photoPath: 'x/ali/1.jpg' }),
    msg('old', 'ali', 24 * 60, { photoPath: 'x/ali/old.jpg' }),
    msg('future', 'ali', -30, { photoPath: 'x/ali/f.jpg' }),
    { ...msg('anon', 'x', 1, { photoPath: 'x/x/a.jpg' }), userId: undefined },
  ], NOW);
  assert.deepEqual(plain(grouped.map((s) => s.userId)), ['banu', 'ali'], 'newest photo first');
  const ali = grouped[1];
  assert.deepEqual(plain(ali.items.map((i) => i.id)), ['a1', 'a2']);
  assert.equal(ali.items[1].caption, 'ikinci');
  assert.equal(ali.latestAt, Date.parse(ago(30)));
  assert.equal(grouped[0].items.length, 1);
});

test('a pending own photo shows in our story from its local file', () => {
  const [mine] = stories.groupPhotoStories([
    msg('local_1', 'me', 0, { mine: true, pending: true, localPhotoUri: 'file:///x.jpg', photoPath: 'p/me/x.jpg' }),
  ], NOW);
  assert.equal(mine.mine, true);
  assert.deepEqual(plain(mine.items[0]), {
    id: 'local_1', photoPath: 'p/me/x.jpg', localPhotoUri: 'file:///x.jpg', caption: '',
    createdAt: ago(0), pending: true,
  });
});

test('seen logic: a story is seen once every item was seen; ours never needs a ring', () => {
  const [banu] = stories.groupPhotoStories([
    msg('b1', 'banu', 50, { photoPath: '1' }), msg('b2', 'banu', 40, { photoPath: '2' }),
    msg('b3', 'banu', 10, { photoPath: '3' }),
  ], NOW);
  assert.equal(stories.isStorySeen(banu, new Set()), false);
  assert.equal(stories.storyStartIndex(banu, new Set()), 0);
  assert.equal(stories.storyStartIndex(banu, new Set(['b1'])), 1);
  assert.equal(stories.storyStartIndex(banu, new Set(['b1', 'b3'])), 1);
  assert.equal(stories.isStorySeen(banu, new Set(['b1', 'b2', 'b3'])), true);
  assert.equal(stories.storyStartIndex(banu, new Set(['b1', 'b2', 'b3'])), 0, 'all seen replays from the start');
  assert.equal(stories.storyRing(banu, new Set()), 'unseen');
  assert.equal(stories.storyRing(banu, new Set(['b1', 'b2', 'b3'])), 'seen');
  assert.equal(stories.storyRing(undefined, new Set()), 'none');
  assert.equal(stories.isStorySeen({ ...banu, mine: true }, new Set()), true);
});

test('story row: you first, then unseen, then seen, then people without photos', () => {
  const grouped = stories.groupPhotoStories([
    msg('c1', 'cem', 5, { photoPath: '1' }), msg('d1', 'deniz', 15, { photoPath: '2' }),
    msg('e1', 'ece', 25, { photoPath: '3' }),
  ], NOW);
  const people = [
    { id: 'ali' }, { id: 'cem' }, { id: 'me', isMe: true }, { id: 'deniz' }, { id: 'ece' }, { id: 'fatma' },
  ];
  const row = stories.orderStoryRow(people, grouped, new Set(['c1']));
  assert.deepEqual(plain(row.map((p) => p.id)), ['me', 'deniz', 'ece', 'cem', 'ali', 'fatma']);
});

test('story age reads in Turkish', () => {
  assert.equal(stories.formatStoryAge(ago(0), NOW), 'şimdi');
  assert.equal(stories.formatStoryAge(ago(-2), NOW), 'şimdi', 'clock skew never reads negative');
  assert.equal(stories.formatStoryAge(ago(12), NOW), '12 dk önce');
  assert.equal(stories.formatStoryAge(ago(150), NOW), '2 sa önce');
  assert.equal(stories.formatStoryAge('nope', NOW), '');
});

test('seen ids are parsed defensively and capped to the newest entries', () => {
  assert.equal(stories.SEEN_STORIES_KEY, 'raslash.seenStories');
  assert.deepEqual(plain(stories.parseSeenIds(null)), []);
  assert.deepEqual(plain(stories.parseSeenIds('{bad')), []);
  assert.deepEqual(plain(stories.parseSeenIds('["a",1,"b"]')), ['a', 'b']);
  assert.deepEqual(plain(stories.addSeenIds(['a', 'b'], ['b', 'c', 'c'])), ['a', 'b', 'c']);
  assert.deepEqual(plain(stories.addSeenIds(['a', 'b', 'c'], ['d', 'e'], 3)), ['c', 'd', 'e']);
  const many = stories.addSeenIds([], Array.from({ length: 400 }, (_, i) => `id${i}`));
  assert.equal(many.length, stories.SEEN_STORIES_LIMIT);
  assert.equal(many[many.length - 1], 'id399');
});
