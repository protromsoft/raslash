import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
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
import { Badge, EmptyState } from '@/components/ui';
import { usePlaces } from '@/context/PlacesContext';
import type { PlaceWithStats } from '@/data/types';
import { haversineKm } from '@/lib/presence';
import { colors, shadows } from '@/theme/colors';
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

function ResultRow({
  place,
  distanceKm,
  index,
  onPress,
}: {
  place: PlaceWithStats;
  distanceKm: number | null;
  index: number;
  onPress: () => void;
}) {
  const rating = place.reviewCount > 0 ? place.overall.toFixed(1) : null;

  return (
    <Animated.View entering={FadeInDown.delay(stagger(index, 28, 220)).duration(duration.base)}>
      <PressableScale onPress={onPress} scaleTo={0.98} style={styles.row}>
        <View style={styles.thumb}>
          {place.imageUrl ? (
            <Image
              source={{ uri: place.imageUrl }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={220}
            />
          ) : (
            <Ionicons name="cafe-outline" size={20} color={colors.muted} />
          )}
          {place.checkedInCount > 0 ? (
            <View style={styles.thumbBadge}>
              <Text style={styles.thumbBadgeText}>{place.checkedInCount}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.rowBody}>
          <Text style={styles.name} numberOfLines={1}>
            {place.name}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {place.category} · {place.city}
            {distanceKm != null ? ` · ${formatDistance(distanceKm)}` : ''}
          </Text>
        </View>

        {rating ? (
          <View style={styles.rating}>
            <Ionicons name="star" size={11} color={colors.ink} />
            <Text style={styles.ratingText}>{rating}</Text>
          </View>
        ) : (
          <Ionicons name="chevron-forward" size={16} color={colors.mutedSoft} />
        )}
      </PressableScale>
    </Animated.View>
  );
}

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const { places } = usePlaces();
  const [query, setQuery] = useState('');
  const [coords, setCoords] = useState<Coords | null>(null);

  // Last known position is instant and never prompts, which keeps search snappy.
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted' || !mounted) return;
      const pos = await Location.getLastKnownPositionAsync();
      if (!pos || !mounted) return;
      setCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const distanceTo = useMemo(
    () => (place: PlaceWithStats) =>
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
        const haystack = `${name} ${fold(place.category)} ${fold(place.city)}`;
        if (!haystack.includes(needle)) return null;
        // Name matches rank above category/city matches, prefixes above the rest.
        const score = name.startsWith(needle) ? 0 : name.includes(needle) ? 1 : 2;
        return { place, score };
      })
      .filter((hit): hit is { place: PlaceWithStats; score: number } => hit != null)
      .sort((a, b) => a.score - b.score || b.place.overall - a.place.overall)
      .slice(0, 40)
      .map((hit) => hit.place);
  }, [places, trimmed, coords, distanceTo]);

  const heading = trimmed
    ? `${results.length} sonuç`
    : coords
      ? 'Sana en yakın mekanlar'
      : 'En yüksek puanlı mekanlar';

  const open = (place: PlaceWithStats) => {
    // Replace keeps the modal stack flat: closing the detail returns to the map.
    router.replace(`/place/${place.id}`);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.sm }]}>
      <Animated.View entering={FadeIn.duration(duration.base)} style={styles.header}>
        <View style={styles.searchShell}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Mekan, kategori veya şehir ara"
            placeholderTextColor={colors.mutedSoft}
            style={styles.input}
            autoFocus
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode={Platform.OS === 'ios' ? 'never' : 'while-editing'}
          />
          {query.length > 0 ? (
            <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityLabel="Temizle">
              <Ionicons name="close-circle" size={18} color={colors.mutedSoft} />
            </Pressable>
          ) : null}
        </View>
        <PressableScale onPress={() => router.back()} hitSlop={8} scaleTo={0.94}>
          <Text style={styles.cancel}>Kapat</Text>
        </PressableScale>
      </Animated.View>

      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xl }]}
        ListHeaderComponent={
          results.length > 0 ? (
            <View style={styles.listHead}>
              <Text style={styles.headingText}>{heading}</Text>
              <Badge label={`${places.length} mekan`} tone="neutral" />
            </View>
          ) : null
        }
        renderItem={({ item, index }) => (
          <ResultRow
            place={item}
            index={index}
            distanceKm={distanceTo(item)}
            onPress={() => open(item)}
          />
        )}
        ListEmptyComponent={
          <EmptyState
            icon="search-outline"
            title={trimmed ? 'Sonuç bulunamadı' : 'Henüz mekan yok'}
            body={
              trimmed
                ? `"${trimmed}" için mekan yok. Bildiğin bir yer varsa öner, ekip kontrol edip listeye eklesin.`
                : 'Listeye ilk mekanı sen ekle; ekip kontrol ettikten sonra haritada görünür.'
            }
            action="Mekan öner"
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
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  searchShell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 50,
    paddingHorizontal: 14,
    borderRadius: radii.pill,
    backgroundColor: colors.white,
    ...shadows.soft,
  },
  input: {
    flex: 1,
    fontFamily: 'DMSans_500Medium',
    fontSize: 15.5,
    color: colors.ink,
    paddingVertical: 0,
  },
  cancel: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 15,
    color: colors.muted,
  },

  list: {
    paddingHorizontal: spacing.md,
    gap: 8,
  },
  listHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  headingText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 17,
    letterSpacing: -0.3,
    color: colors.ink,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.white,
    borderRadius: radii.md,
    padding: 10,
    ...shadows.soft,
  },
  thumb: {
    width: 54,
    height: 54,
    borderRadius: radii.sm,
    backgroundColor: colors.bgSoft,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbBadge: {
    position: 'absolute',
    right: 3,
    bottom: 3,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.white,
  },
  thumbBadgeText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 9,
    color: colors.white,
  },
  rowBody: { flex: 1, gap: 3 },
  name: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 15.5,
    color: colors.ink,
  },
  meta: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 12.5,
    color: colors.muted,
  },
  rating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.bgSoft,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: radii.pill,
  },
  ratingText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 12,
    color: colors.ink,
  },
});
