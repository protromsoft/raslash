import type { TextStyle } from 'react-native';
import { colors } from '@/theme/colors';

export const fonts = {
  display: 'SpaceGrotesk_700Bold',
  displayMedium: 'SpaceGrotesk_500Medium',
  body: 'DMSans_400Regular',
  bodyMedium: 'DMSans_500Medium',
  bodyBold: 'DMSans_700Bold',
} as const;

export const type = {
  hero: {
    fontFamily: fonts.display,
    fontSize: 40,
    lineHeight: 44,
    letterSpacing: -1.2,
    color: colors.ink,
  },
  h1: {
    fontFamily: fonts.display,
    fontSize: 32,
    lineHeight: 37,
    letterSpacing: -0.9,
    color: colors.ink,
  },
  h2: {
    fontFamily: fonts.display,
    fontSize: 24,
    lineHeight: 29,
    letterSpacing: -0.5,
    color: colors.ink,
  },
  h3: {
    fontFamily: fonts.display,
    fontSize: 19,
    lineHeight: 24,
    letterSpacing: -0.3,
    color: colors.ink,
  },
  bodyLg: {
    fontFamily: fonts.body,
    fontSize: 17,
    lineHeight: 25,
    color: colors.inkSoft,
  },
  body: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22,
    color: colors.inkSoft,
  },
  bodyStrong: {
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    lineHeight: 22,
    color: colors.ink,
  },
  label: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
  },
  caption: {
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 16,
    color: colors.muted,
  },
  overline: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  button: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    letterSpacing: -0.1,
  },
} satisfies Record<string, TextStyle>;
