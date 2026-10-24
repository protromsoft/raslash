import { router, useLocalSearchParams } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Button } from '@/components/ui';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '@/components/Avatar';
import { PressableScale } from '@/components/Motion';
import { ChatComposer } from '@/components/ChatComposer';
import { SocialHeader, SocialNotice, socialStyles as s } from '@/components/SocialUI';
import { useApp } from '@/context/AppContext';
import { useSocialQuery } from '@/hooks/useSocialQuery';
import { fetchMessageAccessStatus } from '@/lib/checkIns';
import { socialAction, socialErrorText, SocialError, pageOf, type DirectConversation, type DirectMessage } from '@/lib/socialDiscovery';
import { colors } from '@/theme/colors';
import { goBackOrHome } from '@/lib/navigation';

export default function DirectMessageRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useApp();
  return <ConversationScreen key={`${user?.id}:${id}`} id={id} userId={user?.id} />;
}
function ConversationScreen({ id, userId }: { id: string; userId?: string }) {
  const query = useSocialQuery<DirectConversation>('read', { thread_id: id }, !!id && !!userId, 5000);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [older, setOlder] = useState<DirectMessage[]>([]);
  const [more, setMore] = useState(true);
  const [quota, setQuota] = useState<string>();
  const pending = useRef<{ body: string; id: string } | undefined>(undefined);
  const guard = useRef(false), live = useRef(true), epoch = useRef(0);
  const refreshQuota = async () => {
    try {
      const access = await fetchMessageAccessStatus();
      // Only a nearly-used free quota is worth a line; Pro sees nothing.
      if (live.current) setQuota(access && !access.hasUnlimited && access.messagesRemaining <= 3
        ? `${Math.max(0, access.messagesRemaining)} ücretsiz mesaj kaldı` : undefined);
    } catch { /* Quota is authoritatively enforced by the sending RPC. */ }
  };
  // Older pages stay while the app is backgrounded; they only reset when the
  // conversation itself is gone (blocked, error, another account).
  useEffect(() => {
    live.current = true; void refreshQuota();
    return () => { live.current = false; epoch.current++; };
  }, []);
  useEffect(() => { if (!query.data) { epoch.current++; setOlder([]); setMore(true); } }, [!!query.data]);
  const conversation = query.data;
  const latest = pageOf(conversation?.messages ?? []);
  const messages = [...new Map([...latest.items, ...older].map((m) => [m.id, m])).values()]
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));

  const perform = async (action: string, payload: Record<string, unknown>) => {
    if (!live.current || guard.current) return false;
    guard.current = true; setBusy(true); setError('');
    try { await socialAction(action, payload); if (live.current) await query.refresh(); return true; }
    catch (e) { if (live.current) setError(socialErrorText(e)); return false; }
    finally { guard.current = false; if (live.current) setBusy(false); }
  };
  const send = async () => {
    const body = draft.trim();
    if (!live.current || !body || guard.current) return;
    guard.current = true; setBusy(true); setError('');
    if (pending.current?.body !== body) pending.current = { body, id: Crypto.randomUUID() };
    try {
      await socialAction('send', { thread_id: id, body, request_id: pending.current.id });
      if (live.current) { setDraft(''); pending.current = undefined; await query.refresh(); void refreshQuota(); }
    } catch (e) {
      if (live.current) {
        setError(socialErrorText(e));
        if (e instanceof SocialError && e.code === 'message_limit_reached') Alert.alert('Pro ile devam et', e.message,
          [{ text: 'Kapat' }, { text: 'Pro’yu incele', onPress: () => router.push('/paywall') }]);
      }
    } finally { guard.current = false; if (live.current) setBusy(false); }
  };
  const loadOlder = async () => {
    if (guard.current || !messages.length) return;
    guard.current = true; setBusy(true); const ticket = epoch.current;
    const oldest = messages.at(-1)!;
    try {
      const result = await socialAction<DirectConversation>('read', { thread_id: id, before_time: oldest.created_at, before_id: oldest.id });
      const page = pageOf(result.messages);
      if (live.current && ticket === epoch.current) { setOlder((prev) => [...prev, ...page.items]); setMore(page.hasMore); }
    } catch (e) { if (live.current) { setOlder([]); setError(socialErrorText(e)); await query.refresh(); } }
    finally { guard.current = false; if (live.current) setBusy(false); }
  };
  const report = (message: DirectMessage) => Alert.alert('Mesajı şikâyet et',
    'Seçtiğin mesaj moderasyon ekibine iletilir. Sohbetin tamamı paylaşılmaz.', [
      { text: 'Uygunsuz içerik', onPress: () => void perform('report', { thread_id: id, message_id: message.id, reason: 'inappropriate_content' }).then((ok) => ok && Alert.alert('Şikâyetin alındı')) },
      { text: 'Taciz / spam', onPress: () => void perform('report', { thread_id: id, message_id: message.id, reason: 'harassment' }).then((ok) => ok && Alert.alert('Şikâyetin alındı')) },
      { text: 'Vazgeç', style: 'cancel' },
    ]);
  const footer = conversation?.status === 'accepted' ? <View style={{ gap: 6 }}>
    <ChatComposer inputLabel="Özel mesaj" value={draft} onChangeText={setDraft} placeholder="Mesaj yaz…"
      sending={busy} onSend={() => void send()} />
    {quota ? <Text style={[s.muted, styles.quota]} accessibilityLiveRegion="polite">{quota}</Text> : null}
  </View> : undefined;
  const requestCard = conversation?.status === 'pending' ? <View style={s.card}>
    <Text style={s.body}>{conversation.requested_by === userId
      ? 'Mesaj isteğin gönderildi. Karşı taraf kabul edince sohbet edebilirsiniz.'
      : 'Bu kişi sana mesaj göndermek istiyor. Kabul edersen özel sohbet başlayacak.'}</Text>
    {conversation.requested_by !== userId ? <View style={{ gap: 8 }}>
      <Button label="Kabul et" disabled={busy} onPress={() => void perform('respond', { thread_id: id, response: 'accepted' })} />
      <Button label="Reddet" tone="outline" disabled={busy} onPress={async () => {
        if (await perform('respond', { thread_id: id, response: 'declined' })) { if (live.current) goBackOrHome(); }
      }} /></View> : null}
  </View> : null;
  return <Screen footer={footer}>
    <SocialHeader title={conversation?.peer.first_name ?? 'Özel mesaj'}
      subtitle={conversation?.peer.place_name ? `${conversation.peer.place_name}’de` : undefined}
      leading={conversation ? <Avatar uri={conversation.peer.avatar_url ?? undefined} name={conversation.peer.first_name} size={40} /> : undefined}
      onTitlePress={conversation ? () => router.push(`/person/${conversation.peer.id}`) : undefined}
      right={conversation ? <PressableScale style={styles.more} disabled={busy} hitSlop={4} accessibilityRole="button"
        accessibilityLabel="Diğer seçenekler" onPress={() => Alert.alert(conversation.peer.first_name, undefined, [
          { text: 'Kişiyi engelle', style: 'destructive', onPress: () => Alert.alert('Kişiyi engelle?',
            'Birbirinizi haritada göremez ve özel mesaj gönderemezsiniz.', [{ text: 'Vazgeç', style: 'cancel' },
              { text: 'Engelle', style: 'destructive', onPress: async () => {
                if (await perform('block', { peer_id: conversation.peer.id })) { if (live.current) goBackOrHome(); }
              } }]) },
          { text: 'Vazgeç', style: 'cancel' },
        ])}><Ionicons name="ellipsis-horizontal" size={20} color={colors.ink} /></PressableScale> : undefined} />
    {query.loading ? <ActivityIndicator /> : query.error ? <SocialNotice text={query.error} retry={query.refresh} /> : conversation ? <>
      <FlatList inverted data={messages} keyExtractor={(item) => item.id} keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive" contentContainerStyle={{ paddingVertical: 12, gap: 8 }}
        renderItem={({ item }) => <Pressable onLongPress={item.sender_id !== userId ? () => report(item) : undefined}
          accessibilityLabel={`${item.sender_id === userId ? 'Sen' : conversation.peer.first_name}: ${item.body}`}
          accessibilityHint={item.sender_id !== userId ? 'Şikâyet etmek için basılı tut' : undefined}
          style={[styles.bubble, item.sender_id === userId ? styles.own : styles.incoming]}>
          <Text selectable style={[s.body, item.sender_id === userId && { color: colors.white }]}>{item.body}</Text>
          <Text style={[styles.time, item.sender_id === userId && { color: '#cccccc' }]}>
            {new Date(item.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</Text>
        </Pressable>}
        // The list is inverted, so the empty note is flipped back to read upright.
        ListEmptyComponent={requestCard ? null : <View style={styles.empty}>
          <Text style={[s.body, styles.emptyText]}>{`${conversation.peer.first_name} ile sohbetin burada başlayacak. İlk mesajı sen gönder.`}</Text>
        </View>}
        ListFooterComponent={<>{requestCard}{(latest.hasMore || older.length > 0) && more ? <Button label="Eski mesajları yükle" tone="outline" disabled={busy} onPress={() => void loadOlder()} /> : null}</>} />
    </> : null}
    {error ? <Text style={[s.body, { color: colors.danger, paddingVertical: 8 }]}>{error}</Text> : null}
  </Screen>;
}
const styles = StyleSheet.create({
  quota: { textAlign: 'center', fontSize: 12 },
  empty: { transform: [{ scaleY: -1 }], paddingVertical: 48, paddingHorizontal: 24 },
  emptyText: { textAlign: 'center', color: colors.muted },
  more: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  bubble: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, maxWidth: '80%', gap: 2 },
  own: { alignSelf: 'flex-end', backgroundColor: colors.ink, borderBottomRightRadius: 6 },
  incoming: { alignSelf: 'flex-start', backgroundColor: colors.white, borderBottomLeftRadius: 6 },
  time: { fontFamily: 'DMSans_400Regular', fontSize: 11, color: colors.muted, alignSelf: 'flex-end' },
});
