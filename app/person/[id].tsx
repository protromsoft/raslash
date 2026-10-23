import { Ionicons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import * as Location from 'expo-location';
import { useLocalSearchParams, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '@/components/Avatar';
import { PressableScale } from '@/components/Motion';
import { TagChips } from '@/components/ProfileTags';
import { afterSheetClose, Sheet } from '@/components/Sheet';
import { SocialNotice, socialStyles as s } from '@/components/SocialUI';
import { Button, IconButton, TextButton } from '@/components/ui';
import { useApp } from '@/context/AppContext';
import { useSocialQuery } from '@/hooks/useSocialQuery';
import { goBackOrHome } from '@/lib/navigation';
import { haversineKm } from '@/lib/presence';
import { INTERESTS, LANGUAGES } from '@/lib/profileTags';
import {
  distanceLabel,
  type FriendStatus,
  socialAction,
  socialErrorText,
  SocialError,
  type SocialPerson,
} from '@/lib/socialDiscovery';
import { colors, shadows } from '@/theme/colors';

type ProfileReply = { person: SocialPerson; thread_id?: string; status?: string; friend_status?: FriendStatus };

/** The viewer's last known position, only if location was already granted. */
function useViewerCoords() {
  const [coords, setCoords] = useState<{ latitude: number; longitude: number }>();
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const pos = await Location.getLastKnownPositionAsync({ maxAge: 10 * 60_000 });
        if (live && pos) setCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      } catch {
        // Distance is optional.
      }
    })();
    return () => { live = false; };
  }, []);
  return coords;
}

export default function PersonRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useApp();
  return <PersonScreen key={`${user?.id}:${id}`} id={id} />;
}

function PersonScreen({ id }: { id: string }) {
  const insets = useSafeAreaInsets();
  const query = useSocialQuery<ProfileReply>('profile', { peer_id: id }, !!id);
  const viewer = useViewerCoords();
  const person = query.data?.person;
  const [friendStatus, setFriendStatus] = useState<FriendStatus>();
  const friend = friendStatus ?? query.data?.friend_status ?? 'none';
  const [friendBusy, setFriendBusy] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef<{ body: string; id: string } | undefined>(undefined);
  const guard = useRef(false), live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  // A poll with the server's view replaces our optimistic friend state.
  useEffect(() => { setFriendStatus(undefined); }, [query.data?.friend_status]);

  const threadId = query.data?.thread_id && query.data.status !== 'declined' ? query.data.thread_id : undefined;
  const canRequestDm = !!person?.allow_dm_requests && !query.data?.thread_id;

  const send = async () => {
    const body = draft.trim();
    if (!live.current || !body || guard.current) return;
    guard.current = true; setBusy(true); setError('');
    if (pending.current?.body !== body) pending.current = { body, id: Crypto.randomUUID() };
    try {
      const result = await socialAction<{ thread_id: string }>('send', { peer_id: id, body, request_id: pending.current.id });
      if (!live.current) return;
      setComposeOpen(false);
      afterSheetClose(() => router.replace(`/dm/${result.thread_id}`));
    } catch (e) {
      if (live.current) {
        setError(socialErrorText(e));
        if (e instanceof SocialError && e.code === 'message_limit_reached') Alert.alert('Ücretsiz mesaj hakkın bitti', e.message,
          [{ text: 'Kapat' }, { text: 'Pro’yu incele', onPress: () => router.push('/paywall') }]);
      }
    } finally { guard.current = false; if (live.current) setBusy(false); }
  };

  const friendAction = async (action: 'friend_request' | 'friend_remove' | 'friend_respond', response?: 'accepted' | 'declined') => {
    if (friendBusy) return;
    setFriendBusy(true);
    try {
      const result = await socialAction<{ friend_status: FriendStatus }>(action,
        response ? { peer_id: id, response } : { peer_id: id });
      if (live.current) setFriendStatus(result.friend_status);
    } catch (e) {
      if (live.current) Alert.alert('İşlem tamamlanamadı', socialErrorText(e));
    } finally { if (live.current) setFriendBusy(false); }
  };

  const onFriendPress = () => {
    if (friend === 'none') return void friendAction('friend_request');
    if (friend === 'incoming') {
      return Alert.alert(`${person?.first_name ?? 'Bu kişi'} seni arkadaş olarak ekledi`, undefined, [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'Reddet', style: 'destructive', onPress: () => void friendAction('friend_respond', 'declined') },
        { text: 'Kabul et', onPress: () => void friendAction('friend_respond', 'accepted') },
      ]);
    }
    Alert.alert(friend === 'friends' ? 'Arkadaşlıktan çıkar?' : 'İsteği geri çek?', undefined, [
      { text: 'Vazgeç', style: 'cancel' },
      { text: friend === 'friends' ? 'Çıkar' : 'Geri çek', style: 'destructive', onPress: () => void friendAction('friend_remove') },
    ]);
  };

  const onMessagePress = () => {
    if (threadId) return router.push(`/dm/${threadId}`);
    if (canRequestDm) return setComposeOpen(true);
    Alert.alert('Mesaj gönderilemiyor', query.data?.status === 'declined'
      ? 'Bu kişiye yeni mesaj isteği gönderilemiyor.'
      : 'Bu kişi şu anda yeni mesaj isteği almıyor.');
  };

  const block = () => Alert.alert('Kişiyi engelle?',
    'Birbirinizi Kişiler haritasında göremez, arkadaş olamaz ve özel mesaj gönderemezsiniz.',
    [{ text: 'Vazgeç', style: 'cancel' }, { text: 'Engelle', style: 'destructive', onPress: async () => {
      if (!live.current) return;
      try { await socialAction('block', { peer_id: id }); if (live.current) goBackOrHome(); }
      catch (e) { if (live.current) Alert.alert('İşlem tamamlanamadı', socialErrorText(e)); }
    } }]);

  const distance = viewer && Number.isFinite(person?.latitude) && Number.isFinite(person?.longitude)
    ? distanceLabel(haversineKm(viewer, { latitude: person!.latitude!, longitude: person!.longitude! })) : '';
  const meta = [person?.place_name, distance].filter(Boolean).join(' · ');
  const about = [person?.profession, person?.bio].filter((part) => part?.trim());
  const friendLabel = { none: 'Arkadaş ekle', outgoing: 'İstek gönderildi', incoming: 'İsteği yanıtla', friends: 'Arkadaşsınız' }[friend];
  const friendIcon = ({ none: 'person-add-outline', outgoing: 'time-outline', incoming: 'mail-unread-outline', friends: 'checkmark-circle' } as const)[friend];
  const messageReady = !!threadId || canRequestDm;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topBar}>
        <IconButton icon="chevron-back" onPress={goBackOrHome} accessibilityLabel="Geri" />
        {person ? <IconButton icon="ellipsis-horizontal" onPress={() => setMenuOpen(true)} accessibilityLabel="Profil seçenekleri" /> : null}
      </View>
      {query.loading ? <ActivityIndicator style={{ marginTop: 40 }} color={colors.ink} />
        : query.error ? <View style={styles.pad}><SocialNotice text={query.error} retry={query.refresh} /></View>
        : person ? (
          <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]} showsVerticalScrollIndicator={false}>
            <View style={styles.photo}>
              <Avatar uri={person.avatar_url ?? undefined} name={person.first_name} size={180} />
            </View>
            <Text style={styles.name} accessibilityRole="header">
              {person.first_name}{person.age ? `, ${person.age}` : ''}
            </Text>
            {meta ? <Text style={styles.meta}>{meta}</Text> : null}

            <View style={styles.actions}>
              <PressableScale style={[styles.action, styles.friendAction]} onPress={onFriendPress} disabled={friendBusy}
                accessibilityRole="button" accessibilityLabel={friendLabel} accessibilityState={{ busy: friendBusy }}>
                {friendBusy ? <ActivityIndicator color={colors.ink} />
                  : <><Ionicons name={friendIcon} size={20} color={friend === 'friends' ? colors.green : colors.ink} />
                    <Text style={styles.friendText} numberOfLines={1}>{friendLabel}</Text></>}
              </PressableScale>
              <PressableScale style={[styles.action, styles.messageAction, !messageReady && styles.messageMuted]}
                onPress={onMessagePress} accessibilityRole="button" accessibilityLabel="Mesaj">
                <Ionicons name="chatbubble-outline" size={19} color={messageReady ? colors.white : colors.muted} />
                <Text style={[styles.messageText, !messageReady && styles.messageTextMuted]} numberOfLines={1}>Mesaj</Text>
              </PressableScale>
            </View>

            {about.length ? <View style={styles.section}>
              <Text style={styles.sectionTitle}>Hakkında</Text>
              {person.profession ? <Text style={styles.profession}>{person.profession}</Text> : null}
              {person.bio ? <Text style={styles.body}>{person.bio}</Text> : null}
            </View> : null}
            {person.languages?.length ? <View style={styles.section}>
              <Text style={styles.sectionTitle}>Diller</Text>
              <TagChips keys={person.languages} list={LANGUAGES} />
            </View> : null}
            {person.interests?.length ? <View style={styles.section}>
              <Text style={styles.sectionTitle}>İlgi alanları</Text>
              <TagChips keys={person.interests} list={INTERESTS} />
            </View> : null}
            {person.place_name ? <Text style={styles.note}>
              Konum, kişinin check-in yaptığı mekânı gösterir; kesin konumu değildir.</Text> : null}
          </ScrollView>
        ) : null}

      <Sheet visible={composeOpen} onClose={() => setComposeOpen(false)} title={`${person?.first_name ?? ''} ile tanış`}
        subtitle="İlk mesajın bir istek olarak gider; kabul edilene kadar ikinci mesajı gönderemezsin.">
        <View style={styles.compose}>
          <TextInput accessibilityLabel="İlk özel mesajın" placeholder="Kendini tanıt…" value={draft} onChangeText={setDraft}
            style={s.input} multiline maxLength={500} autoFocus />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button label={busy ? 'Gönderiliyor…' : 'Mesaj isteği gönder'} disabled={busy || !draft.trim()} onPress={() => void send()} />
        </View>
      </Sheet>

      <Sheet visible={menuOpen} onClose={() => setMenuOpen(false)}>
        <View style={styles.compose}>
          <Button label="Kişiyi engelle" tone="outline" onPress={() => { setMenuOpen(false); afterSheetClose(block); }} />
          <TextButton label="Vazgeç" onPress={() => setMenuOpen(false)} />
        </View>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20 },
  pad: { padding: 20 },
  content: { paddingHorizontal: 20, paddingTop: 8, alignItems: 'stretch' },
  photo: { alignSelf: 'center', borderRadius: 90, marginBottom: 20, ...shadows.card },
  name: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 34, letterSpacing: -0.8, color: colors.ink, textAlign: 'center' },
  meta: { fontFamily: 'DMSans_400Regular', fontSize: 15, color: colors.muted, textAlign: 'center', marginTop: 6 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 24 },
  action: { flex: 1, minHeight: 56, borderRadius: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingHorizontal: 12 },
  friendAction: { backgroundColor: colors.white, ...shadows.soft },
  friendText: { fontFamily: 'DMSans_700Bold', fontSize: 16, color: colors.ink, flexShrink: 1 },
  messageAction: { backgroundColor: colors.ink, ...shadows.soft },
  messageMuted: { backgroundColor: colors.bgSoft, shadowOpacity: 0, elevation: 0 },
  messageText: { fontFamily: 'DMSans_700Bold', fontSize: 16, color: colors.white },
  messageTextMuted: { color: colors.muted },
  section: { marginTop: 28, gap: 12 },
  sectionTitle: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 20, letterSpacing: -0.4, color: colors.ink },
  profession: { fontFamily: 'DMSans_700Bold', fontSize: 15, color: colors.ink },
  body: { fontFamily: 'DMSans_400Regular', fontSize: 15, lineHeight: 22, color: colors.inkSoft },
  note: { fontFamily: 'DMSans_400Regular', fontSize: 12, lineHeight: 17, color: colors.muted, marginTop: 28, textAlign: 'center' },
  compose: { gap: 12 },
  error: { fontFamily: 'DMSans_500Medium', fontSize: 13.5, color: colors.danger },
});
