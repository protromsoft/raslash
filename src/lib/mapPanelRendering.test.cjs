const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');
const React = require('react');
const { act, create } = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;
const colors = require('../theme/colors.ts').colors;
const { mapPanelHeight } = require('./mapPanelLayout.ts');
const { motionMocks } = require('./testSupport/motion.cjs');
const motion = motionMocks();
const rn = {
  View: 'view', Text: 'text', ScrollView: 'scroll',
  useWindowDimensions: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }),
  StyleSheet: { create: s => s, absoluteFill: { position: 'absolute' }, hairlineWidth: 1 },
  FlatList: ({ data, renderItem, ListEmptyComponent }) => React.createElement('list', {},
    data.length ? data.map((item, index) => React.createElement(React.Fragment, { key: item.id }, renderItem({ item, index }))) : ListEmptyComponent),
};
const shared = { ...motion.modules, 'react-native': rn, '@expo/vector-icons': { Ionicons: 'icon' },
  'expo-image': { Image: 'image' }, '@/components/Motion': { PressableScale: 'button' },
  '@/components/LiveDot': { LiveDot: 'dot' }, '@/theme/colors': { colors, shadows: {} },
  '@/components/Avatar': { Avatar: 'avatar', AvatarStack: 'avatars' } };
function load(file, mocks = {}) {
  const filename = path.resolve(__dirname, '../..', file);
  const code = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(code, { exports: mod.exports, require: name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (Object.hasOwn(shared, name)) return shared[name];
    if (['react', 'react/jsx-runtime'].includes(name)) return require(name);
    throw new Error(`Unmocked ${name}`);
  } }, { filename });
  return mod.exports;
}
const { PlaceMembers } = load('src/components/PlaceMembers.tsx');
const sheet = load('src/components/MapSheet.tsx');
const { MapPlacesPanel, VenuePhoto } = load('src/components/MapPlacesPanel.tsx', {
  '@/components/MapSheet': sheet,
  '@/lib/placeLabel': { districtForPlace: () => '' },
});
const places = [{ id: 'a', name: 'Ankara Café', city: 'Ankara', category: 'Kafe', checkedInCount: 3, reviewCount: 0 },
  { id: 'b', name: 'İkinci Kafe', city: 'Ankara', category: 'Kafe', checkedInCount: 2, reviewCount: 2, overall: 4.5 }];
const people = [{ id: 'me', firstName: 'Oğuz', isMe: true, avatarUrl: 'https://example.com/me.jpg' },
  { id: 'other', firstName: 'Cem', avatarUrl: 'https://example.com/other.jpg' }];
const base = { places, title: 'Ankara mekânları', height: 450, listHeight: 450, expandedHeight: 650, expanded: false, people, activePlaceId: 'a',
  listKey: 'ankara:all', labelFor: place => place.name, distanceTo: () => 0.2,
  onExpand() {}, onSelect() {}, onClose() {}, onDetails() {}, onJoin() {}, onResetFilter() {} };
const press = (tree, label) => tree.root.findAllByType('button').find(b => b.props.accessibilityLabel === label).props.onPress();

test('list shows photos and sends exactly the selected venue to the preview', async () => {
  let tree, selected;
  await act(() => { tree = create(React.createElement(MapPlacesPanel, { ...base, onSelect: p => { selected = p.id; } })); });
  assert.equal(tree.root.findAllByType(VenuePhoto).length, 2);
  assert.equal(tree.root.findAllByType('avatars').length, 1, 'only active venue has an identity preview');
  await act(() => press(tree, 'İkinci Kafe, 2 kişi burada'));
  assert.equal(selected, 'b');
  await act(() => tree.unmount());
});
test('list rows are photo, name, one meta line and a live count only when someone is there', async () => {
  let tree;
  const quiet = { id: 'c', name: 'Sessiz Kafe', city: 'Ankara', category: 'Kafe', checkedInCount: 0, reviewCount: 3, overall: 4.25 };
  await act(() => { tree = create(React.createElement(MapPlacesPanel, { ...base, places: [...places, quiet] })); });
  const json = JSON.stringify(tree.toJSON());
  assert.match(json, /Kafe · 200 m · ★ 4.3/);
  assert.match(json, /2 kişi burada/);
  assert.doesNotMatch(json, /İlk check-in senin olsun|0 kişi burada|keşfedilmeyi bekliyor/);
  assert.equal(tree.root.findAll(n => n.type === 'icon' && n.props.name === 'chevron-forward').length, 0, 'rows have no chevron');
  assert.equal(tree.root.findAllByType('button').filter(b => b.props.accessibilityLabel === 'Mekân öner').length, 0,
    'the header no longer offers a suggest chip');
  await act(() => tree.unmount());
});
test('the sort pill beside the title shows the current filter and opens the sort menu', async () => {
  let tree, opened = false;
  await act(() => { tree = create(React.createElement(MapPlacesPanel, { ...base, sortLabel: 'Yakınımda', onSort: () => { opened = true; } })); });
  assert.match(JSON.stringify(tree.toJSON()), /Yakınımda/);
  await act(() => press(tree, 'Mekânları sırala: Yakınımda'));
  assert.equal(opened, true);
  await act(() => tree.unmount());
});
test('detail shows members, one meta line and a single action row with join and details', async () => {
  let tree, joined, closed = false, detail;
  await act(() => { tree = create(React.createElement(MapPlacesPanel, { ...base, selected: places[0],
    onJoin: p => { joined = p.id; }, onClose: () => { closed = true; }, onDetails: p => { detail = p.id; } })); });
  const stack = tree.root.findAllByType('avatars');
  assert.equal(stack.length, 1);
  assert.deepEqual(stack[0].props.people.map(p => p.id), ['me', 'other']);
  const json = JSON.stringify(tree.toJSON());
  assert.match(json, /2 kişi şu an burada/);
  assert.match(json, /Kafe · Ankara · 200 m/);
  assert.doesNotMatch(json, /Üyeler|Listeye dön|Şu an kimse yok/);
  assert.doesNotMatch(json, /\["Mekân detayları"\]/, 'the old text link is replaced by the "Detaylar" pill');
  await act(() => press(tree, 'Sohbete katıl'));
  assert.equal(joined, 'a');
  await act(() => press(tree, 'Mekân kartını kapat'));
  assert.equal(closed, true);
  assert.match(json, /Detaylar/);
  await act(() => press(tree, 'Mekân detayları ve yorumlar'));
  assert.equal(detail, 'a');
  await act(() => tree.unmount());
});
test('an empty venue shows no member line; a busy venue elsewhere shows only the count', async () => {
  let tree;
  await act(() => { tree = create(React.createElement(MapPlacesPanel, { ...base, selected: { ...places[1], checkedInCount: 0 } })); });
  assert.doesNotMatch(JSON.stringify(tree.toJSON()), /şu an burada|Şu an kimse yok/);
  assert.match(JSON.stringify(tree.toJSON()), /Check-in yap/);
  await act(() => tree.update(React.createElement(MapPlacesPanel, { ...base, selected: places[1] })));
  assert.match(JSON.stringify(tree.toJSON()), /2 kişi şu an burada/);
  assert.equal(tree.root.findAllByType('avatars').length, 0, 'identities stay hidden without a check-in here');
  await act(() => tree.unmount());
});
test('selecting another venue never exposes a previous venue member photo or name', async () => {
  let tree;
  await act(() => { tree = create(React.createElement(MapPlacesPanel, { ...base, selected: places[0] })); });
  await act(() => tree.update(React.createElement(MapPlacesPanel, { ...base, selected: places[1] })));
  assert.equal(tree.root.findAllByType('avatars').length, 0);
  assert.equal(tree.root.findAllByType('avatar').length, 0);
  assert.doesNotMatch(JSON.stringify(tree.toJSON()), /Cem|example.com\/other/);
  assert.match(JSON.stringify(tree.toJSON()), /Check-in yap/);
  await act(() => tree.unmount());
});
test('member section independently hides identities when permission is false, even if supplied', async () => {
  let tree;
  await act(() => { tree = create(React.createElement(PlaceMembers, { people, canSeeMembers: false, count: 5 })); });
  assert.equal(tree.root.findAllByType('avatar').length, 0);
  assert.doesNotMatch(JSON.stringify(tree.toJSON()), /Cem/);
  await act(() => tree.unmount());
});
test('all authorised members remain horizontally reachable rather than sliced to six', async () => {
  let tree;
  await act(() => { tree = create(React.createElement(PlaceMembers, { people: Array.from({ length: 12 }, (_, i) => ({ id: `${i}`, firstName: `Member${i}` })), canSeeMembers: true, count: 12 })); });
  assert.equal(tree.root.findAllByType('avatar').length, 12);
  await act(() => tree.unmount());
});
test('empty filters offer reset; header press and vertical drag expand/collapse the list', async () => {
  let tree, expanded, reset = false;
  await act(() => { tree = create(React.createElement(MapPlacesPanel, { ...base, places: [],
    onExpand: value => { expanded = value; }, onResetFilter: () => { reset = true; } })); });
  await act(() => press(tree, 'Mekân listesini genişlet'));
  assert.equal(expanded, true);
  const { handlers, config } = tree.root.findByType('gesture').props.gesture;
  handlers.onStart(); handlers.onUpdate({ translationY: 70 });
  handlers.onEnd({ translationY: 70, velocityY: 0 }, true); handlers.onFinalize();
  assert.equal(expanded, false);
  handlers.onStart(); handlers.onUpdate({ translationY: -70 });
  handlers.onEnd({ translationY: -70, velocityY: 0 }, true); handlers.onFinalize();
  assert.equal(expanded, true);
  assert.equal(config.failOffsetX[0], -18, 'horizontal swipes are not sheet drags');
  await act(() => press(tree, 'Tüm mekânları göster'));
  assert.equal(reset, true);
  await act(() => tree.unmount());
});
test('missing/broken venue photos keep a fallback and recover for a different image', async () => {
  let tree;
  await act(() => { tree = create(React.createElement(VenuePhoto, { uri: 'https://example.com/a.jpg', style: {} })); });
  await act(() => tree.root.findByType('image').props.onError());
  assert.equal(tree.root.findAllByType('image').length, 0);
  await act(() => tree.update(React.createElement(VenuePhoto, { uri: 'https://example.com/b.jpg', style: {} })));
  assert.equal(tree.root.findByType('image').props.recyclingKey, 'https://example.com/b.jpg');
  await act(() => tree.unmount());
});
test('panel sizes leave room for controls and tabs on small, large and compatible iPad screens', () => {
  for (const [height, top, bottom] of [[568, 20, 90], [667, 20, 90], [844, 47, 110], [932, 59, 110], [1180, 24, 106]]) {
    const list = mapPanelHeight(height, top, bottom, 'list');
    for (const mode of ['list', 'expanded', 'detail']) {
      const size = mapPanelHeight(height, top, bottom, mode);
      assert.ok(size + top + 110 + bottom <= height);
      assert.ok(size >= list);
    }
  }
});

test('people layouts reserve a visible map area; empty state is compact', () => {
  for (const [height, top, bottom] of [[568, 20, 90], [667, 20, 90], [844, 47, 110], [932, 59, 110]]) {
    for (const mode of ['people', 'peopleEmpty']) {
      const size = mapPanelHeight(height, top, bottom, mode);
      assert.ok(size + top + 124 + bottom + 70 <= height, 'header + panel + tabs retain at least 70px of map');
      assert.ok(size <= 352);
    }
    assert.ok(mapPanelHeight(height, top, bottom, 'peopleEmpty') <= 242);
  }
});

test('an empty "Yakınımda" list offers to suggest a venue instead of blaming a filter', async () => {
  let tree, suggested = false, reset = false;
  await act(() => { tree = create(React.createElement(MapPlacesPanel, { ...base, places: [], emptyReason: 'nearby',
    onSuggest: () => { suggested = true; }, onResetFilter: () => { reset = true; } })); });
  assert.match(JSON.stringify(tree.toJSON()), /Bu bölgede henüz mekân yok/);
  assert.doesNotMatch(JSON.stringify(tree.toJSON()), /Bu filtreye uyan mekân yok/);
  await act(() => press(tree, 'Mekân öner'));
  assert.equal(suggested, true);
  await act(() => press(tree, 'Tüm mekânları göster'));
  assert.equal(reset, true);
  await act(() => tree.update(React.createElement(MapPlacesPanel, { ...base, places: [], emptyReason: 'filter' })));
  assert.match(JSON.stringify(tree.toJSON()), /Bu filtreye uyan mekân yok/);
  await act(() => tree.unmount());
});
