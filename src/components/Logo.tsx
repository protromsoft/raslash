import { memo } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors } from '@/theme/colors';

const VIEW_BOX = '0 0 789 287';

/** Artwork ratio of the wordmark canvas (789×287), same as the `logo-*.png` pair. */
export const LOGO_RATIO = 287 / 789;

/**
 * Where the letterforms actually sit inside that canvas, as a fraction of each
 * side. The canvas carries a lot of air — the glyphs are only ~66% of its width
 * and ~36% of its height — so anything laying the mark out next to other content
 * needs these to space against the letters rather than against the empty box.
 */
export const LOGO_INSET = {
  left: 134 / 789,
  right: (789 - 653.5) / 789,
  top: 88 / 287,
  bottom: (287 - 190.4) / 287,
} as const;

/**
 * The wordmark, one entry per letter, in reading order — the source file lists
 * them right to left. Index 2 is the skewed `s`: the slash the brand is named
 * for, and the one glyph worth treating as an accent when animating.
 */
export const LOGO_LETTERS = [
  {
    key: 'r',
    d: 'M134 188.2V165.544V146.216V123.56H164.72V145.96H164.976C166.64 134.056 176.112 121.384 191.728 121.384V147.752C168.304 147.752 164.72 153.128 164.72 164.392V165.544V188.2H134Z',
  },
  {
    key: 'a1',
    d: 'M214.646 190.376C201.206 190.376 193.526 184.232 193.526 173.48C193.526 160.04 205.814 156.328 222.454 152.232C235.51 149.032 239.478 147.624 239.478 144.296C239.478 141.224 237.046 139.816 232.566 139.816C226.55 139.816 222.198 142.888 222.198 147.88H195.83C197.11 131.24 214.902 121 236.278 121C255.478 121 270.07 128.04 270.07 149.544V158.12C270.07 167.592 270.454 171.304 275.318 171.304C275.958 171.304 277.366 171.176 278.006 170.92V186.024C274.294 187.56 267.382 189.096 260.854 189.096C252.918 189.096 243.83 185.64 241.27 176.552C236.79 184.104 228.342 190.376 214.646 190.376ZM223.478 168.872C223.478 171.304 225.398 172.84 228.47 172.84C233.974 172.84 239.862 168.104 239.862 161.448V157.224C238.966 159.144 237.302 160.04 231.414 162.088C225.27 164.264 223.478 166.184 223.478 168.872Z',
  },
  {
    key: 's-slash',
    d: 'M330.07 188.679C306.826 194.907 289.746 191.003 283.907 176.136L312.22 168.549C314.205 173.981 320.275 174.872 325.962 173.348C330.661 172.089 333.107 169.844 332.51 167.618C331.848 165.145 328.212 164.927 314.335 165.067C298.438 165.086 283.292 165.434 279.681 151.958C275.772 137.368 290.963 126.805 309.509 121.835C330.651 116.17 346.224 120.876 352.935 134.052L326.971 141.009C324.97 136.51 320.417 135.344 313.865 137.1C309.166 138.359 307.429 140.282 308.025 142.508C308.721 145.104 311.459 145.431 330.702 145.045C348.116 144.752 357.336 146.522 360.185 157.155C364.326 172.61 349.605 183.445 330.07 188.679Z',
  },
  {
    key: 'l',
    d: 'M365 187.84V165.184V108.864V88H395.72V108.864V165.184V176.857C395.72 179.883 396.625 182.84 398.318 185.349C399.034 186.41 398.274 187.84 396.994 187.84H365Z',
  },
  {
    key: 'a2',
    d: 'M423.646 190.016C410.206 190.016 402.526 183.872 402.526 173.12C402.526 159.68 414.814 155.968 431.454 151.872C444.51 148.672 448.478 147.264 448.478 143.936C448.478 140.864 446.046 139.456 441.566 139.456C435.55 139.456 431.198 142.528 431.198 147.52H404.83C406.11 130.88 423.902 120.64 445.278 120.64C464.478 120.64 479.07 127.68 479.07 149.184V157.76C479.07 167.232 479.454 170.944 484.318 170.944C484.958 170.944 486.366 170.816 487.006 170.56V185.664C483.294 187.2 476.382 188.736 469.854 188.736C461.918 188.736 452.83 185.28 450.27 176.192C445.79 183.744 437.342 190.016 423.646 190.016ZM432.478 168.512C432.478 170.944 434.398 172.48 437.47 172.48C442.974 172.48 448.862 167.744 448.862 161.088V156.864C447.966 158.784 446.302 159.68 440.414 161.728C434.27 163.904 432.478 165.824 432.478 168.512Z',
  },
  {
    key: 's',
    d: 'M530.096 190.4C506.032 190.4 490.544 182.208 488.752 166.336H518.064C518.576 172.096 524.208 174.528 530.096 174.528C534.96 174.528 537.904 172.992 537.904 170.688C537.904 168.128 534.448 166.976 521.008 163.52C505.648 159.424 490.928 155.84 490.928 141.888C490.928 126.784 508.336 120.512 527.536 120.512C549.424 120.512 563.248 129.088 566.32 143.552H539.44C538.672 138.688 534.576 136.384 527.792 136.384C522.928 136.384 520.752 137.792 520.752 140.096C520.752 142.784 523.312 143.808 542 148.416C558.896 152.64 567.344 156.736 567.344 167.744C567.344 183.744 550.32 190.4 530.096 190.4Z',
  },
  {
    key: 'h',
    d: 'M574.5 187.84V165.184V108.864V88H605.22V108.864V139.584C608.932 128.576 618.276 120.64 630.948 120.64C644.26 120.64 653.476 128.448 653.476 148.8V165.184V187.84H622.756V165.184V155.328C622.756 147.648 619.684 144.32 614.692 144.32C609.188 144.32 606.116 148.032 605.22 153.152V165.184V187.84H574.5Z',
  },
] as const;

type LogoProps = {
  /** Width of the artwork canvas; the height follows the 789:287 ratio. */
  width: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

/** The full wordmark. */
export const Logo = memo(function Logo({
  width,
  color = colors.ink,
  style,
  accessibilityLabel = 'raslash',
}: LogoProps) {
  return (
    <Svg
      width={width}
      height={width * LOGO_RATIO}
      viewBox={VIEW_BOX}
      style={style}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
    >
      {LOGO_LETTERS.map((letter) => (
        <Path key={letter.key} d={letter.d} fill={color} />
      ))}
    </Svg>
  );
});

type LogoLetterProps = {
  /** Index into `LOGO_LETTERS`, left to right. */
  index: number;
  width: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * One letter, drawn on the full wordmark canvas rather than cropped to itself.
 * Stack all seven at the same width and you get the mark back exactly — which is
 * what lets each letter be moved by an ordinary `Animated.View` wrapper instead
 * of animating SVG props.
 */
export const LogoLetter = memo(function LogoLetter({
  index,
  width,
  color = colors.ink,
  style,
}: LogoLetterProps) {
  const letter = LOGO_LETTERS[index];
  if (!letter) return null;

  return (
    <Svg
      width={width}
      height={width * LOGO_RATIO}
      viewBox={VIEW_BOX}
      style={style}
      accessible={false}
      pointerEvents="none"
    >
      <Path d={letter.d} fill={color} />
    </Svg>
  );
});
