import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PressableScale } from '@/components/Motion';
import { ModalGrabber, sheetTopPad } from '@/components/ModalGrabber';
import { EmptyState } from '@/components/ui';
import { usePlaces } from '@/context/PlacesContext';
import type { PlaceWithStats } from '@/data/types';
import { hasValidCoordinates } from '@/lib/placeData';
import { districtForPlace } from '@/lib/placeLabel';
import { haversineKm } from '@/lib/presence';
import { colors } from '@/theme/colors';
import { duration, stagger } from '@/theme/motion';
import { radii, spacing } from '@/theme/spacing';

type Coords = { latitude: number; longitude: number };

/** Turkish-aware, accent-insensitive folding so "cafe" matches "Café". */
function fold(value: string) {
  return value
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function formatDistance(km: number) {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

const ResultRow = memo(function ResultRow({
  place,
  label,
  distanceKm,
  index,
  staggered,
  onPress,
}: {
  place: PlaceWithStats;
  label: string;
  distanceKm: number | null;
  index: number;
  /** Rows only cascade in on the resting list; typing re-mounts them constantly. */
  staggered: boolean;
  onPress: (place: PlaceWithStats) => void;
}) {
  const [failedPhoto, setFailedPhoto] = useState<string>();
  const district = districtForPlace(place);
  const area = district || place.city;
  const handlePress = useCallback(() => onPress(place), [onPress, place]);

  return (
    <Animated.View
      entering={
        staggered
          ? FadeInDown.delay(stagger(index, 28, 220)).duration(duration.base)
          : FadeIn.duration(duration.fast)
      }
    >
      <PressableScale
        onPress={handlePress}
        scaleTo={0.98}
        style={styles.row}
        accessibilityRole="button"
        accessibilityLabel={place.checkedInCount > 0 ? `${label}, ${place.checkedInCount} kişi şu an burada` : label}
      >
        <View style={styles.thumb}>
          {place.imageUrl && failedPhoto !== place.imageUrl ? (
            <Image
              source={{ uri: place.imageUrl }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={220}
              recyclingKey={place.imageUrl}
              onError={() => setFailedPhoto(place.imageUrl)}
            />
          ) : (
            <Ionicons name="cafe-outline" size={20} color={colors.muted} />
          )}
          {place.checkedInCount > 0 ? (
            <View style={styles.thumbBadge}>
              <Text style={styles.thumbBadgeText} maxFontSizeMultiplier={1.2}>{place.checkedInCount}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.rowBody}>
          <Text style={styles.name} numberOfLines={1}>
            {label}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {place.category} · {area}
            {distanceKm != null ? ` · ${formatDistance(distanceKm)}` : ''}
          </Text>
        </View>
      </PressableScale>
    </Animated.View>
  );
});

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const { places, labelFor } = usePlaces();
  const [query, setQuery] = useState('');
  const [coords, setCoords] = useState<Coords | null>(null);

  // Last known position is instant and never prompts, which keeps search snappy.
  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted' || !mounted) return;
        const pos = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000 });
        if (!pos || !mounted || !hasValidCoordinates(pos.coords)) return;
        setCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      } catch (error) {
        // Search works without distance sorting. Some Android devices throw
        // here while location services are disabled even though permission is
        // still recorded as granted.
        console.warn('search location lookup failed', error);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const distanceTo = useCallback(
    (place: PlaceWithStats) =>
      coords
        ? haversineKm(coords, { latitude: place.latitude, longitude: place.longitude })
        : null,
    [coords],
  );

  const trimmed = query.trim();

  const results = useMemo(() => {
    if (!trimmed) {
      const list = [...places];
      if (coords) {
        return list.sort((a, b) => (distanceTo(a) ?? 0) - (distanceTo(b) ?? 0)).slice(0, 20);
      }
      return list.sort((a, b) => b.overall - a.overall).slice(0, 20);
    }

    const needle = fold(trimmed);
    return places
      .map((place) => {
        const name = fold(place.name);
        const label = fold(labelFor(place));
        const district = fold(districtForPlace(place));
        const haystack = `${name} ${label} ${district} ${fold(place.category)} ${fold(place.city)}`;
        if (!haystack.includes(needle)) return null;
        // Name matches rank above category/city matches, prefixes above the rest.
        const score =
          name.startsWith(needle) || label.startsWith(needle)
            ? 0
            : name.includes(needle) || label.includes(needle)
              ? 1
              : 2;
        return { place, score };
      })
      .filter((hit): hit is { place: PlaceWithStats; score: number } => hit != null)
      .sort((a, b) => a.score - b.score || b.place.overall - a.place.overall)
      .slice(0, 40)
      .map((hit) => hit.place);
  }, [places, trimmed, coords, distanceTo, labelFor]);

  const heading = trimmed
    ? `${results.length} sonuç`
    : coords
      ? 'Sana en yakın'
      // Unrated places all score 0: only promise "top rated" when the list leads with a rated one.
      : results[0]?.reviewCount ? 'En yüksek puanlı' : 'Keşfedilecek mekânlar';

  const open = useCallback((place: PlaceWithStats) => {
    // Replace keeps the modal stack flat: closing the detail returns to the map.
    router.replace(`/place/${place.id}`);
  }, []);

  const keyExtractor = useCallback((item: PlaceWithStats) => item.id, []);

  const renderItem = useCallback(
    ({ item, index }: { item: PlaceWithStats; index: number }) => (
      <ResultRow
        place={item}
        label={labelFor(item)}
        index={index}
        staggered={!trimmed}
        distanceKm={distanceTo(item)}
        onPress={open}
      />
    ),
    [distanceTo, labelFor, open, trimmed],
  );

  return (
    <View style={[styles.screen, { paddingTop: sheetTopPad(insets.top) }]}>
      <ModalGrabber />
      <Animated.View entering={FadeIn.duration(duration.base)} style={styles.header}>
        <View style={styles.searchShell}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Mekân ya da semt ara"
            accessibilityLabel="Mekân ara"
            placeholderTextColor={colors.mutedSoft}
            style={styles.input}
            autoFocus
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode={Platform.OS === 'ios' ? 'never' : 'while-editing'}
          />
          {query.length > 0 ? (
            <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Aramayı temizle">
              <Ionicons name="close-circle" size={18} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>
        <PressableScale onPress={() => router.back()} hitSlop={8} scaleTo={0.94} accessibilityRole="button">
          <Text style={styles.cancel}>Kapat</Text>
        </PressableScale>
      </Animated.View>

      <FlatList
        data={results}
        keyExtractor={keyExtractor}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xl }]}
        ListHeaderComponent={
          results.length > 0 ? (
            <Text style={styles.headingText}>{heading}</Text>
          ) : null
        }
        ListFooterComponent={
          results.length > 0 ? (
            <View style={styles.suggest}>
              <Text style={styles.suggestText}>Aradığın mekân yok mu?</Text>
              <PressableScale
                onPress={() => router.replace('/add-place')}
                hitSlop={8}
                scaleTo={0.96}
                accessibilityRole="link"
              >
                <Text style={styles.suggestLink}>Mekân öner</Text>
              </PressableScale>
            </View>
          ) : null
        }
        renderItem={renderItem}
        ListEmptyComponent={
          <EmptyState
            icon="search-outline"
            title={trimmed ? 'Sonuç bulunamadı' : 'Henüz mekân yok'}
            body={
              trimmed
                ? `"${trimmed}" için mekân yok. Bildiğin bir yer varsa öner, ekip kontrol edip listeye eklesin.`
                : 'Listeye ilk mekânı sen ekle; ekip kontrol ettikten sonra haritada görünür.'
            }
            action="Mekân öner"
            onAction={() => router.replace('/add-place')}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: spacing.sm,
  },
  searchShell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 16,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
  },
  input: {
    flex: 1,
    fontFamily: 'DMSans_400Regular',
    fontSize: 16,
    color: colors.ink,
    paddingVertical: 0,
  },
  cancel: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 15,
    color: colors.ink,
  },

  list: {
    paddingHorizontal: 20,
    paddingTop: spacing.sm,
  },
  headingText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 13,
    color: colors.muted,
    paddingBottom: 4,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.lineStrong,
  },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.bgSoft,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbBadge: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 4,
    borderRadius: 10,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.white,
  },
  thumbBadgeText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 11,
    color: colors.white,
  },
  rowBody: { flex: 1, gap: 3 },
  name: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 16,
    color: colors.ink,
  },
  meta: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 13,
    color: colors.muted,
  },

  suggest: { alignItems: 'flex-start', gap: 4, paddingTop: 20 },
  suggestText: { fontFamily: 'DMSans_400Regular', fontSize: 14, color: colors.muted },
  suggestLink: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 15,
    color: colors.ink,
    textDecorationLine: 'underline',
  },
});
