const React = require('react');

// Native/UI-thread adapters only. Tests execute the application's real gesture
// callbacks; this intentionally does not pretend to test spring frame timing.
exports.motionMocks = function motionMocks() {
  const springs = [];
  function Pan() {
    const gesture = { config: {}, handlers: {} };
    for (const name of ['enabled', 'maxPointers', 'activeOffsetY', 'failOffsetX', 'activeOffsetX', 'failOffsetY']) {
      gesture[name] = value => { gesture.config[name] = value; return gesture; };
    }
    for (const name of ['onStart', 'onUpdate', 'onEnd', 'onFinalize']) {
      gesture[name] = callback => { gesture.handlers[name] = callback; return gesture; };
    }
    return gesture;
  }
  const fade = { duration() { return this; }, reduceMotion() { return this; } };
  return { springs, modules: {
    'react-native-gesture-handler': { Gesture: { Pan }, GestureDetector: 'gesture' },
    'react-native-reanimated': {
      __esModule: true, default: { View: 'animated-view', Text: 'animated-text' }, FadeIn: fade, ReduceMotion: { System: 'system' },
      useSharedValue: initial => React.useRef({ value: initial }).current,
      useAnimatedStyle: callback => callback(),
      // Runs the reaction synchronously after each render, like a UI-thread frame would.
      useAnimatedReaction: (prepare, react) => {
        const last = React.useRef(null);
        React.useEffect(() => { const next = prepare(); if (next !== last.current) { react(next, last.current); last.current = next; } });
      }, cancelAnimation() {}, useReducedMotion: () => false,
      interpolateColor: (value, _, colors) => colors[value < 0.5 ? 0 : 1],
      withSpring: (value, config) => { springs.push({ value, config }); return value; },
    },
    'react-native-worklets': { scheduleOnRN: (fn, ...args) => fn(...args) },
    '@/lib/haptics': { haptic() {} },
    '@/theme/motion': { spring: { sheet: { damping: 30, stiffness: 280, mass: 0.85, overshootClamping: true } } },
    '@/lib/discoveryGestures': require('../discoveryGestures.ts'),
  } };
};
