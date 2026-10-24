// Exercise the actual TSX routing/animation effects, with native-only modules
// mocked. These are component regressions, not a substitute for device tests.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');
const React = require('react');
const { act, create } = require('react-test-renderer');
const startup = require('./startup.ts');

global.IS_REACT_ACT_ENVIRONMENT = true;

function clock() {
  let now = 0;
  let id = 0;
  const tasks = new Map();
  return {
    setTimeout(fn, delay) { tasks.set(++id, { fn, at: now + delay }); return id; },
    clearTimeout(id) { tasks.delete(id); },
    advance(ms) {
      now += ms;
      for (const [id, task] of [...tasks]) {
        if (task.at <= now) { tasks.delete(id); task.fn(); }
      }
    },
    pending: () => tasks.size,
  };
}

function loadComponent(relativePath, mocks, timers = clock()) {
  const filename = path.resolve(__dirname, '../..', relativePath);
  const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(compiled, {
    exports: mod.exports,
    require: (name) => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name === 'react' || name === 'react/jsx-runtime') return require(name);
      throw new Error(`Unmocked native dependency: ${name}`);
    },
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
  }, { filename });
  return mod.exports.default;
}

const returningUser = {
  ready: true, syncing: false, session: { user: { id: 'test-only' } },
  authRequired: true, onboardingComplete: true,
};

function indexHarness(initialState) {
  let state = initialState;
  const timers = clock();
  const shared = [];
  const stages = [];
  const component = loadComponent('app/index.tsx', {
    'expo-router': { Redirect: 'redirect' },
    'expo-status-bar': { StatusBar: 'status-bar' },
    'react-native': { StyleSheet: { create: (v) => v }, useWindowDimensions: () => ({ width: 375 }) },
    'react-native-reanimated': {
      __esModule: true, default: { View: 'animated-view' },
      Easing: { bezier: () => 'easing' }, cancelAnimation: () => {},
      useSharedValue: (initial) => {
        const ref = React.useRef(null);
        if (!ref.current) { ref.current = { value: initial }; shared.push(ref.current); }
        return ref.current;
      },
      useAnimatedStyle: (fn) => fn(), withTiming: (value) => value,
    },
    '@/components/Propeller': { Propeller: 'propeller' },
    '@/context/AppContext': { useApp: () => state },
    '@/theme/motion': { easing: { in: 'easing' } },
    '@/lib/startup': startup,
    '@/lib/sentry': { recordStartupStage: (stage) => stages.push(stage) },
  }, timers);
  return { component, timers, shared, stages, setState: (value) => { state = value; } };
}

test('slow bootstrap keeps the logo visible, then fades before routing', async () => {
  const h = indexHarness({ ...returningUser, ready: false });
  let rendered;
  await act(() => { rendered = create(React.createElement(h.component)); });
  await act(() => h.timers.advance(3000));
  assert.equal(h.shared[1].value, 1, 'slow loading must not fade to a blank screen');
  assert.equal(rendered.root.findAllByType('redirect').length, 0);
  await act(() => {
    h.setState(returningUser);
    rendered.update(React.createElement(h.component));
  });
  assert.equal(h.shared[1].value, 0);
  assert.equal(rendered.root.findAllByType('redirect').length, 0);
  await act(() => h.timers.advance(420));
  assert.equal(rendered.root.findByType('redirect').props.href, '/(tabs)');
  assert.deepEqual(h.stages, ['routing_main']);
  await act(() => rendered.unmount());
  assert.equal(h.timers.pending(), 0);
});

test('profile sync resuming during the fade restores the logo and cancels navigation', async () => {
  const h = indexHarness(returningUser);
  let rendered;
  await act(() => { rendered = create(React.createElement(h.component)); });
  await act(() => h.timers.advance(2200));
  assert.equal(h.shared[1].value, 0);
  await act(() => {
    h.setState({ ...returningUser, syncing: true });
    rendered.update(React.createElement(h.component));
  });
  assert.equal(h.shared[1].value, 1);
  await act(() => h.timers.advance(1000));
  assert.equal(rendered.root.findAllByType('redirect').length, 0);
  await act(() => rendered.unmount());
  assert.equal(h.timers.pending(), 0);
});

test('a failed font load hides the splash and renders the application', async () => {
  let hidden = 0;
  let removed = 0;
  const Stack = Object.assign((props) => React.createElement('stack', null, props.children), { Screen: 'screen' });
  const Root = loadComponent('app/_layout.tsx', {
    '@expo-google-fonts/dm-sans': {}, '@expo-google-fonts/space-grotesk': {},
    'expo-font': { useFonts: () => [false, new Error('font unavailable')] },
    'expo-router': { Stack, router: {} },
    'expo-splash-screen': {
      preventAutoHideAsync: async () => {}, hideAsync: async () => { hidden++; },
    },
    'expo-status-bar': { StatusBar: 'status-bar' },
    'react-native': { AppState: { addEventListener: () => ({ remove: () => { removed++; } }) } },
    'react-native-gesture-handler': { GestureHandlerRootView: 'gesture-root' },
    'react-native-safe-area-context': { SafeAreaProvider: 'safe-area' },
    '@/components/StillHereHost': { StillHereHost: 'still-here' },
    '@/lib/checkInGeofence': {},
    '@/context/AppContext': { AppProvider: 'app-provider', useApp: () => ({ user: null }) },
    '@/context/PlacesContext': {
      PlacesProvider: 'places-provider', usePlaces: () => ({ activeCheckIn: null, openStillHerePrompt: () => {} }),
    },
    '@/lib/pushNotifications': {
      dismissRemovedPresentedNotifications: async () => {}, syncGrantedPushToken: async () => {},
      Notifications: {
        addNotificationReceivedListener: () => ({ remove() {} }),
        addNotificationResponseReceivedListener: () => ({ remove() {} }),
        getLastNotificationResponse: () => null,
      },
    },
    '@/theme/colors': { colors: {} }, '@/lib/startup': startup,
    '@/lib/sentry': { initializeSentry() {}, recordStartupStage() {}, recordMemoryWarning() {}, Sentry: { wrap: (c) => c } },
  });
  let rendered;
  await act(() => { rendered = create(React.createElement(Root)); });
  assert.equal(hidden, 1);
  assert.equal(rendered.root.findAllByType('stack').length, 1);
  await act(() => rendered.unmount());
  assert.equal(removed, 2, 'root memory and notification foreground listeners must be removed');
});
