import { Ionicons } from '@expo/vector-icons';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PressableScale } from '@/components/Motion';
import { Sheet } from '@/components/Sheet';
import { Avatar, Button, IconButton, TextButton } from '@/components/ui';
import { useApp } from '@/context/AppContext';
import { usePlaces } from '@/context/PlacesContext';
import type { ChatPerson } from '@/data/types';
import { fetchPlaceMessages, sendPlaceMessage } from '@/lib/checkIns';
import { colors, shadows } from '@/theme/colors';
import { duration } from '@/theme/motion';
import { radii, spacing } from '@/theme/spacing';

type Message = {
  id: string;
  author: string;
  text: string;
  createdAt: string;
  avatarUrl?: string;
  mine?: boolean;
};

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const { placeId } = useLocalSearchParams<{ placeId: string }>();
  const { isSubscribed, profile, user } = useApp();
  const { getPlace, activeCheckIn, checkOut, getActivePeopleForPlace } = usePlaces();

  const place = getPlace(placeId);
  const checkedInHere = activeCheckIn?.placeId === placeId;

  const listRef = useRef<FlatList<Message>>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [people, setPeople] = useState<ChatPerson[]>([]);
  const [text, setText] = useState('');
  const [leaveOpen, setLeaveOpen] = useState(false);

  const refreshPeople = useCallback(async () => {
    if (!placeId) return;
    setPeople(await getActivePeopleForPlace(placeId));
  }, [getActivePeopleForPlace, placeId]);

  useEffect(() => {
    if (!placeId || !checkedInHere) return;
    let mounted = true;
    (async () => {
      const remote = await fetchPlaceMessages(placeId);
      if (!mounted) return;
      if (remote && remote.length > 0) {
        setMessages(
          remote.map((m) => ({
            id: m.id,
            author: m.author,
            text: m.text,
            createdAt: m.createdAt,
            mine: user?.id ? m.userId === user.id : false,
          })),
        );
      } else {
        const now = Date.now();
        setMessages([
          {
            id: 'seed1',
            author: 'Elif',
            text: 'Penceredeki masalardan biri boş mu?',
            createdAt: new Date(now - 12 * 60_000).toISOString(),
          },
          {
            id: 'seed2',
            author: 'Can',
            text: 'Az önce check‑in oldum, wifi bugün gayet iyi.',
            createdAt: new Date(now - 7 * 60_000).toISOString(),
          },
          {
            id: 'seed3',
            author: 'Selin',
            text: '15.00 gibi kısa bir kahve molası veren var mı?',
            createdAt: new Date(now - 2 * 60_000).toISOString(),
          },
        ]);
      }
      await refreshPeople();
    })();
    const poll = setInterval(() => void refreshPeople(), 20_000);
    return () => {
      mounted = false;
      clearInterval(poll);
    };
  }, [checkedInHere, placeId, refreshPeople, user?.id]);

  if (!isSubscribed) {
    return <Redirect href={{ pathname: '/paywall', params: { placeId } }} />;
  }
  if (!place) {
    return <Redirect href="/(tabs)" />;
  }
  if (!checkedInHere) {
    return <Redirect href={{ pathname: '/place/[id]', params: { id: placeId, intent: 'checkin' } }} />;
  }

  const send = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const createdAt = new Date().toISOString();
    const localId = String(Date.now());
    setMessages((prev) => [
      ...prev,
      {
        id: localId,
        author: profile.firstName || 'Sen',
        text: trimmed,
        createdAt,
        avatarUrl: profile.avatarUrl,
        mine: true,
      },
    ]);
    setText('');
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    if (user?.id) {
      const remote = await sendPlaceMessage(place.id, user.id, trimmed);
      if (remote) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === localId ? { ...m, id: remote.id, createdAt: remote.created_at } : m,
          ),
        );
      }
    }
  };

  const confirmLeave = () => {
    setLeaveOpen(false);
    checkOut(place.id);
    router.replace(`/rate/${place.id}`);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 6 }]}>
      <View style={styles.header}>
        <IconButton icon="chevron-back" onPress={() => router.back()} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            {place.name}
          </Text>
          <View style={styles.subRow}>
            <View style={styles.liveDot} />
            <Text style={styles.sub}>{people.length || 1} kişi burada · canlı</Text>
          </View>
        </View>
        <IconButton icon="exit-outline" onPress={() => setLeaveOpen(true)} accessibilityLabel="Çıkış yap" />
      </View>

      {people.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.peopleRow}
          style={styles.peopleStrip}
        >
          {people.map((p) => (
            <View key={p.id} style={styles.person}>
              <View style={styles.personRing}>
                <Avatar uri={p.avatarUrl} name={p.firstName} size={44} />
              </View>
              <Text style={styles.personName} numberOfLines={1}>
                {p.isMe ? 'Sen' : p.firstName}
              </Text>
            </View>
          ))}
        </ScrollView>
      ) : null}

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item }) => (
            <Animated.View
              entering={FadeInDown.duration(duration.base)}
              style={[styles.msgRow, item.mine && styles.msgRowMine]}
            >
              {!item.mine ? (
                <Avatar uri={item.avatarUrl} name={item.author} size={30} style={styles.msgAvatar} />
              ) : null}
              <View style={[styles.bubble, item.mine && styles.bubbleMine]}>
                {!item.mine ? <Text style={styles.author}>{item.author}</Text> : null}
                <Text style={[styles.message, item.mine && styles.messageMine]}>{item.text}</Text>
                <Text style={[styles.time, item.mine && styles.timeMine]}>
                  {formatTime(item.createdAt)}
                </Text>
              </View>
            </Animated.View>
          )}
        />

        <View style={[styles.composer, { paddingBottom: insets.bottom + 10 }]}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Buradakilere yaz…"
            placeholderTextColor={colors.mutedSoft}
            style={styles.input}
            multiline
            returnKeyType="send"
            onSubmitEditing={() => void send()}
          />
          <PressableScale
            style={[styles.send, !text.trim() && styles.sendDisabled]}
            disabled={!text.trim()}
            onPress={() => void send()}
            accessibilityLabel="Gönder"
          >
            <Ionicons name="arrow-up" size={19} color={colors.white} />
          </PressableScale>
        </View>
      </KeyboardAvoidingView>

      <Sheet
        visible={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        title="Mekandan ayrılıyor musun?"
        subtitle="Çıkış yaptığında sohbetten çıkarsın ve mekanı puanlama ekranına yönlendirilirsin."
      >
        <Button label="Çıktım, puanlayayım" onPress={confirmLeave} />
        <TextButton label="Hâlâ buradayım" onPress={() => setLeaveOpen(false)} />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  title: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 19,
    letterSpacing: -0.4,
    color: colors.ink,
  },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.green },
  sub: { fontFamily: 'DMSans_400Regular', fontSize: 12.5, color: colors.muted },

  peopleStrip: { flexGrow: 0, marginBottom: spacing.sm },
  peopleRow: { gap: 14, paddingHorizontal: spacing.md, paddingVertical: 2 },
  person: { alignItems: 'center', gap: 5, width: 54 },
  personRing: {
    padding: 2,
    borderRadius: 26,
    borderWidth: 1.5,
    borderColor: colors.green,
  },
  personName: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 11,
    color: colors.inkSoft,
    textAlign: 'center',
  },

  list: { paddingHorizontal: spacing.md, paddingBottom: 12, gap: 10 },
  msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, maxWidth: '88%' },
  msgRowMine: { alignSelf: 'flex-end', flexDirection: 'row-reverse' },
  msgAvatar: { marginBottom: 2 },
  bubble: {
    flexShrink: 1,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderBottomLeftRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 3,
    ...shadows.soft,
  },
  bubbleMine: {
    backgroundColor: colors.ink,
    borderBottomLeftRadius: radii.lg,
    borderBottomRightRadius: 8,
  },
  author: { fontFamily: 'DMSans_700Bold', fontSize: 12, color: colors.muted },
  message: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 15,
    lineHeight: 21,
    color: colors.ink,
  },
  messageMine: { color: colors.white },
  time: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 10.5,
    color: colors.mutedSoft,
    alignSelf: 'flex-end',
  },
  timeMine: { color: 'rgba(255,255,255,0.5)' },

  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: spacing.md,
    paddingTop: 10,
    backgroundColor: colors.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  input: {
    flex: 1,
    minHeight: 46,
    maxHeight: 120,
    borderRadius: radii.lg,
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    paddingTop: 13,
    paddingBottom: 13,
    fontFamily: 'DMSans_400Regular',
    fontSize: 15,
    color: colors.ink,
    ...shadows.soft,
  },
  send: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.soft,
  },
  sendDisabled: { opacity: 0.35 },
});
