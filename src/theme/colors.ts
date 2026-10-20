export const colors = {
  // Surfaces
  bg: '#F3F1EE',
  bgSoft: '#EAE7E2',
  surface: '#FFFFFF',
  surfaceAlt: '#F8F7F5',
  white: '#FFFFFF',

  // Ink
  black: '#111110',
  ink: '#111110',
  inkSoft: '#3D3B38',
  text: '#111110',
  // 4.9:1 on white / 4.5:1 on bg: the previous #8C877F failed body-text contrast.
  muted: '#6F6A63',
  mutedSoft: '#B4AFA6',
  line: 'rgba(17,17,16,0.08)',
  lineStrong: 'rgba(17,17,16,0.16)',
  track: '#E3DFD9',

  // Night surfaces (hero / photo screens)
  night: '#0C0B0A',
  nightSoft: '#1A1816',
  cardDark: '#1A1816',

  // Signals
  // "Live right now". Dark enough for white text on it and for green text on white.
  green: '#2F7F51',
  greenSoft: 'rgba(47, 127, 81, 0.14)',
  amber: '#D08A3C',
  amberSoft: 'rgba(208, 138, 60, 0.16)',
  danger: '#B4462F',

  // Effects
  shadow: 'rgba(30, 24, 16, 0.16)',
  overlay: 'rgba(12, 11, 10, 0.55)',
  scrim: 'rgba(12, 11, 10, 0.42)',

  // Glass
  glass: 'rgba(255, 255, 255, 0.62)',
  glassStrong: 'rgba(255, 255, 255, 0.80)',
  glassDark: 'rgba(16, 15, 14, 0.52)',
  glassBorder: 'rgba(255, 255, 255, 0.70)',
  glassBorderDark: 'rgba(255, 255, 255, 0.16)',
  glassTint: 'rgba(255, 255, 255, 0.30)',
} as const;

export const glass = {
  intensity: 30,
  intensityStrong: 50,
  intensityDark: 28,
} as const;

export const shadows = {
  card: {
    shadowColor: '#2A1F14',
    shadowOpacity: 0.1,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  soft: {
    shadowColor: '#2A1F14',
    shadowOpacity: 0.07,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  lifted: {
    shadowColor: '#2A1F14',
    shadowOpacity: 0.18,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 16 },
    elevation: 12,
  },
} as const;
