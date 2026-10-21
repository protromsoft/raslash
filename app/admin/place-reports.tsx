import { Image } from 'expo-image';
import { Redirect, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useApp } from '@/context/AppContext';
import { Screen } from '@/components/Screen';
import { SocialHeader, SocialNotice, socialStyles as s } from '@/components/SocialUI';
import { Button } from '@/components/ui';
import { chatPhotoUrls } from '@/lib/placePhotos';
import {
  dismissPlaceMessageReports,
  fetchPlaceMessageReports,
  removePlaceMessage,
  type PlaceMessageReport,
} from '@/lib/placeModeration';
import { colors } from '@/theme/colors';

function errorText(error: unknown) {
  return error instanceof Error && error.message ? error.message : 'Bağlantını kontrol edip tekrar dene.';
}

/** Reported place-chat messages and story photos, for admins to remove or keep. */
export default function PlaceMessageReports() {
  const { isAdmin } = useApp();
  const [reports, setReports] = useState<PlaceMessageReport[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const generation = useRef(0);

  const load = useCallback(async () => {
    const ticket = ++generation.current;
    try {
      const rows = await fetchPlaceMessageReports();
      if (ticket !== generation.current) return;
      setReports(rows);
      setError(null);
      const paths = rows.map((row) => row.photoPath).filter((path): path is string => !!path);
      if (paths.length > 0) {
        const urls = await chatPhotoUrls.resolve(paths);
        if (ticket === generation.current) setPhotoUrls((prev) => ({ ...prev, ...urls }));
      }
    } catch (e) {
      if (ticket === generation.current) setError(errorText(e));
    } finally {
      if (ticket === generation.current) setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (isAdmin) void load();
    }, [isAdmin, load]),
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  if (!isAdmin) return <Redirect href="/(tabs)/profile" />;

  const run = async (messageId: string, action: () => Promise<void>) => {
    setBusyId(messageId);
    try {
      await action();
      await load();
    } catch (e) {
      Alert.alert('İşlem tamamlanamadı', errorText(e));
    } finally {
      setBusyId(null);
    }
  };

  const confirmRemove = (report: PlaceMessageReport) => {
    Alert.alert(
      'Mesaj kaldırılsın mı?',
      report.photoPath
        ? 'Fotoğraf silinir ve mesaj herkesten gizlenir. Bu geri alınamaz.'
        : 'Mesaj herkesten gizlenir.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Kaldır',
          style: 'destructive',
          onPress: () => void run(report.messageId, () => removePlaceMessage(report)),
        },
      ],
    );
  };

  const dismiss = (report: PlaceMessageReport) =>
    void run(report.messageId, () => dismissPlaceMessageReports(report.messageId));

  return (
    <Screen>
      <SocialHeader title="Mekân şikâyetleri" />
      <Text style={[s.muted, styles.intro]}>
        Mekân sohbetlerinde şikâyet edilen mesajlar ve hikâye fotoğrafları. En son 100 kayıt.
      </Text>
      {error && reports.length === 0 ? (
        <SocialNotice text={error} retry={() => void refresh()} />
      ) : (
        <FlatList
          data={reports}
          keyExtractor={(report) => report.messageId}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
          ListEmptyComponent={<SocialNotice text={loading ? 'Yükleniyor…' : 'Şikâyet yok.'} />}
          renderItem={({ item }) => {
            const photo = item.photoPath ? photoUrls[item.photoPath] : undefined;
            const busy = busyId === item.messageId;
            return (
              <View style={s.card}>
                <Text style={s.subtitle} numberOfLines={1}>{item.placeName}</Text>
                <Text style={s.muted}>
                  {item.authorName} · {new Date(item.messageCreatedAt).toLocaleString('tr-TR')}
                  {'\n'}
                  {item.reportCount} şikâyet{item.removedAt ? ' · kaldırıldı' : ''}
                </Text>
                {item.body.trim() ? <Text style={s.body}>{item.body}</Text> : null}
                {item.photoPath ? (
                  photo ? (
                    <Image source={{ uri: photo }} style={styles.photo} contentFit="cover"
                      accessibilityLabel="Şikâyet edilen fotoğraf" />
                  ) : (
                    <View style={[styles.photo, styles.photoMissing]}>
                      <Text style={s.muted}>Fotoğraf yüklenemedi</Text>
                    </View>
                  )
                ) : null}
                <Button label="Kaldır" loading={busy} disabled={!!busyId} onPress={() => confirmRemove(item)} />
                <Button label="Şikâyeti reddet" tone="outline" disabled={!!busyId} onPress={() => dismiss(item)} />
              </View>
            );
          }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { marginBottom: 12 },
  photo: { width: '100%', aspectRatio: 3 / 4, borderRadius: 16, backgroundColor: colors.bgSoft },
  photoMissing: { alignItems: 'center', justifyContent: 'center' },
});
