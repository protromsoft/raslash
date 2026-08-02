import { Ionicons } from '@expo/vector-icons';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ListRenderItemInfo,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PressableScale } from '@/components/Motion';
import { afterSheetClose, Sheet } from '@/components/Sheet';
import { Avatar, Button, IconButton, TextButton } from '@/components/ui';
import { useApp } from '@/context/AppContext';
import { usePlaces } from '@/context/PlacesContext';
import type { ChatPerson } from '@/data/types';
import {
  fetchPlaceMessages,
  sendPlaceMessage,
  subscribeToPlaceMessages,
  type RemoteMessage,
} from '@/lib/checkIns';
import { haptic } from '@/lib/haptics';
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
  /** Sent locally, not yet confirmed by the server. */
  pending?: boolean;
};

/** A message plus whether it continues the previous speaker's block. */
type ChatRow = { message: Message; grouped: boolean };

/** Same author, close in time — drop the repeated avatar and name. */
const GROUP_WINDOW_MS = 5 * 60_000;
/** How close to the end still counts as "following the conversation". */
const STICK_TO_BOTTOM_PX = 90;

const AVATAR_SIZE = 30;

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function seedConversation(): Message[] {
  const now = Date.now();
  return [
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
  ];
}

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const { placeId } = useLocalSearchParams<{ placeId: string }>();
  const { isSubscribed, profile, user } = useApp();
  const { ready, getPlace, labelFor, activeCheckIn, checkOut, getActivePeopleForPlace } = usePlaces();

  const place = getPlace(placeId);
  const checkedInHere = activeCheckIn?.placeId === placeId;

  const listRef = useRef<FlatList<ChatRow>>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [people, setPeople] = useState<ChatPerson[]>([]);
  const [text, setText] = useState('');
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [keyboardUp, setKeyboardUp] = useState(false);

  const peopleRef = useRef<ChatPerson[]>([]);
  peopleRef.current = people;
  /** Only auto-scroll when the user hasn't scrolled up to read history. */
  const atBottomRef = useRef(true);

  const refreshPeople = useCallback(async () => {
    if (!placeId) return;
    setPeople(await getActivePeopleForPlace(placeId));
  }, [getActivePeopleForPlace, placeId]);

  // Transcript is loaded once per place. Deliberately not tied to
  // `refreshPeople`: that callback changes whenever the profile does, and
  // re-running this would wipe locally sent messages off the screen.
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
        setMessages(seedConversation());
      }
    })();
    return () => {
      mounted = false;
    };
  }, [checkedInHere, placeId, user?.id]);

  useEffect(() => {
    if (!placeId || !checkedInHere) return;
    void refreshPeople();
    const poll = setInterval(() => void refreshPeople(), 20_000);
    return () => clearInterval(poll);
  }, [checkedInHere, placeId, refreshPeople]);

  /**
   * Merges a realtime row. Our own insert comes back over the socket too, so an
   * unconfirmed local row with the same text adopts the server id instead of
   * showing the message twice.
   */
  const mergeRemote = useCallback(
    (incoming: RemoteMessage) => {
      const mine = !!user?.id && incoming.userId === user.id;
      setMessages((prev) => {
        if (prev.some((m) => m.id === incoming.id)) return prev;
        if (mine) {
          const pendingIndex = prev.findIndex(
            (m) => m.pending && m.mine && m.text === incoming.text,
          );
          if (pendingIndex >= 0) {
            const next = [...prev];
            next[pendingIndex] = {
              ...next[pendingIndex],
              id: incoming.id,
              createdAt: incoming.createdAt,
              pending: false,
            };
            return next;
          }
        }
        const person = peopleRef.current.find((p) => p.id === incoming.userId);
        return [
          ...prev,
          {
            id: incoming.id,
            author: mine ? profile.firstName || 'Sen' : person?.firstName || 'Misafir',
            text: incoming.text,
            createdAt: incoming.createdAt,
            avatarUrl: mine ? profile.avatarUrl : person?.avatarUrl,
            mine,
          },
        ];
      });
    },
    [profile.avatarUrl, profile.firstName, user?.id],
  );

  // The handler is read through a ref so a profile edit doesn't tear down and
  // rebuild the channel — one subscription per place, removed on unmount.
  const mergeRef = useRef(mergeRemote);
  mergeRef.current = mergeRemote;

  useEffect(() => {
    if (!placeId || !checkedInHere) return;
    return subscribeToPlaceMessages(placeId, (m) => mergeRef.current(m));
  }, [placeId, checkedInHere]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, () => setKeyboardUp(true));
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardUp(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const scrollToEnd = useCallback((animated: boolean) => {
    listRef.current?.scrollToEnd({ animated });
  }, []);

  useEffect(() => {
    if (keyboardUp && atBottomRef.current) {
      // The list shrinks as the keyboard comes up; follow the newest message.
      const id = setTimeout(() => scrollToEnd(true), duration.fast);
      return () => clearTimeout(id);
    }
  }, [keyboardUp, scrollToEnd]);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const distanceFromEnd = contentSize.height - (contentOffset.y + layoutMeasurement.height);
    atBottomRef.current = distanceFromEnd < STICK_TO_BOTTOM_PX;
  }, []);

  const onContentSizeChange = useCallback(() => {
    if (atBottomRef.current) scrollToEnd(false);
  }, [scrollToEnd]);

  /** Consecutive messages from one person collapse into a single block. */
  const rows = useMemo<ChatRow[]>(
    () =>
      messages.map((message, i) => {
        const prev = messages[i - 1];
        const sameSpeaker =
          !!prev && prev.author === message.author && !!prev.mine === !!message.mine;
        const closeInTime =
          !!prev &&
          new Date(message.createdAt).getTime() - new Date(prev.createdAt).getTime() <
            GROUP_WINDOW_MS;
        return { message, grouped: sameSpeaker && closeInTime };
      }),
    [messages],
  );

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<ChatRow>) => {
      const { message, grouped } = item;
      return (
        <Animated.View
          entering={FadeInDown.duration(duration.base)}
          style={[styles.msgRow, message.mine && styles.msgRowMine, grouped && styles.msgRowGrouped]}
        >
          {!message.mine ? (
            grouped ? (
              <View style={styles.avatarSpacer} />
            ) : (
              <Avatar
                uri={message.avatarUrl}
                name={message.author}
                size={AVATAR_SIZE}
                style={styles.msgAvatar}
              />
            )
          ) : null}
          <View style={[styles.bubble, message.mine && styles.bubbleMine]}>
            {!message.mine && !grouped ? (
              <Text style={styles.author}>{message.author}</Text>
            ) : null}
            <Text style={[styles.message, message.mine && styles.messageMine]}>{message.text}</Text>
            <Text style={[styles.time, message.mine && styles.timeMine]}>
              {formatTime(message.createdAt)}
            </Text>
          </View>
        </Animated.View>
      );
    },
    [],
  );

  const keyExtractor = useCallback((item: ChatRow) => item.message.id, []);

  const send = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || !place) return;
    const createdAt = new Date().toISOString();
    const localId = `local_${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: localId,
        author: profile.firstName || 'Sen',
        text: trimmed,
        createdAt,
        avatarUrl: profile.avatarUrl,
        mine: true,
        pending: true,
      },
    ]);
    setText('');
    haptic('light');
    atBottomRef.current = true;
    requestAnimationFrame(() => scrollToEnd(true));

    if (!user?.id) return;
    const remote = await sendPlaceMessage(place.id, user.id, trimmed);
    setMessages((prev) => {
      const index = prev.findIndex((m) => m.id === localId);
      if (index < 0) return prev; // realtime already adopted it
      const next = [...prev];
      next[index] = remote
        ? { ...next[index], id: remote.id, createdAt: remote.created_at, pending: false }
        : { ...next[index], pending: false };
      return next;
    });
  }, [place, profile.avatarUrl, profile.firstName, scrollToEnd, text, user?.id]);

  const confirmLeave = useCallback(() => {
    if (!place) return;
    setLeaveOpen(false);
    checkOut(place.id);
    // Navigating while the sheet's Modal is still dismissing drops the push on iOS.
    afterSheetClose(() => router.replace(`/rate/${place.id}`));
  }, [checkOut, place]);

  if (!isSubscribed) {
    return <Redirect href={{ pathname: '/paywall', params: { placeId } }} />;
  }
  if (!place) {
    // A cold start can reach this route before the catalogue resolves; bouncing
    // to the map there would drop the user out of an active check-in.
    if (!ready) {
      return (
        <View style={[styles.screen, styles.center]}>
          <ActivityIndicator color={colors.ink} />
        </View>
      );
    }
    return <Redirect href="/(tabs)" />;
  }
  if (!checkedInHere) {
    return <Redirect href={{ pathname: '/place/[id]', params: { id: placeId, intent: 'checkin' } }} />;
  }

  const canSend = text.trim().length > 0;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 6 }]}>
      <View style={styles.header}>
        <IconButton icon="chevron-back" onPress={() => router.back()} accessibilityLabel="Geri" />
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            {labelFor(place)}
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
          data={rows}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          onScroll={onScroll}
          scrollEventThrottle={32}
          onContentSizeChange={onContentSizeChange}
          renderItem={renderItem}
        />

        <View
          style={[
            styles.composer,
            // The keyboard already covers the home indicator, so keeping the
            // safe-area padding while it is open leaves a dead gap.
            { paddingBottom: (keyboardUp ? 0 : insets.bottom) + 10 },
          ]}
        >
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Buradakilere yaz…"
            placeholderTextColor={colors.mutedSoft}
            style={styles.input}
            multiline
          />
          <PressableScale
            style={[styles.send, !canSend && styles.sendDisabled]}
            disabled={!canSend}
            onPress={() => void send()}
            accessibilityRole="button"
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
  center: { alignItems: 'center', justifyContent: 'center' },

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
  // Pulls back most of the list gap so a block of replies reads as one turn.
  msgRowGrouped: { marginTop: -6 },
  msgAvatar: { marginBottom: 2 },
  avatarSpacer: { width: AVATAR_SIZE },
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
