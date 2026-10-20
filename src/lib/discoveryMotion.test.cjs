const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');
const React = require('react');
const { act, create } = require('react-test-renderer');
const { motionMocks } = require('./testSupport/motion.cjs');
global.IS_REACT_ACT_ENVIRONMENT = true;
function load(file, mocks) {
  const filename = path.resolve(__dirname, '../..', file);
  const code = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(code, { exports: mod.exports, setTimeout, clearTimeout, require: name => name in mocks ? mocks[name] : require(name) }, { filename });
  return mod.exports;
}
function sheetHarness() {
  const motion = motionMocks();
  const { MapSheet, MapSheetHandle } = load('src/components/MapSheet.tsx', { ...motion.modules, 'react-native': {} });
  const position = { value: 250 }, commits = [];
  const props = { height: 250, minimum: 250, maximum: 550, position, onSnap: value => commits.push(value),
    children: ({ pan }) => React.createElement(MapSheetHandle, { pan }, React.createElement('header')) };
  return { MapSheet, position, commits, props, motion };
}
test('sheet follows the finger, clamps its bounds, and only commits a completed gesture', async () => {
  const h = sheetHarness(); let tree;
  await act(() => { tree = create(React.createElement(h.MapSheet, h.props)); });
  let pan = tree.root.findByType('gesture').props.gesture;
  pan.handlers.onStart(); pan.handlers.onUpdate({ translationY: -80 });
  assert.equal(h.position.value, 330); assert.equal(h.commits.length, 0);
  pan.handlers.onUpdate({ translationY: -1000 }); assert.equal(h.position.value, 550);
  pan.handlers.onEnd({ translationY: -1000, velocityY: 0 }, true); pan.handlers.onFinalize();
  assert.deepEqual(h.commits, [true]); assert.equal(h.position.value, 550);
  await act(() => tree.update(React.createElement(h.MapSheet, { ...h.props, height: 550 })));
  pan = tree.root.findByType('gesture').props.gesture;
  pan.handlers.onStart(); pan.handlers.onUpdate({ translationY: 30 });
  pan.handlers.onEnd({ translationY: 30, velocityY: 0 }, false); pan.handlers.onFinalize();
  assert.equal(h.position.value, 550); assert.deepEqual(h.commits, [true], 'cancel must not collapse/navigate');
  pan.handlers.onStart(); pan.handlers.onUpdate({ translationY: 1000 }); assert.equal(h.position.value, 250);
  pan.handlers.onEnd({ translationY: 1000, velocityY: 0 }, true); pan.handlers.onFinalize();
  assert.deepEqual(h.commits, [true, false]);
  await act(() => tree.unmount());
});
test('small drags stay put; velocity, size changes and reduced-motion configuration are handled', async () => {
  const h = sheetHarness(); let tree;
  await act(() => { tree = create(React.createElement(h.MapSheet, h.props)); });
  const oldPan = tree.root.findByType('gesture').props.gesture;
  oldPan.handlers.onStart(); oldPan.handlers.onUpdate({ translationY: -16 });
  oldPan.handlers.onEnd({ translationY: -16, velocityY: 0 }, true); oldPan.handlers.onFinalize();
  assert.equal(h.position.value, 250);
  oldPan.handlers.onStart(); oldPan.handlers.onUpdate({ translationY: -16 });
  oldPan.handlers.onEnd({ translationY: -16, velocityY: -700 }, true); oldPan.handlers.onFinalize();
  assert.equal(h.position.value, 550);
  oldPan.handlers.onStart(); oldPan.handlers.onUpdate({ translationY: -50 });
  const before = h.commits.length;
  await act(() => tree.update(React.createElement(h.MapSheet, { ...h.props, height: 190, minimum: 112, maximum: 290 })));
  oldPan.handlers.onEnd({ translationY: -50, velocityY: -700 }, true); oldPan.handlers.onFinalize();
  assert.equal(h.position.value, 190); assert.equal(h.commits.length, before, 'stale drag cannot commit old bounds');
  assert.ok(h.motion.springs.every(s => s.config.reduceMotion === 'system' && s.config.overshootClamping));
  await act(() => tree.unmount());
});
test('a new map panel settles the shared height left by the previous mode on its first frame', async () => {
  const h = sheetHarness(); let tree;
  h.position.value = 550; // Expanded venue sheet, then switch to an empty people panel.
  await act(() => { tree = create(React.createElement(h.MapSheet, { ...h.props, height: 190, minimum: 112, maximum: 290 })); });
  assert.equal(h.position.value, 190, 'the new panel must not wait for data, another tap or a drag to resize');
  assert.equal(h.commits.length, 0, 'resizing does not navigate or change the selected mode');
  await act(() => tree.unmount());
});
function headerHarness() {
  const motion = motionMocks(), modes = [];
  const { DiscoveryHeader } = load('src/components/DiscoveryHeader.tsx', {
    ...motion.modules, 'react-native': { View: 'view', Text: 'text', StyleSheet: { create: s => s } },
    '@expo/vector-icons': { Ionicons: 'icon' }, './Motion': { PressableScale: 'button' },
    '@/theme/colors': { colors: {}, shadows: {} },
  });
  const props = { top: 20, city: 'Ankara', mode: 'places', onMode: value => modes.push(value) };
  let tree;
  const render = async (extra = {}) => act(() => { if (tree) tree.update(React.createElement(DiscoveryHeader, { ...props, ...extra }));
    else tree = create(React.createElement(DiscoveryHeader, { ...props, ...extra })); });
  const layout = async () => act(() => tree.root.findByProps({ accessibilityRole: 'tablist' }).props.onLayout({ nativeEvent: { layout: { width: 208 } } }));
  // Where the selector is drawn: 'people' when translated to the second half.
  const pill = () => {
    const style = Object.assign({}, ...[tree.root.findByProps({ testID: 'discovery-pill' }).props.style].flat());
    return style.transform[0].translateX > 0 ? 'people' : 'places';
  };
  const selected = () => tree.root.findAll((n) => n.props.accessibilityRole === 'tab' && n.props.accessibilityState?.selected)
    .map((n) => n.props.accessibilityLabel);
  const gesture = () => tree.root.findByType('gesture').props.gesture;
  const swipe = (pan, dx, velocityX = 0, success = true) => act(() => pan.handlers.onEnd({ translationX: dx, velocityX }, success));
  return { modes, render, layout, pill, selected, gesture, swipe, unmount: () => act(() => tree.unmount()) };
}
test('header swipes change mode once, while short and cancelled swipes do nothing', async () => {
  const h = headerHarness();
  await h.render(); await h.layout();
  let pan = h.gesture();
  await h.swipe(pan, -10); assert.deepEqual(h.modes, []);
  await h.swipe(pan, -100, 0, false); assert.deepEqual(h.modes, []);
  await h.swipe(pan, -60); assert.deepEqual(h.modes, ['people']);
  assert.equal(h.pill(), 'people', 'pill moves to the requested tab immediately');
  await h.render({ mode: 'people' });
  pan = h.gesture();
  await h.swipe(pan, -60); assert.equal(h.modes.length, 1);
  await h.swipe(pan, 10, 650); assert.deepEqual(h.modes, ['people', 'places']);
  await h.unmount();
});
test('a stale gesture handler cannot leave the selector on a different tab than the real mode', async () => {
  const h = headerHarness();
  await h.render(); await h.layout();
  const stalePan = h.gesture(); // created while mode === 'places'
  await h.swipe(stalePan, -60); assert.deepEqual(h.modes, ['people']);
  // JS is busy: a second swipe arrives before the parent re-rendered. It is ignored and
  // the selector stays on the mode the panel is switching to.
  await h.swipe(stalePan, 60); assert.deepEqual(h.modes, ['people']); assert.equal(h.pill(), 'people');
  // Parent adopts 'people' but is still swapping markers: input stays locked.
  await h.render({ mode: 'people', switching: true });
  await h.swipe(stalePan, 60); assert.deepEqual(h.modes, ['people']); assert.equal(h.pill(), 'people');
  await h.render({ mode: 'people' });
  // The original bug: the old handler's closure still says 'places', so swiping back to
  // places used to be a no-op while the pill moved. It must now really switch.
  await h.swipe(stalePan, 60); assert.deepEqual(h.modes, ['people', 'places']); assert.equal(h.pill(), 'places');
  await h.render({ mode: 'places' });
  // Swiping towards the already-active mode is a no-op that keeps the pill in place.
  await h.swipe(stalePan, 60); assert.deepEqual(h.modes, ['people', 'places']); assert.equal(h.pill(), 'places');
  // Ten rapid alternating swipes: the drawn pill and the selected tab always match the mode.
  let mode = 'places';
  for (let i = 0; i < 10; i++) {
    await h.swipe(stalePan, mode === 'places' ? -60 : 60);
    await h.swipe(stalePan, mode === 'places' ? 60 : -60); // racing second swipe, ignored
    mode = h.modes.at(-1);
    assert.equal(h.pill(), mode);
    await h.render({ mode, subtitle: `render ${i}` }); // unrelated re-renders keep the pill
    assert.equal(h.pill(), mode);
    assert.deepEqual(h.selected(), [mode === 'people' ? 'Kişiler' : 'Mekânlar']);
  }
  assert.equal(h.modes.length, 12);
  await h.unmount();
});
test('if the parent never adopts a request, the selector falls back to the real mode', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = headerHarness();
  await h.render(); await h.layout();
  await h.swipe(h.gesture(), -60); assert.equal(h.pill(), 'people');
  await act(() => t.mock.timers.tick(2000));
  assert.equal(h.pill(), 'places');
  await h.unmount();
});
