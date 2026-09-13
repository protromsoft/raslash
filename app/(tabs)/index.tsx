import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Dimensions,
  FlatList,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type AppStateStatus,
  type LayoutChangeEvent,
  type ListRenderItemInfo,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT, type Region } from 'react-native-maps';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PressableScale } from '@/components/Motion';
import { LiveDot } from '@/components/LiveDot';
import { NO_REGULARS, PlaceCard } from '@/components/PlaceCard';
import { RegularsSheet } from '@/components/RegularsSheet';
import { tabBarSpace } from '@/components/TabBar';
import { Chip } from '@/components/ui';
import { useApp } from '@/context/AppContext';
import { usePlaces } from '@/context/PlacesContext';
import { SUPPORTED_CITIES, type CityKey } from '@/data/cities';
import type { PlaceWithStats, Regular } from '@/data/types';
import { haptic } from '@/lib/haptics';
import { hasValidCoordinates } from '@/lib/placeData';
import {
  getForegroundPosition,
  requestForegroundLocationAccess,
  showLocationSettingsAlert,
} from '@/lib/locationPermission';
import {
  fetchCheckInAccessStatus,
  isCheckInCreditsEnabled,
  type CheckInAccessStatus,
} from '@/lib/checkIns';
import {
  countActiveInBounds,
  currentAppPresenceState,
  haversineKm,
  isPopularPlace,
  upsertPresence,
} from '@/lib/presence';
import { colors, shadows } from '@/theme/colors';
import { duration } from '@/theme/motion';
import { radii, spacing } from '@/theme/spacing';

const { width } = Dimensions.get('window');
const CARD_GAP = 12;
const SIDE_PAD = 24;
/** Sliver of the next card left visible so the strip reads as scrollable. */
const PEEK = 22;
const CARD_WIDTH = width - SIDE_PAD * 2 - PEEK;
const SNAP = CARD_WIDTH + CARD_GAP;
/**
 * Trailing padding must cover the peek as well, otherwise the content is `PEEK`
 * short of the last snap point and the final card rests misaligned.
 */
const CARD_TAIL_PAD = SIDE_PAD + PEEK;
/** Used until the strip has laid out, so the first frame's map padding is sane. */
const CAROUSEL_ESTIMATED_HEIGHT = 268;
/** How long the map has to sit still before we re-count presence around it. */
const PRESENCE_COUNT_DEBOUNCE_MS = 450;
const MARKER_ANCHOR = { x: 0.5, y: 0.5 };
/**
 * Rendering every custom marker at once can exhaust MapKit while a filter
 * replaces the marker tree (Istanbul currently has close to 200 places). Keep
 * the complete carousel, but only mount the markers closest to the current map
 * focus. Selection and an active check-in are always retained.
 */
const MAX_MAP_MARKERS = 48;
/** Avoid replacing the visible marker window for a tiny map movement. */
const MARKER_REFOCUS_THRESHOLD_DEGREES = 0.015;

function cityKey(value: string | null | undefined): CityKey {
  if (typeof value !== 'string') return 'istanbul';
  const normalized = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (normalized.includes('ankara')) return 'ankara';
  if (normalized.includes('izmir')) return 'izmir';
  return 'istanbul';
}

/**
 * The leading `SIDE_PAD` is deliberately left out: offsets then line up exactly
 * with the `snapToInterval` grid, so `scrollToOffset(index * SNAP)` lands a card
 * in the same resting position the user's own scroll would.
 */
function getItemLayout(_: unknown, index: number) {
  return { length: SNAP, offset: SNAP * index, index };
}

function offsetToIndex(offsetX: number, count: number) {
  if (count === 0) return -1;
  return Math.min(Math.max(Math.round(offsetX / SNAP), 0), count - 1);
}

type Coords = { latitude: number; longitude: number };
type FilterKey = 'all' | 'near' | 'live' | 'top';

const FILTERS: { key: FilterKey; label: string; icon: Parameters<typeof Chip>[0]['icon'] }[] = [
  { key: 'all', label: 'Tümü', icon: 'grid-outline' },
  { key: 'near', label: 'Yakınımda', icon: 'navigate-outline' },
  { key: 'live', label: 'Şu an dolu', icon: 'people-outline' },
  { key: 'top', label: 'En iyi puan', icon: 'star-outline' },
];

/** Keep the native marker mounted while its artwork changes. Remounting a
 * selected marker during a Fabric map transaction can crash Apple Maps. Only
 * briefly track the view after a visual change, so normal panning stays cheap.
 */
const PlaceMarker = memo(function PlaceMarker({
  place,
  active,
  onSelect,
}: {
  place: PlaceWithStats;
  active: boolean;
  onSelect: (place: PlaceWithStats) => void;
}) {
  // Android rasterizes custom markers. Keep tracking through their first font/layout
  // pass, then stop to avoid a continuous redraw cost across dozens of places.
  const [tracksViewChanges, setTracksViewChanges] = useState(Platform.OS === 'android');
  const visualState = `${active}:${place.checkedInCount}`;
  const previousVisualState = useRef(visualState);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const timeout = setTimeout(() => setTracksViewChanges(false), 900);
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (previousVisualState.current === visualState) return;
    previousVisualState.current = visualState;
    setTracksViewChanges(true);
    const timeout = setTimeout(() => setTracksViewChanges(false), 450);
    return () => clearTimeout(timeout);
  }, [visualState]);

  return (
    <Marker
      coordinate={{ latitude: place.latitude, longitude: place.longitude }}
      onPress={() => onSelect(place)}
      tracksViewChanges={tracksViewChanges}
      anchor={MARKER_ANCHOR}
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
});

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const { user, isSubscribed } = useApp();
  const {
    ready,
    places,
    activeCheckIn,
    getPlace,
    labelFor,
    syncStatus,
    syncMessage,
    getRegularsForPlace,
    getRegularsForPlaces,
  } = usePlaces();

  const mapRef = useRef<MapView>(null);
  const listRef = useRef<FlatList<PlaceWithStats>>(null);
  /** Set when a chip press should send the strip back to the first card. */
  const resetToFirstRef = useRef(false);

  const [selectedId, setSelectedId] = useState<string | undefined>(places[0]?.id);
  const [selectedCity, setSelectedCity] = useState<CityKey>('istanbul');
  const [userCoords, setUserCoords] = useState<Coords | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [activeOnMap, setActiveOnMap] = useState<number | null>(null);
  const [locBusy, setLocBusy] = useState(false);
  const [locationGranted, setLocationGranted] = useState(false);
  const [mapCenter, setMapCenter] = useState<Coords | null>(null);
  const [regularsOpen, setRegularsOpen] = useState(false);
  const [regularsPlace, setRegularsPlace] = useState<PlaceWithStats | null>(null);
  const [regulars, setRegulars] = useState<Regular[]>([]);
  const [previews, setPreviews] = useState<Record<string, Regular[]>>({});
  const [carouselHeight, setCarouselHeight] = useState(CAROUSEL_ESTIMATED_HEIGHT);
  const [checkInAccess, setCheckInAccess] = useState<CheckInAccessStatus | null>(null);
  const locBusyRef = useRef(false);

  const cityPlaces = useMemo(
    () => places.filter((place) => cityKey(place.city) === selectedCity),
    [places, selectedCity],
  );

  const displayedPlaces = useMemo(() => {
    let list = [...cityPlaces];
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
  }, [cityPlaces, filter, userCoords]);

  const selectCity = useCallback((key: CityKey) => {
    const city = SUPPORTED_CITIES.find((item) => item.key === key);
    if (!city) return;
    setSelectedCity(key);
    resetToFirstRef.current = true;
    setActiveOnMap(null);
    mapRef.current?.animateToRegion(
      {
        latitude: city.latitude,
        longitude: city.longitude,
        latitudeDelta: 0.18,
        longitudeDelta: 0.18,
      },
      420,
    );
  }, []);

  // Reading these through state inside callbacks would rebuild the callbacks on
  // every scroll and pan, which is exactly what the carousel must avoid.
  const placesRef = useRef(displayedPlaces);
  placesRef.current = displayedPlaces;
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  const regionRef = useRef<Region | null>(null);

  const selected = useMemo(
    () => displayedPlaces.find((p) => p.id === selectedId) ?? displayedPlaces[0],
    [displayedPlaces, selectedId],
  );
  const activePlace = activeCheckIn ? getPlace(activeCheckIn.placeId) : null;

  const markerPlaces = useMemo(() => {
    if (displayedPlaces.length <= MAX_MAP_MARKERS) return displayedPlaces;

    const focus =
      filter === 'near' && userCoords
        ? userCoords
        : mapCenter ??
          (selected
            ? { latitude: selected.latitude, longitude: selected.longitude }
            : null);
    if (!focus) return displayedPlaces.slice(0, MAX_MAP_MARKERS);

    const priorityIds = new Set(
      [selected?.id, activePlace?.id].filter((id): id is string => Boolean(id)),
    );
    const priority = displayedPlaces.filter((place) => priorityIds.has(place.id));
    const closest = displayedPlaces
      .filter((place) => !priorityIds.has(place.id))
      .sort(
        (a, b) =>
          haversineKm(focus, { latitude: a.latitude, longitude: a.longitude }) -
          haversineKm(focus, { latitude: b.latitude, longitude: b.longitude }),
      );
    return [...priority, ...closest].slice(0, MAX_MAP_MARKERS);
  }, [activePlace?.id, displayedPlaces, filter, mapCenter, selected, userCoords]);

  useEffect(() => {
    if (!isCheckInCreditsEnabled || !user?.id) {
      setCheckInAccess(null);
      return;
    }
    let cancelled = false;
    void fetchCheckInAccessStatus()
      .then((next) => {
        if (!cancelled) setCheckInAccess(next);
      })
      .catch((error) => {
        console.warn('check-in access status failed', error);
        if (!cancelled) setCheckInAccess(null);
      });
    return () => {
      cancelled = true;
    };
  }, [activeCheckIn?.placeId, isSubscribed, user?.id]);

  const distanceTo = useCallback(
    (place: PlaceWithStats) =>
      userCoords
        ? haversineKm(userCoords, { latitude: place.latitude, longitude: place.longitude })
        : null,
    [userCoords],
  );

  // Regulars come from local storage in one batched read, so previews for the
  // whole list are cheap. Keyed by the catalogue's ids rather than the filtered
  // list: re-sorting the strip does not change who this month's regulars are.
  const previewIdsKey = useMemo(
    () => cityPlaces.slice(0, 60).map((p) => p.id).join('|'),
    [cityPlaces],
  );

  useEffect(() => {
    const ids = previewIdsKey ? previewIdsKey.split('|') : [];
    if (ids.length === 0) return;
    let cancelled = false;
    (async () => {
      const map = await getRegularsForPlaces(ids);
      if (cancelled) return;
      setPreviews(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [previewIdsKey, getRegularsForPlaces]);

  // Opening one sheet right after another must not let the first (slower) read
  // land on top of the second place's list.
  const regularsRequestRef = useRef<string | null>(null);
  const openRegulars = useCallback(
    (place: PlaceWithStats) => {
      regularsRequestRef.current = place.id;
      setRegularsPlace(place);
      setRegulars(previews[place.id] ?? NO_REGULARS);
      setRegularsOpen(true);
      void getRegularsForPlace(place.id).then((list) => {
        if (regularsRequestRef.current === place.id) setRegulars(list);
      });
    },
    [getRegularsForPlace, previews],
  );

  const openPlace = useCallback((place: PlaceWithStats) => {
    router.push(`/place/${place.id}`);
  }, []);

  const refreshActiveCount = useCallback(async (nextRegion?: Region | null) => {
    const r = nextRegion ?? regionRef.current;
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
  }, []);

  // Panning fires `onRegionChangeComplete` constantly; without this the map
  // would issue one presence query per gesture and re-render on each reply.
  const countTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onRegionSettled = useCallback(
    (r: Region) => {
      if (
        !hasValidCoordinates(r) ||
        !Number.isFinite(r.latitudeDelta) ||
        !Number.isFinite(r.longitudeDelta) ||
        r.latitudeDelta <= 0 ||
        r.longitudeDelta <= 0
      ) {
        return;
      }
      regionRef.current = r;
      setMapCenter((previous) => {
        if (
          previous &&
          Math.abs(previous.latitude - r.latitude) < MARKER_REFOCUS_THRESHOLD_DEGREES &&
          Math.abs(previous.longitude - r.longitude) < MARKER_REFOCUS_THRESHOLD_DEGREES
        ) {
          return previous;
        }
        return { latitude: r.latitude, longitude: r.longitude };
      });
      if (countTimer.current) clearTimeout(countTimer.current);
      countTimer.current = setTimeout(() => {
        countTimer.current = null;
        void refreshActiveCount();
      }, PRESENCE_COUNT_DEBOUNCE_MS);
    },
    [refreshActiveCount],
  );

  useEffect(
    () => () => {
      if (countTimer.current) clearTimeout(countTimer.current);
    },
    [],
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
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (!mounted) return;
        const granted = status === 'granted';
        setLocationGranted(granted);
        if (!granted) return;
        const pos = await getForegroundPosition({
          timeoutMs: 8_000,
          maxLastKnownAgeMs: 5 * 60_000,
          requiredLastKnownAccuracyM: 500,
        });
        if (!mounted) return;
        const coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        setUserCoords(coords);
        void beatPresence(coords);
      } catch (error) {
        console.warn('initial location load failed', error);
      }
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

  const centreOn = useCallback((place: PlaceWithStats, ms: number) => {
    mapRef.current?.animateToRegion(
      {
        latitude: place.latitude,
        longitude: place.longitude,
        latitudeDelta: 0.03,
        longitudeDelta: 0.03,
      },
      ms,
    );
  }, []);

  /** Marker tap: select, centre the map, and bring the matching card forward. */
  const focusPlace = useCallback(
    (place: PlaceWithStats) => {
      if (place.id !== selectedIdRef.current) {
        setSelectedId(place.id);
        haptic('select');
      }
      centreOn(place, 380);
      const index = placesRef.current.findIndex((p) => p.id === place.id);
      if (index >= 0) {
        listRef.current?.scrollToOffset({ offset: index * SNAP, animated: true });
      }
    },
    [centreOn],
  );

  /**
   * Card → map. Selecting from a marker scrolls the strip, which lands back
   * here; the id check makes that a no-op instead of a second map animation.
   */
  const syncSelectionToOffset = useCallback(
    (offsetX: number) => {
      const list = placesRef.current;
      const index = offsetToIndex(offsetX, list.length);
      const place = index >= 0 ? list[index] : undefined;
      if (!place || place.id === selectedIdRef.current) return;
      setSelectedId(place.id);
      centreOn(place, 320);
    },
    [centreOn],
  );

  const onMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => syncSelectionToOffset(e.nativeEvent.contentOffset.x),
    [syncSelectionToOffset],
  );

  // A slow drag that ends already on a snap point never decelerates, so no
  // momentum event follows and the selection would stay behind.
  const onScrollEndDrag = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (Math.abs(e.nativeEvent.velocity?.x ?? 0) > 0.05) return;
      syncSelectionToOffset(e.nativeEvent.contentOffset.x);
    },
    [syncSelectionToOffset],
  );

  /**
   * Filtering rebuilds the strip under a scroll offset that no longer means the
   * same card. Re-anchor on the id we had (or the first card after a chip press)
   * so the visible card and the highlighted pin never drift apart.
   */
  const listSignature = useMemo(
    () => displayedPlaces.map((p) => p.id).join('|'),
    [displayedPlaces],
  );

  useEffect(() => {
    const list = placesRef.current;
    if (list.length === 0) return;
    const wanted = resetToFirstRef.current
      ? -1
      : list.findIndex((p) => p.id === selectedIdRef.current);
    resetToFirstRef.current = false;
    const index = wanted >= 0 ? wanted : 0;
    if (list[index].id !== selectedIdRef.current) setSelectedId(list[index].id);
    listRef.current?.scrollToOffset({ offset: index * SNAP, animated: false });
    // Runs on membership/order changes only — `placesRef` holds the current list.
  }, [listSignature]);

  const goToMyLocation = useCallback(async () => {
    if (locBusyRef.current) return;
    locBusyRef.current = true;
    setLocBusy(true);
    try {
      const permission = await requestForegroundLocationAccess();
      setLocationGranted(permission.granted);
      if (!permission.granted) {
        showLocationSettingsAlert();
        return;
      }
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        Alert.alert(
          'Konum servisleri kapalı',
          'Kendi konumuna gitmek için cihazının konum servislerini açmalısın.',
        );
        return;
      }
      const pos = await getForegroundPosition({
        timeoutMs: 10_000,
        maxLastKnownAgeMs: 2 * 60_000,
        requiredLastKnownAccuracyM: 500,
      });
      const coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      setUserCoords(coords);
      resetToFirstRef.current = true;
      setFilter('near');
      const nextRegion: Region = {
        latitude: coords.latitude,
        longitude: coords.longitude,
        latitudeDelta: 0.025,
        longitudeDelta: 0.025,
      };
      regionRef.current = nextRegion;
      mapRef.current?.animateToRegion(nextRegion, 480);
      void beatPresence(coords);
      await refreshActiveCount(nextRegion);
    } catch (error) {
      console.warn('go to my location failed', error);
      Alert.alert(
        'Konum alınamadı',
        'Konumun şu anda alınamadı. Konum servislerini ve internet bağlantını kontrol edip tekrar dene.',
      );
    } finally {
      locBusyRef.current = false;
      setLocBusy(false);
    }
  }, [beatPresence, refreshActiveCount]);

  const onCarouselLayout = useCallback((e: LayoutChangeEvent) => {
    const next = Math.round(e.nativeEvent.layout.height);
    if (next > 0) setCarouselHeight((prev) => (prev === next ? prev : next));
  }, []);

  const carouselBottom = tabBarSpace(insets.bottom) + 8;

  // Keeps the focused pin inside the strip between the filters and the cards,
  // measured rather than guessed so it stays right as the card grows.
  const mapPadding = useMemo(
    () => ({ top: insets.top + 96, right: 0, bottom: carouselBottom + carouselHeight, left: 0 }),
    [insets.top, carouselBottom, carouselHeight],
  );

  // Latched once: MapView ignores later `initialRegion` changes anyway, and a
  // fresh object every render would keep marking the prop as dirty.
  const initialRegionRef = useRef<Region | null>(null);
  const anchor = selected ?? cityPlaces[0] ?? places[0];
  if (!initialRegionRef.current && anchor) {
    initialRegionRef.current = {
      latitude: anchor.latitude,
      longitude: anchor.longitude,
      latitudeDelta: 0.07,
      longitudeDelta: 0.07,
    };
  }

  const totalCheckedIn = useMemo(
    () => cityPlaces.reduce((sum, p) => sum + (p.checkedInCount || 0), 0),
    [cityPlaces],
  );
  const activePeople = activeOnMap ?? totalCheckedIn;

  const renderCard = useCallback(
    ({ item }: ListRenderItemInfo<PlaceWithStats>) => (
      <PlaceCard
        place={item}
        label={labelFor(item)}
        width={CARD_WIDTH}
        regulars={previews[item.id] ?? NO_REGULARS}
        distanceKm={distanceTo(item)}
        onPress={openPlace}
        onPressRegulars={openRegulars}
      />
    ),
    [distanceTo, labelFor, openPlace, openRegulars, previews],
  );

  const keyExtractor = useCallback((item: PlaceWithStats) => item.id, []);

  // Only an empty catalogue takes the map off screen. An empty *filter* keeps
  // the map mounted and swaps the strip for a notice, so the whole screen no
  // longer blinks out when "Şu an dolu" matches nothing.
  if (places.length === 0) {
    const loading = !ready || syncStatus === 'syncing';
    return (
      <View style={[styles.screen, styles.center]}>
        {loading ? <ActivityIndicator color={colors.ink} /> : null}
        <Text style={styles.loadingText}>
          {loading ? syncMessage || 'Mekanlar yükleniyor…' : 'Mekan bulunamadı'}
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
        showsUserLocation={locationGranted}
        showsMyLocationButton={false}
        showsCompass={false}
        mapPadding={mapPadding}
        initialRegion={initialRegionRef.current ?? undefined}
        onRegionChangeComplete={onRegionSettled}
      >
        {markerPlaces.map((place) => {
          const active = place.id === selectedId;
          return (
            <PlaceMarker
              key={place.id}
              place={place}
              active={active}
              onSelect={focusPlace}
            />
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
              {cityPlaces.length > 0 ? `${cityPlaces.length} mekan içinde ara` : 'Mekan ara'}
            </Text>
          </PressableScale>

          <View style={styles.cityPill}>
            <LiveDot
              size={7}
              color={syncStatus === 'error' ? colors.danger : syncStatus === 'syncing' ? colors.amber : colors.green}
              pulse={syncStatus !== 'error' && syncStatus !== 'syncing'}
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
          {checkInAccess ? (
            <Chip
              label={checkInAccess.hasUnlimited ? 'Pro · Sınırsız' : `${checkInAccess.freeRemaining} ücretsiz hak`}
              icon={checkInAccess.hasUnlimited ? 'infinite' : 'ticket-outline'}
              active
            />
          ) : null}
          {SUPPORTED_CITIES.map((city) => (
            <Chip
              key={city.key}
              label={city.label}
              icon="location-outline"
              active={selectedCity === city.key}
              onPress={() => selectCity(city.key)}
            />
          ))}
          {FILTERS.map((f) => (
            <Chip
              key={f.key}
              label={f.label}
              icon={f.icon}
              active={filter === f.key}
              onPress={() => {
                if (filter === f.key) return;
                haptic('select');
                resetToFirstRef.current = true;
                // Ask for/acquire location before changing the map data. This
                // avoids replacing marker/list trees in the same frame as the
                // native permission controller is presented.
                if (f.key === 'near' && !userCoords) {
                  void goToMyLocation();
                  return;
                }
                setFilter(f.key);
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
            <LiveDot size={8} />
            <View style={{ flex: 1 }}>
              <Text style={styles.activeTitle} numberOfLines={1}>
                {labelFor(activePlace)} · check‑in aktif
              </Text>
              <Text style={styles.activeSub}>Sohbete dön</Text>
            </View>
            <Ionicons name="chatbubble-ellipses" size={18} color={colors.white} />
          </PressableScale>
        </Animated.View>
      ) : null}

      <View
        style={[styles.fabCol, { bottom: carouselBottom + carouselHeight + 10 }]}
        pointerEvents="box-none"
      >
        <PressableScale
          style={styles.fabLight}
          disabled={locBusy}
          onPress={() => void goToMyLocation()}
          accessibilityRole="button"
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
          accessibilityRole="button"
          accessibilityLabel="Mekan öner"
        >
          <Ionicons name="add" size={26} color={colors.white} />
        </PressableScale>
      </View>

      <Animated.View
        entering={FadeIn.delay(160).duration(duration.slow)}
        style={[styles.carousel, { bottom: carouselBottom }]}
        onLayout={onCarouselLayout}
        pointerEvents="box-none"
      >
        {displayedPlaces.length === 0 ? (
          <View style={styles.emptyStrip}>
            <Ionicons name="cafe-outline" size={20} color={colors.muted} />
            <Text style={styles.emptyStripText}>
              {filter === 'live'
                ? 'Şu an kimsenin check‑in yapmadığı bir an. Tüm mekanlara göz at.'
                : 'Bu filtreye uyan mekan yok.'}
            </Text>
            <Chip
              label="Tüm mekanlar"
              icon="grid-outline"
              onPress={() => {
                resetToFirstRef.current = true;
                setFilter('all');
              }}
            />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            horizontal
            data={displayedPlaces}
            keyExtractor={keyExtractor}
            showsHorizontalScrollIndicator={false}
            snapToInterval={SNAP}
            snapToAlignment="start"
            disableIntervalMomentum
            decelerationRate="fast"
            getItemLayout={getItemLayout}
            style={styles.carouselList}
            contentContainerStyle={styles.carouselContent}
            onMomentumScrollEnd={onMomentumScrollEnd}
            onScrollEndDrag={onScrollEndDrag}
            removeClippedSubviews={false}
            initialNumToRender={3}
            maxToRenderPerBatch={3}
            windowSize={5}
            renderItem={renderCard}
          />
        )}
      </Animated.View>

      <RegularsSheet
        visible={regularsOpen}
        placeName={regularsPlace ? labelFor(regularsPlace) : undefined}
        regulars={regulars}
        onClose={() => setRegularsOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center', gap: 12, padding: spacing.lg },
  loadingText: {
    fontFamily: 'DMSans_500Medium',
    color: colors.muted,
    textAlign: 'center',
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

  // Reserve room for the count badge and shadow inside Android's bitmap bounds.
  markerStack: { paddingHorizontal: 8, paddingVertical: 5, alignItems: 'center' },
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
  emptyStrip: {
    marginHorizontal: SIDE_PAD,
    marginTop: 16,
    marginBottom: 20,
    alignItems: 'center',
    gap: 10,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.white,
    ...shadows.lifted,
  },
  emptyStripText: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 13.5,
    lineHeight: 19,
    color: colors.muted,
    textAlign: 'center',
  },
  carouselContent: {
    paddingLeft: SIDE_PAD,
    paddingRight: CARD_TAIL_PAD,
    gap: CARD_GAP,
    paddingTop: 16,
    // Room for the card's drop shadow, which is not clipped by the strip.
    paddingBottom: 20,
  },
});
