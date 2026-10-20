import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useReducedMotion } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { PressableScale } from './Motion';
import { colors, shadows } from '@/theme/colors';
import { discoverySwipe } from '@/lib/discoveryGestures';
import { haptic } from '@/lib/haptics';

export type DiscoveryMode = 'places' | 'people';
/** Floating map chrome has fixed heights: larger Dynamic Type grows its text only this far. */
const MAP_TEXT_SCALE = 1.3;
export function DiscoveryHeader({ top, city, mode, live = 0, demo, switching = false, onCity, onSearch, onMode }: {
  top: number; city: string; mode: DiscoveryMode;
  /** People active right now; shown in the "live" colour only when above zero. */
  live?: number; demo: boolean;
  /** True while the parent is still swapping map markers for the previous mode change. */
  switching?: boolean;
  onCity: () => void; onSearch: () => void; onMode: (mode: DiscoveryMode) => void;
}) {
  const reducedMotion = useReducedMotion();
  const [segmentWidth, setSegmentWidth] = useState(0);
  // The pill is drawn from React state (the real mode, or the one just requested),
  // never from a UI-thread value a stale gesture or a lost write could leave behind.
  const [requested, setRequested] = useState<DiscoveryMode | null>(null);
  const shown = requested ?? mode;
  // Gesture handlers can outlive a render while JS is busy. They must read the
  // live mode, never the one captured when the gesture object was created.
  const modeRef = useRef(mode);
  const pendingRef = useRef<DiscoveryMode | null>(null);
  const switchingRef = useRef(switching);
  const unlockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const release = useCallback(() => {
    pendingRef.current = null; setRequested(null);
    if (unlockTimer.current) { clearTimeout(unlockTimer.current); unlockTimer.current = null; }
  }, []);
  useEffect(() => {
    modeRef.current = mode;
    if (pendingRef.current === mode) release();
  }, [mode, release]);
  useEffect(() => { switchingRef.current = switching; }, [switching]);
  useEffect(() => () => { if (unlockTimer.current) clearTimeout(unlockTimer.current); }, []);
  const select = useCallback((next: DiscoveryMode) => {
    // Mid-switch, or the mode is already active/requested: ignore the input.
    if (switchingRef.current || pendingRef.current !== null || next === modeRef.current) return;
    pendingRef.current = next; setRequested(next);
    // Safety net: if the parent never adopts the request, fall back to the real mode.
    unlockTimer.current = setTimeout(release, 2000);
    haptic('select');
    onMode(next);
  }, [onMode, release]);
  const swipe = useMemo(() => Gesture.Pan().maxPointers(1).activeOffsetX([-14, 14]).failOffsetY([-12, 12])
    .onEnd((event, success) => {
      if (!success) return;
      const next = discoverySwipe(event.translationX, event.velocityX);
      if (next) scheduleOnRN(select, next);
    }), [select]);
  const half = Math.max(0, (segmentWidth - 6) / 2);
  const indicator = {
    width: half, opacity: segmentWidth > 0 ? 1 : 0,
    transform: [{ translateX: shown === 'people' ? half : 0 }],
    transitionProperty: 'transform' as const, transitionDuration: reducedMotion ? '0ms' : '240ms',
    transitionTimingFunction: 'ease-out' as const,
  };
  return <View style={[styles.root, { top: top + 6 }]} pointerEvents="box-none">
    <View style={styles.row}>
      <PressableScale onPress={onCity} style={styles.city} accessibilityRole="button"
        accessibilityLabel={`Şehir seç: ${city}${demo ? ', örnek profiller' : live > 0 ? `, ${live} kişi aktif` : ''}`}>
        <Text maxFontSizeMultiplier={MAP_TEXT_SCALE} style={styles.title} numberOfLines={1}>{city}</Text>
        <Ionicons name="chevron-down" size={15} color={colors.ink} />
        {demo ? <View style={styles.demoTag}><Text maxFontSizeMultiplier={MAP_TEXT_SCALE} style={styles.demoText} numberOfLines={1}>Örnek profiller</Text></View>
          : live > 0 ? <Text maxFontSizeMultiplier={MAP_TEXT_SCALE} style={styles.live} numberOfLines={1}>{`● ${live} aktif`}</Text> : null}
      </PressableScale>
      {mode === 'places' ? <PressableScale onPress={onSearch} style={styles.circle} accessibilityRole="button" accessibilityLabel="Mekân ara">
        <Ionicons name="search-outline" size={21} color={colors.ink} />
      </PressableScale> : null}
    </View>
    <GestureDetector gesture={swipe} touchAction="pan-y"><View collapsable={false} style={styles.segment} accessibilityRole="tablist"
      onLayout={(event) => setSegmentWidth(event.nativeEvent.layout.width)}>
      <Animated.View pointerEvents="none" testID="discovery-pill" style={[styles.indicator, indicator]} />
      {(['places', 'people'] as const).map((value) => <PressableScale key={value} onPress={() => select(value)}
        accessibilityRole="tab" accessibilityState={{ selected: shown === value }}
        accessibilityLabel={value === 'places' ? 'Mekânlar' : 'Kişiler'}
        style={styles.tab}>
        <Text maxFontSizeMultiplier={MAP_TEXT_SCALE} numberOfLines={1} style={[styles.tabText, shown === value && styles.tabTextActive]}>{value === 'places' ? 'Mekânlar' : 'Kişiler'}</Text>
      </PressableScale>)}
    </View></GestureDetector>
  </View>;
}
const styles = StyleSheet.create({
  // One floating card holds both rows; the controls inside sit on soft fills
  // instead of each carrying its own shadow.
  root: { position: 'absolute', left: 12, right: 12, gap: 6, padding: 6, borderRadius: 30,
    backgroundColor: colors.white, ...shadows.soft },
  row: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  city: { flex: 1, minWidth: 0, minHeight: 44, paddingHorizontal: 12,
    flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 22 },
  title: { flexShrink: 1, fontFamily: 'DMSans_700Bold', fontSize: 17, color: colors.ink },
  live: { flexShrink: 1, marginLeft: 6, fontFamily: 'DMSans_700Bold', fontSize: 13, color: colors.green },
  demoTag: { marginLeft: 6, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: '#EEE8FD' },
  demoText: { fontFamily: 'DMSans_700Bold', fontSize: 12, color: '#715399' },
  circle: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  segment: { flexDirection: 'row', padding: 3, borderRadius: 22, backgroundColor: colors.bg },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 38, borderRadius: 19, paddingHorizontal: 6 },
  indicator: { position: 'absolute', left: 3, top: 3, bottom: 3, borderRadius: 19, backgroundColor: colors.ink },
  tabText: { fontFamily: 'DMSans_700Bold', fontSize: 14, color: colors.muted },
  tabTextActive: { color: colors.white },
});
