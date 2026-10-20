import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Redirect, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PressableScale } from '@/components/Motion';
import { HeaderBar } from '@/components/Screen';
import { Badge, Button, Card, EmptyState, Field, Txt } from '@/components/ui';
import { useApp } from '@/context/AppContext';
import { usePlaces } from '@/context/PlacesContext';
import { CAFE_IMAGES, COWORK_IMAGES } from '@/lib/placeImages';
import { classifyGooglePlace } from '@/lib/placeFilter';
import { SCAN_CITIES, scanPointsFor } from '@/lib/placeScanGrid';
import type { CityKey } from '@/data/cities';
import type { Place } from '@/data/types';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { colors } from '@/theme/colors';
import { radii, spacing } from '@/theme/spacing';
import { goBackOrHome } from '@/lib/navigation';

type Tab = 'pending' | 'reviews' | 'images' | 'sync' | 'push';

const ALL_REASONS = '__all__';
/** One Nearby Search per point and type (cafe, coffee_shop, coworking_space). */
const SYNC_CITIES = SCAN_CITIES.map((city) => ({
  key: city.citySlug as CityKey, label: city.city, radiusKm: city.radiusKm, requests: scanPointsFor(city).length * 3,
}));

/** Why a place is waiting, so similar places can be reviewed together. */
function pendingReason(place: Place) {
  if (place.source === 'user') return 'Kullanıcı önerisi';
  if (!place.googleTypes?.length && !place.googlePrimaryType) return 'Google tipi bilinmiyor';
  const decision = classifyGooglePlace({ name: place.name, primaryType: place.googlePrimaryType,
    types: place.googleTypes, businessStatus: place.businessStatus });
  return decision.reason;
}

const TABS: [Tab, string][] = [
  ['pending', 'Onay'],
  ['reviews', 'Yorum'],
  ['images', 'Görsel'],
  ['sync', 'Sync'],
  ['push', 'Bildirim'],
];

export default function AdminScreen() {
  const insets = useSafeAreaInsets();
  const { isAdmin } = useApp();
  const {
    places,
    pendingPlaces,
    approvePlace,
    rejectPlace,
    setPendingPlacesStatus,
    deleteReview,
    addAdminReview,
    updatePlaceImage,
    adminSyncGoogle,
    syncStatus,
    syncMessage,
  } = usePlaces();

  const [tab, setTab] = useState<Tab>('pending');
  const [selectedPlaceId, setSelectedPlaceId] = useState(places[0]?.id ?? '');
  const [adminComment, setAdminComment] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [pushTitle, setPushTitle] = useState('RASLASH');
  const [pushBody, setPushBody] = useState('');
  const [sendingPush, setSendingPush] = useState(false);

  const [syncCity, setSyncCity] = useState<CityKey>('izmir');
  const [reasonFilter, setReasonFilter] = useState(ALL_REASONS);
  const [checked, setChecked] = useState<Set<string>>(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMessage, setBulkMessage] = useState('');
  const reasons = useMemo(() => {
    const byReason = new Map<string, number>();
    for (const place of pendingPlaces) {
      const reason = pendingReason(place);
      byReason.set(reason, (byReason.get(reason) ?? 0) + 1);
    }
    return [...byReason.entries()].sort((a, b) => b[1] - a[1]);
  }, [pendingPlaces]);
  const visiblePending = useMemo(
    () => reasonFilter === ALL_REASONS ? pendingPlaces : pendingPlaces.filter((p) => pendingReason(p) === reasonFilter),
    [pendingPlaces, reasonFilter],
  );
  // Selection only ever holds places that are still pending.
  const checkedIds = useMemo(() => pendingPlaces.filter((p) => checked.has(p.id)).map((p) => p.id), [checked, pendingPlaces]);
  const allVisibleChecked = visiblePending.length > 0 && visiblePending.every((p) => checked.has(p.id));
  const toggle = (id: string) => setChecked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleVisible = () => setChecked((prev) => {
    const next = new Set(prev);
    for (const p of visiblePending) {
      if (allVisibleChecked) next.delete(p.id); else next.add(p.id);
    }
    return next;
  });
  const runBulk = (status: 'approved' | 'rejected') => {
    const count = checkedIds.length;
    if (!count || bulkBusy) return;
    const verb = status === 'approved' ? 'onayla' : 'reddet';
    Alert.alert(
      `${count} mekânı ${verb}?`,
      status === 'approved'
        ? 'Seçilen mekânlar hemen haritada görünür.'
        : 'Seçilen mekânlar listeye eklenmez. Gerekirse admin panelinden geri alınabilir.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: status === 'approved' ? 'Onayla' : 'Reddet',
          style: status === 'approved' ? 'default' : 'destructive',
          onPress: () => {
            setBulkBusy(true);
            setBulkMessage('');
            void setPendingPlacesStatus(checkedIds, status)
              .then((done) => {
                setChecked(new Set());
                setBulkMessage(`${done} mekân ${status === 'approved' ? 'onaylandı' : 'reddedildi'}.`);
              })
              .catch((error) => setBulkMessage(`İşlem tamamlanamadı: ${error instanceof Error ? error.message : 'bilinmeyen hata'}`))
              .finally(() => setBulkBusy(false));
          },
        },
      ],
    );
  };

  const selected = useMemo(
    () => places.find((p) => p.id === selectedPlaceId) ?? places[0],
    [places, selectedPlaceId],
  );

  if (!isAdmin) {
    return <Redirect href="/(tabs)/profile" />;
  }

  const placePicker = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsRow}>
      {places.map((p) => (
        <PressableScale
          key={p.id}
          scaleTo={0.94}
          style={[styles.chip, selected?.id === p.id && styles.chipActive]}
          onPress={() => setSelectedPlaceId(p.id)}
        >
          <Text
            style={[styles.chipText, selected?.id === p.id && styles.chipTextActive]}
            numberOfLines={1}
          >
            {p.name}
          </Text>
        </PressableScale>
      ))}
    </ScrollView>
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.sm }]}>
      <HeaderBar onBack={goBackOrHome} right={<View style={{ width: 42 }} />} />
      <View style={styles.titleRow}>
        <Txt variant="h1">Admin</Txt>
        <Button label="DM şikâyetleri" tone="outline" onPress={() => router.push('/admin/social-reports')} />
        {pendingPlaces.length > 0 ? (
          <Badge label={`${pendingPlaces.length} onay bekliyor`} tone="warm" />
        ) : null}
      </View>

      <View style={styles.tabs}>
        {TABS.map(([key, label]) => (
          <PressableScale
            key={key}
            scaleTo={0.95}
            style={[styles.tab, tab === key && styles.tabActive]}
            onPress={() => setTab(key)}
          >
            <Text style={[styles.tabText, tab === key && styles.tabTextActive]}>{label}</Text>
          </PressableScale>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {tab === 'pending' ? (
          pendingPlaces.length === 0 ? (
            <EmptyState
              icon="checkmark-done-outline"
              title="Bekleyen mekân yok"
              body="Kullanıcı önerileri ve Google taramasından gelen yeni mekânlar burada listelenir."
            />
          ) : (
            <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsRow}>
              {[[ALL_REASONS, pendingPlaces.length] as const, ...reasons].map(([reason, count]) => (
                <PressableScale key={reason} scaleTo={0.94} onPress={() => setReasonFilter(reason)}
                  accessibilityRole="button" accessibilityState={{ selected: reasonFilter === reason }}
                  style={[styles.chip, styles.reasonChip, reasonFilter === reason && styles.chipActive]}>
                  <Text style={[styles.chipText, reasonFilter === reason && styles.chipTextActive]} numberOfLines={1}>
                    {reason === ALL_REASONS ? 'Tümü' : reason} · {count}
                  </Text>
                </PressableScale>
              ))}
            </ScrollView>
            <View style={styles.bulkBar}>
              <PressableScale onPress={toggleVisible} style={styles.selectAll} accessibilityRole="checkbox"
                accessibilityState={{ checked: allVisibleChecked }} hitSlop={6}>
                <Ionicons name={allVisibleChecked ? 'checkbox' : 'square-outline'} size={22} color={colors.ink} />
                <Text style={styles.selectAllText}>
                  {allVisibleChecked ? 'Seçimi kaldır' : `Görünen ${visiblePending.length} mekânı seç`}
                </Text>
              </PressableScale>
              {checkedIds.length > 0 ? <Text style={styles.meta}>{checkedIds.length} seçili</Text> : null}
            </View>
            {checkedIds.length > 0 ? (
              <View style={styles.row}>
                <Button label={`Seçilenleri onayla (${checkedIds.length})`} icon="checkmark-done" style={styles.flex}
                  size="sm" loading={bulkBusy} disabled={bulkBusy} onPress={() => runBulk('approved')} />
                <Button label="Reddet" tone="outline" size="sm" full={false} disabled={bulkBusy}
                  onPress={() => runBulk('rejected')} />
              </View>
            ) : null}
            {bulkMessage ? <Text style={styles.meta} accessibilityLiveRegion="polite">{bulkMessage}</Text> : null}
            {visiblePending.map((p) => (
              <Card key={p.id} style={styles.card}>
                <PressableScale onPress={() => toggle(p.id)} style={styles.cardHead} scaleTo={0.99}
                  accessibilityRole="checkbox" accessibilityState={{ checked: checked.has(p.id) }}
                  accessibilityLabel={`${p.name} seç`}>
                  <Ionicons name={checked.has(p.id) ? 'checkbox' : 'square-outline'} size={22} color={colors.ink} />
                  <View style={styles.flex}>
                    <Text style={styles.cardTitle}>{p.name}</Text>
                    <Text style={styles.meta}>
                      {p.city} · {p.category} · {p.submittedByName ?? (p.source === 'google' ? 'Google taraması' : 'Kullanıcı')}
                    </Text>
                    <Text style={styles.reason}>{pendingReason(p)}</Text>
                  </View>
                </PressableScale>
                <View style={styles.row}>
                  <Button
                    label="Onayla"
                    icon="checkmark"
                    style={styles.flex}
                    onPress={() => void approvePlace(p.id)}
                  />
                  <Button
                    label="Reddet"
                    tone="outline"
                    style={styles.flex}
                    onPress={() => void rejectPlace(p.id)}
                  />
                </View>
              </Card>
            ))}
            </>
          )
        ) : null}

        {tab === 'reviews' && selected ? (
          <Card style={styles.card}>
            <Text style={styles.label}>Mekân seç</Text>
            {placePicker}
            <Text style={styles.cardTitle}>{selected.name}</Text>
            {selected.reviews.length === 0 ? (
              <Text style={styles.meta}>Bu mekânda yorum yok.</Text>
            ) : (
              selected.reviews.map((r) => (
                <View key={r.id} style={styles.reviewRow}>
                  <View style={styles.flex}>
                    <Text style={styles.reviewAuthor}>{r.author}</Text>
                    <Text style={styles.reviewText}>{r.text || '(sadece puan)'}</Text>
                  </View>
                  <PressableScale onPress={() => void deleteReview(selected.id, r.id)} hitSlop={8}>
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  </PressableScale>
                </View>
              ))
            )}
            <Field
              label="Admin yorumu"
              value={adminComment}
              onChangeText={setAdminComment}
              placeholder="Yorum ekle…"
            />
            <Button
              label="Yorum ekle"
              disabled={!adminComment.trim()}
              onPress={() => {
                void addAdminReview(selected.id, adminComment.trim()).then(() => setAdminComment(''));
              }}
            />
          </Card>
        ) : null}

        {tab === 'images' && selected ? (
          <Card style={styles.card}>
            <Text style={styles.label}>Mekân seç</Text>
            {placePicker}
            <Text style={styles.cardTitle}>{selected.name}</Text>
            {selected.imageUrl ? (
              <Image source={{ uri: selected.imageUrl }} style={styles.preview} contentFit="cover" />
            ) : null}
            <Text style={styles.label}>Hazır görsellerden seç</Text>
            <View style={styles.imageGrid}>
              {[...CAFE_IMAGES, ...COWORK_IMAGES].map((url) => (
                <PressableScale
                  key={url}
                  scaleTo={0.92}
                  onPress={() => void updatePlaceImage(selected.id, url)}
                >
                  <Image source={{ uri: url }} style={styles.thumb} contentFit="cover" />
                </PressableScale>
              ))}
            </View>
            <Field
              label="veya URL yapıştır"
              value={imageUrl}
              onChangeText={setImageUrl}
              placeholder="https://…"
              autoCapitalize="none"
            />
            <Button
              label="Görseli uygula"
              disabled={!imageUrl.trim()}
              onPress={() => {
                void updatePlaceImage(selected.id, imageUrl.trim()).then(() => setImageUrl(''));
              }}
            />
          </Card>
        ) : null}

        {tab === 'sync' ? (
          <Card style={styles.card}>
            <Text style={styles.cardTitle}>Google taraması</Text>
            <Text style={styles.meta}>
              Seçilen şehri 2,5 km aralıklı noktalardan tarar. Yeni mekânlar “Onay” sekmesine düşer;
              onayladıkların ve reddettiklerin olduğu gibi kalır. Kapalı işletmeler alınmaz.
            </Text>
            <View style={styles.row}>
              {SYNC_CITIES.map((city) => (
                <PressableScale key={city.key} scaleTo={0.96} onPress={() => setSyncCity(city.key)}
                  disabled={syncStatus === 'syncing'} accessibilityRole="radio"
                  accessibilityState={{ selected: syncCity === city.key }}
                  style={[styles.cityOption, syncCity === city.key && styles.cityOptionActive]}>
                  <Text style={[styles.cityName, syncCity === city.key && styles.chipTextActive]}>{city.label}</Text>
                  <Text style={[styles.cityMeta, syncCity === city.key && styles.cityMetaActive]}>
                    {city.radiusKm} km · ~{city.requests} istek
                  </Text>
                </PressableScale>
              ))}
            </View>
            <View style={styles.statusRow}>
              <Badge
                label={syncStatus}
                tone={syncStatus === 'error' ? 'warm' : syncStatus === 'ok' ? 'live' : 'neutral'}
              />
            </View>
            {syncMessage ? <Text style={styles.meta}>{syncMessage}</Text> : null}
            <Button
              label={syncStatus === 'syncing'
                ? 'Tarama devam ediyor…'
                : `${SYNC_CITIES.find((c) => c.key === syncCity)?.label} taramasını başlat`}
              loading={syncStatus === 'syncing'}
              disabled={syncStatus === 'syncing'}
              onPress={() => {
                const city = SYNC_CITIES.find((c) => c.key === syncCity);
                if (!city) return;
                Alert.alert(
                  `${city.label} taransın mı?`,
                  `Yaklaşık ${city.requests} Google Places isteği atılır (ücretli). Yeni mekânlar onay bekler.`,
                  [
                    { text: 'Vazgeç', style: 'cancel' },
                    { text: 'Taramayı başlat', onPress: () => void adminSyncGoogle(city.key) },
                  ],
                );
              }}
            />
          </Card>
        ) : null}

        {tab === 'push' ? (
          <Card style={styles.card}>
            <Text style={styles.cardTitle}>Toplu bildirim gönder</Text>
            <Text style={styles.meta}>
              Bildirim izni veren tüm cihazlara gider ve uygulama içi Bildirimler ekranına da
              kaydedilir.
            </Text>
            <Field
              label="Başlık"
              value={pushTitle}
              onChangeText={setPushTitle}
              maxLength={80}
              placeholder="RASLASH"
            />
            <Field
              label="Mesaj"
              value={pushBody}
              onChangeText={setPushBody}
              maxLength={240}
              multiline
              placeholder="Kullanıcılara gönderilecek mesaj…"
            />
            <Button
              label={sendingPush ? 'Gönderiliyor…' : 'Bildirimi gönder'}
              icon="send-outline"
              loading={sendingPush}
              disabled={!pushTitle.trim() || !pushBody.trim()}
              onPress={() => {
                if (!isSupabaseConfigured || !supabase) {
                  Alert.alert('Bildirim', 'Supabase bağlantısı yok.');
                  return;
                }
                setSendingPush(true);
                void supabase.functions
                  .invoke('send-push-notification', {
                    body: { title: pushTitle.trim(), body: pushBody.trim() },
                  })
                  .then(({ data, error }) => {
                    if (error) throw error;
                    setPushBody('');
                    Alert.alert(
                      'Bildirim gönderildi',
                      `${Number(data?.accepted ?? 0)} cihaz gönderimi kabul etti.`,
                    );
                  })
                  .catch((error) => {
                    Alert.alert(
                      'Bildirim gönderilemedi',
                      error instanceof Error ? error.message : 'Bilinmeyen hata',
                    );
                  })
                  .finally(() => setSendingPush(false));
              }}
            />
          </Card>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.lg },
  flex: { flex: 1 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  tabs: { flexDirection: 'row', gap: 6, marginBottom: spacing.md },
  tab: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: radii.pill,
    paddingVertical: 10,
    alignItems: 'center',
  },
  tabActive: { backgroundColor: colors.ink },
  tabText: { fontFamily: 'DMSans_500Medium', fontSize: 13, color: colors.inkSoft },
  tabTextActive: { color: colors.white },
  content: { gap: 12 },
  card: { gap: 10 },
  cardTitle: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 17, color: colors.ink },
  meta: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 13.5,
    lineHeight: 20,
    color: colors.muted,
  },
  row: { flexDirection: 'row', gap: 8 },
  label: { fontFamily: 'DMSans_500Medium', fontSize: 13, color: colors.muted },
  chipsRow: { maxHeight: 42 },
  chip: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginRight: 8,
    maxWidth: 170,
  },
  chipActive: { backgroundColor: colors.ink },
  chipText: { fontFamily: 'DMSans_500Medium', fontSize: 12.5, color: colors.ink },
  chipTextActive: { color: colors.white },
  reviewRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.sm,
    padding: 10,
  },
  reviewAuthor: { fontFamily: 'DMSans_700Bold', fontSize: 14, color: colors.ink },
  reviewText: { fontFamily: 'DMSans_400Regular', fontSize: 13, color: colors.muted },
  preview: { width: '100%', height: 150, borderRadius: radii.md },
  imageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  thumb: { width: 70, height: 70, borderRadius: 12 },
  statusRow: { flexDirection: 'row' },
  reasonChip: { maxWidth: 280 },
  cityOption: { flex: 1, minHeight: 64, borderRadius: radii.md, paddingHorizontal: 10, paddingVertical: 10,
    backgroundColor: colors.surfaceAlt, justifyContent: 'center', gap: 2 },
  cityOptionActive: { backgroundColor: colors.ink },
  cityName: { fontFamily: 'DMSans_700Bold', fontSize: 14, color: colors.ink },
  cityMeta: { fontFamily: 'DMSans_400Regular', fontSize: 12, color: colors.muted },
  cityMetaActive: { color: 'rgba(255,255,255,0.72)' },
  bulkBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  selectAll: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  selectAllText: { fontFamily: 'DMSans_700Bold', fontSize: 14, color: colors.ink },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  reason: { fontFamily: 'DMSans_500Medium', fontSize: 12.5, color: colors.inkSoft },
});
