import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { PressableScale } from '@/components/Motion';
import { Avatar } from '@/components/ui';
import type { PlaceWithStats, Regular } from '@/data/types';
import { colors, shadows } from '@/theme/colors';
import { radii, spacing } from '@/theme/spacing';

export const CARD_IMAGE_HEIGHT = 116;

/** Shared empty list so a place without regulars keeps a stable prop identity. */
export const NO_REGULARS: Regular[] = [];

type PlaceCardProps = {
  place: PlaceWithStats;
  /**
   * Display name from `labelFor` — chains carry a district suffix. Required so
   * the raw catalogue name can never reach the card by omission.
   */
  label: string;
  regulars: Regular[];
  distanceKm?: number | null;
  width: number;
  /**
   * The place is handed back so the carousel can keep one callback for every
   * card — per-item closures would re-render the whole list on each scroll.
   */
  onPress: (place: PlaceWithStats) => void;
  onPressRegulars: (place: PlaceWithStats) => void;
};

/**
 * Map carousel card. The monthly "Müdavimler" leaderboard lives inside the
 * card as its own footer row rather than as a separate rail beside it.
 */
function PlaceCardBase({
  place,
  label,
  regulars,
  distanceKm,
  width,
  onPress,
  onPressRegulars,
}: PlaceCardProps) {
  const rating = place.reviewCount > 0 ? place.overall.toFixed(1) : '—';
  const leader = regulars[0];
  const live = place.checkedInCount > 0;

  const handlePress = useCallback(() => onPress(place), [onPress, place]);
  const handlePressRegulars = useCallback(() => onPressRegulars(place), [onPressRegulars, place]);

  return (
    <View style={[styles.shadow, { width }]}>
      <View style={styles.card}>
        <PressableScale
          onPress={handlePress}
          scaleTo={0.99}
          style={styles.tapArea}
          accessibilityRole="button"
          accessibilityLabel={label}
        >
          <View style={styles.media}>
            {place.imageUrl ? (
              <Image
                source={{ uri: place.imageUrl }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                transition={280}
              />
            ) : (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bgSoft }]} />
            )}
            <LinearGradient
              colors={['rgba(12,11,10,0.36)', 'rgba(12,11,10,0)']}
              style={StyleSheet.absoluteFill}
            />

            <View style={styles.mediaTop}>
              <View style={styles.ratingPill}>
                <Ionicons name="star" size={11} color={colors.ink} />
                <Text style={styles.ratingText}>{rating}</Text>
                <Text style={styles.ratingCount}>({place.reviewCount})</Text>
              </View>
              {live ? (
                <View style={styles.livePill}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>{place.checkedInCount} kişi</Text>
                </View>
              ) : null}
            </View>
          </View>

          <View style={styles.body}>
            <Text style={styles.name} numberOfLines={1}>
              {label}
            </Text>
            <Text style={styles.meta} numberOfLines={1}>
              {place.category} · {place.city}
              {distanceKm != null ? ` · ${formatDistance(distanceKm)}` : ''}
            </Text>
          </View>
        </PressableScale>

        <PressableScale
          onPress={handlePressRegulars}
          scaleTo={0.98}
          style={styles.regularsRow}
          accessibilityRole="button"
          accessibilityLabel="Müdavimler"
        >
          <View style={styles.trophy}>
            <Ionicons name="trophy" size={13} color={colors.white} />
          </View>
          <View style={styles.regularsText}>
            <Text style={styles.regularsTitle}>Müdavimler</Text>
            <Text style={styles.regularsSub} numberOfLines={1}>
              {leader
                ? `1. ${leader.firstName} · ${leader.visits} geliş`
                : 'Bu ay ilk sen ol'}
            </Text>
          </View>
          {regulars.length > 0 ? (
            <View style={styles.avatars}>
              {regulars.slice(0, 3).map((r, i) => (
                <Avatar
                  key={r.userKey}
                  uri={r.avatarUrl}
                  name={r.firstName}
                  size={26}
                  ring
                  style={i > 0 ? { marginLeft: -9 } : undefined}
                />
              ))}
            </View>
          ) : null}
          <Ionicons name="chevron-forward" size={16} color={colors.mutedSoft} />
        </PressableScale>
      </View>
    </View>
  );
}

/** Memoised: the carousel re-renders on every map pan and selection change. */
export const PlaceCard = memo(PlaceCardBase);

function formatDistance(km: number) {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

const styles = StyleSheet.create({
  shadow: {
    borderRadius: radii.lg,
    // Android draws elevation from the view's outline, which needs an opaque
    // background — without it the card had no shadow there at all.
    backgroundColor: colors.white,
    ...shadows.lifted,
  },
  card: {
    borderRadius: radii.lg,
    backgroundColor: colors.white,
    overflow: 'hidden',
  },
  tapArea: {
    backgroundColor: colors.white,
  },
  media: {
    height: CARD_IMAGE_HEIGHT,
    backgroundColor: colors.bgSoft,
  },
  mediaTop: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ratingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(255,255,255,0.94)',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: radii.pill,
  },
  ratingText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 12,
    color: colors.ink,
  },
  ratingCount: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 11,
    color: colors.muted,
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(12,11,10,0.72)',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: radii.pill,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.green,
  },
  liveText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 11,
    color: colors.white,
  },
  body: {
    paddingHorizontal: spacing.md,
    paddingTop: 12,
    paddingBottom: 10,
    gap: 3,
  },
  name: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 19,
    letterSpacing: -0.4,
    color: colors.ink,
  },
  meta: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 13,
    color: colors.muted,
  },
  regularsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: spacing.sm,
    marginBottom: spacing.sm,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  trophy: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  regularsText: {
    flex: 1,
    gap: 1,
  },
  regularsTitle: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 13,
    color: colors.ink,
  },
  regularsSub: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 11.5,
    color: colors.muted,
  },
  avatars: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
