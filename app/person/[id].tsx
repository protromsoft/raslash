import { useLocalSearchParams, router } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Text, TextInput, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Avatar } from '@/components/Avatar';
import { Button, Txt } from '@/components/ui';
import { SocialHeader, SocialNotice, socialStyles as s } from '@/components/SocialUI';
import { useApp } from '@/context/AppContext';
import { useSocialQuery } from '@/hooks/useSocialQuery';
import { socialAction, socialErrorText, SocialError, type SocialPerson } from '@/lib/socialDiscovery';

export default function PersonRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useApp();
  return <PersonScreen key={`${user?.id}:${id}`} id={id} />;
}
function PersonScreen({ id }: { id: string }) {
  const query = useSocialQuery<{ person: SocialPerson; thread_id?: string; status?: string }>('profile', { peer_id: id }, !!id);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef<{ body: string; id: string } | undefined>(undefined);
  const guard = useRef(false), live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const person = query.data?.person;
  const send = async () => {
    const body = draft.trim();
    if (!live.current || !body || guard.current) return;
    guard.current = true; setBusy(true); setError('');
    if (pending.current?.body !== body) pending.current = { body, id: Crypto.randomUUID() };
    try {
      const result = await socialAction<{ thread_id: string }>('send', { peer_id: id, body, request_id: pending.current.id });
      if (live.current) router.replace(`/dm/${result.thread_id}`);
    } catch (e) {
      if (live.current) {
        setError(socialErrorText(e));
        if (e instanceof SocialError && e.code === 'message_limit_reached') Alert.alert('Ücretsiz mesaj hakkın bitti', e.message,
          [{ text: 'Kapat' }, { text: 'Pro’yu incele', onPress: () => router.push('/paywall') }]);
      }
    } finally { guard.current = false; if (live.current) setBusy(false); }
  };
  return <Screen scroll footer={person && !query.data?.thread_id && person.allow_dm_requests ? <View style={{ gap: 10 }}>
    <TextInput accessibilityLabel="İlk özel mesajın" placeholder="Kendini tanıt…" value={draft} onChangeText={setDraft}
      style={s.input} multiline maxLength={500} editable={!busy} />
    {error ? <Text style={s.body}>{error}</Text> : null}
    <Button label={busy ? 'Gönderiliyor…' : 'Mesaj isteği gönder'} disabled={busy || !draft.trim()} onPress={() => void send()} />
  </View> : undefined}>
    <SocialHeader title="Üye profili" />
    {query.loading ? <ActivityIndicator /> : query.error ? <SocialNotice text={query.error} retry={query.refresh} /> : person ? <>
      <View style={s.card}>
        <Avatar uri={person.avatar_url ?? undefined} name={person.first_name} size={96} />
        <Txt variant="h2">{person.first_name}</Txt>
        {person.profession ? <Text style={s.body}>{person.profession}</Text> : null}
        {person.bio ? <Text style={s.body}>{person.bio}</Text> : null}
        {person.place_name ? <Text style={s.muted}>Check-in: {person.place_name} · {person.city}{'\n'}Bu işaret mekânı gösterir; kişinin kesin konumu değildir.</Text> : null}
      </View>
      {query.data?.thread_id ? query.data.status === 'declined'
        ? <SocialNotice text="Bu kişiye yeni mesaj isteği gönderilemiyor." />
        : <Button label="Özel sohbeti aç" onPress={() => router.replace(`/dm/${query.data!.thread_id}`)} />
        : <SocialNotice text={person.allow_dm_requests
          ? 'İlk mesajın bir istek olarak gider. Kabul edilmeden ikinci mesaj gönderemezsin. Mekân sohbetleri ve DM için toplam 15 ücretsiz mesaj hakkın var. 24 saatte en fazla 5 yeni kişiye istek gönderebilirsin.'
          : 'Bu kişi yeni mesaj isteği almıyor.'} />}
      <Button label="Kişiyi engelle" tone="outline" onPress={() => Alert.alert('Kişiyi engelle?',
        'Birbirinizi Kişiler haritasında göremez ve özel mesaj gönderemezsiniz.',
        [{ text: 'Vazgeç', style: 'cancel' }, { text: 'Engelle', style: 'destructive', onPress: async () => {
          if (!live.current) return;
          try { await socialAction('block', { peer_id: id }); if (live.current) router.back(); }
          catch (e) { if (live.current) Alert.alert('İşlem tamamlanamadı', socialErrorText(e)); }
        } }])} />
    </> : null}
  </Screen>;
}
