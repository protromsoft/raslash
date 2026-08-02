import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Dimensions, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckInPrompt, type CheckInPromptMode } from '@/components/CheckInPrompt';
import { ModalGrabber, sheetTopPad } from '@/components/ModalGrabber';
import { Appear, PressableScale } from '@/components/Motion';
import { RegularsSheet } from '@/components/RegularsSheet';
import { afterSheetClose } from '@/components/Sheet';
import { Avatar, Badge, Button, Card, IconButton, Txt } from '@/components/ui';
import { useApp } from '@/context/AppContext';
import { usePlaces } from '@/context/PlacesContext';
import type { ChatPerson, Regular } from '@/data/types';
import { measureProximityTo } from '@/lib/checkInProximity';
import { openDirections } from '@/lib/directions';
import { haptic } from '@/lib/haptics';
import { colors, shadows } from '@/theme/colors';
import { duration, stagger } from '@/theme/motion';
import { radii, spacing } from '@/theme/spacing';

const HERO_HEIGHT = Math.min(Dimensions.get('window').height * 0.4, 360);

function StatTile({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: number;
}) {
  return (
    <View style={styles.stat}>
      <Ionicons name={icon} size={17} color={colors.ink} />
      <Text style={styles.statValue}>{value > 0 ? value.toFixed(1) : '—'}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      <View style={styles.statTrack}>
        <View style={[styles.statFill, { width: `${Math.min(value / 5, 1) * 100}%` }]} />
      </View>
    </View>
  );
}

export default function PlaceDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id, intent } = useLocalSearchParams<{ id: string; intent?: string }>();
  const { isSubscribed } = useApp();
  const {
    ready,
    getPlace,
    labelFor,
    activeCheckIn,
    checkIn,
    getRegularsForPlace,
    getActivePeopleForPlace,
  } = usePlaces();

  const place = getPlace(id ?? '');
  const placeId = place?.id;
  const isCheckedInHere = activeCheckIn?.placeId === place?.id;

  const [promptMode, setPromptMode] = useState<CheckInPromptMode>(null);
  const [distanceM, setDistanceM] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [regulars, setRegulars] = useState<Regular[]>([]);
  const [regularsOpen, setRegularsOpen] = useState(false);
  const [people, setPeople] = useState<ChatPerson[]>([]);

  // Clears the sticky footer (56 tall + its own padding) plus breathing room.
  const scrollPad = useMemo(
    () => ({ paddingBottom: insets.bottom + 120 }),
    [insets.bottom],
  );

  // Keyed on the id, not the place object: `withStats` hands out a fresh object
  // whenever any place's rating or check-in count moves, which would otherwise
  // refetch regulars and active people on unrelated updates.
  useEffect(() => {
    if (!placeId) return;
    let cancelled = false;
    (async () => {
      const [list, active] = await Promise.all([
        getRegularsForPlace(placeId),
        getActivePeopleForPlace(placeId),
      ]);
      if (cancelled) return;
      setRegulars(list);
      setPeople(active);
    })();
    return () => {
      cancelled = true;
    };
  }, [placeId, getRegularsForPlace, getActivePeopleForPlace]);

  // Bumped whenever the prompt closes, so a location lookup the user already
  // backed out of cannot re-open the sheet (or leave the CTA stuck) when it
  // finally resolves a second later.
  const proximityRun = useRef(0);

  const runProximityGate = useCallback(async () => {
    if (!place) return;
    const run = ++proximityRun.current;
    setBusy(true);
    setPromptMode('loading');
    const result = await measureProximityTo(place);
    if (run !== proximityRun.current) return;
    setBusy(false);
    setDistanceM(result.distanceM);
    setPromptMode(result.status === 'near' ? 'confirm' : 'too_far');
  }, [place]);

  /** Every way the prompt can go away — "Vazgeç", backdrop, drag, Android back. */
  const closeProximityPrompt = useCallback(() => {
    proximityRun.current += 1;
    setBusy(false);
    setPromptMode(null);
  }, []);

  // Leaving the screen mid-lookup counts as backing out too.
  useEffect(() => () => {
    proximityRun.current += 1;
  }, []);

  // Fires once for an `intent=checkin` deep link. Without the latch the effect
  // re-ran every time `places` produced a new object — restarting the location
  // lookup and snapping the open prompt back to its loading state.
  const gateStartedRef = useRef(false);
  useEffect(() => {
    if (intent !== 'checkin' || !placeId || !isSubscribed || isCheckedInHere) return;
    if (gateStartedRef.current) return;
    gateStartedRef.current = true;
    void runProximityGate();
  }, [intent, placeId, isSubscribed, isCheckedInHere, runProximityGate]);

  const onPrimary = () => {
    if (!place || busy) return;
    if (isCheckedInHere) {
      router.push(`/chat/${place.id}`);
      return;
    }
    if (!isSubscribed) {
      router.push({ pathname: '/paywall', params: { placeId: place.id } });
      return;
    }
    void runProximityGate();
  };

  const onConfirmCheckIn = () => {
    if (!place) return;
    proximityRun.current += 1;
    setPromptMode(null);
    haptic('success');
    checkIn(place.id);
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
            <Button label="Geri dön" tone="outline" full={false} onPress={() => router.back()} />
          </>
        )}
      </View>
    );
  }

  const rating = place.reviewCount > 0 ? place.overall.toFixed(1) : '—';
  const title = labelFor(place);

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
          <View style={[styles.heroBar, { paddingTop: sheetTopPad(insets.top) + 4 }]}>
            <IconButton icon="close" tone="blur" onPress={() => router.back()} />
            {place.checkedInCount > 0 ? (
              <View style={styles.livePill}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>{place.checkedInCount} kişi burada</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.body}>
          <Appear>
            <View style={styles.badges}>
              <Badge label={place.category} tone="neutral" />
              <Badge label={place.city} tone="neutral" icon="location-outline" />
              <Badge label={`★ ${rating}`} tone="dark" />
            </View>
            <Txt variant="hero" style={{ marginTop: 10 }}>
              {title}
            </Txt>
            <Txt variant="body" style={{ marginTop: 6 }}>
              {place.reviewCount > 0
                ? `Puanlar yalnızca Raslash kullanıcılarından gelir — ${place.reviewCount} değerlendirme.`
                : 'Puanlar yalnızca Raslash kullanıcılarından gelir — bu mekan henüz puanlanmadı.'}
            </Txt>
          </Appear>

          <Appear delay={60} style={styles.statsRow}>
            <StatTile icon="wifi" label="Wi‑Fi" value={place.wifi} />
            <StatTile icon="cafe-outline" label="Rahatlık" value={place.comfort} />
            <StatTile icon="flash-outline" label="Priz" value={place.outlets} />
          </Appear>

          <Appear delay={110}>
            <Card onPress={() => setRegularsOpen(true)} style={styles.regularsCard}>
              <View style={styles.regularsHead}>
                <View style={styles.trophy}>
                  <Ionicons name="trophy" size={15} color={colors.white} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.regularsTitle}>Müdavimler</Text>
                  <Text style={styles.regularsSub}>Bu ayın en çok gelenleri</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.mutedSoft} />
              </View>

              {regulars.length === 0 ? (
                <Text style={styles.regularsEmpty}>
                  Bu ay henüz kimse yok. Check‑in yap, listenin başına geç.
                </Text>
              ) : (
                <View style={styles.podium}>
                  {regulars.slice(0, 3).map((r) => (
                    <View key={r.userKey} style={styles.podiumItem}>
                      <Avatar uri={r.avatarUrl} name={r.firstName} size={44} />
                      <View style={styles.podiumRank}>
                        <Text style={styles.podiumRankText}>{r.rank}</Text>
                      </View>
                      <Text style={styles.podiumName} numberOfLines={1}>
                        {r.firstName}
                      </Text>
                      <Text style={styles.podiumVisits}>{r.visits} geliş</Text>
                    </View>
                  ))}
                </View>
              )}
            </Card>
          </Appear>

          {people.length > 0 ? (
            <Appear delay={150}>
              <View style={styles.peopleRow}>
                <Text style={styles.sectionTitle}>Şu an burada</Text>
                <View style={styles.peopleList}>
                  {people.slice(0, 6).map((p) => (
                    <View key={p.id} style={styles.person}>
                      <Avatar uri={p.avatarUrl} name={p.firstName} size={46} ring />
                      <Text style={styles.personName} numberOfLines={1}>
                        {p.isMe ? 'Sen' : p.firstName}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            </Appear>
          ) : null}

          <Appear delay={190} style={styles.reviews}>
            <Text style={styles.sectionTitle}>Yorumlar</Text>
            {place.reviews.length === 0 ? (
              <Card style={styles.emptyReviews}>
                <Ionicons name="chatbox-ellipses-outline" size={20} color={colors.muted} />
                <Text style={styles.emptyReviewsText}>
                  Henüz yorum yok. Çıkışta puan vererek ilk yorumu sen bırak.
                </Text>
              </Card>
            ) : (
              place.reviews.map((review, i) => (
                <Animated.View
                  key={review.id}
                  entering={FadeInDown.delay(stagger(i, 45)).duration(duration.base)}
                >
                  <Card style={styles.review}>
                    <View style={styles.reviewHead}>
                      <Avatar name={review.author} size={32} />
                      <Text style={styles.reviewAuthor}>{review.author}</Text>
                      <Badge
                        label={`★ ${((review.wifi + review.comfort + review.outlets) / 3).toFixed(1)}`}
                        tone="neutral"
                      />
                    </View>
                    {review.text ? <Text style={styles.reviewText}>{review.text}</Text> : null}
                    <Text style={styles.reviewMeta}>
                      Wi‑Fi {review.wifi} · Rahatlık {review.comfort} · Priz {review.outlets}
                    </Text>
                  </Card>
                </Animated.View>
              ))
            )}
          </Appear>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.sm }]}>
        <PressableScale
          onPress={() => void openDirections(place)}
          style={styles.directions}
          accessibilityRole="button"
          accessibilityLabel={`${title} için yol tarifi al`}
        >
          <Ionicons name="navigate" size={19} color={colors.ink} />
          <Text style={styles.directionsLabel}>Yol tarifi</Text>
        </PressableScale>

        <PressableScale onPress={onPrimary} disabled={busy} style={styles.cta}>
          <Ionicons
            name={isCheckedInHere ? 'chatbubble-ellipses' : 'log-in-outline'}
            size={19}
            color={colors.white}
          />
          <Text style={styles.ctaLabel}>
            {isCheckedInHere ? 'Sohbete dön' : isSubscribed ? 'Check‑in yap' : 'Üye ol ve check‑in yap'}
          </Text>
        </PressableScale>
      </View>

      <CheckInPrompt
        visible={promptMode != null}
        mode={promptMode}
        placeName={title}
        distanceM={distanceM}
        onConfirm={onConfirmCheckIn}
        onDismiss={closeProximityPrompt}
      />

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
    justifyContent: 'space-between',
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(12,11,10,0.78)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.green },
  liveText: { fontFamily: 'DMSans_700Bold', fontSize: 12, color: colors.white },

  body: {
    paddingHorizontal: spacing.lg,
    marginTop: -28,
    gap: spacing.lg,
  },
  badges: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },

  statsRow: { flexDirection: 'row', gap: 10 },
  stat: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: radii.md,
    padding: 12,
    gap: 4,
    ...shadows.soft,
  },
  statValue: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 22,
    letterSpacing: -0.6,
    color: colors.ink,
  },
  statLabel: { fontFamily: 'DMSans_400Regular', fontSize: 12, color: colors.muted },
  statTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.track,
    overflow: 'hidden',
    marginTop: 4,
  },
  statFill: { height: '100%', backgroundColor: colors.ink, borderRadius: 2 },

  regularsCard: { gap: 12 },
  regularsHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  trophy: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  regularsTitle: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 16, color: colors.ink },
  regularsSub: { fontFamily: 'DMSans_400Regular', fontSize: 12, color: colors.muted },
  regularsEmpty: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 13,
    lineHeight: 19,
    color: colors.muted,
  },
  podium: { flexDirection: 'row', gap: 10 },
  podiumItem: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.sm,
    paddingVertical: 12,
  },
  podiumRank: {
    position: 'absolute',
    top: 6,
    right: 10,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  podiumRankText: { fontFamily: 'DMSans_700Bold', fontSize: 10, color: colors.white },
  podiumName: { fontFamily: 'DMSans_700Bold', fontSize: 12.5, color: colors.ink, marginTop: 4 },
  podiumVisits: { fontFamily: 'DMSans_400Regular', fontSize: 11, color: colors.muted },

  sectionTitle: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 19,
    letterSpacing: -0.3,
    color: colors.ink,
  },
  peopleRow: { gap: 12 },
  peopleList: { flexDirection: 'row', gap: 14, flexWrap: 'wrap' },
  person: { alignItems: 'center', gap: 5, width: 56 },
  personName: { fontFamily: 'DMSans_500Medium', fontSize: 11.5, color: colors.inkSoft },

  reviews: { gap: 10 },
  emptyReviews: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  emptyReviewsText: {
    flex: 1,
    fontFamily: 'DMSans_400Regular',
    fontSize: 13.5,
    lineHeight: 19,
    color: colors.muted,
  },
  review: { gap: 8 },
  reviewHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  reviewAuthor: { flex: 1, fontFamily: 'DMSans_700Bold', fontSize: 14, color: colors.ink },
  reviewText: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 14,
    lineHeight: 21,
    color: colors.inkSoft,
  },
  reviewMeta: { fontFamily: 'DMSans_400Regular', fontSize: 12, color: colors.muted },

  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    backgroundColor: colors.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  directions: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    minHeight: 56,
    paddingHorizontal: 14,
    borderRadius: radii.md,
    backgroundColor: colors.white,
    borderWidth: 1.4,
    borderColor: colors.line,
    ...shadows.soft,
  },
  directionsLabel: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 11,
    color: colors.inkSoft,
  },
  cta: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 56,
    borderRadius: radii.md,
    backgroundColor: colors.ink,
    ...shadows.soft,
  },
  ctaLabel: { fontFamily: 'DMSans_700Bold', fontSize: 16, color: colors.white },
});
