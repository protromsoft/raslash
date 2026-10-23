const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '../..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');
function load(file, mocks = {}) {
  const code = ts.transpileModule(read(file), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(code, { exports: mod.exports, setTimeout, clearTimeout, AbortController,
    require: (name) => (Object.hasOwn(mocks, name) ? mocks[name] : (() => { throw new Error(`Unmocked ${name}`); })()) });
  return mod.exports;
}
const plain = (value) => JSON.parse(JSON.stringify(value));

test('profile tags: only known keys are kept, in list order, capped', () => {
  const tags = load('src/lib/profileTags.ts');
  assert.deepEqual(plain(tags.cleanTagKeys(['en', 'xx', 'tr', 'en'], tags.LANGUAGES, 8)), ['tr', 'en']);
  assert.deepEqual(plain(tags.cleanTagKeys(null, tags.INTERESTS, 10)), []);
  assert.deepEqual(plain(tags.cleanTagKeys(['coffee', 'design', 'software'], tags.INTERESTS, 2)), ['coffee', 'design']);
  assert.deepEqual(plain(tags.toggleTag(['tr'], 'en', 8)), ['tr', 'en']);
  assert.deepEqual(plain(tags.toggleTag(['tr', 'en'], 'tr', 8)), ['en']);
  assert.deepEqual(plain(tags.toggleTag(['tr', 'en'], 'de', 2)), ['tr', 'en'], 'full selection stays unchanged');
  // Keys must satisfy the database check (`[a-z_]`).
  for (const tag of [...tags.LANGUAGES, ...tags.INTERESTS]) assert.match(tag.key, /^[a-z_]+$/);
  assert.equal(tags.LANGUAGES.length <= 50 && tags.INTERESTS.length <= 50, true);
});

test('distance reads in Turkish and the first two profiles are free', () => {
  const social = load('src/lib/socialDiscovery.ts', { '@/lib/supabase': { supabase: null }, './supabase': { supabase: null } });
  assert.equal(social.distanceLabel(0.012), '50 m uzakta');
  assert.equal(social.distanceLabel(0.84), '850 m uzakta');
  assert.equal(social.distanceLabel(3.44), '3.4 km uzakta');
  assert.equal(social.distanceLabel(16.4), '16 km uzakta');
  assert.equal(social.distanceLabel(Number.NaN), '');
  assert.equal(social.isProfileLocked(0, false), false);
  assert.equal(social.isProfileLocked(1, false), false);
  assert.equal(social.isProfileLocked(2, false), true);
  assert.equal(social.isProfileLocked(9, true), false);
});

test('server: friend actions, profile reach and block cleanup', () => {
  const sql = read('supabase/migrations/20261023090000_friends_and_profile_details.sql');
  for (const action of ['friends', 'friend_request', 'friend_respond', 'friend_remove']) {
    assert.match(sql, new RegExp(`p_action = '${action}'`));
  }
  // Pair actions take the same pair lock as messages and blocks.
  assert.match(sql, /'send', 'friend_request', 'friend_respond', 'friend_remove'\)/);
  // Profiles open for people at the same venue (place chat) and for friends.
  assert.match(sql, /or v_friend\.user_low is not null or private\.shares_checkin\(v_uid, v_other\)/);
  // Blocking ends a friendship; requests are rate limited; the table is private.
  assert.match(sql, /on conflict do nothing;\n    delete from private\.friendships where user_low = v_low and user_high = v_high;/);
  assert.match(sql, /if v_count >= 20 then raise exception 'friend_rate_limit'/);
  assert.match(sql, /revoke all on private\.friendships from public, anon, authenticated;/);
  assert.match(sql, /check \(cardinality\(languages\) <= 8/);
});

test('place chat: people without a story and message avatars open the profile (Pro)', () => {
  const src = read('app/chat/[placeId].tsx');
  const open = src.slice(src.indexOf('const openProfile = useCallback'), src.indexOf('const renderItem'));
  assert.match(open, /if \(!photoAccess\) \{\s*openPaywall\(\);/);
  assert.match(open, /router\.push\(`\/person\/\$\{userId\}`\)/);
  assert.match(src, /onPress=\{\(\) => openProfile\(p\.id\)\}/);
  assert.match(src, /onPress=\{message\.userId \? \(\) => openProfile\(message\.userId\) : undefined\}/);
});

test('messages tab lists friends and incoming friend requests above the chats', () => {
  const src = read('app/(tabs)/messages.tsx');
  assert.match(src, /useSocialQuery<\{ friends: SocialFriend\[\] \}>\('friends'/);
  assert.match(src, /filter\(\(f\) => f\.direction !== 'outgoing'\)/);
  assert.ok(src.indexOf('Arkadaşlar</Text>') < src.indexOf('mesaj isteği</Text>'));
});
