import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { memo, useRef, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, Text, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import { AvatarStack } from '@/components/Avatar';
import { LiveDot } from '@/components/LiveDot';
import { PressableScale } from '@/components/Motion';
import { MapSheet, MapSheetHandle } from '@/components/MapSheet';
import { districtForPlace } from '@/lib/placeLabel';
import type { ChatPerson, PlaceWithStats } from '@/data/types';
import { colors, shadows } from '@/theme/colors';

function distanceLabel(km: number | null) {
  if (km == null || !Number.isFinite(km)) return '';
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

/** "Kafe · Cihangir · 350 m · ★ 4.6"; missing parts are left out. */
export function placeMetaLine(place: PlaceWithStats, distanceKm: number | null, district?: string) {
  return [place.category, district, distanceLabel(distanceKm),
    place.reviewCount > 0 && Number.isFinite(place.overall) ? `★ ${place.overall.toFixed(1)}` : '']
    .filter(Boolean).join(' · ');
}

/** Recycled rows never keep a previous venue's image when a URL is absent/broken. */
export function VenuePhoto({ uri, style }: { uri?: string; style: StyleProp<ViewStyle> }) {
  const [failed, setFailed] = useState<string>();
  return (
    <View style={[styles.photo, style]}>
      <Ionicons name="cafe-outline" size={26} color={colors.muted} />
      {uri && uri !== failed ? (
        <Image key={uri} source={{ uri }} recyclingKey={uri} style={StyleSheet.absoluteFill}
          contentFit="cover" transition={150} onError={() => setFailed(uri)} />
      ) : null}
    </View>
  );
}

export const MapPlaceRow = memo(function MapPlaceRow({ place, label, distanceKm, people, onSelect }: {
  place: PlaceWithStats;
  label: string;
  distanceKm: number | null;
  /** The parent supplies identities only for the viewer's active check-in. */
  people: ChatPerson[];
  onSelect: (place: PlaceWithStats) => void;
}) {
  const count = people.length || place.checkedInCount;
  return (
    <PressableScale style={styles.row} onPress={() => onSelect(place)} scaleTo={0.99}
      accessibilityRole="button" accessibilityLabel={count > 0 ? `${label}, ${count} kişi burada` : label}>
      <VenuePhoto uri={place.imageUrl} style={styles.thumbnail} />
      <View style={styles.rowCopy}>
        <Text maxFontSizeMultiplier={MAP_TEXT_SCALE} style={styles.rowTitle} numberOfLines={1}>{label}</Text>
        <Text maxFontSizeMultiplier={MAP_TEXT_SCALE} style={styles.rowMeta} numberOfLines={1}>{placeMetaLine(place, distanceKm)}</Text>
        {count > 0 ? <View style={styles.rowPeople}>
          {people.length > 0 ? <AvatarStack people={people} size={22} max={3} /> : <LiveDot size={6} pulse />}
          <Text maxFontSizeMultiplier={MAP_TEXT_SCALE} style={styles.peopleLive} numberOfLines={1}>{`${count} kişi burada`}</Text>
        </View> : null}
      </View>
    </PressableScale>
  );
});

type Props = {
  places: PlaceWithStats[];
  selected?: PlaceWithStats;
  title: string;
  height: number;
  listHeight?: number;
  expandedHeight?: number;
  /** Header-only height the list can be dragged down to; omit to keep the list open. */
  peekHeight?: number;
  /** The list is dragged down to its header. */
  collapsed?: boolean;
  onCollapse?: (collapsed: boolean) => void;
  position?: SharedValue<number>;
  expanded: boolean;
  activePlaceId?: string;
  people: ChatPerson[];
  listKey: string;
  labelFor: (place: PlaceWithStats) => string;
  distanceTo: (place: PlaceWithStats) => number | null;
  onExpand: (expanded: boolean) => void;
  onSelect: (place: PlaceWithStats) => void;
  onClose: () => void;
  onDetails: (place: PlaceWithStats) => void;
  onJoin: (place: PlaceWithStats) => void;
  onResetFilter: () => void;
  /** Current sort/filter label ("Tümü", "Yakınımda" …) shown as a pill beside the title. */
  sortLabel?: string;
  /** Opens the sort menu (Tümü / Yakınımda / Şu an dolu / En iyi puan). */
  onSort?: () => void;
  /** Opens "Mekân öner" from the empty state; nothing floats over the pins. */
  onSuggest?: () => void;
  /** Why the list can be empty: no place within reach, or a filter matched nothing. */
  emptyReason?: 'nearby' | 'filter';
  /** Height the selected-place card needs: handle + content + buttons. */
  onDetailHeight?: (height: number) => void;
};

const NO_PEOPLE: ChatPerson[] = [];
/** Floating map chrome has fixed heights: larger Dynamic Type grows its text only this far. */
const MAP_TEXT_SCALE = 1.3;
const DETAIL_HANDLE_HEIGHT = 24;

/** Inline over the map: no second native modal and no map remount on selection. */
export function MapPlacesPanel(props: Props) {
  const { selected, places, title, height, expanded, activePlaceId, people, listKey,
    labelFor, distanceTo, onExpand, onSelect, onClose, onDetails, onJoin, onResetFilter, onSuggest,
    sortLabel, onSort, emptyReason = 'filter', onDetailHeight, peekHeight, collapsed = false, onCollapse } = props;
  const listHeight = props.listHeight ?? height;
  const expandedHeight = props.expandedHeight ?? height;
  // List mode has three stops: header only (dragged down), list, expanded list.
  const canPeek = !selected && peekHeight != null && !!onCollapse;
  const onStop = (stop: number) => {
    if (stop >= expandedHeight) { onCollapse?.(false); onExpand(true); }
    else if (canPeek && stop <= peekHeight!) { onExpand(false); onCollapse?.(true); }
    else { onCollapse?.(false); onExpand(false); }
  };
  const { height: screenHeight } = useWindowDimensions();
  // The card reports how tall its content is so the sheet can shrink to fit
  // instead of leaving a gap above the buttons.
  const contentHeight = useRef(0);
  const actionsHeight = useRef(0);
  const reportHeight = () => {
    if (contentHeight.current > 0 && actionsHeight.current > 0) {
      onDetailHeight?.(DETAIL_HANDLE_HEIGHT + contentHeight.current + actionsHeight.current);
    }
  };
  const isHere = !!selected && selected.id === activePlaceId;
  const members = isHere ? people : NO_PEOPLE;
  const hereCount = selected ? members.length || Math.max(0, selected.checkedInCount) : 0;
  return (
    <MapSheet height={height} minimum={canPeek ? peekHeight : listHeight} middle={canPeek ? listHeight : undefined}
      maximum={selected ? height : expandedHeight}
      position={props.position} onSnap={selected ? (open) => { if (!open) onClose(); } : undefined}
      onStop={selected ? undefined : onStop}
      style={styles.panel} testID="map-places-panel">
      {({ pan }) => <>
      {!selected ? (
        <>
          <MapSheetHandle pan={pan}>
            <View style={styles.panelHeader}>
              <View style={styles.handle} />
              <View style={styles.headingRow}>
                <PressableScale style={styles.headingCopy} onPress={() => (collapsed ? onCollapse?.(false) : onExpand(!expanded))} scaleTo={1}
                  accessibilityRole="button"
                  accessibilityLabel={collapsed ? 'Mekân listesini aç' : expanded ? 'Mekân listesini küçült' : 'Mekân listesini genişlet'}
                  accessibilityHint={canPeek ? 'Aşağı çekerek listeyi kapatabilirsin.' : undefined}
                  accessibilityState={{ expanded: expanded && !collapsed }}>
                  <Text maxFontSizeMultiplier={MAP_TEXT_SCALE} style={styles.heading} numberOfLines={1}>{title}</Text>
                </PressableScale>
                {onSort ? <PressableScale onPress={onSort} style={styles.sort} hitSlop={4}
                  accessibilityRole="button" accessibilityLabel={`Mekânları sırala: ${sortLabel ?? 'Tümü'}`}>
                  <Text maxFontSizeMultiplier={MAP_TEXT_SCALE} style={styles.sortText} numberOfLines={1}>{sortLabel ?? 'Tümü'}</Text>
                  <Ionicons name="chevron-down" size={13} color={colors.ink} />
                </PressableScale> : null}
              </View>
            </View>
          </MapSheetHandle>
          <FlatList
            key={listKey}
            data={places}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            keyExtractor={(place) => place.id}
            initialNumToRender={5}
            maxToRenderPerBatch={5}
            windowSize={5}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => <MapPlaceRow place={item} label={labelFor(item)} distanceKm={distanceTo(item)}
              people={item.id === activePlaceId ? people : NO_PEOPLE} onSelect={onSelect} />}
            ItemSeparatorComponent={() => <View style={styles.divider} />}
            ListEmptyComponent={emptyReason === 'nearby' ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>Bu bölgede henüz mekân yok.</Text>
                {onSuggest ? <PressableScale onPress={onSuggest} accessibilityRole="button" accessibilityLabel="Mekân öner" style={styles.suggestEmpty}>
                  <Ionicons name="add" size={18} color={colors.white} />
                  <Text style={styles.suggestEmptyText}>Mekân öner</Text>
                </PressableScale> : null}
                <PressableScale onPress={onResetFilter} accessibilityRole="button" accessibilityLabel="Tüm mekânları göster" style={styles.reset}>
                  <Text style={styles.resetMuted}>Tüm mekânları göster</Text>
                </PressableScale>
              </View>
            ) : (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>Bu filtreye uyan mekân yok.</Text>
                <PressableScale onPress={onResetFilter} accessibilityRole="button" accessibilityLabel="Tüm mekânları göster" style={styles.reset}>
                  <Text style={styles.resetText}>Tüm mekânları göster</Text>
                </PressableScale>
              </View>
            )}
          />
        </>
      ) : (
        <>
          <MapSheetHandle pan={pan}><PressableScale onPress={onClose} scaleTo={1}
            style={styles.detailHandle} accessibilityRole="button" accessibilityLabel="Mekân kartını küçült">
            <View style={[styles.handle, { marginBottom: 0 }]} />
          </PressableScale></MapSheetHandle>
          <ScrollView key={selected.id} style={styles.list} contentContainerStyle={styles.detailContent}
            showsVerticalScrollIndicator={false} bounces={false}
            onContentSizeChange={(_, h) => { contentHeight.current = h; reportHeight(); }}>
            <View>
              {/* Sized from the screen, not the sheet: the sheet's height follows this content. */}
              <VenuePhoto uri={selected.imageUrl} style={[styles.hero, { height: Math.min(180, screenHeight * 0.2) }]} />
              <PressableScale onPress={onClose} style={styles.close} accessibilityRole="button" accessibilityLabel="Mekân kartını kapat">
                <Ionicons name="close" size={22} color={colors.ink} />
              </PressableScale>
            </View>
            <View style={styles.detailCopy}>
              <Text maxFontSizeMultiplier={MAP_TEXT_SCALE} style={styles.detailTitle} numberOfLines={2}>{labelFor(selected)}</Text>
              <Text maxFontSizeMultiplier={MAP_TEXT_SCALE} style={styles.detailMeta} numberOfLines={2}>
                {placeMetaLine(selected, distanceTo(selected), districtForPlace(selected) || selected.city)}
              </Text>
            </View>
            {hereCount > 0 ? <View style={styles.here}>
              {/* A count is public; identities come only from the same-venue RPC for the viewer's own check-in. */}
              {members.length > 0 ? <AvatarStack people={members} size={30} max={4} />
                : <Ionicons name="lock-closed-outline" size={15} color={colors.muted}
                    accessibilityLabel="İsimleri görmek için check-in yap" />}
              <Text maxFontSizeMultiplier={MAP_TEXT_SCALE} style={styles.hereText} numberOfLines={1}>{`${hereCount} kişi şu an burada`}</Text>
            </View> : null}
          </ScrollView>
          <View style={styles.actions}
            onLayout={(event) => { actionsHeight.current = event.nativeEvent.layout.height; reportHeight(); }}>
            <PressableScale onPress={() => onJoin(selected)} style={styles.join} accessibilityRole="button"
              accessibilityLabel={isHere ? 'Sohbete katıl' : 'Check-in yap ve sohbete katıl'}>
              <Text maxFontSizeMultiplier={MAP_TEXT_SCALE} style={styles.joinText} numberOfLines={1}>{isHere ? 'Sohbete katıl' : 'Check-in yap'}</Text>
            </PressableScale>
            <PressableScale onPress={() => onDetails(selected)} style={styles.details} accessibilityRole="button" accessibilityLabel="Mekân detayları ve yorumlar">
              <Text maxFontSizeMultiplier={MAP_TEXT_SCALE} style={styles.detailsText} numberOfLines={1}>Detaylar</Text>
            </PressableScale>
          </View>
        </>
      )}
      </>}
    </MapSheet>
  );
}

const styles = StyleSheet.create({
  // Same floating card as the people panel: inset from the edges, all corners rounded.
  panel: { backgroundColor: colors.white, borderRadius: 30, overflow: 'hidden', marginHorizontal: 10, ...shadows.soft },
  detailHandle: { height: DETAIL_HANDLE_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  panelHeader: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.track, alignSelf: 'center', marginBottom: 12 },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headingCopy: { flex: 1, minWidth: 0 },
  sort: { height: 36, maxWidth: 150, paddingHorizontal: 12, borderRadius: 18, backgroundColor: colors.bg,
    flexDirection: 'row', alignItems: 'center', gap: 4 },
  sortText: { flexShrink: 1, fontFamily: 'DMSans_700Bold', fontSize: 13, color: colors.ink },
  heading: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 22, letterSpacing: -0.5, color: colors.ink },
  list: { flex: 1, minHeight: 0 },
  listContent: { paddingHorizontal: 20, paddingBottom: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, minHeight: 76 },
  photo: { backgroundColor: colors.bgSoft, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  thumbnail: { width: 52, height: 52, borderRadius: 14 },
  rowCopy: { flex: 1, minWidth: 0, gap: 3 },
  rowTitle: { fontFamily: 'DMSans_700Bold', fontSize: 16, lineHeight: 21, color: colors.ink },
  rowMeta: { fontFamily: 'DMSans_400Regular', fontSize: 13, color: colors.muted },
  rowPeople: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 18 },
  peopleLive: { flexShrink: 1, fontFamily: 'DMSans_700Bold', fontSize: 12, color: colors.green },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line },
  empty: { alignItems: 'center', paddingVertical: 24, gap: 12 },
  emptyText: { fontFamily: 'DMSans_400Regular', color: colors.muted, fontSize: 14 },
  reset: { padding: 12 },
  suggestEmpty: { minHeight: 44, paddingHorizontal: 18, borderRadius: 22, backgroundColor: colors.ink,
    flexDirection: 'row', alignItems: 'center', gap: 6 },
  suggestEmptyText: { fontFamily: 'DMSans_700Bold', fontSize: 14, color: colors.white },
  resetText: { fontFamily: 'DMSans_700Bold', color: colors.ink, fontSize: 14 },
  resetMuted: { fontFamily: 'DMSans_500Medium', fontSize: 13, color: colors.muted },
  detailContent: { paddingHorizontal: 14, paddingBottom: 6, gap: 14 },
  hero: { width: '100%', borderRadius: 20 },
  detailCopy: { gap: 4, paddingHorizontal: 6 },
  detailTitle: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 24, lineHeight: 29, color: colors.ink, letterSpacing: -0.6 },
  detailMeta: { fontFamily: 'DMSans_400Regular', color: colors.muted, fontSize: 14 },
  here: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 6 },
  hereText: { flexShrink: 1, fontFamily: 'DMSans_700Bold', fontSize: 14, color: colors.green },
  close: { position: 'absolute', top: 10, right: 10, width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.glassStrong, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12,
    backgroundColor: colors.white },
  join: { flex: 1, minHeight: 52, paddingHorizontal: 16, borderRadius: 26, backgroundColor: colors.ink,
    alignItems: 'center', justifyContent: 'center' },
  joinText: { color: colors.white, fontFamily: 'DMSans_700Bold', fontSize: 16 },
  details: { minHeight: 52, paddingHorizontal: 20, borderRadius: 26, backgroundColor: colors.bg,
    alignItems: 'center', justifyContent: 'center' },
  detailsText: { fontFamily: 'DMSans_700Bold', fontSize: 15, color: colors.ink },
});
