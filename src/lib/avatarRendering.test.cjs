// Native modules are mocked; exercise actual components/hooks, not copies.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');
const React = require('react');
const { act, create } = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;

function load(file, mocks, globals = {}) {
  const filename = path.resolve(__dirname, '../..', file);
  const code = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(code, { exports: mod.exports, console, ...globals, require: (name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (['react', 'react/jsx-runtime'].includes(name)) return require(name);
    throw new Error(`Unmocked import: ${name}`);
  } }, { filename });
  return mod.exports;
}
const rn = {
  View: 'view', Text: 'text',
  StyleSheet: { create: (styles) => styles, absoluteFill: { position: 'absolute' } },
};
const colors = require('../theme/colors.ts').colors;
const { Avatar, AvatarStack } = load('src/components/Avatar.tsx', {
  'react-native': rn, 'expo-image': { Image: 'image' },
  '@/lib/avatarAppearance': require('./avatarAppearance.ts'), '@/theme/colors': { colors },
});

test('missing, loading, and broken images retain the initial; a new URL can load', async () => {
  let tree;
  await act(() => { tree = create(React.createElement(Avatar, { name: 'Ali', uri: 'https://example.com/a.jpg' })); });
  assert.equal(tree.root.findByType('text').props.children, 'A');
  assert.equal(tree.root.findAllByType('image').length, 1);
  await act(() => tree.root.findByType('image').props.onError());
  assert.equal(tree.root.findAllByType('image').length, 0);
  assert.equal(tree.root.findByType('text').props.children, 'A');
  await act(() => tree.update(React.createElement(Avatar, { name: 'Cem', uri: 'https://example.com/b.jpg' })));
  assert.equal(tree.root.findByType('image').props.recyclingKey, 'https://example.com/b.jpg');
  await act(() => tree.update(React.createElement(Avatar, { name: 'Cem' })));
  assert.equal(tree.root.findAllByType('image').length, 0);
  assert.equal(tree.root.findByType('text').props.children, 'C');
  await act(() => tree.unmount());
});

test('avatar stack is capped at three real people', async () => {
  let tree;
  await act(() => { tree = create(React.createElement(AvatarStack, {
    people: Array.from({ length: 8 }, (_, i) => ({ id: `u${i}`, firstName: `Person ${i}` })),
  })); });
  assert.equal(tree.root.findAllByType(Avatar).length, 3);
  await act(() => tree.unmount());
});

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

function peopleHarness() {
  let app = { user: { id: 'viewer' } };
  let activeCheckIn = { placeId: 'venue', userId: 'viewer', startedAt: '2026-10-03' };
  let focused = true, listener, latest, intervals = new Set();
  const requests = [];
  const fetch = (placeId) => { const request = { placeId, ...deferred() }; requests.push(request); return request.promise; };
  const appState = { currentState: 'active', addEventListener: (_, callback) => {
    listener = callback; return { remove: () => { listener = undefined; } };
  } };
  const { useActivePeople } = load('src/hooks/useActivePeople.ts', {
    'expo-router': { useFocusEffect: (callback) => React.useEffect(() => focused ? callback() : undefined, [callback, focused]) },
    'react-native': { AppState: appState },
    '@/context/AppContext': { useApp: () => app },
    '@/context/PlacesContext': { usePlaces: () => ({ activeCheckIn, getActivePeopleForPlace: fetch }) },
  }, { setInterval: (callback) => { intervals.add(callback); return callback; }, clearInterval: (id) => intervals.delete(id) });
  function Probe({ placeId = 'venue' }) { latest = useActivePeople(placeId); return null; }
  return { Probe, requests, people: () => latest, intervals,
    setCheckIn: (value) => { activeCheckIn = value; },
    setUser: (id) => { app = { user: id ? { id } : null }; },
    setFocus: (value) => { focused = value; },
    setAppState: (value) => { appState.currentState = value; listener?.(value); },
    tick: () => { for (const callback of intervals) callback(); },
  };
}
const activePeople = [{ id: 'viewer', firstName: 'Sen' }, { id: 'other', firstName: 'Ali' }];

test('no check-in, another venue, signed-out or another account never query profiles', async () => {
  for (const mode of ['none', 'venue', 'signed-out', 'account']) {
    const h = peopleHarness();
    if (mode === 'none') h.setCheckIn(null);
    if (mode === 'signed-out') h.setUser(null);
    if (mode === 'account') h.setUser('different');
    let tree;
    await act(() => { tree = create(React.createElement(h.Probe, { placeId: mode === 'venue' ? 'elsewhere' : 'venue' })); });
    assert.equal(h.requests.length, 0, mode);
    assert.equal(h.people().length, 0, mode);
    await act(() => tree.unmount());
  }
});

test('checkout clears photos and ignores late responses, including re-entry', async () => {
  const h = peopleHarness(); let tree;
  await act(() => { tree = create(React.createElement(h.Probe)); });
  await act(() => h.requests[0].resolve(activePeople));
  assert.equal(h.people().length, 2);
  await act(() => h.tick());
  await act(() => { h.setCheckIn(null); tree.update(React.createElement(h.Probe)); });
  assert.equal(h.people().length, 0);
  assert.equal(h.intervals.size, 0);
  await act(() => { h.setCheckIn({ placeId: 'venue', userId: 'viewer', startedAt: 'new' }); tree.update(React.createElement(h.Probe)); });
  await act(() => h.requests[1].resolve(activePeople));
  assert.equal(h.people().length, 0, 'previous visit cannot populate new visit');
  await act(() => h.requests[2].resolve([activePeople[0]]));
  assert.equal(h.people().length, 1);
  await act(() => tree.unmount());
});

test('switching accounts clears identities before an old request completes', async () => {
  const h = peopleHarness(); let tree;
  await act(() => { tree = create(React.createElement(h.Probe)); });
  await act(() => { h.setUser('new-user'); tree.update(React.createElement(h.Probe)); });
  await act(() => h.requests[0].resolve(activePeople));
  assert.equal(h.people().length, 0);
  assert.equal(h.intervals.size, 0);
  await act(() => tree.unmount());
});

test('background and blur clear photos; polling never overlaps; focus reloads', async () => {
  const h = peopleHarness(); let tree;
  await act(() => { tree = create(React.createElement(h.Probe)); h.tick(); h.tick(); });
  assert.equal(h.requests.length, 1);
  await act(() => h.requests[0].resolve(activePeople));
  await act(() => h.setAppState('background'));
  assert.equal(h.people().length, 0);
  await act(() => h.tick());
  assert.equal(h.requests.length, 1);
  await act(() => h.setAppState('active'));
  await act(() => h.requests[1].resolve([activePeople[0]]));
  assert.equal(h.people().length, 1, 'departed person removed on refresh');
  await act(() => { h.setFocus(false); tree.update(React.createElement(h.Probe)); });
  assert.equal(h.people().length, 0);
  assert.equal(h.intervals.size, 0);
  await act(() => { h.setFocus(true); tree.update(React.createElement(h.Probe)); });
  assert.equal(h.requests.length, 3);
  await act(() => tree.unmount());
});

test('failed refresh clears previous identities', async () => {
  const h = peopleHarness(); let tree;
  await act(() => { tree = create(React.createElement(h.Probe)); });
  await act(() => h.requests[0].resolve(activePeople));
  await act(() => h.tick());
  await act(() => h.requests[1].reject(new Error('offline')));
  assert.equal(h.people().length, 0);
  await act(() => tree.unmount());
});

test('returning to foreground during a request discards it and immediately reloads', async () => {
  const h = peopleHarness(); let tree;
  await act(() => { tree = create(React.createElement(h.Probe)); });
  await act(() => { h.setAppState('background'); h.setAppState('active'); });
  assert.equal(h.requests.length, 1, 'in-flight queries must not overlap');
  await act(() => h.requests[0].resolve(activePeople));
  assert.equal(h.people().length, 0, 'background snapshot is stale');
  assert.equal(h.requests.length, 2, 'must not wait for next poll');
  await act(() => h.requests[1].resolve([activePeople[0]]));
  assert.equal(h.people().length, 1);
  await act(() => tree.unmount());
});

test('message history carries the already-authorised profile photo, with no extra request', async () => {
  const userId = '22222222-2222-4222-8222-222222222222';
  const row = { id: 'm1', user_id: userId, body: 'hello', created_at: '2026-10-03' };
  const rpcCalls = [];
  const chain = { select: () => chain, eq: () => chain, order: () => chain,
    limit: async () => ({ data: [row], error: null }) };
  const { fetchPlaceMessages } = load('src/lib/checkIns.ts', {
    'expo-crypto': {}, '@/lib/purchases': {},
    '@/lib/supabase': { isSupabaseConfigured: true, supabase: {
      from: (table) => { assert.equal(table, 'messages'); return chain; },
      rpc: async (name, args) => { rpcCalls.push({ name, args }); return {
        data: [{ id: userId, first_name: 'Ali', avatar_url: ' https://example.com/a.jpg ' }], error: null,
      }; },
    } },
  }, { process: { env: {} } });
  const result = await fetchPlaceMessages('11111111-1111-4111-8111-111111111111');
  assert.equal(result[0].avatarUrl, 'https://example.com/a.jpg');
  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0].name, 'get_public_profiles');
  assert.deepEqual(Array.from(rpcCalls[0].args.profile_ids), [userId]);
});

test('place card separates up-to-three active avatars from monthly regulars', async () => {
  const { PlaceCard } = load('src/components/PlaceCard.tsx', {
    '@expo/vector-icons': { Ionicons: 'icon' }, 'expo-image': { Image: 'image' },
    'expo-linear-gradient': { LinearGradient: 'gradient' }, 'react-native': rn,
    '@/components/Motion': { PressableScale: 'button' }, '@/components/LiveDot': { LiveDot: 'dot' },
    '@/components/Avatar': { Avatar, AvatarStack }, '@/theme/colors': { colors, shadows: {} },
    '@/theme/spacing': { radii: {}, spacing: {} },
  });
  const props = { place: { id: 'venue', reviewCount: 0, checkedInCount: 9, category: 'Cafe', city: 'Ankara' },
    label: 'Test café', width: 300, regulars: [], onPress() {}, onPressRegulars() {} };
  let tree;
  await act(() => { tree = create(React.createElement(PlaceCard, props)); });
  assert.equal(tree.root.findAllByType(AvatarStack).length, 0, 'aggregate count alone cannot reveal identities');
  await act(() => tree.update(React.createElement(PlaceCard, { ...props,
    activePeople: [...activePeople, { id: '3', firstName: 'Cem' }, { id: '4', firstName: 'Can' }],
  })));
  assert.equal(tree.root.findAllByType(Avatar).length, 3);
  assert.match(JSON.stringify(tree.toJSON()), /kişi burada/);
  assert.match(JSON.stringify(tree.toJSON()), /Müdavimler/);
  await act(() => tree.unmount());
});
