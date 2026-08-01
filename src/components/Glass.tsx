import { BlurView } from 'expo-blur';
import type { ReactNode } from 'react';
import {
  Platform,
  StyleSheet,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { PressableScale } from '@/components/Motion';
import { colors, glass, shadows } from '@/theme/colors';
import { radii } from '@/theme/spacing';

export { ScreenAtmosphere } from '@/components/Screen';

type GlassProps = {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  intensity?: number;
  tint?: 'light' | 'dark' | 'default';
  radius?: number;
};

function Layers({
  children,
  contentStyle,
  intensity,
  tint,
  radius,
}: Required<Pick<GlassProps, 'intensity' | 'tint' | 'radius'>> &
  Pick<GlassProps, 'children' | 'contentStyle'>) {
  const borderColor = tint === 'dark' ? colors.glassBorderDark : colors.glassBorder;
  const fallback =
    tint === 'dark'
      ? colors.glassDark
      : Platform.OS === 'android'
        ? colors.glassStrong
        : colors.glass;

  return (
    <View style={[styles.clip, { borderRadius: radius, borderColor }]}>
      <BlurView
        intensity={intensity}
        tint={tint}
        style={StyleSheet.absoluteFill}
        experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
      />
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: fallback, borderRadius: radius }]}
      />
      <View style={[styles.content, contentStyle]}>{children}</View>
    </View>
  );
}

export function GlassView({
  children,
  style,
  contentStyle,
  intensity = glass.intensity,
  tint = 'light',
  radius = radii.lg,
}: GlassProps) {
  return (
    <View style={[styles.shadow, { borderRadius: radius }, style]}>
      <Layers intensity={intensity} tint={tint} radius={radius} contentStyle={contentStyle}>
        {children}
      </Layers>
    </View>
  );
}

export function GlassPressable({
  children,
  style,
  contentStyle,
  intensity = glass.intensity,
  tint = 'light',
  radius = radii.lg,
  ...pressableProps
}: GlassProps & PressableProps) {
  return (
    <PressableScale
      {...pressableProps}
      scaleTo={0.98}
      style={[styles.shadow, { borderRadius: radius }, style as ViewStyle]}
    >
      <Layers intensity={intensity} tint={tint} radius={radius} contentStyle={contentStyle}>
        {children}
      </Layers>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  // Shadow lives on the outer wrapper; clipping happens one level down so the
  // shadow never gets cut into a hard rectangle.
  shadow: {
    backgroundColor: 'transparent',
    ...shadows.soft,
  },
  clip: {
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  content: {
    zIndex: 1,
  },
});
