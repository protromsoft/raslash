import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Modal, PixelRatio, Platform, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Marker, type MapMarker } from 'react-native-maps';
import { router } from 'expo-router';
import Animated, { type SharedValue } from 'react-native-reanimated';
import { Avatar } from './Avatar';
import { PressableScale } from './Motion';
import { Button } from './ui';
import { MapSheet, MapSheetHandle } from './MapSheet';
import { haptic } from '@/lib/haptics';
import { avatarAppearance } from '@/lib/avatarAppearance';
import { type SocialPerson, groupPeopleAtVenues } from '@/lib/socialDiscovery';
import { colors, shadows } from '@/theme/colors';
import { demoPortrait } from '@/data/discoveryDemo';

type VenueGroup = ReturnType<typeof groupPeopleAtVenues>[number];
const PEOPLE_MARKER_TRACK_MS = 250;
/** `redraw` exists only on Android (Google Maps bitmap markers). On iOS (Apple
 * Maps, Fabric) the command is missing and throws; tracksViewChanges covers it. */
function redrawMarker(marker: MapMarker | null) {
  if (Platform.OS === 'android') marker?.redraw();
}
/** The sheet and photo cards have fixed heights; larger Dynamic Type grows text only this far. */
const CARD_TEXT_SCALE = 1.3;
/** Fixed bitmap bounds + bounded repaint, no continuously animated map marker. */
export const PeopleMarker = memo(function PeopleMarker({ group, onSelect, demo = false }: {
  group: VenueGroup; onSelect: (placeId: string) => void; demo?: boolean;
}) {
  const person = group.people[0];
  const face = avatarAppearance(person.first_name, person.avatar_url ?? undefined);
  const portrait = demo ? demoPortrait(person.id) : undefined;
  const markerRef = useRef<MapMarker>(null);
  const [failed, setFailed] = useState<string>();
  const [tracking, setTracking] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracking only has to cover the first layout pass; image loads re-arm it via
  // `repaint`. A long window here kept dozens of markers redrawing on mode switch.
  const repaint = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setTracking(true);
    timer.current = setTimeout(() => { redrawMarker(markerRef.current); setTracking(false); }, PEOPLE_MARKER_TRACK_MS);
  }, []);
  useEffect(() => {
    setTracking(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { redrawMarker(markerRef.current); setTracking(false); }, PEOPLE_MARKER_TRACK_MS);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [face.uri, group.people.length, face.initial, portrait]);
  return <Marker ref={markerRef} coordinate={{ latitude: group.latitude, longitude: group.longitude }}
    anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={tracking} onPress={() => onSelect(group.id)}
    title={demo ? `AI demo · ${person.first_name} · Gerçek kullanıcı değil` : `${person.place_name ?? 'Mekân'} · ${group.people.length} görünür üye`}>
    <View collapsable={false} style={styles.pinBounds}>
      <View collapsable={false} style={[styles.halo, demo && styles.demoHalo]}><View style={[styles.pinFace, { backgroundColor: face.backgroundColor }]}>
        <Text style={styles.initial} allowFontScaling={false}>{face.initial}</Text>
        {portrait ? <Image source={portrait} style={StyleSheet.absoluteFill} resizeMode="cover" fadeDuration={0} onLoad={repaint} />
          : face.uri && failed !== face.uri ? <Image key={face.uri} source={{ uri: face.uri }} style={StyleSheet.absoluteFill}
          resizeMode="cover" fadeDuration={0} onLoad={repaint} onError={() => { setFailed(face.uri); repaint(); }} /> : null}
      </View></View>
      {demo ? <View style={styles.demoPinLabel}><Text style={styles.demoPinText} allowFontScaling={false}>DEMO</Text></View> : <View style={styles.dot} />}
      {group.people.length > 1 ? <View style={styles.count}><Text style={styles.countText} allowFontScaling={false}>+{group.people.length - 1}</Text></View> : null}
    </View>
  </Marker>;
});

export function PeopleMapPanel({ people, loading, error, height, venueId, ownId, hasMore, onNext, onAll, onRetry,
  demo = false, onDemo, visible, collapsed = false, openHeight = height, onCollapse, position, onContentHeight }: {
  people: SocialPerson[]; loading: boolean; error?: string; height: number; venueId?: string; ownId?: string;
  hasMore: boolean; onNext: () => void; onAll: () => void; onRetry: () => void;
  demo?: boolean; onDemo?: () => void;
  /** The viewer's own map visibility; undefined while it is still loading. */
  visible?: boolean;
  collapsed?: boolean; openHeight?: number; onCollapse?: (collapsed: boolean) => void; position?: SharedValue<number>;
  /** Height the open panel needs (handle + header + cards + footer), so the sheet can fit it. */
  onContentHeight?: (height: number) => void;
}) {
  const [previewPerson, setPreviewPerson] = useState<SocialPerson>();
  useEffect(() => { setPreviewPerson(undefined); }, [demo]);
  const { height: screenHeight } = useWindowDimensions();
  const shown = venueId ? people.filter((p) => p.place_id === venueId) : people;
  // Short sheets and large Dynamic Type both use the compact layout, so the
  // photo cards keep their names visible instead of being squeezed.
  // Decided from the screen, not the sheet: the sheet's height follows this content.
  const compact = screenHeight < 700 || PixelRatio.getFontScale() > 1.2;
  const showTryDemo = !demo && !shown.length && !!onDemo;
  const parts = useRef({ header: 0, body: 0, footer: 0, demo: 0 });
  const measure = (part: keyof typeof parts.current, value: number) => {
    parts.current[part] = value;
    const { header, body, footer, demo: demoLink } = parts.current;
    if (header > 0 && body > 0 && footer > 0) onContentHeight?.(header + body + footer + (showTryDemo ? demoLink : 0));
  };
  const cardStride = (compact ? 104 : 116) + 10;
  const lastCard = useRef(0);
  useEffect(() => { lastCard.current = 0; }, [demo, venueId, compact]);
  return <MapSheet height={height} minimum={onCollapse ? 112 : height} maximum={openHeight} position={position}
    onSnap={(open) => onCollapse?.(!open)} style={styles.panel} testID="people-map-panel">
    {({ pan, revealStyle }) => <>
    <MapSheetHandle pan={pan}><PressableScale scaleTo={1} onPress={() => onCollapse?.(!collapsed)}
      accessibilityRole="button" accessibilityLabel={collapsed ? 'Kişi panelini aç' : 'Kişi panelini küçült'}
      accessibilityHint="Yukarı veya aşağı kaydırarak da paneli açıp küçültebilirsin."
      accessibilityState={{ expanded: !collapsed }}>
    <View onLayout={(event) => measure('header', event.nativeEvent.layout.height)}>
    <View style={styles.handle} />
    <View style={[styles.header, compact && styles.compactHeader]}>
      <Text style={[styles.heading, compact && styles.compactHeading]} numberOfLines={1} maxFontSizeMultiplier={CARD_TEXT_SCALE}>{venueId ? 'Aynı mekânda buluş' : 'Çevrendeki insanlar'}</Text>
      {shown.length > 0 ? <Text style={styles.total} numberOfLines={1} maxFontSizeMultiplier={CARD_TEXT_SCALE}>{`${shown.length}${hasMore ? '+' : ''} kişi`}</Text> : null}
      <Ionicons name={collapsed ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
    </View>
    </View>
    </PressableScale></MapSheetHandle>
    <Animated.View style={[styles.revealedBody, onCollapse && revealStyle]} pointerEvents={collapsed ? 'none' : 'auto'}
      accessibilityElementsHidden={collapsed} importantForAccessibility={collapsed ? 'no-hide-descendants' : 'auto'}>
    <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={styles.body} bounces={false}
      onContentSizeChange={(_, h) => measure('body', h)}>
    {loading ? <ActivityIndicator style={{ margin: 16 }} /> : error ? <View style={styles.notice}>
      <Text style={styles.caption}>{error}</Text><Button label="Tekrar dene" tone="outline" onPress={onRetry} />
    </View> : <FlatList horizontal data={shown} keyExtractor={(person) => person.id} showsHorizontalScrollIndicator={false}
      key={`${venueId ?? 'all'}:${demo}:${compact}`} snapToInterval={cardStride} decelerationRate="fast"
      disableIntervalMomentum directionalLockEnabled bounces={false} overScrollMode="never"
      onMomentumScrollEnd={(event) => {
        const index = Math.round(event.nativeEvent.contentOffset.x / cardStride);
        if (index !== lastCard.current) { lastCard.current = index; haptic('select'); }
      }}
      contentContainerStyle={styles.list} initialNumToRender={4} maxToRenderPerBatch={4} windowSize={3}
      ListEmptyComponent={<View style={styles.empty}>
        <View style={styles.emptyIcon}><Ionicons name="cafe-outline" size={24} color={colors.green} /></View>
        <View style={{ flex: 1 }}><Text style={styles.emptyTitle} maxFontSizeMultiplier={CARD_TEXT_SCALE}>İlk merhaba senden olsun.</Text><Text style={styles.caption} maxFontSizeMultiplier={CARD_TEXT_SCALE}>
          Henüz görünür üye yok. Check-in yapıp görünürlüğünü açarak sen de katıl.</Text></View></View>}
      renderItem={({ item }) => <PressableScale style={[styles.person, compact && styles.compactPerson]} accessibilityRole="button"
        accessibilityLabel={`${demo ? 'Demo profil, ' : ''}${item.first_name}, ${item.place_name}`}
        onPress={() => demo ? setPreviewPerson(item) : router.push(item.id === ownId ? '/(tabs)/profile' : `/person/${item.id}`)}>
        <View style={[styles.photo, compact && styles.compactPhoto]}>
          <PersonPortrait person={item} demo={demo} />
          {demo ? <View style={styles.cardBadge}><Text style={styles.badgeText} maxFontSizeMultiplier={CARD_TEXT_SCALE}>DEMO</Text></View> : null}
        </View>
        <Text style={styles.name} numberOfLines={1} maxFontSizeMultiplier={CARD_TEXT_SCALE}>{item.id === ownId ? 'Sen' : item.first_name}</Text>
        <Text style={styles.meta} numberOfLines={1} maxFontSizeMultiplier={CARD_TEXT_SCALE}>
          {[item.profession, item.place_name].filter(Boolean).join(' · ')}</Text>
      </PressableScale>}
    />}
    </ScrollView>
    <View style={styles.footer} onLayout={(event) => measure('footer', event.nativeEvent.layout.height)}>
      {demo ? <>
        <Text style={[styles.footerText, styles.demoText, { flex: 1 }]} numberOfLines={2} maxFontSizeMultiplier={CARD_TEXT_SCALE}>AI DEMO · Kurgusal profiller, gerçek kullanıcı değil</Text>
        <PressableScale onPress={onDemo} hitSlop={8} accessibilityRole="button" accessibilityLabel="Gerçek kişilere dön">
          <Text style={styles.footerLink} numberOfLines={1} maxFontSizeMultiplier={CARD_TEXT_SCALE}>Gerçek kişilere dön</Text>
        </PressableScale>
      </> : <>
        <PressableScale onPress={() => router.push('/social-settings')} hitSlop={8} style={styles.visibility} accessibilityRole="button"
          accessibilityLabel={visible === undefined ? 'Görünürlüğünü ayarla' : `Görünürlüğün ${visible ? 'açık' : 'kapalı'}, değiştir`}>
          <Text style={styles.footerText} numberOfLines={1} maxFontSizeMultiplier={CARD_TEXT_SCALE}>
            {visible === undefined ? 'Görünürlüğün' : `Görünürlüğün: ${visible ? 'Açık' : 'Kapalı'}`}
            <Text style={styles.footerLink}> · Değiştir</Text></Text>
        </PressableScale>
        {venueId || hasMore ? <PressableScale onPress={venueId ? onAll : onNext} hitSlop={8} accessibilityRole="button"
          accessibilityLabel={venueId ? 'Tüm görünür kişiler' : 'Diğer kişiler'}>
          <Text style={styles.footerLink} numberOfLines={1} maxFontSizeMultiplier={CARD_TEXT_SCALE}>{venueId ? 'Tümü' : 'Diğerleri →'}</Text>
        </PressableScale> : null}
      </>}
    </View>
    {showTryDemo ? <PressableScale onPress={onDemo} style={styles.tryDemo}
      onLayout={(event) => measure('demo', event.nativeEvent.layout.height)} accessibilityRole="button" accessibilityLabel="Demo görünümünü dene">
      <Text style={styles.demoLink} maxFontSizeMultiplier={CARD_TEXT_SCALE}>AI profillerle örnek görünümü dene →</Text></PressableScale> : null}
    </Animated.View>
    <Modal visible={demo && !!previewPerson} transparent animationType="fade" onRequestClose={() => setPreviewPerson(undefined)}>
      <View style={styles.modalBackdrop}><View style={styles.preview}>
        {previewPerson ? <ScrollView contentContainerStyle={{ gap: 12 }} bounces={false}>
          <View style={styles.previewPhoto}><PersonPortrait person={previewPerson} demo /></View>
          <Text style={styles.eyebrow}>AI DEMO · GERÇEK KULLANICI DEĞİL</Text>
          <Text style={styles.previewName}>{previewPerson.first_name}</Text>
          <Text style={styles.caption}>{previewPerson.profession} · {previewPerson.bio}</Text>
          <Text style={styles.caption}>Bu profil yalnızca tasarımı denemek için cihazında gösteriliyor. Gerçek check-in veya mesajlaşma yapmaz.</Text>
        </ScrollView> : null}
        <Button label="Haritaya dön" onPress={() => setPreviewPerson(undefined)} />
      </View></View>
    </Modal>
    </>}
  </MapSheet>;
}

function PersonPortrait({ person, demo }: { person: SocialPerson; demo: boolean }) {
  const [failed, setFailed] = useState<string>();
  const source = demo ? demoPortrait(person.id) : person.avatar_url && person.avatar_url !== failed ? { uri: person.avatar_url } : undefined;
  return <View style={styles.portrait}>
    {source ? <Image source={source} style={StyleSheet.absoluteFill} resizeMode="cover"
      onError={() => setFailed(person.avatar_url ?? '')} />
      : <Avatar name={person.first_name} size={72} />}
  </View>;
}
const styles = StyleSheet.create({
  panel: { backgroundColor: colors.white, borderRadius: 30, overflow: 'hidden', marginHorizontal: 10, ...shadows.soft },
  handle: { width: 32, height: 4, borderRadius: 2, backgroundColor: colors.track, alignSelf: 'center', marginTop: 9, marginBottom: 2 },
  body: { paddingBottom: 4 },
  revealedBody: { flex: 1, minHeight: 0 },
  scroll: { flex: 1, minHeight: 0 },
  header: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  compactHeader: { paddingTop: 4, paddingBottom: 8 },
  compactHeading: { fontSize: 18, marginBottom: 0 },
  eyebrow: { fontFamily: 'DMSans_700Bold', fontSize: 11, letterSpacing: 1.1, color: colors.green, marginBottom: 4 },
  heading: { flex: 1, fontFamily: 'SpaceGrotesk_700Bold', fontSize: 22, letterSpacing: -0.5, color: colors.ink },
  caption: { fontFamily: 'DMSans_400Regular', fontSize: 11, lineHeight: 16, color: colors.muted },
  total: { fontFamily: 'DMSans_400Regular', fontSize: 13, color: colors.muted },
  list: { paddingHorizontal: 20, gap: 10 },
  person: { width: 116, gap: 4 },
  compactPerson: { width: 104 },
  photo: { height: 104, borderRadius: 18, overflow: 'hidden', backgroundColor: '#D9E6DE', marginBottom: 2 },
  compactPhoto: { height: 72 },
  portrait: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: '#D9E6DE' },
  cardBadge: { position: 'absolute', top: 9, left: 9, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 4, backgroundColor: 'rgba(17,17,16,0.48)', flexDirection: 'row', gap: 4, alignItems: 'center' },
  badgeText: { fontFamily: 'DMSans_700Bold', fontSize: 11, color: colors.white, letterSpacing: 0.3 },
  name: { fontFamily: 'DMSans_700Bold', fontSize: 14, color: colors.ink },
  meta: { fontFamily: 'DMSans_400Regular', fontSize: 12, color: colors.muted },
  footer: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 12 },
  visibility: { flex: 1, minWidth: 0 },
  footerText: { flexShrink: 1, fontFamily: 'DMSans_400Regular', fontSize: 13, color: colors.muted },
  footerLink: { fontFamily: 'DMSans_700Bold', fontSize: 13, color: colors.ink },
  // A horizontal list gives its empty component no width, so the text column needs a fixed one
  // (fits a 375pt iPhone SE after the panel inset and list padding).
  empty: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 2, paddingBottom: 12, width: 290 },
  emptyIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.greenSoft, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontFamily: 'DMSans_700Bold', fontSize: 14, color: colors.ink, marginBottom: 4 },
  tryDemo: { paddingHorizontal: 16, paddingBottom: 12, paddingTop: 2, alignItems: 'center' },
  demoLink: { fontFamily: 'DMSans_500Medium', fontSize: 11, color: '#715399' },
  demoText: { color: '#715399' },
  demoHalo: { backgroundColor: '#E5DBF5' },
  demoPinLabel: { position: 'absolute', bottom: 0, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1, backgroundColor: '#715399' },
  demoPinText: { fontFamily: 'DMSans_700Bold', fontSize: 11, color: colors.white },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(10,20,15,0.55)', justifyContent: 'center', padding: 24 },
  preview: { padding: 20, gap: 16, borderRadius: 28, backgroundColor: colors.white, width: '100%', maxWidth: 400, maxHeight: '80%', alignSelf: 'center' },
  previewName: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 22, letterSpacing: -0.5, color: colors.ink },
  previewPhoto: { height: 230, borderRadius: 18, overflow: 'hidden' },
  notice: { padding: 14, gap: 6, maxWidth: 340 },
  pinBounds: { width: 78, height: 78, alignItems: 'center', justifyContent: 'center' },
  halo: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.greenSoft, padding: 6 },
  pinFace: { width: 60, height: 60, borderRadius: 30, borderWidth: 3, borderColor: colors.white,
    overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  initial: { color: colors.white, fontFamily: 'DMSans_700Bold', fontSize: 23 },
  dot: { position: 'absolute', right: 9, top: 9, width: 15, height: 15, borderRadius: 8, borderWidth: 3,
    borderColor: colors.white, backgroundColor: colors.green },
  count: { position: 'absolute', bottom: 4, right: 4, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 12, backgroundColor: colors.ink },
  countText: { color: colors.white, fontFamily: 'DMSans_700Bold', fontSize: 11 },
});
