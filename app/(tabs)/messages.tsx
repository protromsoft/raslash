import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useApp } from '@/context/AppContext';
import { Screen } from '@/components/Screen';
import { Avatar } from '@/components/Avatar';
import { PressableScale } from '@/components/Motion';
import { Button, EmptyState, Txt } from '@/components/ui';
import { SocialNotice, socialStyles as s } from '@/components/SocialUI';
import { useSocialQuery } from '@/hooks/useSocialQuery';
import { pageOf, type DirectThread, type SocialFriend } from '@/lib/socialDiscovery';
import { colors } from '@/theme/colors';

/** "14:32" today, "Dün", a weekday within the week, otherwise "3 Eki". */
function threadTime(iso: string, now = new Date()) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (days <= 0) return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  if (days === 1) return 'Dün';
  if (days < 7) return date.toLocaleDateString('tr-TR', { weekday: 'short' });
  return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}

export default function MessagesRoute() {
  const { user } = useApp();
  return <MessagesScreen key={user?.id} userId={user?.id} />;
}
function MessagesScreen({ userId }: { userId?: string }) {
  const [cursor, setCursor] = useState<{ before_time?: string; before_id?: string }>({});
  const [requestsOnly, setRequestsOnly] = useState(false);
  const query = useSocialQuery<{ threads: DirectThread[] }>('inbox', cursor);
  const friendsQuery = useSocialQuery<{ friends: SocialFriend[] }>('friends', {}, true, 30000);
  // Incoming requests first (they need an answer), then friends; outgoing stay on the profile.
  const friends = (friendsQuery.data?.friends ?? []).filter((f) => f.direction !== 'outgoing')
    .sort((a, b) => Number(b.direction === 'incoming') - Number(a.direction === 'incoming'));
  const page = pageOf(query.data?.threads ?? []);
  const last = page.items.at(-1);
  // Incoming requests are gathered into one card instead of mixing into chats.
  const isRequest = (thread: DirectThread) => thread.status === 'pending' && thread.requested_by !== userId;
  const requests = page.items.filter(isRequest);
  const shown = requestsOnly ? requests : page.items.filter((thread) => !isRequest(thread));
  // Only a pull shows the spinner; background polls refresh silently.
  const [pulling, setPulling] = useState(false);
  const pull = useCallback(async () => {
    setPulling(true);
    try { await query.refresh(); } finally { setPulling(false); }
  }, [query.refresh]);
  const header = <>
    {!requestsOnly && friends.length > 0 ? <View style={styles.friends}>
      <Text style={styles.friendsTitle}>Arkadaşlar</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.friendRow}>
        {friends.map((friend) => {
          const incoming = friend.direction === 'incoming';
          return <PressableScale key={friend.id} style={styles.friend} onPress={() => router.push(`/person/${friend.id}`)}
            accessibilityRole="button" accessibilityLabel={incoming ? `${friend.first_name}, arkadaşlık isteği` : friend.first_name}>
            <View style={[styles.friendRing, incoming && styles.friendRingNew]}>
              <Avatar uri={friend.avatar_url ?? undefined} name={friend.first_name} size={58} />
            </View>
            <Text style={styles.friendName} numberOfLines={1}>{friend.first_name}</Text>
            {incoming ? <Text style={styles.friendBadge} numberOfLines={1}>İstek</Text> : null}
          </PressableScale>;
        })}
      </ScrollView>
    </View> : null}
    {!requestsOnly && requests.length > 0 ? <PressableScale style={styles.requests} onPress={() => setRequestsOnly(true)}
      accessibilityRole="button" accessibilityLabel={`${requests.length} mesaj isteği`}>
      <View style={styles.requestFaces}>{requests.slice(0, 2).map((thread, index) =>
        <View key={thread.id} style={[styles.requestFace, index > 0 && styles.requestFaceOverlap]}>
          <Avatar uri={thread.avatar_url} name={thread.first_name} size={28} /></View>)}</View>
      <Text style={styles.requestsTitle} numberOfLines={1}>{requests.length} mesaj isteği</Text>
      <Ionicons name="chevron-forward" size={16} color={colors.muted} />
    </PressableScale> : null}
    {requestsOnly ? <PressableScale style={styles.back} onPress={() => setRequestsOnly(false)} accessibilityRole="button"
      accessibilityLabel="Tüm sohbetlere dön">
      <Ionicons name="chevron-back" size={18} color={colors.ink} /><Text style={styles.backText}>Tüm sohbetler</Text>
    </PressableScale> : null}
    {cursor.before_time ? <Button label="En yeni mesajlar" tone="outline" size="sm" full={false} onPress={() => setCursor({})} /> : null}
  </>;
  return <Screen tabBarPadding>
    {/* Visibility and message settings live in Profil → "Görünürlük ve mesajlar". */}
    <View style={s.header}><Txt variant="h1" style={styles.title} numberOfLines={1}>{requestsOnly ? 'Mesaj istekleri' : 'Mesajlar'}</Txt></View>
    {query.loading ? <ActivityIndicator /> : query.error ? <SocialNotice text={query.error} retry={query.refresh} /> : <FlatList
      data={shown} keyExtractor={(item) => item.id} onRefresh={() => void pull()} refreshing={pulling}
      ListHeaderComponent={header} showsVerticalScrollIndicator={false}
      ListEmptyComponent={requestsOnly ? <SocialNotice text="Bekleyen mesaj isteğin yok." /> : <EmptyState icon="people-outline"
        title="Henüz sohbetin yok"
        body="Aynı mekândaki üyelerle tanışmak için Kişiler’e göz at. Yeni kişiler önce mesaj isteği gönderir; kabul etmek sana kalmış."
        action="Kişileri keşfet" onAction={() => router.navigate({ pathname: '/', params: { mode: 'people' } })} />}
      renderItem={({ item }) => {
        const unread = item.unread > 0;
        return <PressableScale style={styles.row} onPress={() => router.push(`/dm/${item.id}`)} scaleTo={0.99}
          accessibilityRole="button" accessibilityLabel={`${item.first_name}, ${unread ? `${item.unread} okunmamış mesaj` : 'sohbet'}`}>
          <Avatar uri={item.avatar_url} name={item.first_name} size={52} />
          <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
            <View style={styles.rowTop}>
              <Text style={styles.name} numberOfLines={1}>{item.first_name}</Text>
              <Text style={styles.time}>{threadTime(item.last_message_at)}</Text>
            </View>
            <View style={styles.rowTop}>
              <Text style={[styles.preview, unread && styles.previewUnread]} numberOfLines={1}>
                {item.status === 'pending' ? item.requested_by === userId ? 'Bekliyor · ' : 'İstek · ' : ''}{item.preview}</Text>
              {unread ? <View style={styles.unread}>
                <Text style={styles.unreadText} maxFontSizeMultiplier={1.4}>{item.unread > 99 ? '99+' : item.unread}</Text></View> : null}
            </View>
          </View>
        </PressableScale>;
      }}
      ListFooterComponent={page.hasMore && last ? <Button label="Daha eski sohbetler" tone="outline" size="sm" full={false}
        style={{ alignSelf: 'center', marginTop: 12 }}
        onPress={() => setCursor({ before_time: last.last_message_at, before_id: last.id })} /> : null}
    />}
  </Screen>;
}
const styles = StyleSheet.create({
  title: { flex: 1, minWidth: 0 },
  friends: { marginBottom: 14, gap: 10 },
  friendsTitle: { fontFamily: 'DMSans_700Bold', fontSize: 15, color: colors.ink },
  friendRow: { gap: 14, paddingRight: 8 },
  friend: { width: 66, alignItems: 'center', gap: 5 },
  friendRing: { padding: 2, borderRadius: 33, borderWidth: 2, borderColor: 'transparent' },
  friendRingNew: { borderColor: colors.green },
  friendName: { fontFamily: 'DMSans_500Medium', fontSize: 12.5, color: colors.ink, maxWidth: 66 },
  friendBadge: { fontFamily: 'DMSans_700Bold', fontSize: 10.5, color: colors.green, marginTop: -3 },
  requests: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: 18, backgroundColor: colors.white, marginBottom: 8, minHeight: 52 },
  requestFaces: { flexDirection: 'row' },
  requestFace: { borderRadius: 16, borderWidth: 2, borderColor: colors.white },
  requestFaceOverlap: { marginLeft: -10 },
  requestsTitle: { flex: 1, minWidth: 0, fontFamily: 'DMSans_700Bold', fontSize: 15, color: colors.ink },
  back: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', minHeight: 44, marginBottom: 4 },
  backText: { fontFamily: 'DMSans_700Bold', fontSize: 14, color: colors.ink },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { flex: 1, fontFamily: 'DMSans_700Bold', fontSize: 16, color: colors.ink },
  time: { fontFamily: 'DMSans_400Regular', fontSize: 12, color: colors.muted },
  preview: { flex: 1, fontFamily: 'DMSans_400Regular', fontSize: 14, color: colors.muted },
  previewUnread: { fontFamily: 'DMSans_700Bold', color: colors.ink },
  unread: { minWidth: 20, minHeight: 20, paddingHorizontal: 6, borderRadius: 10, backgroundColor: colors.ink,
    alignItems: 'center', justifyContent: 'center' },
  unreadText: { fontFamily: 'DMSans_700Bold', fontSize: 11, lineHeight: 15, color: colors.white },
});
