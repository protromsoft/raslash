import { Easing } from 'react-native-reanimated';

export const duration = {
  fast: 160,
  base: 260,
  slow: 420,
  hero: 620,
} as const;

/** iOS-like curves: `out` for entrances, `in` for exits, `inOut` for moves. */
export const easing = {
  out: Easing.bezier(0.22, 1, 0.36, 1),
  in: Easing.bezier(0.64, 0, 0.78, 0),
  inOut: Easing.bezier(0.65, 0, 0.35, 1),
} as const;

export const spring = {
  press: { damping: 18, stiffness: 320, mass: 0.6 },
  gentle: { damping: 20, stiffness: 180, mass: 0.9 },
} as const;

/** Staggered delay for list entrances, capped so long lists stay snappy. */
export function stagger(index: number, step = 55, max = 400) {
  return Math.min(index * step, max);
}
