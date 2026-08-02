import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PressableScale } from '@/components/Motion';
import { haptic } from '@/lib/haptics';
import { colors, shadows } from '@/theme/colors';
import { duration } from '@/theme/motion';
import { radii, spacing, TAB_BAR_HEIGHT } from '@/theme/spacing';

const ICONS: Record<string, { on: keyof typeof Ionicons.glyphMap; off: keyof typeof Ionicons.glyphMap }> = {
  index: { on: 'map', off: 'map-outline' },
  notifications: { on: 'notifications', off: 'notifications-outline' },
  profile: { on: 'person', off: 'person-outline' },
};

/** Gap kept below the pill on devices without a home indicator. */
const MIN_BOTTOM_INSET = 10;

/** Total space the floating bar occupies, for screens that pad their content. */
export function tabBarSpace(bottomInset: number) {
  return TAB_BAR_HEIGHT + Math.max(bottomInset, MIN_BOTTOM_INSET);
}

/**
 * The pill and every item share one transition, so the container's width and
 * the chips inside it move together — animating only the children left the
 * white pill snapping to its new width a frame ahead of them.
 */
const resize = LinearTransition.duration(duration.base);

/** Floating pill tab bar: the active tab expands into a dark label chip. */
export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, MIN_BOTTOM_INSET) }]}
      pointerEvents="box-none"
    >
      <Animated.View layout={resize} style={styles.bar}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const focused = state.index === index;
          const icon = ICONS[route.name] ?? { on: 'ellipse', off: 'ellipse-outline' };
          const label = (options.title ?? route.name) as string;
          const badge = options.tabBarBadge;

          return (
            <PressableScale
              key={route.key}
              accessibilityRole="button"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={label}
              scaleTo={0.92}
              onPress={() => {
                const event = navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                });
                if (event.defaultPrevented || focused) return;
                haptic('select');
                navigation.navigate(route.name);
              }}
              onLongPress={() => {
                navigation.emit({ type: 'tabLongPress', target: route.key });
              }}
              style={styles.itemHit}
            >
              <Animated.View layout={resize} style={[styles.item, focused && styles.itemActive]}>
                <View>
                  <Ionicons
                    name={focused ? icon.on : icon.off}
                    size={21}
                    color={focused ? colors.white : colors.muted}
                  />
                  {badge ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText} numberOfLines={1}>
                        {badge}
                      </Text>
                    </View>
                  ) : null}
                </View>
                {focused ? (
                  <Animated.Text
                    entering={FadeIn.duration(duration.fast)}
                    style={styles.label}
                    numberOfLines={1}
                  >
                    {label}
                  </Animated.Text>
                ) : null}
              </Animated.View>
            </PressableScale>
          );
        })}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: TAB_BAR_HEIGHT,
    paddingHorizontal: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.white,
    ...shadows.lifted,
  },
  itemHit: {
    borderRadius: radii.pill,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 46,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
  },
  itemActive: {
    backgroundColor: colors.ink,
    paddingHorizontal: 18,
  },
  label: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 13.5,
    color: colors.white,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -7,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 9,
    color: colors.white,
  },
});
