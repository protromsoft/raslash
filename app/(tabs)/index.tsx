import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Dimensions,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type AppStateStatus,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT, type Region } from 'react-native-maps';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PressableScale } from '@/components/Motion';
import { PlaceCard } from '@/components/PlaceCard';
import { RegularsSheet } from '@/components/RegularsSheet';
import { Chip } from '@/components/ui';
import { useApp } from '@/context/AppContext';
import { usePlaces } from '@/context/PlacesContext';
import type { PlaceWithStats, Regular } from '@/data/types';
import {
  countActiveInBounds,
  currentAppPresenceState,
  haversineKm,
  isPopularPlace,
  upsertPresence,
} from '@/lib/presence';
import { colors, shadows } from '@/theme/colors';
import { duration } from '@/theme/motion';
import { radii, spacing, TAB_BAR_HEIGHT } from '@/theme/spacing';

const { width } = Dimensions.get('window');
const CARD_GAP = 12;
const SIDE_PAD = 24;
const CARD_WIDTH = width - SIDE_PAD * 2 - 22;
const SNAP = CARD_WIDTH + CARD_GAP;

type Coords = { latitude: number; longitude: number };
type FilterKey = 'all' | 'near' | 'live' | 'top';

const FILTERS: { key: FilterKey; label: string; icon: Parameters<typeof Chip>[0]['icon'] }[] = [
  { key: 'all', label: 'Tümü', icon: 'grid-outline' },
  { key: 'near', label: 'Yakınımda', icon: 'navigate-outline' },
  { key: 'live', label: 'Şu an dolu', icon: 'people-outline' },
  { key: 'top', label: 'En iyi puan', icon: 'star-outline' },
];

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useApp();
  const { places, activeCheckIn, getPlace, syncStatus, syncMessage, getRegularsForPlace } =
    usePlaces();

  const mapRef = useRef<MapView>(null);
  const listRef = useRef<FlatList<PlaceWithStats>>(null);

  const [selectedId, setSelectedId] = useState<string | undefined>(places[0]?.id);
  const [userCoords, setUserCoords] = useState<Coords | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [region, setRegion] = useState<Region | null>(null);
  const [activeOnMap, setActiveOnMap] = useState<number | null>(null);
  const [locBusy, setLocBusy] = useState(false);
  const [regularsOpen, setRegularsOpen] = useState(false);
  const [regularsPlace, setRegularsPlace] = useState<PlaceWithStats | null>(null);
  const [regulars, setRegulars] = useState<Regular[]>([]);
  const [previews, setPreviews] = useState<Record<string, Regular[]>>({});

  const displayedPlaces = useMemo(() => {
    let list = [...places];
    if (filter === 'live') list = list.filter((p) => p.checkedInCount > 0);
    if (filter === 'top') list = list.sort((a, b) => b.overall - a.overall);
    if (filter === 'near' && userCoords) {
      list = list.sort(
        (a, b) =>
          haversineKm(userCoords, { latitude: a.latitude, longitude: a.longitude }) -
          haversineKm(userCoords, { latitude: b.latitude, longitude: b.longitude }),
      );
    }
    return list;
  }, [places, filter, userCoords]);

  const selected = useMemo(
    () => displayedPlaces.find((p) => p.id === selectedId) ?? displayedPlaces[0],
    [displayedPlaces, selectedId],
  );
  const activePlace = activeCheckIn ? getPlace(activeCheckIn.placeId) : null;

  const distanceTo = useCallback(
    (place: PlaceWithStats) =>
      userCoords
        ? haversineKm(userCoords, { latitude: place.latitude, longitude: place.longitude })
        : null,
    [userCoords],
  );

  // Regulars come from local storage, so previews for the whole list are cheap.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        displayedPlaces.slice(0, 40).map(async (p) => [p.id, await getRegularsForPlace(p.id)] as const),
      );
      if (cancelled) return;
      setPreviews(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [displayedPlaces, getRegularsForPlace]);

  const openRegulars = async (place: PlaceWithStats) => {
    setRegularsPlace(place);
    setRegulars(previews[place.id] ?? []);
    setRegularsOpen(true);
    const list = await getRegularsForPlace(place.id);
    setRegulars(list);
  };

  useEffect(() => {
    if (!selectedId && displayedPlaces[0]) setSelectedId(displayedPlaces[0].id);
    if (selectedId && !displayedPlaces.some((p) => p.id === selectedId) && displayedPlaces[0]) {
      setSelectedId(displayedPlaces[0].id);
    }
  }, [displayedPlaces, selectedId]);

  const refreshActiveCount = useCallback(
    async (nextRegion?: Region | null) => {
      const r = nextRegion ?? region;
      if (!r) {
        setActiveOnMap(null);
        return;
      }
      const count = await countActiveInBounds({
        minLat: r.latitude - r.latitudeDelta / 2,
        maxLat: r.latitude + r.latitudeDelta / 2,
        minLng: r.longitude - r.longitudeDelta / 2,
        maxLng: r.longitude + r.longitudeDelta / 2,
      });
      setActiveOnMap(count);
    },
    [region],
  );

  const beatPresence = useCallback(
    async (coords?: Coords | null, appState?: AppStateStatus) => {
      if (!user?.id || !coords) return;
      await upsertPresence({
        userId: user.id,
        latitude: coords.latitude,
        longitude: coords.longitude,
        appState: currentAppPresenceState(appState),
      });
      await refreshActiveCount();
    },
    [refreshActiveCount, user?.id],
  );

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted' || !mounted) return;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      if (!mounted) return;
      const coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      setUserCoords(coords);
      void beatPresence(coords);
    })();
    return () => {
      mounted = false;
    };
  }, [beatPresence]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      void beatPresence(userCoords, currentAppPresenceState(state));
    });
    const timer = setInterval(() => void beatPresence(userCoords), 30000);
    return () => {
      sub.remove();
      clearInterval(timer);
    };
  }, [beatPresence, userCoords]);

  const focusPlace = (place: PlaceWithStats, index?: number) => {
    setSelectedId(place.id);
    mapRef.current?.animateToRegion(
      {
        latitude: place.latitude,
        longitude: place.longitude,
        latitudeDelta: 0.03,
        longitudeDelta: 0.03,
      },
      380,
    );
    if (typeof index === 'number') {
      listRef.current?.scrollToOffset({ offset: index * SNAP, animated: true });
    }
  };

  const goToMyLocation = async () => {
    setLocBusy(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      setUserCoords(coords);
      setFilter('near');
      const nextRegion: Region = {
        latitude: coords.latitude,
        longitude: coords.longitude,
        latitudeDelta: 0.025,
        longitudeDelta: 0.025,
      };
      setRegion(nextRegion);
      mapRef.current?.animateToRegion(nextRegion, 480);
      void beatPresence(coords);
      requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }));
      await refreshActiveCount(nextRegion);
    } finally {
      setLocBusy(false);
    }
  };

  const onCardScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / SNAP);
    const place = displayedPlaces[index];
    if (place && place.id !== selectedId) {
      setSelectedId(place.id);
      mapRef.current?.animateToRegion(
        {
          latitude: place.latitude,
          longitude: place.longitude,
          latitudeDelta: 0.03,
          longitudeDelta: 0.03,
        },
        320,
      );
    }
  };

  const carouselBottom = insets.bottom + TAB_BAR_HEIGHT + 18;
  const activePeople = activeOnMap ?? places.reduce((sum, p) => sum + (p.checkedInCount || 0), 0);

  if (!selected) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator color={colors.ink} />
        <Text style={styles.loadingText}>
          {syncStatus === 'syncing' ? syncMessage || 'Mekanlar yükleniyor…' : 'Mekan bulunamadı'}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={PROVIDER_DEFAULT}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        // Keeps the focused pin visible in the strip between the filters and the card.
        mapPadding={{ top: insets.top + 96, right: 0, bottom: carouselBottom + 230, left: 0 }}
        initialRegion={{
          latitude: selected.latitude,
          longitude: selected.longitude,
          latitudeDelta: 0.07,
          longitudeDelta: 0.07,
        }}
        onRegionChangeComplete={(r) => {
          setRegion(r);
          void refreshActiveCount(r);
        }}
      >
        {displayedPlaces.map((place, index) => {
          const active = place.id === selectedId;
          return (
            <Marker
              key={place.id}
              coordinate={{ latitude: place.latitude, longitude: place.longitude }}
              onPress={() => focusPlace(place, index)}
              tracksViewChanges={false}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <View style={styles.markerStack}>
                <View style={[styles.marker, active && styles.markerActive]}>
                  <Ionicons name="laptop-outline" size={active ? 24 : 18} color={colors.white} />
                  {place.checkedInCount > 0 ? (
                    <View style={styles.markerCount}>
                      <Text style={styles.markerCountText}>{place.checkedInCount}</Text>
                    </View>
                  ) : null}
                </View>
                {isPopularPlace(place) ? (
                  <View style={styles.markerFlame}>
                    <Ionicons name="flame" size={10} color={colors.amber} />
                  </View>
                ) : null}
              </View>
            </Marker>
          );
        })}
      </MapView>

      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <View style={styles.statusRow} pointerEvents="box-none">
          <PressableScale
            onPress={() => router.push('/search')}
            scaleTo={0.97}
            style={styles.searchPill}
            accessibilityRole="search"
            accessibilityLabel="Mekan ara"
          >
            <Ionicons name="search" size={16} color={colors.white} />
            <Text style={styles.searchText} numberOfLines={1}>
              {places.length > 0 ? `${places.length} mekan içinde ara` : 'Mekan ara'}
            </Text>
          </PressableScale>

          <View style={styles.cityPill}>
            <View
              style={[
                styles.dot,
                syncStatus === 'error' && { backgroundColor: colors.danger },
                syncStatus === 'syncing' && { backgroundColor: colors.amber },
              ]}
            />
            <Text style={styles.cityText}>
              {syncStatus === 'syncing' ? 'Yükleniyor…' : `${activePeople} aktif`}
            </Text>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}
        >
          {FILTERS.map((f) => (
            <Chip
              key={f.key}
              label={f.label}
              icon={f.icon}
              active={filter === f.key}
              onPress={() => {
                setFilter(f.key);
                if (f.key === 'near' && !userCoords) void goToMyLocation();
              }}
            />
          ))}
        </ScrollView>
      </View>

      {activePlace ? (
        <Animated.View
          entering={FadeInDown.duration(duration.slow)}
          exiting={FadeOut}
          style={[styles.activeBanner, { top: insets.top + 108 }]}
        >
          <PressableScale
            onPress={() => router.push(`/chat/${activePlace.id}`)}
            style={styles.activeInner}
          >
            <View style={styles.activePulse} />
            <View style={{ flex: 1 }}>
              <Text style={styles.activeTitle} numberOfLines={1}>
                {activePlace.name} · check‑in aktif
              </Text>
              <Text style={styles.activeSub}>Sohbete dön</Text>
            </View>
            <Ionicons name="chatbubble-ellipses" size={18} color={colors.white} />
          </PressableScale>
        </Animated.View>
      ) : null}

      <View style={[styles.fabCol, { bottom: carouselBottom + 280 }]} pointerEvents="box-none">
        <PressableScale
          style={styles.fabLight}
          disabled={locBusy}
          onPress={() => void goToMyLocation()}
          accessibilityLabel="Konumuma git"
        >
          {locBusy ? (
            <ActivityIndicator size="small" color={colors.ink} />
          ) : (
            <Ionicons name="navigate" size={20} color={colors.ink} />
          )}
        </PressableScale>
        <PressableScale
          style={styles.fabDark}
          onPress={() => router.push('/add-place')}
          accessibilityLabel="Mekan öner"
        >
          <Ionicons name="add" size={26} color={colors.white} />
        </PressableScale>
      </View>

      <Animated.View
        entering={FadeIn.delay(160).duration(duration.slow)}
        style={[styles.carousel, { bottom: carouselBottom }]}
        pointerEvents="box-none"
      >
        <FlatList
          ref={listRef}
          horizontal
          data={displayedPlaces}
          keyExtractor={(item) => item.id}
          showsHorizontalScrollIndicator={false}
          snapToInterval={SNAP}
          snapToAlignment="start"
          decelerationRate="fast"
          getItemLayout={(_, index) => ({ length: SNAP, offset: SNAP * index, index })}
          style={styles.carouselList}
          contentContainerStyle={styles.carouselContent}
          onMomentumScrollEnd={onCardScroll}
          removeClippedSubviews={false}
          renderItem={({ item }) => (
            <PlaceCard
              place={item}
              width={CARD_WIDTH}
              regulars={previews[item.id] ?? []}
              distanceKm={distanceTo(item)}
              onPress={() => router.push(`/place/${item.id}`)}
              onPressRegulars={() => void openRegulars(item)}
            />
          )}
        />
      </Animated.View>

      <RegularsSheet
        visible={regularsOpen}
        placeName={regularsPlace?.name}
        regulars={regulars}
        onClose={() => setRegularsOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: {
    fontFamily: 'DMSans_500Medium',
    color: colors.muted,
  },

  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    gap: 10,
  },
  statusRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: spacing.md,
  },
  cityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(12,11,10,0.82)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
    ...shadows.soft,
  },
  searchPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 38,
    backgroundColor: colors.ink,
    paddingHorizontal: 14,
    borderRadius: radii.pill,
    ...shadows.card,
  },
  searchText: {
    flex: 1,
    fontFamily: 'DMSans_500Medium',
    fontSize: 13.5,
    color: 'rgba(255,255,255,0.82)',
  },
  cityText: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 12.5,
    color: colors.white,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.green,
  },
  filters: {
    paddingHorizontal: spacing.md,
    gap: 8,
  },

  activeBanner: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
  },
  activeInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.ink,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    ...shadows.card,
  },
  activePulse: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.green,
  },
  activeTitle: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 14,
    color: colors.white,
  },
  activeSub: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 12,
    color: 'rgba(255,255,255,0.68)',
    marginTop: 1,
  },

  markerStack: { alignItems: 'center' },
  marker: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2.5,
    borderColor: colors.white,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.soft,
  },
  markerActive: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 3,
  },
  markerCount: {
    position: 'absolute',
    top: -4,
    right: -6,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.white,
  },
  markerCountText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 9,
    color: colors.white,
  },
  markerFlame: {
    marginTop: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.soft,
  },

  fabCol: {
    position: 'absolute',
    right: spacing.md,
    gap: 10,
    alignItems: 'center',
    zIndex: 5,
  },
  fabLight: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  fabDark: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.lifted,
  },

  carousel: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  carouselList: {
    overflow: 'visible',
  },
  carouselContent: {
    paddingHorizontal: SIDE_PAD,
    gap: CARD_GAP,
    paddingTop: 16,
    paddingBottom: 18,
  },
});
