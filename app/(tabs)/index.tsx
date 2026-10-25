import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  BackHandler,
  Platform,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type AppStateStatus,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT, type Region } from 'react-native-maps';
import Animated, { FadeIn, FadeInDown, FadeOut, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PressableScale } from '@/components/Motion';
import { LiveDot } from '@/components/LiveDot';
import { afterSheetClose, Sheet } from '@/components/Sheet';
import { Button } from '@/components/ui';
import { MapPlacesPanel } from '@/components/MapPlacesPanel';
import { PeopleMapPanel, PeopleMarker } from '@/components/PeopleMapPanel';
import { DiscoveryHeader, type DiscoveryMode } from '@/components/DiscoveryHeader';
import { discoveryDemoPeople } from '@/data/discoveryDemo';
import { useSocialQuery } from '@/hooks/useSocialQuery';
import { shortPlaceName } from '@/lib/placeLabel';
import { MAP_CITY_KEY } from '@/lib/mapCity';
import { sortByPriorities } from '@/lib/onboardingQuiz';
import { hasPhotoAccess } from '@/lib/placePhotos';
import { groupPeopleAtVenues, pageOf, type SocialPerson, type SocialPreferences } from '@/lib/socialDiscovery';
import { tabBarSpace } from '@/components/TabBar';
import { useApp } from '@/context/AppContext';
import { usePlaces } from '@/context/PlacesContext';
import { cityKey, nearestSupportedCityKey, SUPPORTED_CITIES, type CityKey } from '@/data/cities';
import type { PlaceWithStats } from '@/data/types';
import { useActivePeople } from '@/hooks/useActivePeople';
import { haptic } from '@/lib/haptics';
import { hasValidCoordinates } from '@/lib/placeData';
import { mapPanelHeight } from '@/lib/mapPanelLayout';
import { clusterPoints, clusterPinOffsets, clusterArtworkCoordinate, mapItemCoordinate, separateIdenticalPoints, type MapCluster, type MapViewport } from '@/lib/mapClusters';
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

/** How long the map has to sit still before we re-count presence around it. */
const PRESENCE_COUNT_DEBOUNCE_MS = 450;
const MARKER_ANCHOR = { x: 0.5, y: 0.5 };
/** Pin caption height; mirrored as top padding so the anchor stays on the icon. */
const MARKER_LABEL_H = 16;
/** Label centre below the venue: half the pin (≈24) plus a small gap. */
const LABEL_OFFSET_Y = 34;
/**
 * Rendering every custom marker at once can exhaust MapKit while a filter
 * replaces the marker tree (Istanbul currently has close to 200 places). Keep
 * the complete list, but only mount the markers closest to the current map
 * focus. Selection and an active check-in are always retained.
 */
const MAX_MAP_MARKERS = 48;
/** Zoomed out, venues are small dots, so far more of them fit on the map. */
const MAX_PLACE_DOTS = 160;
/** Screen cells (pt) that hold at most one dot / one pin, so markers cover the map evenly. */
const DOT_CELL_PT = 14;
const PIN_CELL_PT = 40;
/** Degrees of longitude shown when a city is opened. */
const CITY_LNG_DELTA = 0.18;
/** See `paintEpoch`: markers are remounted once this long after the map is ready. */
const MARKER_REPAINT_AFTER_MS = 1500;
/** A new marker redraws for this long, so its snapshot is never taken half laid out. */
const MARKER_FIRST_TRACK_MS = 700;
/**
 * Narrower than this (degrees of longitude across the map, ~6 km), dots become
 * full pins. "Yakınımda" lands at ~0.05 once the header and panel pad the map,
 * and should already show named pins.
 */
/** After a city change, when the camera is read back (the move animates for 420 ms). */
const CITY_SETTLE_MS = 700;
const PIN_ZOOM_LNG_DELTA = 0.07;
/** Set after the map's one location prompt (see the initial location effect). */
const LOCATION_ASKED_KEY = 'raslash.mapLocationAsked';
function rememberCity(key: CityKey) {
  AsyncStorage.setItem(MAP_CITY_KEY, key).catch(() => undefined);
}
/**
 * Switching Mekânlar/Kişiler swaps up to 48 custom native markers. Doing that in
 * the same commit as the panel swap froze the UI, so the panel changes first and
 * the new markers are mounted in small groups on later frames.
 */
const MARKER_BATCH_SIZE = 12;
const MARKER_BATCH_INTERVAL_MS = 48;
/** Active check-in banner: offset below the safe area, and its height before it is measured. */
const ACTIVE_BANNER_TOP = 130;
const ACTIVE_BANNER_FALLBACK_HEIGHT = 62;
/** Re-cluster only after the zoom changes by more than ~15%. */
const MARKER_REZOOM_LOG_THRESHOLD = Math.log(1.15);
/** "Yakınımda" only lists places this close; beyond it the area counts as empty. */
const NEARBY_LIMIT_KM = 10;

type Coords = { latitude: number; longitude: number };
type FilterKey = 'all' | 'near' | 'live' | 'top';
const NO_PAYLOAD: Record<string, unknown> = {};

const FILTERS: { key: FilterKey; label: string; icon: IconName }[] = [
  { key: 'all', label: 'Tümü', icon: 'apps-outline' },
  { key: 'near', label: 'Yakınımda', icon: 'navigate-outline' },
  { key: 'live', label: 'Şu an dolu', icon: 'people-outline' },
  { key: 'top', label: 'En iyi puan', icon: 'star-outline' },
];

type IconName = keyof typeof Ionicons.glyphMap;
type MenuChoice = { label: string; icon: IconName; selected: boolean; run: () => void };

/** Keep the native marker mounted while its artwork changes. Remounting a
 * selected marker during a Fabric map transaction can crash Apple Maps. Only
 * briefly track the view after a visual change, so normal panning stays cheap.
 */
/** Zoomed-out venue: a small dot at its own spot; green while people are there. */
const PlaceDot = memo(function PlaceDot({ place, onSelect }: {
  place: PlaceWithStats;
  onSelect: (place: PlaceWithStats) => void;
}) {
  // Track the first layout on both platforms: a marker snapshotted before its
  // view had laid out showed up blank or half drawn on iOS.
  const [tracksViewChanges, setTracksViewChanges] = useState(true);
  useEffect(() => {
    const timeout = setTimeout(() => setTracksViewChanges(false), MARKER_FIRST_TRACK_MS);
    return () => clearTimeout(timeout);
  }, []);
  return (
    <Marker
      coordinate={{ latitude: place.latitude, longitude: place.longitude }}
      onPress={() => onSelect(place)}
      tracksViewChanges={tracksViewChanges}
      anchor={{ x: 0.5, y: 0.5 }}
      zIndex={place.checkedInCount > 0 ? 6 : 5}
      title={place.name}
    >
      <View style={styles.dotBounds}>
        <View style={[styles.dot, place.checkedInCount > 0 && styles.dotLive]} />
      </View>
    </Marker>
  );
});

/**
 * A venue's short name as its own marker, just below its pin. Separate from
 * the pin so the pin's tap area stays the size of the icon; tapping the name
 * opens the same venue.
 */
const PlaceLabel = memo(function PlaceLabel({ place, active, latitude, longitude, onSelect }: {
  place: PlaceWithStats;
  active: boolean;
  latitude: number;
  longitude: number;
  onSelect: (place: PlaceWithStats) => void;
}) {
  const [tracksViewChanges, setTracksViewChanges] = useState(true);
  useEffect(() => {
    const timeout = setTimeout(() => setTracksViewChanges(false), MARKER_FIRST_TRACK_MS);
    return () => clearTimeout(timeout);
  }, []);
  return (
    <Marker
      coordinate={{ latitude, longitude }}
      onPress={() => onSelect(place)}
      tracksViewChanges={tracksViewChanges}
      // Below the pin: Apple Maps positions by centre offset (points), Google by anchor.
      centerOffset={{ x: 0, y: LABEL_OFFSET_Y }}
      anchor={{ x: 0.5, y: -LABEL_OFFSET_Y / MARKER_LABEL_H + 0.5 }}
      zIndex={active ? 99 : 9}
    >
      <Text style={[styles.markerLabel, active && styles.markerLabelActive]} numberOfLines={1} allowFontScaling={false}>
        {shortPlaceName(place.name)}
      </Text>
    </Marker>
  );
});

const PlaceMarker = memo(function PlaceMarker({
  place,
  active,
  onSelect,
  latitude = place.latitude,
  longitude = place.longitude,
}: {
  place: PlaceWithStats;
  active: boolean;
  onSelect: (place: PlaceWithStats) => void;
  /** Where the pin is drawn; differs from the venue only when overlapping pins are fanned out. */
  latitude?: number;
  longitude?: number;
}) {
  // Android rasterizes custom markers. Keep tracking through their first font/layout
  // pass, then stop to avoid a continuous redraw cost across dozens of places.
  const [tracksViewChanges, setTracksViewChanges] = useState(true);
  const visualState = `${active}:${place.checkedInCount}`;
  const previousVisualState = useRef(visualState);

  // First layout tracked on both platforms (see PlaceDot).
  useEffect(() => {
    const timeout = setTimeout(() => setTracksViewChanges(false), MARKER_FIRST_TRACK_MS);
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
      coordinate={{ latitude, longitude }}
      onPress={() => onSelect(place)}
      tracksViewChanges={tracksViewChanges}
      anchor={MARKER_ANCHOR}
      zIndex={active ? 100 : 10}
    >
      <View style={styles.markerStack}>
        <View>
        <View style={[styles.marker, place.checkedInCount > 0 && styles.markerLive, active && styles.markerActive]}>
          <Ionicons name="laptop-outline" size={active ? 24 : 18} color={active ? colors.white : colors.ink} />
          {place.checkedInCount > 0 ? (
            <View style={styles.markerCount}>
              <Text style={styles.markerCountText} allowFontScaling={false}>{place.checkedInCount}</Text>
            </View>
          ) : null}
        </View>
        {isPopularPlace(place) ? (
          <View style={styles.markerFlame}>
            <Ionicons name="flame" size={10} color={colors.amber} />
          </View>
        ) : null}
        </View>
      </View>
    </Marker>
  );
});

function clusterSize(count: number) {
  const size = count >= 20 ? 52 : count >= 8 ? 48 : 44;
  return { width: size, height: size, borderRadius: size / 2 };
}

/** Several overlapping places shown as one pin; tapping zooms in to split them. */
type ClusterPoint = { id: string; latitude: number; longitude: number };
const ClusterMarker = memo(function ClusterMarker<T extends ClusterPoint>({ cluster, onSelect, count = cluster.members.length,
  people = false, demo = false, viewport, offset = { x: 0, y: 0 } }: {
  cluster: MapCluster<T>;
  onSelect: (cluster: MapCluster<T>) => void;
  count?: number; people?: boolean; demo?: boolean; offset?: { x: number; y: number };
  viewport: MapViewport | null;
}) {
  const [tracksViewChanges, setTracksViewChanges] = useState(Platform.OS === 'android');
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const timeout = setTimeout(() => setTracksViewChanges(false), 900);
    return () => clearTimeout(timeout);
  }, []);
  const live = !demo && (people || cluster.members.some((point) => 'checkedInCount' in point && Number(point.checkedInCount) > 0));
  const offsetLength = Math.hypot(offset.x, offset.y);
  const coordinate = clusterArtworkCoordinate(cluster, viewport, offset);
  const visualState = `${count}:${live}:${offset.x}:${offset.y}`;
  const previousVisualState = useRef(visualState);
  useEffect(() => {
    if (previousVisualState.current === visualState) return;
    previousVisualState.current = visualState;
    setTracksViewChanges(true);
    const timeout = setTimeout(() => setTracksViewChanges(false), 450);
    return () => clearTimeout(timeout);
  }, [visualState]);
  return (<>
    {offsetLength > 0 ? <Polyline coordinates={[{ latitude: cluster.latitude, longitude: cluster.longitude }, coordinate]}
      strokeColor={colors.inkSoft} strokeWidth={1.5} tappable={false} /> : null}
    <Marker
      coordinate={coordinate}
      onPress={() => onSelect(cluster)}
      tracksViewChanges={tracksViewChanges}
      anchor={MARKER_ANCHOR}
      title={people ? `${demo ? 'Örnek profiller · ' : ''}${count} görünür kişi · ${cluster.members.length} mekân` : `${count} mekân`}
      zIndex={20}
    >
      <View collapsable={false} style={styles.markerStack}>
        <View style={[styles.marker, styles.cluster, clusterSize(count)]}>
          <Text style={styles.clusterText} allowFontScaling={false}>{count}</Text>
          {live ? <View style={styles.clusterLive} /> : null}
        </View>
      </View>
    </Marker>
  </>);
});

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const { height: screenHeight, width: screenWidth } = useWindowDimensions();
  const { user, isSubscribed, isAdmin, profile } = useApp();
  const {
    ready,
    places,
    activeCheckIn,
    getPlace,
    labelFor,
    syncStatus,
    syncMessage,
  } = usePlaces();

  const mapRef = useRef<MapView>(null);
  const [selectedId, setSelectedId] = useState<string>();
  const [detailContentHeight, setDetailContentHeightState] = useState(0);
  const [peopleContentHeight, setPeopleContentHeightState] = useState(0);
  const setPeopleContentHeight = useCallback((next: number) => {
    setPeopleContentHeightState((current) => (Math.abs(current - next) > 1 ? Math.ceil(next) : current));
  }, []);
  // Rounded and thresholded so sub-pixel layout passes don't re-render the sheet.
  const setDetailContentHeight = useCallback((next: number) => {
    setDetailContentHeightState((current) => (Math.abs(current - next) > 1 ? Math.ceil(next) : current));
  }, []);
  const [panelExpanded, setPanelExpanded] = useState(false);
  // The places list dragged down to its header, so the map is free.
  const [placesCollapsed, setPlacesCollapsed] = useState(false);
  const [peopleCollapsed, setPeopleCollapsed] = useState(false);
  const [selectedCity, setSelectedCity] = useState<CityKey>('istanbul');
  const [mapMode, setMapMode] = useState<'places' | 'people'>('places');
  const [peopleCursor, setPeopleCursor] = useState<string>();
  const [peopleVenue, setPeopleVenue] = useState<string>();
  // Explicit, local design preview. Never substitute fake rows into live discovery.
  const [peopleDemo, setPeopleDemo] = useState(false);
  const [mapMenu, setMapMenu] = useState<{ title: string; choices: MenuChoice[] } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => { setPeopleDemo(false); setPeopleVenue(undefined); setPeopleCollapsed(false); }, [user?.id]);
  useFocusEffect(useCallback(() => () => {
    setPeopleDemo(false); setPeopleVenue(undefined); setPeopleCollapsed(false); setMenuOpen(false);
  }, []));
  const peopleQuery = useSocialQuery<{ people: SocialPerson[] }>('discover',
    { city: selectedCity, after: peopleCursor }, mapMode === 'people' && !peopleDemo);
  const peoplePage = pageOf(peopleQuery.data?.people ?? []);
  // Only the footer's "Görünürlüğün: Açık/Kapalı" reads this; poll it slowly.
  const visibilityQuery = useSocialQuery<SocialPreferences>('preferences', NO_PAYLOAD, mapMode === 'people' && !peopleDemo, 60000);
  const [userCoords, setUserCoords] = useState<Coords | null>(null);
  // Pro (same rule as venue photos) opens every person card's profile.
  const profileAccess = hasPhotoAccess({ isSubscribed, isAdmin, appReviewAccess: user?.app_metadata?.app_review_access });
  const [filter, setFilter] = useState<FilterKey>('all');
  const [activeOnMap, setActiveOnMap] = useState<number | null>(null);
  const [locBusy, setLocBusy] = useState(false);
  const [locationGranted, setLocationGranted] = useState(false);
  const [mapCenter, setMapCenter] = useState<Coords | null>(null);
  // Zoom level for clustering; only updated when it changes noticeably.
  const [mapZoom, setMapZoom] = useState<{ longitudeDelta: number; latitude: number } | null>(null);
  const [checkInAccess, setCheckInAccess] = useState<CheckInAccessStatus | null>(null);
  const [activeBannerHeight, setActiveBannerHeight] = useState(0);
  const canPreviewPeople = __DEV__ || isAdmin || checkInAccess?.accessTier === 'app_review';
  useEffect(() => { if (!canPreviewPeople) setPeopleDemo(false); }, [canPreviewPeople]);
  const locBusyRef = useRef(false);
  const cityWasSelectedManuallyRef = useRef(false);

  const cityPlaces = useMemo(
    () => places.filter((place) => cityKey(place.city) === selectedCity),
    [places, selectedCity],
  );
  // While no member is visible in the city, everyone sees clearly labelled
  // sample profiles instead of an empty map. They are never presented as real
  // people: every card, pin and the preview says "Örnek profil", and they
  // cannot be messaged. The first real visible member replaces them.
  const noRealPeople = !peopleQuery.loading && !peopleQuery.error && !!peopleQuery.data
    && peopleQuery.data.people.length === 0 && !peopleCursor && !peopleVenue;
  const sampleMode = peopleDemo || noRealPeople;
  const demoPeople = useMemo(() => sampleMode ? discoveryDemoPeople(cityPlaces) : [], [cityPlaces, sampleMode]);
  const visiblePeople = sampleMode ? demoPeople : peoplePage.items;
  const peopleGroups = useMemo(() => groupPeopleAtVenues(sampleMode ? demoPeople : peopleQuery.data?.people.slice(0, 50) ?? []),
    [sampleMode, demoPeople, peopleQuery.data]);

  const displayedPlaces = useMemo(() => {
    let list = [...cityPlaces];
    if (filter === 'live') list = list.filter((p) => p.checkedInCount > 0);
    // Weighted by what this member said matters in onboarding (Wi‑Fi, prizler…).
    if (filter === 'top') list = sortByPriorities(list, profile.workPreferences?.priorities);
    if (filter === 'near' && userCoords) {
      // A sorted list of places 40 km away reads as "nearby"; cut it off and
      // let the panel say the area has nothing yet instead.
      list = list
        .filter((p) => haversineKm(userCoords, { latitude: p.latitude, longitude: p.longitude }) <= NEARBY_LIMIT_KM)
        .sort(
          (a, b) =>
            haversineKm(userCoords, { latitude: a.latitude, longitude: a.longitude }) -
            haversineKm(userCoords, { latitude: b.latitude, longitude: b.longitude }),
        );
    }
    return list;
  }, [cityPlaces, filter, profile.workPreferences?.priorities, userCoords]);

  const applyCitySelection = useCallback((key: CityKey) => {
    setSelectedCity(key);
    // The venues drawn are picked around the map centre. A programmatic move
    // does not always report back, which left a new city without a single dot
    // until the map was dragged; start from the city's centre and zoom instead.
    const city = SUPPORTED_CITIES.find((item) => item.key === key);
    if (city) {
      setMapCenter({ latitude: city.latitude, longitude: city.longitude });
      setMapZoom({ longitudeDelta: CITY_LNG_DELTA, latitude: city.latitude });
    }
    setPeopleCursor(undefined);
    setPeopleVenue(undefined);
    setPeopleCollapsed(false);
    setSelectedId(undefined);
    setPanelExpanded(false);
    setActiveOnMap(null);
  }, []);

  const animateToCity = useCallback((key: CityKey) => {
    const city = SUPPORTED_CITIES.find((item) => item.key === key);
    if (!city) return;
    mapRef.current?.animateToRegion(
      {
        latitude: city.latitude,
        longitude: city.longitude,
        latitudeDelta: CITY_LNG_DELTA,
        longitudeDelta: CITY_LNG_DELTA,
      },
      420,
    );
  }, []);

  const selectCity = useCallback(
    (key: CityKey) => {
      cityWasSelectedManuallyRef.current = true;
      rememberCity(key);
      applyCitySelection(key);
      animateToCity(key);
    },
    [animateToCity, applyCitySelection],
  );

  // Reopen the remembered city until the location (if any) says otherwise.
  const locatedCityRef = useRef(false);
  // The map waits for this (a few ms) so it opens on the remembered city
  // instead of İstanbul: an animation sent before the map is ready is dropped.
  const [cityRestored, setCityRestored] = useState(false);
  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(MAP_CITY_KEY).then((stored) => {
      const city = SUPPORTED_CITIES.find((item) => item.key === stored)?.key;
      if (!live || !city || locatedCityRef.current || cityWasSelectedManuallyRef.current) return;
      applyCitySelection(city);
    }).catch(() => undefined).finally(() => { if (live) setCityRestored(true); });
    return () => { live = false; };
  }, [applyCitySelection]);

  const regionRef = useRef<Region | null>(null);

  // A city chosen before the map was ready (location arriving early) or while
  // it was off screen still gets shown once the map can move.
  const [mapReady, setMapReady] = useState(false);
  // Markers added while the app is still busy starting up can be snapshotted
  // before their view is drawn and stay invisible until the map is dragged.
  // Remount them once, after the map has had a moment to settle.
  const [paintEpoch, setPaintEpoch] = useState(0);
  useEffect(() => {
    if (!mapReady) return;
    const timer = setTimeout(() => setPaintEpoch(1), MARKER_REPAINT_AFTER_MS);
    return () => clearTimeout(timer);
  }, [mapReady]);
  useEffect(() => {
    if (!mapReady) return;
    const shown = regionRef.current ?? initialRegionRef.current;
    if (shown && nearestSupportedCityKey(shown) === selectedCity) return;
    animateToCity(selectedCity);
  }, [animateToCity, mapReady, selectedCity]);
  // A programmatic move does not always report `onRegionChangeComplete`, and
  // the venue window then stayed on the previous city (no dots in Ankara until
  // the map was dragged). Read where the camera actually is once it settles.
  const syncMapCentre = useCallback(() => {
    void mapRef.current?.getCamera().then(({ center }) => {
      if (!hasValidCoordinates(center)) return;
      setMapCenter((previous) => previous
        && Math.abs(previous.latitude - center.latitude) < 1e-4
        && Math.abs(previous.longitude - center.longitude) < 1e-4
        ? previous : { latitude: center.latitude, longitude: center.longitude });
    }).catch(() => { /* Keep the previous centre. */ });
  }, []);

  const selected = useMemo(
    () => displayedPlaces.find((p) => p.id === selectedId),
    [displayedPlaces, selectedId],
  );
  const ownCheckIn = user?.id && activeCheckIn?.userId === user.id ? activeCheckIn : null;
  const activePlace = ownCheckIn ? getPlace(ownCheckIn.placeId) : null;
  const checkedInPeople = useActivePeople(ownCheckIn?.placeId);

  useEffect(() => {
    if (selectedId && !displayedPlaces.some((place) => place.id === selectedId)) setSelectedId(undefined);
  }, [displayedPlaces, selectedId]);

  useFocusEffect(useCallback(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (selectedId) { setSelectedId(undefined); return true; }
      if (panelExpanded) { setPanelExpanded(false); return true; }
      if (mapMode === 'people' && !peopleCollapsed) { setPeopleCollapsed(true); return true; }
      return false;
    });
    return () => sub.remove();
  }, [panelExpanded, selectedId, mapMode, peopleCollapsed]));

  const clusterViewport = useMemo(() => mapZoom ? { ...mapZoom, width: screenWidth } : null, [mapZoom, screenWidth]);
  // Venues are never merged into count bubbles. Zoomed out every venue is a
  // small dot at its own spot; zoomed in they become full pins. Only venues in
  // (and just around) the visible area are drawn, nearest to the centre first.
  const dotMode = !mapZoom || mapZoom.longitudeDelta > PIN_ZOOM_LNG_DELTA;
  const placeMarkers = useMemo(() => {
    const priorityIds = new Set([selected?.id, activePlace?.id].filter((id): id is string => Boolean(id)));
    const focus = mapCenter
      ?? (filter === 'near' && userCoords ? userCoords : null)
      ?? (selected ? { latitude: selected.latitude, longitude: selected.longitude } : null);
    let list = displayedPlaces;
    if (focus && mapZoom) {
      const lngPerPoint = mapZoom.longitudeDelta / screenWidth;
      const halfLng = (screenWidth / 2) * lngPerPoint * 2;
      const halfLat = (screenHeight / 2) * lngPerPoint * Math.cos(mapZoom.latitude * Math.PI / 180) * 2;
      list = list.filter((place) => priorityIds.has(place.id)
        || (Math.abs(place.latitude - focus.latitude) < halfLat && Math.abs(place.longitude - focus.longitude) < halfLng));
    }
    const limit = dotMode ? MAX_PLACE_DOTS : MAX_MAP_MARKERS;
    // One marker per small screen cell, so the budget covers the whole map
    // instead of running out around the centre (Ankara has 700+ venues and
    // whole districts used to stay empty). Live, then rated venues win a cell.
    if (mapZoom && list.length > limit) {
      const cellPt = dotMode ? DOT_CELL_PT : PIN_CELL_PT;
      const lngCell = (mapZoom.longitudeDelta / screenWidth) * cellPt;
      const latCell = lngCell * Math.cos(mapZoom.latitude * Math.PI / 180);
      const ranked = [...list].sort((a, b) => Number(priorityIds.has(b.id)) - Number(priorityIds.has(a.id))
        || b.checkedInCount - a.checkedInCount || b.reviewCount - a.reviewCount);
      const taken = new Set<string>();
      list = ranked.filter((place) => {
        if (priorityIds.has(place.id)) return true;
        const cell = `${Math.floor(place.latitude / latCell)}:${Math.floor(place.longitude / lngCell)}`;
        if (taken.has(cell)) return false;
        taken.add(cell);
        return true;
      });
    }
    if (list.length <= limit) return list;
    const priority = list.filter((place) => priorityIds.has(place.id));
    const rest = list.filter((place) => !priorityIds.has(place.id));
    if (focus) rest.sort((a, b) => haversineKm(focus, a) - haversineKm(focus, b));
    return [...priority, ...rest].slice(0, limit);
  }, [activePlace?.id, displayedPlaces, dotMode, filter, mapCenter, mapZoom, screenHeight, screenWidth, selected, userCoords]);

  // Venues sharing the exact same coordinate get a fixed few-metre offset so
  // each stays tappable. It never depends on zoom, so pins never jump.
  const pinSpread = useMemo(() => separateIdenticalPoints(placeMarkers), [placeMarkers]);

  // Names under pins only where they fit: in the simulator a dense Kadıköy turned
  // into overlapping captions over other pins. A label (≈112×18 pt under its
  // icon) is kept only if it clears every pin and the labels already placed;
  // the selected place, live places and rated places claim space first.
  const labeledIds = useMemo(() => {
    const shown = new Set<string>();
    if (dotMode || !mapZoom || !mapCenter) return shown;
    const lngPerPoint = mapZoom.longitudeDelta / screenWidth;
    const latPerPoint = lngPerPoint * Math.cos(mapZoom.latitude * Math.PI / 180);
    const at = (place: PlaceWithStats) => {
      const spot = pinSpread.get(place.id) ?? place;
      return { x: (spot.longitude - mapCenter.longitude) / lngPerPoint, y: (mapCenter.latitude - spot.latitude) / latPerPoint };
    };
    type Box = { l: number; r: number; t: number; b: number };
    const hit = (a: Box, b: Box) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
    const icons = placeMarkers.map((place) => {
      const { x, y } = at(place);
      return { id: place.id, box: { l: x - 20, r: x + 20, t: y - 20, b: y + 20 } };
    });
    const order = [...placeMarkers].sort((a, b) =>
      Number(b.id === selectedId) - Number(a.id === selectedId)
      || b.checkedInCount - a.checkedInCount || b.reviewCount - a.reviewCount);
    const placed: Box[] = [];
    for (const place of order) {
      const { x, y } = at(place);
      const label = { l: x - 56, r: x + 56, t: y + 22, b: y + 40 };
      if (icons.some((icon) => icon.id !== place.id && hit(icon.box, label))) continue;
      if (placed.some((box) => hit(box, label))) continue;
      placed.push(label);
      shown.add(place.id);
    }
    return shown;
  }, [dotMode, mapCenter, mapZoom, pinSpread, placeMarkers, screenWidth, selectedId]);

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

  const distanceToPoint = useCallback(
    (point: { latitude: number; longitude: number }) => (userCoords ? haversineKm(userCoords, point) : null),
    [userCoords],
  );
  const distanceTo = useCallback(
    (place: PlaceWithStats) =>
      userCoords
        ? haversineKm(userCoords, { latitude: place.latitude, longitude: place.longitude })
        : null,
    [userCoords],
  );

  // The detail sheet shows the same place; leaving the map card open under it
  // made the two cards stack while the sheet was dismissed.
  const openPlace = useCallback((place: PlaceWithStats) => {
    setSelectedId(undefined);
    router.push(`/place/${place.id}`);
  }, []);

  const joinPlace = useCallback((place: PlaceWithStats) => {
    setSelectedId(undefined);
    if (place.id === ownCheckIn?.placeId) {
      router.push(`/chat/${place.id}`);
    } else {
      // Reuse the existing permission, distance, confirmation and quota gates.
      router.push({ pathname: '/place/[id]', params: { id: place.id, intent: 'checkin' } });
    }
  }, [ownCheckIn?.placeId]);

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
  // Zoom for clustering: only the horizontal span is reliable (the latitude
  // bounds MapKit reports cover just the padded strip between header and panel;
  // see MapViewport). Also runs on map ready, because the initial region never
  // fires onRegionChangeComplete.
  const readMapZoom = useCallback(() => {
    void mapRef.current?.getMapBoundaries().then(({ northEast, southWest }) => {
      const longitudeDelta = northEast.longitude - southWest.longitude;
      const latitude = (northEast.latitude + southWest.latitude) / 2;
      if (!(longitudeDelta > 0) || !Number.isFinite(latitude)) return;
      setMapZoom((previous) => previous &&
        Math.abs(Math.log(previous.longitudeDelta / longitudeDelta)) < MARKER_REZOOM_LOG_THRESHOLD
        ? previous : { longitudeDelta, latitude });
    }).catch(() => { /* Keep the previous clustering zoom. */ });
  }, []);

  useEffect(() => {
    if (!mapReady) return;
    const timer = setTimeout(() => { syncMapCentre(); readMapZoom(); }, CITY_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [mapReady, readMapZoom, selectedCity, syncMapCentre]);

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
      // Follow the centre on every real move, but ignore MapKit's sub-pixel
      // jitter between settles. Exact equality here churned the marker window on
      // the tiniest reported delta; because new markers now track their first
      // layout on iOS too, that remounted dozens of tracking markers over and
      // over and froze the screen. The epsilon scales with zoom (a fixed one was
      // wider than the whole map when zoomed in) and stays far smaller than the
      // one-screen padding the venue filter already keeps, so nothing on screen
      // is dropped.
      const centreJitter = r.longitudeDelta / 50;
      setMapCenter((previous) => {
        if (
          previous &&
          Math.abs(previous.latitude - r.latitude) < centreJitter &&
          Math.abs(previous.longitude - r.longitude) < centreJitter
        ) {
          return previous;
        }
        return { latitude: r.latitude, longitude: r.longitude };
      });
      readMapZoom();
      if (countTimer.current) clearTimeout(countTimer.current);
      countTimer.current = setTimeout(() => {
        countTimer.current = null;
        void refreshActiveCount();
      }, PRESENCE_COUNT_DEBOUNCE_MS);
    },
    [readMapZoom, refreshActiveCount],
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
        // The map asks for location once, ever. iOS "Allow Once" resets to
        // "not determined" on every launch, which used to re-prompt each time;
        // after the first answer the map only checks, and "Konumum" can ask again.
        const asked = await AsyncStorage.getItem(LOCATION_ASKED_KEY).catch(() => null);
        const granted = asked
          ? (await Location.getForegroundPermissionsAsync()).status === 'granted'
          : (await requestForegroundLocationAccess()).granted;
        if (!asked) AsyncStorage.setItem(LOCATION_ASKED_KEY, '1').catch(() => undefined);
        if (!mounted) return;
        setLocationGranted(granted);
        if (!granted) return;
        const openNearestCity = (coords: Coords) => {
          const nearestCity = nearestSupportedCityKey(coords);
          if (!nearestCity || cityWasSelectedManuallyRef.current || locatedCityRef.current) return;
          locatedCityRef.current = true;
          rememberCity(nearestCity);
          applyCitySelection(nearestCity);
          animateToCity(nearestCity);
        };
        // A city only needs a coarse fix: use any recent cached one right away,
        // because a fresh GPS fix indoors often missed the timeout and the map
        // then stayed on İstanbul.
        const cached = await Location.getLastKnownPositionAsync({ maxAge: 24 * 60 * 60_000 }).catch(() => null);
        if (!mounted) return;
        if (cached) openNearestCity({ latitude: cached.coords.latitude, longitude: cached.coords.longitude });
        const pos = await getForegroundPosition({
          timeoutMs: 15_000,
          maxLastKnownAgeMs: 5 * 60_000,
          requiredLastKnownAccuracyM: 500,
        });
        if (!mounted) return;
        const coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        setUserCoords(coords);
        openNearestCity(coords);
        void beatPresence(coords);
      } catch (error) {
        console.warn('initial location load failed', error);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [animateToCity, applyCitySelection, beatPresence]);

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
    // Never zoom back out: a member who zoomed in to tap a venue keeps that
    // zoom; from further out we zoom in to a street-level view.
    const current = regionRef.current;
    const latitudeDelta = Math.min(0.03, current?.latitudeDelta ?? 0.03);
    const longitudeDelta = Math.min(0.03, current?.longitudeDelta ?? 0.03);
    mapRef.current?.animateToRegion(
      { latitude: place.latitude, longitude: place.longitude, latitudeDelta, longitudeDelta },
      ms,
    );
  }, []);

  /** A marker or a list row opens the same preview without remounting the map. */
  const focusPlace = useCallback(
    (place: PlaceWithStats) => {
      setSelectedId(place.id);
      setPanelExpanded(false);
      haptic('select');
      centreOn(place, 380);
    },
    [centreOn],
  );

  const zoomToCluster = useCallback((cluster: MapCluster<ClusterPoint>) => {
    haptic('select');
    // Frame the members, but always zoom in at least 3x so a dense cluster
    // visibly splits instead of re-forming at almost the same zoom.
    const factor = mapZoom ? Math.min(1, (mapZoom.longitudeDelta / 3) / cluster.bounds.longitudeDelta) : 1;
    mapRef.current?.animateToRegion({ ...cluster.bounds,
      latitudeDelta: cluster.bounds.latitudeDelta * factor, longitudeDelta: cluster.bounds.longitudeDelta * factor }, 380);
  }, [mapZoom]);

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
      const nearestCity = nearestSupportedCityKey(coords);
      if (nearestCity) applyCitySelection(nearestCity);
      setSelectedId(undefined);
      setPanelExpanded(false);
      setPlacesCollapsed(false);
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
  }, [applyCitySelection, beatPresence, refreshActiveCount]);

  const panelBottom = tabBarSpace(insets.bottom) + 8;
  // The active check-in banner sits under the header (top + ACTIVE_BANNER_TOP);
  // the places panel must stop below it instead of covering it when opened.
  const showActiveBanner = !!activePlace && mapMode === 'places';
  const placesReserve = showActiveBanner
    ? ACTIVE_BANNER_TOP + (activeBannerHeight || ACTIVE_BANNER_FALLBACK_HEIGHT) + 8 : undefined;
  // The open people panel fits its content; the layout table is only the upper bound.
  const peopleOpenHeight = Math.min(mapPanelHeight(screenHeight, insets.top, panelBottom, visiblePeople.length ? 'people' : 'peopleEmpty'),
    peopleContentHeight || Infinity);
  const listHeight = mapPanelHeight(screenHeight, insets.top, panelBottom, 'list', placesReserve);
  const placesPeekHeight = mapPanelHeight(screenHeight, insets.top, panelBottom, 'placesPeek', placesReserve);
  const expandedHeight = mapPanelHeight(screenHeight, insets.top, panelBottom, 'expanded', placesReserve);
  const panelHeight = mapMode === 'people'
    ? peopleCollapsed ? mapPanelHeight(screenHeight, insets.top, panelBottom, 'peoplePeek') : peopleOpenHeight
    : selected
      // The card fits its content; the old fixed share of the screen is only the upper bound.
      ? Math.max(listHeight, Math.min(mapPanelHeight(screenHeight, insets.top, panelBottom, 'detail', placesReserve),
        detailContentHeight || Infinity))
      : placesCollapsed ? placesPeekHeight
      : mapPanelHeight(screenHeight, insets.top, panelBottom, panelExpanded ? 'expanded' : 'list', placesReserve);
  const sheetPosition = useSharedValue(panelHeight);
  // Hidden once the sheet grows past the list height (expanded list, place card):
  // driven from the sheet itself, so it also hides mid-drag.
  const fabLimit = (mapMode === 'people' ? peopleOpenHeight : listHeight) + 24;
  const fabPosition = useAnimatedStyle(() => {
    const hidden = sheetPosition.value > fabLimit;
    return { bottom: panelBottom + sheetPosition.value + 10, opacity: hidden ? 0 : 1 };
  });
  // No count bubbles for people either: each venue keeps its own photo pin
  // (people are already grouped per venue, with a +N badge). Passing no
  // viewport turns clustering off.
  const personMarkers = useMemo(() => clusterPoints(peopleGroups, null).sort((a, b) => {
    if (!mapCenter) return mapItemCoordinate(a).id.localeCompare(mapItemCoordinate(b).id);
    return haversineKm(mapCenter, mapItemCoordinate(a)) - haversineKm(mapCenter, mapItemCoordinate(b));
  }).slice(0, MAX_MAP_MARKERS), [peopleGroups, mapCenter]);
  const peopleClusterOffsets = useMemo(() => clusterPinOffsets(personMarkers,
    mapZoom ? { ...mapZoom, width: screenWidth } : null, new Set(peopleVenue ? [peopleVenue] : []), 72),
  [personMarkers, mapZoom, screenWidth, peopleVenue]);
  // `markerMode` trails `mapMode`: the panel swaps immediately, the markers follow
  // once that frame has been drawn, then grow by MARKER_BATCH_SIZE per step.
  const [markerMode, setMarkerMode] = useState(mapMode);
  const [markerBudget, setMarkerBudget] = useState(MAX_PLACE_DOTS);
  const markerLimit = markerMode === 'people' ? MAX_MAP_MARKERS : MAX_PLACE_DOTS;
  useEffect(() => {
    if (markerMode === mapMode) return;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => { setMarkerBudget(MARKER_BATCH_SIZE); setMarkerMode(mapMode); });
    });
    return () => cancelAnimationFrame(frame);
  }, [mapMode, markerMode]);
  useEffect(() => {
    if (markerMode !== mapMode || markerBudget >= markerLimit) return;
    const timer = setTimeout(() => setMarkerBudget((budget) => budget + MARKER_BATCH_SIZE), MARKER_BATCH_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [mapMode, markerBudget, markerMode]);
  // The old markers stay until the new panel has painted; the selector stays
  // locked until every batch is mounted, so rapid swipes cannot queue swaps.
  const modeSwitching = markerMode !== mapMode || markerBudget <
    Math.min(markerLimit, markerMode === 'people' ? personMarkers.length : placeMarkers.length);
  const selectPeopleVenue = useCallback((placeId: string) => { setPeopleVenue(placeId); setPeopleCollapsed(false); }, []);
  useEffect(() => {
    if (peopleVenue && !peopleGroups.some((g) => g.id === peopleVenue)) setPeopleVenue(undefined);
  }, [peopleGroups, peopleVenue]);

  // Keep pins between the filters and the panel, including on small devices.
  const mapPadding = useMemo(
    () => ({ top: insets.top + 124, right: 0, bottom: panelBottom + panelHeight, left: 0 }),
    [insets.top, panelBottom, panelHeight],
  );

  // Latched once: MapView ignores later `initialRegion` changes anyway, and a
  // fresh object every render would keep marking the prop as dirty.
  const initialRegionRef = useRef<Region | null>(null);
  // Opens on the selected (remembered) city's centre, not on whichever venue
  // happens to come first in the catalogue.
  const cityCentre = SUPPORTED_CITIES.find((city) => city.key === selectedCity);
  const anchor = selected ?? cityCentre ?? cityPlaces[0] ?? places[0];
  // Not before the remembered city is read: latching the default (İstanbul)
  // left the venue window centred there after the map moved to Ankara.
  if (cityRestored && !initialRegionRef.current && anchor) {
    initialRegionRef.current = {
      latitude: anchor.latitude,
      longitude: anchor.longitude,
      latitudeDelta: 0.12,
      longitudeDelta: 0.12,
    };
  }

  const totalCheckedIn = useMemo(
    () => cityPlaces.reduce((sum, p) => sum + (p.checkedInCount || 0), 0),
    [cityPlaces],
  );
  const activePeople = activeOnMap ?? totalCheckedIn;
  const cityLabel = SUPPORTED_CITIES.find((city) => city.key === selectedCity)?.label ?? 'İstanbul';
  // The app's own sheet on both platforms: the iOS action sheet looked like
  // a system dialog that did not belong to the app.
  const choose = (title: string, choices: MenuChoice[]) => {
    setMapMenu({ title, choices });
    setMenuOpen(true);
  };
  const pickMenuChoice = (choice: MenuChoice) => {
    setMenuOpen(false);
    // A location permission prompt must not appear while the sheet's Modal is closing.
    afterSheetClose(choice.run);
  };
  const toggleDemo = () => {
    if (!canPreviewPeople) return;
    setPeopleCollapsed(false);
    setPeopleDemo((value) => !value); setPeopleVenue(undefined); setPeopleCursor(undefined);
  };
  const changeMode = (mode: DiscoveryMode) => {
    setPeopleCollapsed(false);
    setSelectedId(undefined); setPanelExpanded(false); setPeopleVenue(undefined); setMapMode(mode);
    if (mode === 'places') setPeopleDemo(false);
  };
  // "Kişileri keşfet" (Mesajlar) opens the map straight in people mode.
  const { mode: requestedMode } = useLocalSearchParams<{ mode?: string }>();
  useEffect(() => {
    if (requestedMode !== 'people' && requestedMode !== 'places') return;
    if (requestedMode !== mapMode) changeMode(requestedMode);
    router.setParams({ mode: undefined });
    // Only react to the incoming parameter, not to later mode switches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedMode]);
  const filterOptions = () => choose('Mekânları sırala', FILTERS.map((option) => ({
    label: option.label, icon: option.icon, selected: option.key === filter, run: () => {
      if (filter === option.key) return;
      haptic('select'); setSelectedId(undefined); setPanelExpanded(false);
      // "Yakınımda" also moves the map to the member and zooms in, so the list
      // and the pins describe the same area (TestFlight feedback).
      if (option.key === 'near') { void goToMyLocation(); return; }
      setFilter(option.key);
    },
  })));

  // Only an empty catalogue takes the map off screen. An empty *filter* keeps
  // the map mounted and shows a notice in the panel, so the whole screen no
  // longer blinks out when "Şu an dolu" matches nothing.
  if (!cityRestored) {
    return <View style={styles.screen} />;
  }
  if (places.length === 0) {
    const loading = !ready || syncStatus === 'syncing';
    return (
      <View style={[styles.screen, styles.center]}>
        {loading ? <ActivityIndicator color={colors.ink} /> : null}
        <Text style={styles.loadingText}>
          {loading ? syncMessage || 'Mekânlar yükleniyor…' : 'Mekân bulunamadı'}
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
        onMapReady={() => { setMapReady(true); readMapZoom(); }}
      >
        {/* Markers mount only once the map can draw them: a marker snapshots its
            view during its first moments, and one added before the map was ready
            stayed invisible until the map was dragged. */}
        {!mapReady ? null : markerMode === 'people' ? personMarkers.slice(0, markerBudget).map((item) => item.kind === 'cluster'
          ? <ClusterMarker key={`people-cluster:${item.cluster.id}`} cluster={item.cluster} people demo={sampleMode} viewport={clusterViewport}
              count={item.cluster.members.reduce((sum, group) => sum + group.people.length, 0)}
              offset={peopleClusterOffsets.get(item.cluster.id)} onSelect={zoomToCluster} />
          : <PeopleMarker key={`people:${item.point.id}`} group={item.point} demo={sampleMode} onSelect={selectPeopleVenue} />)
          : placeMarkers.slice(0, markerBudget).flatMap((place) => {
          if (dotMode && place.id !== selectedId && place.id !== activePlace?.id) {
            return [<PlaceDot key={`dot:${paintEpoch}:${place.id}`} place={place} onSelect={focusPlace} />];
          }
          const spot = pinSpread.get(place.id) ?? place;
          const pin = (
            <PlaceMarker
              key={`pin:${paintEpoch}:${place.id}`}
              place={place}
              active={place.id === selectedId}
              onSelect={focusPlace}
              latitude={spot.latitude}
              longitude={spot.longitude}
            />
          );
          return labeledIds.has(place.id) ? [pin, (
            <PlaceLabel key={`label:${paintEpoch}:${place.id}`} place={place} active={place.id === selectedId}
              latitude={spot.latitude} longitude={spot.longitude} onSelect={focusPlace} />
          )] : [pin];
        })}
      </MapView>

      <DiscoveryHeader top={insets.top} city={cityLabel} mode={mapMode} demo={mapMode === 'people' && sampleMode}
        switching={modeSwitching}
        live={syncStatus !== 'syncing' ? activePeople : 0}
        onCity={() => choose('Hangi şehirde keşfedelim?', SUPPORTED_CITIES.map((city) => ({ label: city.label, icon: 'location-outline' as const,
          selected: city.key === selectedCity, run: () => selectCity(city.key) })))}
        onSearch={() => router.push('/search')} onMode={changeMode} />

      {showActiveBanner ? (
        <Animated.View
          entering={FadeInDown.duration(duration.slow)}
          exiting={FadeOut}
          style={[styles.activeBanner, { top: insets.top + ACTIVE_BANNER_TOP }]}
          onLayout={(event) => {
            const next = Math.ceil(event.nativeEvent.layout.height);
            setActiveBannerHeight((previous) => previous === next ? previous : next);
          }}
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

      <Animated.View
        style={[styles.fabCol, fabPosition]}
        pointerEvents={panelExpanded || selected ? 'none' : 'box-none'}
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
        {/* "Mekân öner": always reachable, not only from an empty list. */}
        <PressableScale
          style={styles.fabDark}
          onPress={() => router.push('/add-place')}
          accessibilityRole="button"
          accessibilityLabel="Mekân öner"
        >
          <Ionicons name="add" size={26} color={colors.white} />
        </PressableScale>
      </Animated.View>

      <Animated.View
        entering={FadeIn.delay(160).duration(duration.slow)}
        style={[styles.mapPanel, { bottom: panelBottom }]}
        pointerEvents="box-none"
      >
        {mapMode === 'people' ? <PeopleMapPanel people={visiblePeople} loading={!sampleMode && peopleQuery.loading}
          error={sampleMode ? undefined : peopleQuery.error} height={panelHeight} ownId={user?.id} venueId={peopleVenue}
          openHeight={peopleOpenHeight} collapsed={peopleCollapsed} onCollapse={setPeopleCollapsed} position={sheetPosition}
          demo={sampleMode} onDemo={peopleDemo && canPreviewPeople ? toggleDemo : undefined} visible={visibilityQuery.data?.map_visible} hasMore={!sampleMode && peoplePage.hasMore} onRetry={peopleQuery.refresh}
          onNext={() => { setPeopleCursor(peoplePage.items.at(-1)?.id); setPeopleVenue(undefined); }}
          onAll={() => { setPeopleVenue(undefined); setPeopleCursor(undefined); if (!peopleDemo) void peopleQuery.refresh(); }}
          onContentHeight={setPeopleContentHeight} proAccess={profileAccess} distanceKm={distanceToPoint} /> : <MapPlacesPanel
          places={displayedPlaces}
          selected={selected}
          title={filter === 'near' ? 'Yakınındaki mekânlar' : `${SUPPORTED_CITIES.find((city) => city.key === selectedCity)?.label ?? ''} mekânları`}
          height={panelHeight}
          listHeight={listHeight} expandedHeight={expandedHeight} position={sheetPosition}
          peekHeight={placesPeekHeight} collapsed={placesCollapsed} onCollapse={setPlacesCollapsed}
          expanded={panelExpanded}
          activePlaceId={ownCheckIn?.placeId}
          people={checkedInPeople}
          listKey={`${selectedCity}:${filter}`}
          labelFor={labelFor}
          distanceTo={distanceTo}
          onExpand={setPanelExpanded}
          onSelect={focusPlace}
          onClose={() => setSelectedId(undefined)}
          onDetails={openPlace}
          onJoin={joinPlace}
          onResetFilter={() => { setSelectedId(undefined); setFilter('all'); }}
          onSuggest={() => router.push('/add-place')}
          sortLabel={FILTERS.find((option) => option.key === filter)?.label}
          onSort={filterOptions}
          emptyReason={filter === 'near' && userCoords ? 'nearby' : 'filter'}
          onDetailHeight={setDetailContentHeight}
        />}
      </Animated.View>
      <Sheet visible={menuOpen} onClose={() => setMenuOpen(false)} title={mapMenu?.title} scroll={false}>
        <View style={styles.menuList}>
          {mapMenu?.choices.map((choice) => (
            <PressableScale key={choice.label} onPress={() => pickMenuChoice(choice)} scaleTo={0.98}
              style={[styles.menuChoice, choice.selected && styles.menuChoiceSelected]}
              accessibilityRole="button" accessibilityState={{ selected: choice.selected }} accessibilityLabel={choice.label}>
              <View style={[styles.menuIcon, choice.selected && styles.menuIconSelected]}>
                <Ionicons name={choice.icon} size={18} color={choice.selected ? colors.white : colors.ink} />
              </View>
              <Text style={styles.menuLabel}>{choice.label}</Text>
              {choice.selected ? <Ionicons name="checkmark" size={20} color={colors.ink} /> : null}
            </PressableScale>
          ))}
          <Button label="Vazgeç" onPress={() => setMenuOpen(false)} style={styles.menuCancel} />
        </View>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  menuList: { gap: 6 },
  menuCancel: { marginTop: 10 },
  menuChoice: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12,
    borderRadius: 18 },
  menuChoiceSelected: { backgroundColor: colors.white },
  menuIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  menuIconSelected: { backgroundColor: colors.ink },
  menuLabel: { flex: 1, fontFamily: 'DMSans_700Bold', fontSize: 16, color: colors.ink },
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center', gap: 12, padding: spacing.lg },
  loadingText: {
    fontFamily: 'DMSans_500Medium',
    color: colors.muted,
    textAlign: 'center',
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

  // Bounds leave room for the shadow and a comfortable tap target.
  dotBounds: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2.5, borderColor: colors.white, backgroundColor: colors.ink,
    ...shadows.soft },
  dotLive: { backgroundColor: colors.green },
  // Reserve room for the count badge and shadow inside Android's bitmap bounds.
  // Kept tight around the icon: a wider marker view (it once carried the name)
  // swallowed taps on iOS and venues stopped opening.
  markerStack: { paddingHorizontal: 8, paddingVertical: 5, alignItems: 'center' },
  markerLabel: { height: MARKER_LABEL_H, maxWidth: 116, paddingHorizontal: 5, borderRadius: 7,
    overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.9)', fontFamily: 'DMSans_700Bold', fontSize: 11,
    lineHeight: MARKER_LABEL_H, color: colors.ink },
  markerLabelActive: { backgroundColor: colors.ink, color: colors.white },
  // Single places are light so the map stays readable; ink is reserved for
  // clusters and the selected place, green for places that are live right now.
  marker: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 2,
    borderColor: colors.white,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.soft,
  },
  markerLive: {
    borderWidth: 3,
    borderColor: colors.green,
  },
  markerActive: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 3,
    borderColor: colors.white,
    backgroundColor: colors.ink,
  },
  markerCount: {
    position: 'absolute',
    top: -5,
    right: -7,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 4,
    borderRadius: 10,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.white,
  },
  markerCountText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 11,
    color: colors.white,
  },
  cluster: { borderWidth: 3, backgroundColor: colors.ink },
  clusterText: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 15, color: colors.white },
  clusterLive: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: colors.white,
    backgroundColor: colors.green,
  },
  // Overlaps the pin's bottom edge instead of taking layout space, so the
  // icon stays centred on the venue.
  markerFlame: {
    position: 'absolute',
    bottom: -7,
    alignSelf: 'center',
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
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },

  mapPanel: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
});
