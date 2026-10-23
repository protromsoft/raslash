const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');
const React = require('react');
const { act, create } = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;
const { colors, shadows } = require('../theme/colors.ts');
const spacing = require('../theme/spacing.ts');
const rn = { View: 'view', Text: 'text', TextInput: 'input', Pressable: 'pressable', ActivityIndicator: 'spinner',
  StyleSheet: { create: value => value, absoluteFill: {} } };
const animated = { __esModule: true, default: { createAnimatedComponent: () => 'pressable', View: 'animated-view' },
  useSharedValue: value => React.useRef({ value }).current, useAnimatedStyle: cb => cb(), useReducedMotion: () => false,
  withSpring: value => value, withTiming: value => value };
const shared = { 'react-native': rn, 'react-native-reanimated': animated,
  '@expo/vector-icons': { Ionicons: 'icon' }, '@/theme/colors': { colors, shadows }, '@/theme/spacing': spacing,
  '@/theme/typography': { type: { button: { fontSize: 18 } } }, '@/theme/motion': { spring: { press: {} } },
  '@/components/Avatar': {}, 'expo-router': { router: { back() {}, replace() {} }, useLocalSearchParams: () => ({ placeId: 'p' }) },
  '@/lib/navigation': { goBackOrHome() {} } };
function load(file, mocks = {}) {
  const filename = path.resolve(__dirname, '../..', file);
  const code = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(code, { exports: mod.exports, require: name => Object.hasOwn(mocks, name) ? mocks[name]
    : Object.hasOwn(shared, name) ? shared[name] : ['react', 'react/jsx-runtime'].includes(name) ? require(name)
    : (() => { throw new Error(`Unmocked ${name}`); })() }, { filename });
  return mod.exports;
}
const motion = load('src/components/Motion.tsx');
shared['@/components/Motion'] = motion;
const { Button } = load('src/components/ui.tsx');
const { ChatComposer } = load('src/components/ChatComposer.tsx');
const styleOf = node => Object.assign({}, ...[node.props.style].flat(Infinity).filter(Boolean));

test('disabled primary uses an explicit readable surface, not whole-control opacity; busy stays visible', async () => {
  let tree;
  await act(() => { tree = create(React.createElement(Button, { label: 'Devam', disabled: true })); });
  let button = tree.root.findByType('pressable');
  assert.equal(styleOf(button).opacity, 1);
  assert.equal(styleOf(button).backgroundColor, colors.bgSoft);
  assert.equal(button.props.accessibilityState.disabled, true);
  await act(() => tree.update(React.createElement(Button, { label: 'Devam', disabled: true, loading: true })));
  button = tree.root.findByType('pressable');
  assert.equal(styleOf(button).backgroundColor, colors.ink);
  assert.equal(styleOf(button).opacity, 1);
  assert.equal(button.props.accessibilityState.busy, true);
  assert.equal(tree.root.findByType('spinner').props.color, colors.white);
  await act(() => tree.unmount());
});

test('long composer grows to a bounded scrollable height, retains the draft and shrinks after clearing', async () => {
  let tree, changed;
  const draft = 'Uzun mesaj satırı\n'.repeat(25);
  const props = { value: draft, onChangeText: value => { changed = value; }, onSend() {}, placeholder: 'Mesaj' };
  await act(() => { tree = create(React.createElement(ChatComposer, props)); });
  let input = tree.root.findByType('input');
  await act(() => input.props.onContentSizeChange({ nativeEvent: { contentSize: { height: 400 } } }));
  input = tree.root.findByType('input');
  assert.equal(styleOf(input).height, 120);
  assert.equal(input.props.scrollEnabled, true);
  assert.equal(input.props.maxLength, 500);
  assert.equal(input.props.value, draft);
  await act(() => input.props.onChangeText(draft + 'son'));
  assert.equal(changed, draft + 'son');
  await act(() => input.props.onContentSizeChange({ nativeEvent: { contentSize: { height: NaN } } }));
  assert.equal(styleOf(tree.root.findByType('input')).height, 120);
  await act(() => tree.update(React.createElement(ChatComposer, { ...props, value: '' })));
  assert.equal(styleOf(tree.root.findByType('input')).height, 46);
  assert.equal(tree.root.findByType('pressable').props.disabled, true);
  await act(() => tree.unmount());
});

test('busy or whitespace-only composer cannot send and does not hide the progress indicator', async () => {
  let tree;
  await act(() => { tree = create(React.createElement(ChatComposer, { value: ' ', onChangeText() {}, onSend() {}, placeholder: 'Mesaj' })); });
  assert.equal(tree.root.findByType('pressable').props.disabled, true);
  assert.equal(styleOf(tree.root.findByType('pressable')).opacity, 1);
  await act(() => tree.update(React.createElement(ChatComposer, { value: 'Selam', sending: true, onChangeText() {}, onSend() {}, placeholder: 'Mesaj' })));
  // The input stays editable while sending, so iOS keeps the keyboard open.
  assert.notEqual(tree.root.findByType('input').props.editable, false);
  assert.equal(tree.root.findByType('pressable').props.accessibilityState.busy, true);
  assert.equal(styleOf(tree.root.findByType('pressable')).backgroundColor, colors.ink);
  assert.equal(tree.root.findAllByType('spinner').length, 1);
  await act(() => tree.unmount());
});

test('venue suggestion pins its actions outside the form and prevents rapid duplicate submissions', async () => {
  let tree, complete;
  const calls = [];
  const pending = new Promise(resolve => { complete = resolve; });
  const { default: AddPlace } = load('app/add-place.tsx', {
    '@/components/Screen': { Screen: props => React.createElement('screen', {}, React.createElement('content', {}, props.children), React.createElement('footer', {}, props.footer)), HeaderBar: 'header' },
    '@/components/Motion': { Appear: 'view' },
    '@/components/ui': { Button: 'button', Field: 'field', Card: 'view', Chip: 'chip', ScreenTitle: 'title', TextButton: 'button' },
    '@/context/PlacesContext': { usePlaces: () => ({ submitPlace: input => { calls.push(input); return pending; } }) },
    '@/components/LocationPicker': { LocationPicker: 'picker' },
    'expo-location': { getForegroundPermissionsAsync: async () => ({ status: 'denied' }) },
    '@/lib/presence': { haversineKm: (a, b) => Math.hypot(a.latitude - b.latitude, a.longitude - b.longitude) * 111 },
    '@/lib/placeLabel': { districtForPlace: () => 'Galata' },
    '@/lib/placeScanGrid': load('src/lib/placeScanGrid.ts'),
  });
  await act(() => { tree = create(React.createElement(AddPlace)); });
  await act(() => tree.root.findAllByType('field')[0].props.onChangeText('Test Kafe'));
  const button = () => tree.root.findByType('footer').findAllByType('button')[0];
  assert.equal(button().props.disabled, true, 'a suggestion needs a location from the map');
  await act(() => tree.root.findByType('picker').props.onPick({ latitude: 41.0256, longitude: 28.9741 }));
  await act(() => { button().props.onPress(); button().props.onPress(); });
  assert.equal(calls.length, 1);
  assert.deepEqual([calls[0].city, calls[0].latitude, calls[0].longitude], ['İstanbul', 41.0256, 28.9741]);
  await act(() => complete());
  assert.equal(tree.root.findByType('title').props.title, 'Onaya gönderildi');
  await act(() => tree.unmount());
});
