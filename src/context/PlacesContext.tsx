import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import { seedPlaces, seedReviews } from '@/data/seedPlaces';
import type {
  ActiveCheckIn,
  AppNotification,
  ChatPerson,
  Place,
  PlaceWithStats,
  RatingScores,
  Regular,
  Review,
} from '@/data/types';
import { useApp } from '@/context/AppContext';
import {
  endRemoteCheckIn,
  fetchActivePeople,
  startRemoteCheckIn,
  type CheckInAccessResult,
} from '@/lib/checkIns';
import { autoImageForPlace } from '@/lib/placeImages';
import { buildBrandCounts, displayPlaceName } from '@/lib/placeLabel';
import { withStats } from '@/lib/ratings';
import { getRegulars, getRegularsMap, recordVisit } from '@/lib/regulars';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import {
  fetchApprovedPlaces,
  fetchNotificationsRemote,
  fetchPendingPlaces,
  insertNotificationRemote,
  insertPendingPlace,
  updatePlaceImageRemote,
  updatePlaceStatus,
} from '@/lib/supabasePlaces';
import { uuid } from '@/lib/uuid';

/** 3 saat sonra "hala orada mısın?" */
export const STILL_HERE_AFTER_MS = 3 * 60 * 60 * 1000;
/** 24 saat sonra otomatik iptal */
export const AUTO_CANCEL_AFTER_MS = 24 * 60 * 60 * 1000;

type SyncStatus = 'idle' | 'syncing' | 'ok' | 'error';

type PlacesState = {
  ready: boolean;
  places: PlaceWithStats[];
  pendingPlaces: Place[];
  notifications: AppNotification[];
  unreadCount: number;
  activeCheckIn: ActiveCheckIn | null;
  stillHerePlaceId: string | null;
  syncStatus: SyncStatus;
  syncMessage: string;
  lastSyncedAt: string | null;
  getPlace: (id: string) => PlaceWithStats | undefined;
  /** Display name — chains get a district suffix, e.g. "Starbucks | Şişli". */
  labelFor: (place: { name: string; latitude: number; longitude: number }) => string;
  checkIn: (placeId: string) => Promise<CheckInAccessResult>;
  checkOut: (placeId: string, opts?: { silent?: boolean }) => void;
  confirmStillHere: () => void;
  openStillHerePrompt: (placeId: string) => void;
  dismissStillHerePrompt: () => void;
  leaveFromStillHere: () => string | null;
  /** Test: 3 saat bildirimini hemen oluştur */
  simulateStillHereReminder: () => void;
  getRegularsForPlace: (placeId: string) => Promise<Regular[]>;
  /** One storage read for many places — for lists that need every preview. */
  getRegularsForPlaces: (placeIds: string[]) => Promise<Record<string, Regular[]>>;
  getActivePeopleForPlace: (placeId: string) => Promise<ChatPerson[]>;
  submitRating: (placeId: string, scores: RatingScores, text?: string) => Promise<void>;
  submitPlace: (input: {
    name: string;
    city: string;
    category?: string;
    latitude?: number;
    longitude?: number;
  }) => Promise<void>;
  approvePlace: (placeId: string) => Promise<void>;
  rejectPlace: (placeId: string) => Promise<void>;
  deleteReview: (placeId: string, reviewId: string) => Promise<void>;
  addAdminReview: (placeId: string, text: string, scores?: RatingScores) => Promise<void>;
  updatePlaceImage: (placeId: string, imageUrl: string) => Promise<void>;
  markNotificationRead: (id: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  adminSyncGoogle: () => Promise<void>;
};

const STORAGE_KEYS = {
  reviews: 'raslash.reviewsByPlace',
  checkIn: 'raslash.activeCheckIn',
  checkInCounts: 'raslash.checkInCounts',
  places: 'raslash.googlePlaces.v3',
  pending: 'raslash.pendingPlaces',
  notifications: 'raslash.notifications',
  lastSyncedAt: 'raslash.placesLastSyncedAt.v3',
} as const;

const PlacesContext = createContext<PlacesState | null>(null);

function ensureImages(list: Place[]) {
  return list.map((p) => ({
    ...p,
    status: p.status ?? 'approved',
    imageUrl: p.imageUrl || autoImageForPlace(p.id, p.category),
  }));
}

export function PlacesProvider({ children }: { children: ReactNode }) {
  const { profile, user } = useApp();
  const [ready, setReady] = useState(false);
  const [basePlaces, setBasePlaces] = useState<Place[]>(ensureImages(seedPlaces));
  const [pendingPlaces, setPendingPlaces] = useState<Place[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [reviewsByPlace, setReviewsByPlace] = useState<Record<string, Review[]>>(seedReviews);
  const [activeCheckIn, setActiveCheckIn] = useState<ActiveCheckIn | null>(null);
  const [stillHerePlaceId, setStillHerePlaceId] = useState<string | null>(null);
  const [checkInCounts, setCheckInCounts] = useState<Record<string, number>>({});
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [syncMessage, setSyncMessage] = useState('');
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const activeRef = useRef<ActiveCheckIn | null>(null);
  activeRef.current = activeCheckIn;

  const persistPlaces = useCallback(async (list: Place[]) => {
    setBasePlaces(list);
    await AsyncStorage.setItem(STORAGE_KEYS.places, JSON.stringify(list));
  }, []);

  const persistPending = useCallback(async (list: Place[]) => {
    setPendingPlaces(list);
    await AsyncStorage.setItem(STORAGE_KEYS.pending, JSON.stringify(list));
  }, []);

  const persistNotifications = useCallback(async (list: AppNotification[]) => {
    setNotifications(list);
    await AsyncStorage.setItem(STORAGE_KEYS.notifications, JSON.stringify(list));
  }, []);

  const pushNotification = useCallback(
    async (n: Omit<AppNotification, 'id' | 'createdAt' | 'read'>) => {
      const item: AppNotification = {
        ...n,
        id: `n_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        createdAt: new Date().toISOString(),
        read: false,
      };
      setNotifications((prev) => {
        const next = [item, ...prev];
        void AsyncStorage.setItem(STORAGE_KEYS.notifications, JSON.stringify(next));
        return next;
      });
      try {
        if (!user?.id) return;
        await insertNotificationRemote({
          userId: user.id,
          title: n.title,
          body: n.body,
          type: n.type,
          placeId: n.placeId,
        });
      } catch {
        // local notification still kept
      }
    },
    [user?.id],
  );

  const refreshFromSupabase = useCallback(async () => {
    if (!isSupabaseConfigured) return false;
    try {
      const [approved, pending, remoteNotes] = await Promise.all([
        fetchApprovedPlaces(),
        fetchPendingPlaces(),
        user?.id ? fetchNotificationsRemote() : Promise.resolve(null),
      ]);
      if (approved && approved.length > 0) {
        const list = ensureImages(approved);
        setBasePlaces(list);
        await AsyncStorage.setItem(STORAGE_KEYS.places, JSON.stringify(list));
      }
      if (pending) {
        setPendingPlaces(pending);
        await AsyncStorage.setItem(STORAGE_KEYS.pending, JSON.stringify(pending));
      }
      if (remoteNotes && remoteNotes.length > 0) {
        setNotifications(remoteNotes);
        await AsyncStorage.setItem(STORAGE_KEYS.notifications, JSON.stringify(remoteNotes));
      }
      return true;
    } catch (e) {
      console.warn('Supabase refresh failed', e);
      return false;
    }
  }, [user?.id]);

  const runGoogleSync = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setSyncStatus('error');
      setSyncMessage('Supabase bağlantısı yok');
      return;
    }
    setSyncStatus('syncing');
    setSyncMessage('Google → Supabase sunucu sync…');

    try {
      const { data, error } = await supabase.functions.invoke('sync-places');
      if (error) throw error;
      await refreshFromSupabase();
      const now = new Date().toISOString();
      setLastSyncedAt(now);
      await AsyncStorage.setItem(STORAGE_KEYS.lastSyncedAt, now);
      setSyncMessage(`${Number(data?.imported ?? 0)} mekan Supabase’e yazıldı`);
      setSyncStatus('ok');
    } catch (e) {
      setSyncStatus('error');
      setSyncMessage(
        e instanceof Error
          ? e.message
          : 'Supabase yazma hatası',
      );
    }
  }, [refreshFromSupabase]);

  useEffect(() => {
    (async () => {
      const entries = await AsyncStorage.multiGet([
        STORAGE_KEYS.reviews,
        STORAGE_KEYS.checkIn,
        STORAGE_KEYS.checkInCounts,
        STORAGE_KEYS.places,
        STORAGE_KEYS.pending,
        STORAGE_KEYS.notifications,
        STORAGE_KEYS.lastSyncedAt,
      ]);
      const map = Object.fromEntries(entries);
      if (map[STORAGE_KEYS.reviews]) setReviewsByPlace(JSON.parse(map[STORAGE_KEYS.reviews]!));
      if (map[STORAGE_KEYS.checkIn]) setActiveCheckIn(JSON.parse(map[STORAGE_KEYS.checkIn]!));
      if (map[STORAGE_KEYS.checkInCounts]) {
        setCheckInCounts(JSON.parse(map[STORAGE_KEYS.checkInCounts]!));
      }
      if (map[STORAGE_KEYS.places]) {
        const cached = ensureImages(JSON.parse(map[STORAGE_KEYS.places]!) as Place[]);
        if (cached.length > 0) setBasePlaces(cached.filter((p) => p.status !== 'rejected'));
      }
      if (map[STORAGE_KEYS.pending]) setPendingPlaces(JSON.parse(map[STORAGE_KEYS.pending]!));
      if (map[STORAGE_KEYS.notifications]) {
        setNotifications(JSON.parse(map[STORAGE_KEYS.notifications]!));
      }
      if (map[STORAGE_KEYS.lastSyncedAt]) setLastSyncedAt(map[STORAGE_KEYS.lastSyncedAt]);

      if (isSupabaseConfigured) {
        await refreshFromSupabase();
      }
      setReady(true);

      if (isSupabaseConfigured) {
        setSyncStatus('ok');
        setSyncMessage(isSupabaseConfigured ? 'Supabase bağlı' : 'Liste güncel');
      }
    })();
  }, [refreshFromSupabase, runGoogleSync]);

  const approvedPlaces = useMemo(
    () => basePlaces.filter((p) => p.status === 'approved'),
    [basePlaces],
  );

  const places = useMemo(
    () =>
      approvedPlaces.map((place) =>
        withStats(place, reviewsByPlace[place.id] ?? [], checkInCounts[place.id] ?? 0),
      ),
    [approvedPlaces, reviewsByPlace, checkInCounts],
  );

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications],
  );

  const getPlace = useCallback(
    (id: string) => places.find((p) => p.id === id),
    [places],
  );

  // Counted over the whole catalogue so a branch keeps its district suffix even
  // when the visible list is filtered down to one result.
  const brandCounts = useMemo(() => buildBrandCounts(places), [places]);

  const labelFor = useCallback(
    (place: { name: string; latitude: number; longitude: number }) =>
      displayPlaceName(place, brandCounts),
    [brandCounts],
  );

  /** Notification copy shows the same branch-aware name as the rest of the app. */
  const labelForId = useCallback(
    (placeId: string) => {
      const found = basePlaces.find((p) => p.id === placeId);
      return found ? labelFor(found) : 'Mekan';
    },
    [basePlaces, labelFor],
  );

  const checkOut = useCallback(
    (placeId: string, opts?: { silent?: boolean }) => {
      setActiveCheckIn((prev) => {
        if (prev?.placeId === placeId) {
          void AsyncStorage.removeItem(STORAGE_KEYS.checkIn);
          return null;
        }
        return prev;
      });
      setStillHerePlaceId((id) => (id === placeId ? null : id));
      setCheckInCounts((prev) => {
        const current = prev[placeId] ?? 1;
        const merged = { ...prev, [placeId]: Math.max(0, current - 1) };
        void AsyncStorage.setItem(STORAGE_KEYS.checkInCounts, JSON.stringify(merged));
        return merged;
      });
      if (user?.id) {
        void endRemoteCheckIn(placeId, user.id);
      }
      if (!opts?.silent) {
        // rating flow handled by caller
      }
    },
    [user?.id],
  );

  const persistActive = useCallback(async (next: ActiveCheckIn | null) => {
    setActiveCheckIn(next);
    if (next) await AsyncStorage.setItem(STORAGE_KEYS.checkIn, JSON.stringify(next));
    else await AsyncStorage.removeItem(STORAGE_KEYS.checkIn);
  }, []);

  const checkIn = useCallback(
    async (placeId: string): Promise<CheckInAccessResult> => {
      if (!user?.id) {
        return { status: 'error', freeRemaining: 0, message: 'Oturum bulunamadı.' };
      }
      const access = await startRemoteCheckIn(placeId, user.id);
      if (access.status !== 'allowed') return access;

      const next: ActiveCheckIn = { placeId, startedAt: new Date().toISOString() };
      await persistActive(next);
      setCheckInCounts((prev) => {
        const merged = { ...prev, [placeId]: (prev[placeId] ?? 0) + 1 };
        void AsyncStorage.setItem(STORAGE_KEYS.checkInCounts, JSON.stringify(merged));
        return merged;
      });
      const userKey = user.id;
      void recordVisit({
        placeId,
        userKey,
        firstName: profile.firstName || 'Sen',
        lastName: profile.lastName,
        avatarUrl: profile.avatarUrl,
      });
      return access;
    },
    [persistActive, profile.avatarUrl, profile.firstName, profile.lastName, user?.id],
  );

  const confirmStillHere = useCallback(() => {
    const current = activeRef.current;
    if (!current) {
      setStillHerePlaceId(null);
      return;
    }
    const next: ActiveCheckIn = {
      ...current,
      confirmedAt: new Date().toISOString(),
    };
    void persistActive(next);
    setStillHerePlaceId(null);
  }, [persistActive]);

  const openStillHerePrompt = useCallback((placeId: string) => {
    setStillHerePlaceId(placeId);
  }, []);

  const dismissStillHerePrompt = useCallback(() => {
    setStillHerePlaceId(null);
  }, []);

  const leaveFromStillHere = useCallback(() => {
    const placeId = stillHerePlaceId ?? activeRef.current?.placeId ?? null;
    if (placeId) checkOut(placeId);
    setStillHerePlaceId(null);
    return placeId;
  }, [checkOut, stillHerePlaceId]);

  const simulateStillHereReminder = useCallback(() => {
    const current = activeRef.current;
    if (!current) return;
    const placeName = labelForId(current.placeId);
    const next: ActiveCheckIn = {
      ...current,
      remindedAt: new Date().toISOString(),
    };
    void persistActive(next);
    void pushNotification({
      type: 'still_here',
      title: 'Mekanda mısınız hala?',
      body: `${placeName} — hâlâ orada mısın? Bildirime dokun.`,
      placeId: current.placeId,
    });
    setStillHerePlaceId(current.placeId);
  }, [labelForId, persistActive, pushNotification]);

  const getRegularsForPlace = useCallback(async (placeId: string) => getRegulars(placeId, 10), []);

  const getRegularsForPlaces = useCallback(
    async (placeIds: string[]) => getRegularsMap(placeIds, 10),
    [],
  );

  const getActivePeopleForPlace = useCallback(
    async (placeId: string): Promise<ChatPerson[]> => {
      const remote = await fetchActivePeople(placeId);
      const me: ChatPerson = {
        id: user?.id ?? 'me',
        firstName: profile.firstName || 'Sen',
        lastName: profile.lastName,
        avatarUrl: profile.avatarUrl,
        isMe: true,
      };
      if (activeRef.current?.placeId === placeId) {
        // Supabase may not know about this check-in yet (or at all offline), so
        // "me" is always prepended and de-duplicated rather than waited for.
        return [me, ...remote.filter((p) => p.id !== me.id)];
      }
      return remote;
    },
    [profile.avatarUrl, profile.firstName, profile.lastName, user?.id],
  );

  // 3 saat hatırlatma + 24 saat otomatik iptal
  useEffect(() => {
    const tick = () => {
      const current = activeRef.current;
      if (!current) return;
      const started = new Date(current.startedAt).getTime();
      const now = Date.now();
      const elapsed = now - started;

      if (elapsed >= AUTO_CANCEL_AFTER_MS) {
        const placeId = current.placeId;
        const placeName = labelForId(placeId);
        checkOut(placeId, { silent: true });
        void pushNotification({
          type: 'system',
          title: 'Check-in sona erdi',
          body: `${placeName} check-in’i 24 saat sonra otomatik iptal edildi.`,
          placeId,
        });
        return;
      }

      if (elapsed >= STILL_HERE_AFTER_MS && !current.remindedAt) {
        const placeId = current.placeId;
        const placeName = labelForId(placeId);
        const next: ActiveCheckIn = {
          ...current,
          remindedAt: new Date().toISOString(),
        };
        void persistActive(next);
        void pushNotification({
          type: 'still_here',
          title: 'Mekanda mısınız hala?',
          body: `${placeName} — hâlâ orada mısın? Bildirime dokun.`,
          placeId,
        });
      }
    };

    tick();
    const id = setInterval(tick, 30_000);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') tick();
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [checkOut, labelForId, persistActive, pushNotification]);

  const submitRating = useCallback(
    async (placeId: string, scores: RatingScores, text?: string) => {
      const author =
        [profile.firstName, profile.lastName].filter(Boolean).join(' ') || 'Sen';
      const review: Review = {
        id: `local_${Date.now()}`,
        author,
        text: text?.trim() || undefined,
        wifi: scores.wifi,
        comfort: scores.comfort,
        outlets: scores.outlets,
        createdAt: new Date().toISOString(),
      };
      setReviewsByPlace((prev) => {
        const list = prev[placeId] ?? [];
        const merged = { ...prev, [placeId]: [review, ...list] };
        void AsyncStorage.setItem(STORAGE_KEYS.reviews, JSON.stringify(merged));
        return merged;
      });
    },
    [profile.firstName, profile.lastName],
  );

  const submitPlace = useCallback(
    async (input: {
      name: string;
      city: string;
      category?: string;
      latitude?: number;
      longitude?: number;
    }) => {
      const id = uuid();
      const category = input.category?.trim() || 'Cafe';
      const place: Place = {
        id,
        name: input.name.trim(),
        city: input.city.trim() || 'Istanbul',
        category,
        latitude: input.latitude ?? 41.015137,
        longitude: input.longitude ?? 28.97953,
        imageUrl: autoImageForPlace(id, category),
        source: 'user',
        status: 'pending',
        submittedByName:
          [profile.firstName, profile.lastName].filter(Boolean).join(' ') || 'Kullanıcı',
      };
      try {
        if (isSupabaseConfigured) {
          if (!user?.id) throw new Error('Oturum gerekli');
          await insertPendingPlace(place, user.id);
          await refreshFromSupabase();
        } else {
          await persistPending([place, ...pendingPlaces]);
        }
      } catch {
        await persistPending([place, ...pendingPlaces]);
      }
      await pushNotification({
        type: 'system',
        title: 'Mekan gönderildi',
        body: `"${labelFor(place)}" onay bekliyor. Onaylanınca listelenecek.`,
        placeId: place.id,
      });
    },
    [
      labelFor,
      pendingPlaces,
      persistPending,
      profile.firstName,
      profile.lastName,
      user?.id,
      pushNotification,
      refreshFromSupabase,
    ],
  );

  const approvePlace = useCallback(
    async (placeId: string) => {
      const pending = pendingPlaces.find((p) => p.id === placeId);
      if (!pending) return;
      try {
        if (isSupabaseConfigured) {
          await updatePlaceStatus(placeId, 'approved');
          await refreshFromSupabase();
        } else {
          const approved: Place = { ...pending, status: 'approved' };
          await persistPending(pendingPlaces.filter((p) => p.id !== placeId));
          await persistPlaces([approved, ...basePlaces.filter((p) => p.id !== placeId)]);
        }
      } catch {
        const approved: Place = { ...pending, status: 'approved' };
        await persistPending(pendingPlaces.filter((p) => p.id !== placeId));
        await persistPlaces([approved, ...basePlaces.filter((p) => p.id !== placeId)]);
      }
      await pushNotification({
        type: 'place_approved',
        title: 'Mekanın onaylandı',
        body: `"${labelFor(pending)}" artık haritada listeleniyor.`,
        placeId: pending.id,
      });
    },
    [
      labelFor,
      pendingPlaces,
      basePlaces,
      persistPending,
      persistPlaces,
      pushNotification,
      refreshFromSupabase,
    ],
  );

  const rejectPlace = useCallback(
    async (placeId: string) => {
      const pending = pendingPlaces.find((p) => p.id === placeId);
      if (!pending) return;
      try {
        if (isSupabaseConfigured) {
          await updatePlaceStatus(placeId, 'rejected');
          await refreshFromSupabase();
        } else {
          await persistPending(pendingPlaces.filter((p) => p.id !== placeId));
        }
      } catch {
        await persistPending(pendingPlaces.filter((p) => p.id !== placeId));
      }
      await pushNotification({
        type: 'place_rejected',
        title: 'Mekan reddedildi',
        body: `"${labelFor(pending)}" listeye eklenmedi.`,
        placeId: pending.id,
      });
    },
    [labelFor, pendingPlaces, persistPending, pushNotification, refreshFromSupabase],
  );

  const deleteReview = useCallback(async (placeId: string, reviewId: string) => {
    setReviewsByPlace((prev) => {
      const list = (prev[placeId] ?? []).filter((r) => r.id !== reviewId);
      const merged = { ...prev, [placeId]: list };
      void AsyncStorage.setItem(STORAGE_KEYS.reviews, JSON.stringify(merged));
      return merged;
    });
  }, []);

  const addAdminReview = useCallback(
    async (placeId: string, text: string, scores?: RatingScores) => {
      await submitRating(placeId, scores ?? { wifi: 4, comfort: 4, outlets: 4 }, text);
    },
    [submitRating],
  );

  const updatePlaceImage = useCallback(
    async (placeId: string, imageUrl: string) => {
      try {
        if (isSupabaseConfigured) {
          await updatePlaceImageRemote(placeId, imageUrl);
          await refreshFromSupabase();
          return;
        }
      } catch {
        // fall through
      }
      const next = basePlaces.map((p) => (p.id === placeId ? { ...p, imageUrl } : p));
      await persistPlaces(next);
    },
    [basePlaces, persistPlaces, refreshFromSupabase],
  );

  const markNotificationRead = useCallback(
    async (id: string) => {
      const next = notifications.map((n) => (n.id === id ? { ...n, read: true } : n));
      await persistNotifications(next);
    },
    [notifications, persistNotifications],
  );

  const markAllNotificationsRead = useCallback(async () => {
    const next = notifications.map((n) => ({ ...n, read: true }));
    await persistNotifications(next);
  }, [notifications, persistNotifications]);

  const value = useMemo(
    () => ({
      ready,
      places,
      pendingPlaces,
      notifications,
      unreadCount,
      activeCheckIn,
      stillHerePlaceId,
      syncStatus,
      syncMessage,
      lastSyncedAt,
      getPlace,
      labelFor,
      checkIn,
      checkOut,
      confirmStillHere,
      openStillHerePrompt,
      dismissStillHerePrompt,
      leaveFromStillHere,
      simulateStillHereReminder,
      getRegularsForPlace,
      getRegularsForPlaces,
      getActivePeopleForPlace,
      submitRating,
      submitPlace,
      approvePlace,
      rejectPlace,
      deleteReview,
      addAdminReview,
      updatePlaceImage,
      markNotificationRead,
      markAllNotificationsRead,
      adminSyncGoogle: runGoogleSync,
    }),
    [
      ready,
      places,
      pendingPlaces,
      notifications,
      unreadCount,
      activeCheckIn,
      stillHerePlaceId,
      syncStatus,
      syncMessage,
      lastSyncedAt,
      getPlace,
      labelFor,
      checkIn,
      checkOut,
      confirmStillHere,
      openStillHerePrompt,
      dismissStillHerePrompt,
      leaveFromStillHere,
      simulateStillHereReminder,
      getRegularsForPlace,
      getRegularsForPlaces,
      getActivePeopleForPlace,
      submitRating,
      submitPlace,
      approvePlace,
      rejectPlace,
      deleteReview,
      addAdminReview,
      updatePlaceImage,
      markNotificationRead,
      markAllNotificationsRead,
      runGoogleSync,
    ],
  );

  return <PlacesContext.Provider value={value}>{children}</PlacesContext.Provider>;
}

export function usePlaces() {
  const ctx = useContext(PlacesContext);
  if (!ctx) throw new Error('usePlaces must be used within PlacesProvider');
  return ctx;
}
