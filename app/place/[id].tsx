import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckInPrompt, type CheckInPromptMode } from '@/components/CheckInPrompt';
import { districtForPlace } from '@/lib/placeLabel';
import { ModalGrabber, useSheetTopPad } from '@/components/ModalGrabber';
import { Appear, PressableScale } from '@/components/Motion';
import { LockedPhoto } from '@/components/LockedPhoto';
import { PhotoViewer } from '@/components/PhotoViewer';
import { RegularsSheet } from '@/components/RegularsSheet';
import { afterSheetClose } from '@/components/Sheet';
import { AvatarStack, Button, Card, IconButton, Txt } from '@/components/ui';
import { useApp } from '@/context/AppContext';
import { usePlaces } from '@/context/PlacesContext';
import type { Regular } from '@/data/types';
import { useActivePeople } from '@/hooks/useActivePeople';
import { measureProximityTo } from '@/lib/checkInProximity';
import { openDirections } from '@/lib/directions';
import { haptic } from '@/lib/haptics';
import { hasPhotoAccess, reviewPhotoUrls } from '@/lib/placePhotos';
import { colors } from '@/theme/colors';
import { duration, stagger } from '@/theme/motion';
import { radii, spacing } from '@/theme/spacing';
import { goBackOrHome } from '@/lib/navigation';

const HERO_HEIGHT = Math.min(Dimensions.get('window').height * 0.34, 300);

/** "5" for whole scores, "4.3" otherwise. */
function formatScore(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${label} ${value > 0 ? value.toFixed(1) : 'puan yok'}`}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value > 0 ? value.toFixed(1) : '—'}</Text>
    </View>
  );
}

export default function PlaceDetailScreen() {
  const insets = useSafeAreaInsets();
  const sheetTop = useSheetTopPad();
  const { id, intent } = useLocalSearchParams<{ id: string; intent?: string }>();
  const { user, isAdmin, isSubscribed } = useApp();
  const {
    ready,
    getPlace,
    labelFor,
    activeCheckIn,
    checkIn,
    getRegularsForPlace,
    refreshRatings,
  } = usePlaces();

  const place = getPlace(id ?? '');
  const placeId = place?.id;
  // Show ratings other members left since the list was last loaded.
  useEffect(() => {
    void refreshRatings();
  }, [refreshRatings]);
  const isCheckedInHere = !!user?.id && activeCheckIn?.userId === user.id && !!place?.id && activeCheckIn?.placeId === place.id;
  const hasLocationTestAccess = isAdmin || user?.app_metadata?.app_review_access === true;
  // Review photos are Pro: without access they stay locked and are never signed.
  const photoAccess = hasPhotoAccess({
    isSubscribed,
    isAdmin,
    appReviewAccess: user?.app_metadata?.app_review_access,
  });

  const [promptMode, setPromptMode] = useState<CheckInPromptMode>(null);
  const [distanceM, setDistanceM] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  // React state is committed after the press handler returns. Keep a
  // synchronous latch as well so a rapid double tap cannot start two native
  // permission prompts or two check-in mutations in that window.
  const busyRef = useRef(false);
  const [regulars, setRegulars] = useState<Regular[]>([]);
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const [regularsOpen, setRegularsOpen] = useState(false);
  const [reviewPhotoUris, setReviewPhotoUris] = useState<Record<string, string>>({});
  const people = useActivePeople(placeId);

  // Clears the sticky footer (56 tall + its own padding) plus breathing room.
  const scrollPad = useMemo(
    () => ({ paddingBottom: insets.bottom + 120 }),
    [insets.bottom],
  );

  // Keyed on the id, not the place object: `withStats` hands out a fresh object
  // whenever any place's rating or check-in count moves, which would otherwise
  // refetch regulars on unrelated updates. Live people refresh separately.
  useEffect(() => {
    if (!placeId) return;
    let cancelled = false;
    (async () => {
      const list = await getRegularsForPlace(placeId);
      if (cancelled) return;
      setRegulars(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [placeId, getRegularsForPlace]);

  // One signed-URL batch for every review photo; the module cache keeps them
  // across visits.
  const reviewPhotoKey = useMemo(
    () =>
      photoAccess
        ? (place?.reviews ?? []).flatMap((r) => (r.photoPath ? [r.photoPath] : [])).join('|')
        : '',
    [photoAccess, place?.reviews],
  );
  useEffect(() => {
    if (!reviewPhotoKey) return;
    let cancelled = false;
    void reviewPhotoUrls.resolve(reviewPhotoKey.split('|')).then((urls) => {
      if (!cancelled) setReviewPhotoUris((prev) => ({ ...prev, ...urls }));
    });
    return () => {
      cancelled = true;
    };
  }, [reviewPhotoKey]);

  const openPaywall = useCallback(() => router.push('/paywall'), []);

  // Bumped whenever the prompt closes, so a location lookup the user already
  // backed out of cannot re-open the sheet (or leave the CTA stuck) when it
  // finally resolves a second later.
  const proximityRun = useRef(0);

  const runProximityGate = useCallback(async () => {
    if (!place || busyRef.current) return;
    busyRef.current = true;
    const run = ++proximityRun.current;
    setBusy(true);
    setPromptMode('loading');
    // App Review cannot physically visit an Istanbul venue. A dedicated demo
    // account can receive this server-managed app_metadata flag; normal users
    // always continue through the real 150 m location check below.
    if (hasLocationTestAccess) {
      busyRef.current = false;
      setBusy(false);
      setDistanceM(null);
      setPromptMode('confirm');
      return;
    }
    const result = await measureProximityTo(place);
    if (run !== proximityRun.current) return;
    busyRef.current = false;
    setBusy(false);
    setDistanceM(result.distanceM);
    setPromptMode(result.status === 'near' ? 'confirm' : 'too_far');
  }, [hasLocationTestAccess, place]);

  /** Every way the prompt can go away — "Vazgeç", backdrop, drag, Android back. */
  const closeProximityPrompt = useCallback(() => {
    proximityRun.current += 1;
    busyRef.current = false;
    setBusy(false);
    setPromptMode(null);
  }, []);

  // Leaving the screen mid-lookup counts as backing out too.
  useEffect(() => () => {
    proximityRun.current += 1;
    busyRef.current = false;
  }, []);

  // Fires once for an `intent=checkin` deep link. Without the latch the effect
  // re-ran every time `places` produced a new object — restarting the location
  // lookup and snapping the open prompt back to its loading state.
  const gateStartedRef = useRef(false);
  useEffect(() => {
    if (intent !== 'checkin' || !placeId || isCheckedInHere) return;
    if (gateStartedRef.current) return;
    gateStartedRef.current = true;
    void runProximityGate();
  }, [intent, placeId, isCheckedInHere, runProximityGate]);

  const onPrimary = () => {
    if (!place || busyRef.current) return;
    if (isCheckedInHere) {
      router.push(`/chat/${place.id}`);
      return;
    }
    void runProximityGate();
  };

  const onConfirmCheckIn = async () => {
    if (!place || busyRef.current) return;
    busyRef.current = true;
    proximityRun.current += 1;
    setPromptMode(null);
    setBusy(true);
    let result: Awaited<ReturnType<typeof checkIn>>;
    try {
      result = await checkIn(place.id);
    } catch (error) {
      console.warn('check-in confirmation failed', error);
      Alert.alert('Check-in yapılamadı', 'Beklenmeyen bir hata oluştu. Lütfen tekrar dene.');
      return;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
    if (result.status === 'paywall_required') {
      afterSheetClose(() =>
        router.push({ pathname: '/paywall', params: { placeId: place.id } }),
      );
      return;
    }
    if (result.status === 'error') {
      Alert.alert('Check-in yapılamadı', result.message ?? 'Lütfen tekrar dene.');
      return;
    }
    haptic('success');
    // Wait for the prompt's modal to leave the screen before pushing the chat.
    afterSheetClose(() => router.push(`/chat/${place.id}`));
  };

  if (!place) {
    // The catalogue is swapped for the remote one on boot, so a deep link can
    // arrive before the id exists locally. Waiting on `ready` keeps that from
    // flashing "not found" at a place that is about to load.
    return (
      <View style={[styles.screen, styles.center]}>
        {!ready ? (
          <ActivityIndicator color={colors.ink} />
        ) : (
          <>
            <Txt variant="h3">Mekan bulunamadı</Txt>
            <Button label="Geri dön" tone="outline" full={false} onPress={goBackOrHome} />
          </>
        )}
      </View>
    );
  }

  const title = labelFor(place);
  const area = districtForPlace(place) || place.city;
  const ratingPart = place.reviewCount > 0
    ? `★ ${place.overall.toFixed(1)} (${place.reviewCount} değerlendirme)`
    : 'Yeni · henüz puan yok';
  const meta = [place.category, area, ratingPart].filter(Boolean).join(' · ');
  // A count is public; faces and names only once you are checked in here.
  const visibleMembers = isCheckedInHere ? people : [];
  const liveCount = visibleMembers.length || Math.max(0, place.checkedInCount);
  const topRegular = regulars[0];

  return (
    <View style={styles.screen}>
      <View style={styles.sheetChrome} pointerEvents="none">
        {/* Sits on the photo hero, so it needs the light handle. */}
        <ModalGrabber tone="light" />
      </View>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={scrollPad}
        bounces={false}
      >
        <View style={[styles.hero, { height: HERO_HEIGHT }]}>
          {place.imageUrl ? (
            <Image
              source={{ uri: place.imageUrl }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={320}
            />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bgSoft }]} />
          )}
          <LinearGradient
            colors={['rgba(12,11,10,0.45)', 'rgba(12,11,10,0.05)', 'rgba(243,241,238,1)']}
            locations={[0, 0.45, 1]}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.heroBar, { paddingTop: sheetTop + 4 }]}>
            <IconButton icon="close" tone="blur" onPress={goBackOrHome} accessibilityLabel="Kapat" />
          </View>
        </View>

        <View style={styles.body}>
          <Appear style={styles.titleBlock}>
            <Txt variant="h1" numberOfLines={3}>
              {title}
            </Txt>
            <Text style={styles.meta}>{meta}</Text>
          </Appear>

          {liveCount > 0 ? (
            <Appear delay={60} style={styles.membersRow}>
              {visibleMembers.length > 0 ? (
                <AvatarStack people={visibleMembers} size={32} max={3} />
              ) : (
                // Identities stay behind check-in; show anonymous faces only.
                <View style={styles.anonStack} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  {Array.from({ length: Math.min(liveCount, 3) }, (_, i) => (
                    <View key={i} style={[styles.anonFace, i > 0 && styles.anonOverlap]} />
                  ))}
                </View>
              )}
              <Text style={styles.liveText}>{liveCount} kişi şu an burada</Text>
            </Appear>
          ) : null}

          {/* Without reviews these tiles would only show "—": leave them out. */}
          {place.reviewCount > 0 ? <Appear delay={90} style={styles.statsRow}>
            <StatTile label="Wi‑Fi" value={place.wifi} />
            <StatTile label="Rahatlık" value={place.comfort} />
            <StatTile label="Priz" value={place.outlets} />
          </Appear> : null}

          {topRegular ? (
            <Appear delay={110}>
              <PressableScale
                onPress={() => setRegularsOpen(true)}
                scaleTo={0.985}
                style={styles.regularsRow}
                accessibilityRole="button"
                accessibilityLabel={`Müdavimler. Bu ay en çok gelen: ${topRegular.firstName}, ${topRegular.visits} geliş`}
              >
                <View style={styles.regularsText}>
                  <Text style={styles.regularsTitle}>Müdavimler</Text>
                  <Text style={styles.regularsSub} numberOfLines={1}>
                    {`Bu ay en çok gelen: ${topRegular.firstName} · ${topRegular.visits} geliş`}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </PressableScale>
            </Appear>
          ) : null}

          <Appear delay={150} style={styles.reviews}>
            <Txt variant="h3">Yorumlar</Txt>
            {place.reviews.length === 0 ? (
              <Card style={styles.review}>
                <Text style={styles.emptyReviewsText}>
                  Henüz yorum yok. Çıkışta puan vererek ilk yorumu sen bırak.
                </Text>
              </Card>
            ) : (
              place.reviews.map((review, i) => {
                const hasPhoto = !!(review.photoPath || review.localPhotoUri);
                const photoUri =
                  review.localPhotoUri ?? (review.photoPath ? reviewPhotoUris[review.photoPath] : undefined);
                return (
                  <Animated.View
                    key={review.id}
                    entering={FadeInDown.delay(stagger(i, 45)).duration(duration.base)}
                  >
                    <Card style={styles.review}>
                      <View style={styles.reviewHead}>
                        <Text style={styles.reviewAuthor} numberOfLines={1}>{review.author}</Text>
                        <Text style={styles.reviewScore}>
                          {`★ ${formatScore((review.wifi + review.comfort + review.outlets) / 3)}`}
                        </Text>
                      </View>
                      <Text style={styles.reviewScores}>
                        {`Wi‑Fi ${formatScore(review.wifi)} · Rahatlık ${formatScore(review.comfort)} · Priz ${formatScore(review.outlets)}`}
                      </Text>
                      {/* A rating without text said nothing; say so instead of an empty card. */}
                      {review.text ? <Text style={styles.reviewText}>{review.text}</Text>
                        : <Text style={styles.reviewNoText}>Yalnızca puan verdi, yorum yazmadı.</Text>}
                      {hasPhoto && !photoAccess ? (
                        <LockedPhoto onPress={openPaywall} label={false} style={styles.reviewPhoto} />
                      ) : photoUri ? (
                        <PressableScale
                          onPress={() => setViewerUri(photoUri)}
                          accessibilityRole="imagebutton"
                          accessibilityLabel={`${review.author} fotoğrafını tam ekran aç`}
                          style={styles.reviewPhoto}
                        >
                          <Image
                            source={{ uri: photoUri }}
                            style={StyleSheet.absoluteFill}
                            contentFit="cover"
                            transition={150}
                          />
                        </PressableScale>
                      ) : null}
                    </Card>
                  </Animated.View>
                );
              })
            )}
          </Appear>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.sm }]}>
        <PressableScale
          onPress={() => void openDirections(place)}
          style={styles.directions}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel="Yol tarifi"
        >
          <Ionicons name="navigate-outline" size={20} color={colors.ink} />
        </PressableScale>

        <Button
          label={isCheckedInHere ? 'Sohbete dön' : 'Check‑in yap'}
          onPress={onPrimary}
          loading={busy}
          full={false}
          style={styles.cta}
        />
      </View>

      <CheckInPrompt
        visible={promptMode != null}
        mode={promptMode}
        placeName={title}
        distanceM={distanceM}
        onConfirm={onConfirmCheckIn}
        onDismiss={closeProximityPrompt}
      />

      <PhotoViewer uri={viewerUri} onClose={() => setViewerUri(null)} />

      <RegularsSheet
        visible={regularsOpen}
        placeName={title}
        regulars={regulars}
        onClose={() => setRegularsOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.lg },
  sheetChrome: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 4,
  },

  hero: { backgroundColor: colors.bgSoft },
  heroBar: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    top: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },

  body: {
    paddingHorizontal: 20,
    marginTop: -12,
    gap: 18,
  },
  titleBlock: { gap: 6 },
  meta: { fontFamily: 'DMSans_400Regular', fontSize: 14, lineHeight: 20, color: colors.muted },

  membersRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  anonStack: { flexDirection: 'row' },
  anonFace: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.mutedSoft,
    borderWidth: 2,
    borderColor: colors.bg,
  },
  anonOverlap: { marginLeft: -10 },
  liveText: { fontFamily: 'DMSans_700Bold', fontSize: 14, color: colors.green },

  statsRow: { flexDirection: 'row', gap: 8 },
  stat: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: 12,
    gap: 2,
  },
  statLabel: { fontFamily: 'DMSans_400Regular', fontSize: 12, color: colors.muted },
  statValue: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 20,
    letterSpacing: -0.4,
    color: colors.ink,
  },

  regularsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  regularsText: { flex: 1, gap: 2 },
  regularsTitle: { fontFamily: 'DMSans_700Bold', fontSize: 15, color: colors.ink },
  regularsSub: { fontFamily: 'DMSans_400Regular', fontSize: 13, color: colors.muted },

  reviews: { gap: 10 },
  emptyReviewsText: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
  },
  review: { gap: 6, padding: 14 },
  reviewHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  reviewAuthor: { flex: 1, fontFamily: 'DMSans_700Bold', fontSize: 14, color: colors.ink },
  reviewScore: { fontFamily: 'DMSans_400Regular', fontSize: 14, color: colors.muted },
  reviewScores: { fontFamily: 'DMSans_500Medium', fontSize: 12.5, color: colors.muted, marginTop: 2 },
  reviewNoText: { fontFamily: 'DMSans_400Regular', fontSize: 13.5, fontStyle: 'italic', color: colors.muted, marginTop: 6 },
  reviewText: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 14,
    lineHeight: 20,
    color: colors.inkSoft,
  },
  reviewPhoto: {
    width: 72,
    height: 72,
    marginTop: 2,
    borderRadius: radii.sm,
    overflow: 'hidden',
    backgroundColor: colors.bgSoft,
  },

  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: spacing.sm,
    backgroundColor: colors.bg,
  },
  directions: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.4,
    borderColor: colors.lineStrong,
  },
  cta: { flex: 1, minHeight: 52, borderRadius: radii.pill },
});
