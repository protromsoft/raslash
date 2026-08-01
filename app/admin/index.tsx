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
import { colors } from '@/theme/colors';
import { radii, spacing } from '@/theme/spacing';

type Tab = 'pending' | 'reviews' | 'images' | 'sync';

const TABS: [Tab, string][] = [
  ['pending', 'Onay'],
  ['reviews', 'Yorum'],
  ['images', 'Görsel'],
  ['sync', 'Sync'],
];

export default function AdminScreen() {
  const insets = useSafeAreaInsets();
  const { isAdmin } = useApp();
  const {
    places,
    pendingPlaces,
    approvePlace,
    rejectPlace,
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
      <HeaderBar onBack={() => router.back()} right={<View style={{ width: 42 }} />} />
      <View style={styles.titleRow}>
        <Txt variant="h1">Admin</Txt>
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
              title="Bekleyen mekan yok"
              body="Kullanıcı önerileri burada listelenir."
            />
          ) : (
            pendingPlaces.map((p) => (
              <Card key={p.id} style={styles.card}>
                <Text style={styles.cardTitle}>{p.name}</Text>
                <Text style={styles.meta}>
                  {p.city} · {p.category} · {p.submittedByName}
                </Text>
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
            ))
          )
        ) : null}

        {tab === 'reviews' && selected ? (
          <Card style={styles.card}>
            <Text style={styles.label}>Mekan seç</Text>
            {placePicker}
            <Text style={styles.cardTitle}>{selected.name}</Text>
            {selected.reviews.length === 0 ? (
              <Text style={styles.meta}>Bu mekanda yorum yok.</Text>
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
            <Text style={styles.label}>Mekan seç</Text>
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
            <Text style={styles.cardTitle}>Google haftalık sync</Text>
            <Text style={styles.meta}>
              Sadece admin tetikleyebilir. Çalışmaya uygun cafe ve cowork mekanları kalır, diğerleri
              elenir; uygun görsel otomatik atanır.
            </Text>
            <View style={styles.statusRow}>
              <Badge
                label={syncStatus}
                tone={syncStatus === 'error' ? 'warm' : syncStatus === 'ok' ? 'live' : 'neutral'}
              />
            </View>
            {syncMessage ? <Text style={styles.meta}>{syncMessage}</Text> : null}
            <Button
              label={syncStatus === 'syncing' ? 'Sync devam ediyor…' : 'Şimdi sync çalıştır'}
              loading={syncStatus === 'syncing'}
              onPress={() => {
                void adminSyncGoogle().then(() =>
                  Alert.alert('Sync', 'İşlem tamamlandı. Sonuç mesajını kontrol et.'),
                );
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
});
