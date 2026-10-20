const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');
const React = require('react');
const { act, create } = require('react-test-renderer');
const { motionMocks } = require('./testSupport/motion.cjs');
global.IS_REACT_ACT_ENVIRONMENT = true;
function load(file, mocks, globals = {}) {
  const filename = path.resolve(__dirname, '../..', file);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(code, { exports: mod.exports, console, setTimeout, clearTimeout, AbortController, ...globals,
    require: name => Object.hasOwn(mocks, name) ? mocks[name] : ['react', 'react/jsx-runtime'].includes(name)
      ? require(name) : (() => { throw new Error(`Unmocked ${name}`); })() }, { filename });
  return mod.exports;
}
const api = load('src/lib/socialDiscovery.ts', { './supabase': { supabase: null } });
test('people are grouped at real venues, invalid points excluded, never jittered', () => {
  const rows = [{ id: 'a', first_name: 'A', place_id: 'cafe', latitude: 39, longitude: 32 },
    { id: 'b', first_name: 'B', place_id: 'cafe', latitude: 39, longitude: 32 },
    { id: 'b', first_name: 'B', place_id: 'cafe', latitude: 39, longitude: 32 },
    { id: 'c', place_id: 'bad', latitude: NaN, longitude: 32 },
    { id: 'd', place_id: 'bad2', latitude: 99, longitude: 32 }];
  const groups = api.groupPeopleAtVenues(rows);
  assert.equal(groups.length, 1); assert.equal(groups[0].people.length, 2);
  assert.equal(groups[0].latitude, 39); assert.equal(groups[0].longitude, 32);
  assert.equal(api.pageOf(Array.from({ length: 51 }, (_, i) => i)).items.length, 50);
  assert.equal(api.pageOf(Array(51)).hasMore, true);
});
test('RPC masks server/network details and uses an abort deadline', async () => {
  let captured;
  const { socialAction } = load('src/lib/socialDiscovery.ts', { './supabase': { supabase: {
    rpc: (...args) => { captured = args; return { abortSignal: async signal => {
      assert.ok(signal); return { error: { message: 'secret database detail', code: 'XX000' } };
    } }; },
  } } });
  await assert.rejects(() => socialAction('send', { body: 'private' }), /Bağlantı kurulamadı/);
  assert.equal(captured[1].p_action, 'send');
});

function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
function queryHarness() {
  let userId = 'a', focused = true, latest, listener;
  const requests = [], intervals = new Set();
  const state = { currentState: 'active', addEventListener: (_, cb) => { listener = cb; return { remove() { listener = null; } }; } };
  const { useSocialQuery } = load('src/hooks/useSocialQuery.ts', {
    'react-native': { AppState: state }, '@/context/AppContext': { useApp: () => ({ user: userId ? { id: userId } : null }) },
    'expo-router': { useFocusEffect: cb => React.useEffect(() => focused ? cb() : undefined, [cb, focused]) },
    '@/lib/socialDiscovery': { socialAction: (action, payload) => { const r = { ...deferred(), action, payload }; requests.push(r); return r.promise; }, socialErrorText: () => 'safe error' },
  }, { setInterval: cb => { intervals.add(cb); return cb; }, clearInterval: cb => intervals.delete(cb) });
  function Probe({ enabled = true, city = 'ankara' }) { latest = useSocialQuery('discover', { city }, enabled); return null; }
  return { Probe, requests, intervals, value: () => latest, user: id => { userId = id; }, focus: v => { focused = v; },
    background: v => { state.currentState = v; listener?.(v); } };
}
test('query discards previous account responses and clears on sign-out', async () => {
  const h = queryHarness(); let tree;
  await act(() => { tree = create(React.createElement(h.Probe)); });
  const old = h.requests[0];
  await act(() => { h.user('b'); tree.update(React.createElement(h.Probe)); });
  await act(() => old.resolve({ people: ['secret-a'] }));
  assert.equal(h.value().data, undefined);
  await act(() => h.requests[1].resolve({ people: ['b-visible'] }));
  assert.equal(h.value().data.people[0], 'b-visible');
  await act(() => { h.user(null); tree.update(React.createElement(h.Probe)); });
  assert.equal(h.value().data, undefined);
  await act(() => tree.unmount()); assert.equal(h.intervals.size, 0);
});
test('query does not overlap polls and keeps the same account\'s rows across inactive, background, failed polls and blur', async () => {
  const h = queryHarness(); let tree;
  await act(() => { tree = create(React.createElement(h.Probe)); });
  await act(() => { for (const tick of h.intervals) { tick(); tick(); } });
  assert.equal(h.requests.length, 1);
  await act(() => h.requests[0].resolve({ people: ['visible'] }));
  // Control Center / notification banner: transient, nothing is cleared or refetched.
  await act(() => h.background('inactive')); assert.equal(h.value().data.people[0], 'visible'); assert.equal(h.requests.length, 1);
  await act(() => h.background('background')); assert.equal(h.value().data.people[0], 'visible');
  assert.equal(h.value().loading, false);
  await act(() => { for (const tick of h.intervals) tick(); }); assert.equal(h.requests.length, 1);
  await act(() => h.background('active')); assert.equal(h.requests.length, 2);
  assert.equal(h.value().data.people[0], 'visible', 'foreground refresh happens behind the current rows');
  await act(() => h.requests[1].resolve({ people: ['new'] }));
  assert.equal(h.value().data.people[0], 'new');
  await act(() => { for (const tick of h.intervals) tick(); });
  await act(() => h.requests[2].reject(new Error('network')));
  assert.equal(h.value().data.people[0], 'new'); assert.equal(h.value().error, undefined);
  await act(() => { h.focus(false); tree.update(React.createElement(h.Probe)); });
  assert.equal(h.intervals.size, 0); assert.equal(h.value().data.people[0], 'new');
  await act(() => { h.focus(true); tree.update(React.createElement(h.Probe)); });
  assert.equal(h.value().data.people[0], 'new'); assert.equal(h.requests.length, 4);
  // A different account never sees these rows, not even for one render.
  await act(() => { h.user('b'); tree.update(React.createElement(h.Probe)); });
  assert.equal(h.value().data, undefined); assert.equal(h.value().loading, true);
  await act(() => tree.unmount());
});
test('first load failure shows the error', async () => {
  const h = queryHarness(); let tree;
  await act(() => { tree = create(React.createElement(h.Probe)); });
  await act(() => h.requests[0].reject(new Error('network')));
  assert.equal(h.value().data, undefined); assert.equal(h.value().error, 'safe error');
  await act(() => tree.unmount());
});
test('disabled query does not fetch; city switch and foreground ignore stale replies', async () => {
  const h = queryHarness(); let tree;
  await act(() => { tree = create(React.createElement(h.Probe, { enabled: false })); });
  assert.equal(h.requests.length, 0);
  await act(() => tree.update(React.createElement(h.Probe)));
  await act(() => tree.update(React.createElement(h.Probe, { city: 'izmir' })));
  await act(() => h.requests[0].resolve({ people: ['ankara'] })); assert.equal(h.value().data, undefined);
  await act(() => h.background('background'));
  await act(() => h.background('active'));
  await act(() => h.requests[1].resolve({ people: ['stale'] })); assert.equal(h.value().data, undefined);
  await act(() => h.requests[2].resolve({ people: ['fresh'] })); assert.equal(h.value().data.people[0], 'fresh');
  await act(() => tree.unmount());
});

const colors = require('../theme/colors.ts').colors;
const list = ({ data, renderItem, ListEmptyComponent, ListFooterComponent, ...props }) => React.createElement('list', props,
  ...data.map((item, index) => React.createElement(React.Fragment, { key: item.id }, renderItem({ item, index }))),
  !data.length ? ListEmptyComponent : null, ListFooterComponent);
const rn = { Platform: { OS: 'ios' }, PixelRatio: { getFontScale: () => 1 }, useWindowDimensions: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }), View: 'view', Text: 'text', Image: 'image', ActivityIndicator: 'spinner', FlatList: list, ScrollView: 'scroll',
  Modal: ({ visible, children }) => visible ? React.createElement('modal', {}, children) : null,
  Pressable: 'pressable', TextInput: 'input', Alert: { alert() {} },
  AppState: { addEventListener: () => ({ remove() {} }) }, StyleSheet: { create: s => s, absoluteFill: {} } };
const ui = { Button: props => React.createElement('button', props) };
const demo = load('src/data/discoveryDemo.ts', Object.fromEntries(['defne', 'emre', 'ece', 'kerem'].map((id, index) => [
  `../../assets/demo-people/${id}-v1.png`, index + 1,
])));
const sheetAdapter = {
  MapSheet: ({ children, ...props }) => React.createElement('sheet', props, children({ pan: null, revealStyle: {} })),
  MapSheetHandle: ({ children }) => React.createElement('handle', {}, children),
};
function peoplePanel(pushed = [], feedback = []) {
  return load('src/components/PeopleMapPanel.tsx', {
    ...motionMocks().modules, './MapSheet': sheetAdapter,
    '@/lib/haptics': { haptic: kind => feedback.push(kind) },
    'react-native': rn, 'react-native-maps': { Marker: 'marker' },
    '@expo/vector-icons': { Ionicons: 'icon' }, 'expo-linear-gradient': { LinearGradient: 'gradient' },
    'expo-router': { router: { push: p => pushed.push(p) } },
    './Avatar': { Avatar: 'avatar' }, './LiveDot': { LiveDot: 'dot' }, './Motion': { PressableScale: 'pressable' }, './ui': ui,
    '@/data/discoveryDemo': demo,
    '@/lib/avatarAppearance': require('./avatarAppearance.ts'), '@/lib/socialDiscovery': api, '@/theme/colors': { colors, shadows: {} },
  });
}
test('people panel shows real names, venue grouping and profile links', async () => {
  const pushed = [];
  const { PeopleMapPanel } = peoplePanel(pushed);
  let tree; const people = [{ id: 'a', first_name: 'Ada', place_id: 'p', place_name: 'Test Cafe' },
    { id: 'b', first_name: 'Bora', place_id: 'q', place_name: 'Other Cafe' }];
  await act(() => { tree = create(React.createElement(PeopleMapPanel, { people, venueId: 'p', height: 260, ownId: 'me' })); });
  assert.equal(tree.root.findAllByType('avatar').length, 1);
  await act(() => tree.root.findAllByType('pressable').find(p => p.props.accessibilityLabel === 'Ada, Test Cafe').props.onPress());
  assert.equal(pushed[0], '/person/a');
  assert.doesNotMatch(JSON.stringify(tree.toJSON()), /Bora/);
  await act(() => tree.unmount());
});

test('empty live discovery never silently displays fictional members', async () => {
  const { PeopleMapPanel } = peoplePanel(); let tree, toggled = false;
  await act(() => { tree = create(React.createElement(PeopleMapPanel, { people: [], height: 242, onDemo: () => { toggled = true; } })); });
  assert.doesNotMatch(JSON.stringify(tree.toJSON()), /Defne|Emre|demo:defne/);
  const control = tree.root.findAllByType('pressable').find(p => p.props.accessibilityLabel === 'Demo görünümünü dene');
  assert.ok(control); assert.equal(toggled, false);
  await act(() => control.props.onPress()); assert.equal(toggled, true);
  await act(() => tree.unmount());
});
test('people panel has a tap alternative to dragging and hides collapsed content from touch/accessibility', async () => {
  const { PeopleMapPanel } = peoplePanel(); let tree, collapsed;
  const props = { people: [{ id: 'a', first_name: 'Ada', place_name: 'Kafe' }], height: 352, openHeight: 352,
    onCollapse: value => { collapsed = value; } };
  await act(() => { tree = create(React.createElement(PeopleMapPanel, props)); });
  await act(() => tree.root.findAllByType('pressable').find(p => p.props.accessibilityLabel === 'Kişi panelini küçült').props.onPress());
  assert.equal(collapsed, true);
  await act(() => tree.update(React.createElement(PeopleMapPanel, { ...props, height: 112, collapsed: true })));
  const body = tree.root.findAllByType('animated-view').find(v => v.props.accessibilityElementsHidden);
  assert.equal(body.props.pointerEvents, 'none'); assert.equal(body.props.importantForAccessibility, 'no-hide-descendants');
  const opener = tree.root.findAllByType('pressable').find(p => p.props.accessibilityLabel === 'Kişi panelini aç');
  assert.equal(opener.props.accessibilityState.expanded, false);
  await act(() => opener.props.onPress()); assert.equal(collapsed, false);
  await act(() => tree.unmount());
});
test('horizontal cards do not belong to the sheet handle; scroll feedback occurs once per new card', async () => {
  const pushed = [], feedback = [];
  const { PeopleMapPanel } = peoplePanel(pushed, feedback); let tree;
  await act(() => { tree = create(React.createElement(PeopleMapPanel, {
    people: [{ id: 'a', first_name: 'Ada', place_name: 'Kafe' }], height: 352,
  })); });
  const card = tree.root.findAllByType('pressable').find(p => p.props.accessibilityLabel === 'Ada, Kafe');
  for (let node = card.parent; node; node = node.parent) assert.notEqual(node.type, 'handle');
  const scrollEnd = tree.root.findByType('list').props.onMomentumScrollEnd;
  scrollEnd({ nativeEvent: { contentOffset: { x: 152 } } });
  scrollEnd({ nativeEvent: { contentOffset: { x: 153 } } });
  scrollEnd({ nativeEvent: { contentOffset: { x: 0 } } });
  assert.deepEqual(feedback, ['select', 'select']); assert.deepEqual(pushed, []);
  await act(() => tree.unmount());
});
test('demo portraits are device-only, labelled and cannot navigate to a live profile or DM', async () => {
  const venues = [{ id: 'p', name: 'Örnek Kafe', latitude: 39.9, longitude: 32.8, city: 'Ankara' }];
  const people = demo.discoveryDemoPeople(venues), pushed = [];
  assert.equal(people.length, 4); assert.ok(people.every(p => p.id.startsWith('demo:') && p.allow_dm_requests === false));
  assert.equal(demo.discoveryDemoPeople([]).length, 0);
  assert.equal(demo.discoveryDemoPeople([{ ...venues[0], latitude: NaN }]).length, 0);
  const { PeopleMapPanel } = peoplePanel(pushed); let tree;
  await act(() => { tree = create(React.createElement(PeopleMapPanel, { people, height: 350, demo: true })); });
  assert.equal(tree.root.findAllByType('image').length, 4);
  assert.match(JSON.stringify(tree.toJSON()), /AI DEMO/);
  await act(() => tree.root.findAllByType('pressable').find(p => p.props.accessibilityLabel === 'Demo profil, Defne, Örnek Kafe').props.onPress());
  assert.equal(pushed.length, 0); assert.equal(tree.root.findAllByType('modal').length, 1);
  assert.match(JSON.stringify(tree.toJSON()), /mesajlaşma yapmaz/);
  await act(() => tree.update(React.createElement(PeopleMapPanel, { people: [], height: 242, demo: false })));
  assert.equal(tree.root.findAllByType('modal').length, 0);
  assert.doesNotMatch(JSON.stringify(tree.toJSON()), /Defne/);
  await act(() => tree.unmount());
});
test('demo marker is labelled DEMO instead of presenting a live check-in dot', async () => {
  const { PeopleMarker } = peoplePanel(); let tree;
  const people = demo.discoveryDemoPeople([{ id: 'p', name: 'Örnek Kafe', latitude: 39.9, longitude: 32.8, city: 'Ankara' }]);
  await act(() => { tree = create(React.createElement(PeopleMarker, { group: api.groupPeopleAtVenues(people)[0], demo: true })); });
  assert.match(tree.root.findByType('marker').props.title, /Gerçek kullanıcı değil/);
  assert.match(JSON.stringify(tree.toJSON()), /DEMO/);
  assert.equal(tree.root.findAllByType('image')[0].props.source, 1);
  await act(() => tree.unmount());
});
test('discovery header has two named tabs and context-specific search/settings', async () => {
  const { DiscoveryHeader } = load('src/components/DiscoveryHeader.tsx', {
    ...motionMocks().modules,
    'react-native': rn, '@expo/vector-icons': { Ionicons: 'icon' }, './Motion': { PressableScale: 'pressable' },
    '@/theme/colors': { colors, shadows: {} },
  });
  let tree, mode;
  const props = { top: 20, city: 'İzmir', mode: 'places', subtitle: 'Mekân keşfet', onMode: value => { mode = value; } };
  await act(() => { tree = create(React.createElement(DiscoveryHeader, props)); });
  const tabs = tree.root.findAllByType('pressable').filter(p => p.props.accessibilityRole === 'tab');
  assert.equal(tabs.length, 2); assert.equal(tabs[0].props.accessibilityState.selected, true);
  await act(() => tabs[1].props.onPress()); assert.equal(mode, 'people');
  await act(() => tree.update(React.createElement(DiscoveryHeader, { ...props, mode: 'people', demo: true })));
  // People mode: no search, no visibility/options buttons; demo is only a short tag.
  const labels = tree.root.findAllByType('pressable').filter(p => p.props.accessibilityRole !== 'tab').map(p => p.props.accessibilityLabel);
  assert.deepEqual(labels, ['Şehir seç: İzmir, AI demo']);
  assert.match(JSON.stringify(tree.toJSON()), /AI demo/);
  await act(() => tree.update(React.createElement(DiscoveryHeader, { ...props, mode: 'places', demo: false, live: 12 })));
  const placeLabels = tree.root.findAllByType('pressable').map(p => p.props.accessibilityLabel);
  assert.ok(placeLabels.includes('Mekân ara'));
  assert.ok(!placeLabels.some(l => /filtre|yenile|Görünürlük/i.test(l)), 'filters moved to the places panel');
  assert.match(JSON.stringify(tree.toJSON()), /● 12 aktif/);
  await act(() => tree.update(React.createElement(DiscoveryHeader, { ...props, mode: 'places', demo: false, live: 0 })));
  assert.doesNotMatch(JSON.stringify(tree.toJSON()), /aktif|mekân ·|· Pro/);
  await act(() => tree.unmount());
});

function dmHarness(status = 'pending', requestedBy = 'peer', access = null) {
  let current = { loading: false, data: { thread_id: 't', status, requested_by: requestedBy,
    peer: { id: 'peer', first_name: 'Ada' }, messages: [{ id: 'm', sender_id: 'peer', body: 'Merhaba', created_at: '2026-10-03T12:00:00Z' }] }, refresh: async () => {} };
  const calls = [], alerts = [], pushes = [];
  let nextResult;
  const screen = props => React.createElement('screen', {}, props.children, props.footer);
  const { default: DM } = load('app/dm/[id].tsx', {
    'expo-router': { router: { push: p => pushes.push(p), back() {} }, useLocalSearchParams: () => ({ id: 't' }) },
    'expo-crypto': { randomUUID: () => 'unique-request' }, 'react-native': { ...rn, Alert: { alert: (...args) => alerts.push(args) } },
    '@/components/Screen': { Screen: screen }, '@/components/ui': ui, '@/components/Avatar': { Avatar: 'avatar' },
    '@expo/vector-icons': { Ionicons: 'icon' }, '@/components/Motion': { PressableScale: 'pressable' },
    '@/components/ChatComposer': load('src/components/ChatComposer.tsx', { 'react-native': rn, '@expo/vector-icons': { Ionicons: 'icon' },
      '@/components/Motion': { PressableScale: 'button' },
      '@/theme/colors': { colors, shadows: {} }, '@/theme/spacing': { radii: {} } }),
    '@/components/SocialUI': { SocialHeader: p => React.createElement('header', {}, p.right), SocialNotice: 'notice', socialStyles: {} },
    '@/context/AppContext': { useApp: () => ({ user: { id: 'me' } }) },
    '@/hooks/useSocialQuery': { useSocialQuery: () => current }, '@/lib/checkIns': { fetchMessageAccessStatus: async () => access },
    '@/lib/socialDiscovery': { ...api, socialAction: async (action, payload) => { calls.push({ action, payload });
      if (nextResult) return nextResult.promise; return {}; } }, '@/theme/colors': { colors },
  });
  return { DM, calls, alerts, pushes, data: value => { current = value; }, pending: d => { nextResult = d; } };
}
test('pending recipient has accept/decline and no composer; sender cannot self-accept', async () => {
  let tree; const h = dmHarness();
  await act(() => { tree = create(React.createElement(h.DM)); });
  assert.equal(tree.root.findAllByType('input').length, 0);
  const accept = tree.root.findAllByType('button').find(b => b.props.label === 'Kabul et');
  await act(() => accept.props.onPress()); assert.equal(h.calls[0].payload.response, 'accepted');
  await act(() => tree.unmount());
  const sender = dmHarness('pending', 'me');
  await act(() => { tree = create(React.createElement(sender.DM)); });
  assert.equal(tree.root.findAllByType('button').filter(b => b.props.label === 'Kabul et').length, 0);
  assert.equal(tree.root.findAllByType('input').length, 0);
  await act(() => tree.unmount());
});
test('accepted DM puts composer in keyboard-aware footer and double-send is guarded', async () => {
  const h = dmHarness('accepted'); let tree;
  await act(() => { tree = create(React.createElement(h.DM)); });
  assert.equal(tree.root.findByType('input').props.maxLength, 500);
  await act(() => tree.root.findByType('input').props.onChangeText('Selam'));
  const d = deferred(); h.pending(d);
  const send = tree.root.findAllByType('button').find(b => b.props.accessibilityLabel === 'Gönder');
  assert.equal(send.props.disabled, false);
  await act(() => { send.props.onPress(); send.props.onPress(); });
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0].payload.body, 'Selam');
  await act(() => d.resolve({})); assert.equal(tree.root.findByType('input').props.value, '');
  await act(() => tree.unmount());
});
test('blocked/error conversation removes message bodies and composer', async () => {
  const h = dmHarness('accepted'); let tree;
  await act(() => { tree = create(React.createElement(h.DM)); });
  assert.match(JSON.stringify(tree.toJSON()), /Merhaba/);
  await act(() => { h.data({ error: 'Sohbet kullanılamıyor', loading: false, refresh: async () => {} }); tree.update(React.createElement(h.DM)); });
  assert.doesNotMatch(JSON.stringify(tree.toJSON()), /Merhaba/); assert.equal(tree.root.findAllByType('input').length, 0);
  await act(() => tree.unmount());
});

test('DM menu only offers blocking; quota line appears only when 3 or fewer free messages remain', async () => {
  const text = tree => JSON.stringify(tree.toJSON());
  let tree; const h = dmHarness('accepted', 'peer', { hasUnlimited: false, messagesRemaining: 3 });
  await act(() => { tree = create(React.createElement(h.DM)); });
  assert.match(text(tree), /3 ücretsiz mesaj kaldı/);
  assert.doesNotMatch(text(tree), /basılı tut\./);
  await act(() => tree.root.findAllByType('pressable').find(p => p.props.accessibilityLabel === 'Diğer seçenekler').props.onPress());
  const labels = h.alerts.at(-1)[2].map(o => o.text);
  assert.ok(labels.includes('Kişiyi engelle')); assert.ok(!labels.includes('Profili gör'));
  await act(() => tree.unmount());
  for (const access of [{ hasUnlimited: false, messagesRemaining: 9 }, { hasUnlimited: true, messagesRemaining: 0 }]) {
    const other = dmHarness('accepted', 'peer', access);
    await act(() => { tree = create(React.createElement(other.DM)); });
    assert.doesNotMatch(text(tree), /ücretsiz mesaj|Sınırsız/);
    await act(() => tree.unmount());
  }
});

function inboxHarness(threads) {
  const pushes = [];
  const { default: Messages } = load('app/(tabs)/messages.tsx', {
    '@expo/vector-icons': { Ionicons: 'icon' }, 'expo-router': { router: { push: p => pushes.push(p), navigate() {} } },
    'react-native': { ...rn, FlatList: ({ ListHeaderComponent, ...p }) => React.createElement('view', {}, ListHeaderComponent, list(p)) },
    '@/context/AppContext': { useApp: () => ({ user: { id: 'me' } }) },
    '@/components/Screen': { Screen: p => React.createElement('screen', {}, p.children) }, '@/components/Avatar': { Avatar: 'avatar' },
    '@/components/Motion': { PressableScale: 'pressable' },
    '@/components/ui': { ...ui, EmptyState: 'empty', Txt: p => React.createElement('txt', p, p.children) },
    '@/components/SocialUI': { SocialNotice: 'notice', socialStyles: {} },
    '@/hooks/useSocialQuery': { useSocialQuery: () => ({ loading: false, data: { threads }, refresh: async () => {} }) },
    '@/lib/socialDiscovery': api, '@/theme/colors': { colors },
  });
  return { Messages, pushes };
}
test('inbox gathers requests into one compact row and drops the section label', async () => {
  const t = (id, extra) => ({ id, first_name: id, preview: `${id} yazdı`, last_message_at: '2026-10-03T12:00:00Z', unread: 0, status: 'accepted', ...extra });
  const h = inboxHarness([t('Ada', { unread: 2 }), t('Bora'), t('Cem', { status: 'pending', requested_by: 'Cem' }),
    t('Dila', { status: 'pending', requested_by: 'Dila' })]);
  let tree;
  await act(() => { tree = create(React.createElement(h.Messages)); });
  const text = () => JSON.stringify(tree.toJSON());
  assert.match(text(), /Mesajlar/); assert.match(text(), /2 mesaj isteği/);
  assert.doesNotMatch(text(), /Sohbetler|Kabul edene kadar|Cem yazdı/);
  assert.ok(!tree.root.findAllByType('pressable').some(p => /ayar/i.test(p.props.accessibilityLabel ?? '')));
  assert.ok(tree.root.findAllByType('pressable').find(p => p.props.accessibilityLabel === 'Ada, 2 okunmamış mesaj'));
  await act(() => tree.root.findAllByType('pressable').find(p => p.props.accessibilityLabel === '2 mesaj isteği').props.onPress());
  assert.match(text(), /Mesaj istekleri/); assert.match(text(), /Tüm sohbetler/); assert.match(text(), /"İstek · ","Cem yazdı"/);
  assert.doesNotMatch(text(), /Bora yazdı/);
  await act(() => tree.unmount());
});

test('notifications split into Bugün / Daha önce, unread only by dot, history clearing behind the menu', async () => {
  const alerts = []; let markedAll = 0;
  const now = new Date();
  const notifications = [
    { id: 'n1', type: 'system', title: 'Yeni', body: 'Bugünkü', createdAt: now.toISOString(), read: false },
    { id: 'n2', type: 'place_approved', title: 'Eski', body: 'Geçen hafta', createdAt: '2026-01-02T10:00:00Z', read: true },
  ];
  let unread = 1;
  const { default: Notifications } = load('app/(tabs)/notifications.tsx', {
    ...motionMocks().modules,
    'react-native-reanimated': { __esModule: true, default: { View: 'animated-view' }, FadeInDown: { delay() { return this; }, duration() { return this; } } },
    '@expo/vector-icons': { Ionicons: 'icon' }, 'expo-router': { router: { push() {} } },
    'react-native': { ...rn, Alert: { alert: (...args) => alerts.push(args) } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    '@/components/Motion': { PressableScale: 'pressable' }, '@/components/TabBar': { tabBarSpace: () => 0 },
    '@/components/ui': { EmptyState: 'empty', Txt: p => React.createElement('txt', p, p.children) },
    '@/context/PlacesContext': { usePlaces: () => ({ notifications, unreadCount: unread, markNotificationRead() {},
      markAllNotificationsRead: () => { markedAll++; }, clearNotifications: async () => {}, openStillHerePrompt() {} }) },
    '@/theme/colors': { colors }, '@/theme/motion': { duration: { base: 1 }, stagger: i => i },
    '@/theme/spacing': { spacing: { xs: 4, sm: 8, md: 16, lg: 20 } },
  });
  let tree;
  await act(() => { tree = create(React.createElement(Notifications)); });
  const text = () => JSON.stringify(tree.toJSON());
  assert.match(text(), /Bugün/); assert.match(text(), /Daha önce/);
  assert.ok(text().indexOf('Bugünkü') < text().indexOf('Daha önce'));
  assert.doesNotMatch(text(), /okunmamış|Hepsi okundu|Geçmişi sil/);
  await act(() => tree.root.findAllByType('pressable').find(p => p.props.accessibilityLabel === 'Tümünü okundu say').props.onPress());
  assert.equal(markedAll, 1);
  await act(() => tree.root.findAllByType('pressable').find(p => p.props.accessibilityLabel === 'Diğer seçenekler').props.onPress());
  assert.ok(alerts.at(-1)[2].some(o => o.text === 'Geçmişi sil'));
  unread = 0;
  await act(() => tree.update(React.createElement(Notifications)));
  assert.doesNotMatch(text(), /Tümünü oku/);
  await act(() => tree.unmount());
});
