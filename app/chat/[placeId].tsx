import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ListRenderItemInfo,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, { FadeInDown, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatComposer } from '@/components/ChatComposer';
import { PressableScale } from '@/components/Motion';
import { LiveDot } from '@/components/LiveDot';
import { useKeyboardLift } from '@/components/Screen';
import { afterSheetClose, Sheet } from '@/components/Sheet';
import { StoryViewer } from '@/components/StoryViewer';
import { Avatar, Button, IconButton, TextButton } from '@/components/ui';
import { useApp } from '@/context/AppContext';
import { usePlaces } from '@/context/PlacesContext';
import type { ChatPerson } from '@/data/types';
import { useActivePeople } from '@/hooks/useActivePeople';
import { buildChatRows, type ChatMessage as Message, type ChatRow } from '@/lib/chatPresentation';
import {
  fetchPlaceMessages,
  fetchMessageAccessStatus,
  blockUser,
  isMessageAllowed,
  reportMessage,
  sendPlaceMessage,
  subscribeToPlaceMessages,
  type MessageAccessStatus,
  type RemoteMessage,
} from '@/lib/checkIns';
import { haptic } from '@/lib/haptics';
import {
  CHAT_PHOTO_BUCKET,
  chatPhotoPath,
  chatPhotoUrls,
  hasPhotoAccess,
  takeCameraPhoto,
  uploadJpeg,
} from '@/lib/placePhotos';
import { colors, shadows } from '@/theme/colors';
import { duration } from '@/theme/motion';
import { radii, spacing } from '@/theme/spacing';
import { goBackOrHome } from '@/lib/navigation';
import {
  SEEN_STORIES_KEY,
  addSeenIds,
  groupPhotoStories,
  isPhotoMessage,
  orderStoryRow,
  parseSeenIds,
  storyRing,
  storyStartIndex,
  type PersonStory,
} from '@/lib/placeStories';

type TranscriptState = 'loading' | 'ready' | 'error';

/** How close to the end still counts as "following the conversation". */
const STICK_TO_BOTTOM_PX = 90;

const AVATAR_SIZE = 30;

/** Stories expire after 24 hours; re-check the window this often. */
const STORY_CLOCK_MS = 60_000;

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
  const { profile, user, isSubscribed, isAdmin } = useApp();
  // Photos are Pro: without access the story rings and "+" lead to the paywall.
  const photoAccess = hasPhotoAccess({
    isSubscribed,
    isAdmin,
    appReviewAccess: user?.app_metadata?.app_review_access,
  });
  const { ready, getPlace, labelFor, activeCheckIn, checkOut } = usePlaces();

  const place = getPlace(placeId);
  const checkedInHere = activeCheckIn?.placeId === placeId;

  const listRef = useRef<FlatList<ChatRow>>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [transcriptState, setTranscriptState] = useState<TranscriptState>('loading');
  const activePeople = useActivePeople(placeId);
  const [blockedIds, setBlockedIds] = useState<Set<string>>(() => new Set());
  const people = useMemo(
    () => activePeople.filter((person) => !blockedIds.has(person.id)),
    [activePeople, blockedIds],
  );
  const [text, setText] = useState('');
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [keyboardUp, setKeyboardUp] = useState(false);
  const [sending, setSending] = useState(false);
  const [messageAccess, setMessageAccess] = useState<MessageAccessStatus | null>(null);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [storyClock, setStoryClock] = useState(0);
  const [seenIds, setSeenIds] = useState<ReadonlySet<string>>(() => new Set());
  const seenListRef = useRef<string[]>([]);
  const [viewer, setViewer] = useState<{ userId: string; startIndex: number } | null>(null);
  const sendingRef = useRef(false);
  const retryRequestRef = useRef<{ body: string; requestId: string } | null>(null);

  // This screen is pushed over a modal card on iOS. KeyboardAvoidingView uses
  // the card's window offset and can leave the composer behind the keyboard.
  // Explicit bottom padding follows the keyboard frame instead and works for
  // both the modal card and a normal full-screen route.
  const keyboardLift = useKeyboardLift(insets.bottom);
  const keyboardLiftStyle = useAnimatedStyle(() => ({
    paddingBottom: keyboardLift.value,
  }));

  const peopleRef = useRef<ChatPerson[]>([]);
  peopleRef.current = people;
  /** Only auto-scroll when the user hasn't scrolled up to read history. */
  const atBottomRef = useRef(true);

  // Transcript is loaded once per place. Deliberately not tied to
  // profile/presence refreshes: they must not wipe locally sent messages.
  useEffect(() => {
    if (!placeId || !checkedInHere) return;
    let mounted = true;
    setMessages([]);
    setTranscriptState('loading');
    (async () => {
      let remote: RemoteMessage[] | null = null;
      // The local check-in is followed by a remote insert. Navigation can win
      // that race on a fast device, so briefly retry until the RLS gate sees it.
      for (let attempt = 0; attempt < 3 && remote === null; attempt += 1) {
        remote = await fetchPlaceMessages(placeId);
        if (remote === null && attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
        }
      }
      if (!mounted) return;
      if (remote === null) {
        setTranscriptState('error');
        return;
      }
      setMessages(
        remote.map((m) => ({
          id: m.id,
          author: m.author,
          text: m.text,
          createdAt: m.createdAt,
          mine: user?.id ? m.userId === user.id : false,
          userId: m.userId,
          avatarUrl: m.avatarUrl,
          photoPath: m.photoPath,
        })),
      );
      setTranscriptState('ready');
    })();
    return () => {
      mounted = false;
    };
  }, [checkedInHere, placeId, user?.id]);

  useEffect(() => {
    if (!checkedInHere || !user?.id) {
      setMessageAccess(null);
      return;
    }
    let cancelled = false;
    void fetchMessageAccessStatus()
      .then((next) => {
        if (!cancelled) setMessageAccess(next);
      })
      .catch((error) => {
        console.warn('message access status failed', error);
      });
    return () => {
      cancelled = true;
    };
  }, [checkedInHere, isSubscribed, user?.id]);

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
            (m) =>
              m.pending &&
              m.mine &&
              m.text === incoming.text &&
              (m.photoPath ?? '') === (incoming.photoPath ?? ''),
          );
          if (pendingIndex >= 0) {
            const next = [...prev];
            next[pendingIndex] = {
              ...next[pendingIndex],
              id: incoming.id,
              createdAt: incoming.createdAt,
              photoPath: incoming.photoPath,
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
            author: mine ? profile.firstName || 'Sen' : person?.firstName || incoming.author || 'Misafir',
            text: incoming.text,
            createdAt: incoming.createdAt,
            avatarUrl: mine ? profile.avatarUrl : person?.avatarUrl || incoming.avatarUrl,
            mine,
            userId: incoming.userId,
            photoPath: incoming.photoPath,
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

  // Photos never enter the transcript: they are grouped into 24-hour stories
  // on the people strip. Blocked people's photos are dropped with their messages.
  const visibleMessages = useMemo(
    () => messages.filter((message) => !message.userId || !blockedIds.has(message.userId)),
    [blockedIds, messages],
  );
  useEffect(() => {
    const id = setInterval(() => setStoryClock((tick) => tick + 1), STORY_CLOCK_MS);
    return () => clearInterval(id);
  }, []);
  const stories = useMemo(() => {
    const profiles = new Map(people.map((person) => [person.id, person]));
    return groupPhotoStories(visibleMessages, Date.now()).map((story): PersonStory => {
      const person = profiles.get(story.userId);
      return person
        ? { ...story, author: person.firstName || story.author, avatarUrl: person.avatarUrl ?? story.avatarUrl }
        : story;
    });
    // storyClock re-runs the 24-hour window while the screen stays open.
  }, [people, storyClock, visibleMessages]);
  const storyOf = useMemo(() => new Map(stories.map((story) => [story.userId, story])), [stories]);
  const storyRow = useMemo(() => orderStoryRow(people, stories, seenIds), [people, seenIds, stories]);

  // Seen photo ids live on the device, capped to the newest few hundred.
  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(SEEN_STORIES_KEY)
      .then((raw) => {
        if (!mounted) return;
        const stored = parseSeenIds(raw);
        // Keep anything marked while the read was in flight.
        seenListRef.current = addSeenIds(stored, seenListRef.current);
        setSeenIds(new Set(seenListRef.current));
      })
      .catch((error) => console.warn('seen stories read failed', error));
    return () => {
      mounted = false;
    };
  }, []);

  const markSeen = useCallback((id: string) => {
    if (seenListRef.current.includes(id)) return;
    seenListRef.current = addSeenIds(seenListRef.current, [id]);
    setSeenIds(new Set(seenListRef.current));
    AsyncStorage.setItem(SEEN_STORIES_KEY, JSON.stringify(seenListRef.current)).catch((error) =>
      console.warn('seen stories write failed', error),
    );
  }, []);

  // Signs every story photo in one batch; the module cache keeps URLs across
  // remounts, so reopening the chat does not re-sign. Without photo access
  // nothing is signed: rings only lead to the paywall.
  const photoPathKey = useMemo(
    () =>
      photoAccess
        ? stories
            .flatMap((story) => story.items)
            .flatMap((item) => (item.photoPath && !item.localPhotoUri ? [item.photoPath] : []))
            .join('|')
        : '',
    [photoAccess, stories],
  );
  useEffect(() => {
    if (!photoPathKey) return;
    let cancelled = false;
    void chatPhotoUrls.resolve(photoPathKey.split('|')).then((urls) => {
      if (!cancelled) setPhotoUrls((prev) => ({ ...prev, ...urls }));
    });
    return () => {
      cancelled = true;
    };
  }, [photoPathKey]);

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
    () => buildChatRows(visibleMessages.filter((message) => !isPhotoMessage(message)), people),
    [people, visibleMessages],
  );

  const openMessageOptions = useCallback(
    (message: Message) => {
      if (message.mine || !message.userId || !user?.id) return;
      const viewerId = user.id;
      const targetUserId = message.userId;
      Alert.alert('Mesaj seçenekleri', 'Bu mesaj için ne yapmak istersin?', [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Şikâyet Et',
          onPress: () => {
            void reportMessage(viewerId, message.id, targetUserId).then((ok) => {
              Alert.alert(
                ok ? 'Şikâyet alındı' : 'Şikâyet gönderilemedi',
                ok
                  ? 'İncelemek üzere kaydettik. Teşekkür ederiz.'
                  : 'Bağlantını kontrol edip tekrar deneyebilirsin.',
              );
            });
          },
        },
        {
          text: 'Kullanıcıyı Engelle',
          style: 'destructive',
          onPress: () => {
            void blockUser(viewerId, targetUserId).then((ok) => {
              if (ok) {
                setMessages((current) =>
                  current.filter((item) => item.userId !== targetUserId),
                );
                setBlockedIds((current) => new Set([...current, targetUserId]));
              }
              Alert.alert(
                ok ? 'Kullanıcı engellendi' : 'Engelleme başarısız',
                ok
                  ? 'Bu kullanıcının mesajlarını artık görmeyeceksin.'
                  : 'Bağlantını kontrol edip tekrar deneyebilirsin.',
              );
            });
          },
        },
      ]);
    },
    [user?.id],
  );

  const openPaywall = useCallback(() => {
    Keyboard.dismiss();
    router.push('/paywall');
  }, []);

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
          <PressableScale
            style={[styles.bubble, message.mine && styles.bubbleMine]}
            scaleTo={message.mine || !message.userId ? 1 : 0.98}
            onLongPress={
              message.mine || !message.userId || !user?.id
                ? undefined
                : () => openMessageOptions(message)
            }
            delayLongPress={350}
            accessibilityHint={
              message.mine || !message.userId
                ? undefined
                : 'Şikâyet ve engelleme seçenekleri için basılı tut'
            }
          >
            {!message.mine && !grouped ? (
              <Text style={styles.author}>{message.author}</Text>
            ) : null}
            {message.text ? (
              <Text style={[styles.message, message.mine && styles.messageMine]}>{message.text}</Text>
            ) : null}
            <Text style={[styles.time, message.mine && styles.timeMine]}>
              {formatTime(message.createdAt)}
            </Text>
          </PressableScale>
        </Animated.View>
      );
    },
    [openMessageOptions, user?.id],
  );

  const keyExtractor = useCallback((item: ChatRow) => item.message.id, []);

  /**
   * One delivery path for text and photo messages: optimistic row, upload (for
   * a photo), the quota-checked RPC with one idempotent retry, then either the
   * server id or the row removed and the draft restored. A photo's optimistic
   * row never shows in the transcript; it appears in our own story instead.
   */
  const deliver = useCallback(async (body: string, photoUri?: string) => {
    if (!place || !user?.id) return;
    sendingRef.current = true;
    setSending(true);
    const createdAt = new Date().toISOString();
    // A failed photo is a new shot next time, so only text reuses a request id.
    const requestId =
      !photoUri && retryRequestRef.current?.body === body
        ? retryRequestRef.current.requestId
        : Crypto.randomUUID();
    const photoPath = photoUri ? chatPhotoPath(place.id, user.id) : undefined;
    const localId = `local_${requestId}`;
    setMessages((prev) => [
      ...prev,
      {
        id: localId,
        author: profile.firstName || 'Sen',
        text: body,
        createdAt,
        avatarUrl: profile.avatarUrl,
        mine: true,
        userId: user.id,
        pending: true,
        // Known up front so the realtime echo of this insert adopts the row.
        photoPath,
        localPhotoUri: photoUri,
      },
    ]);
    setText('');
    haptic('light');
    if (!photoUri) {
      atBottomRef.current = true;
      requestAnimationFrame(() => scrollToEnd(true));
    }

    let remote: Awaited<ReturnType<typeof sendPlaceMessage>>;
    try {
      if (photoUri && photoPath) await uploadJpeg(CHAT_PHOTO_BUCKET, photoPath, photoUri);
      remote = await sendPlaceMessage(place.id, user.id, body, requestId, photoPath);
      if (remote.status === 'error' && remote.code === 'send_failed') {
        // The first response may be transport-ambiguous: the server could have
        // committed before the connection dropped. Retrying the same request
        // id is safe and cannot consume a second credit or create a duplicate.
        remote = await sendPlaceMessage(place.id, user.id, body, requestId, photoPath);
      }
    } catch (error) {
      console.warn('message send failed', error);
      remote = {
        status: 'error',
        code: 'unexpected_error',
        message: 'Beklenmeyen bir hata oluştu.',
        requestId,
      };
    } finally {
      sendingRef.current = false;
      setSending(false);
    }

    if (remote.status !== 'sent') {
      setMessages((prev) => prev.filter((message) => message.id !== localId));
      if (body) setText((current) => (current.length === 0 ? body : current));
      if (remote.status === 'pro_required') {
        // The server is the authority over a stale client Pro flag.
        retryRequestRef.current = null;
        openPaywall();
      } else if (remote.status === 'limit_reached') {
        retryRequestRef.current = null;
        setMessageAccess({ messagesRemaining: 0, hasUnlimited: false, accessTier: 'free' });
        Alert.alert(
          '15 ücretsiz mesaj hakkın doldu',
          'Raslash Pro ile mekan sohbetlerinde sınırsız mesajlaşabilirsin.',
          [
            { text: 'Şimdi değil', style: 'cancel' },
            { text: 'Pro ile devam et', onPress: openPaywall },
          ],
        );
      } else {
        retryRequestRef.current = photoUri ? null : { body, requestId: remote.requestId };
        Alert.alert(
          photoUri ? 'Fotoğraf gönderilemedi' : 'Mesaj gönderilemedi',
          'Check-in durumunu ve internet bağlantını kontrol edip tekrar dene.',
        );
      }
      return;
    }
    retryRequestRef.current = null;
    setMessageAccess((current) => ({
      messagesRemaining: remote.messagesRemaining,
      hasUnlimited: remote.hasUnlimited,
      accessTier: remote.hasUnlimited ? current?.accessTier ?? 'pro' : 'free',
    }));
    setMessages((prev) => {
      const index = prev.findIndex((m) => m.id === localId);
      if (index < 0) return prev; // realtime already adopted it
      if (prev.some((m, i) => i !== index && m.id === remote.id)) {
        return prev.filter((_, i) => i !== index);
      }
      const next = [...prev];
      next[index] = {
        ...next[index],
        id: remote.id,
        createdAt: remote.created_at,
        photoPath,
        pending: false,
      };
      return next;
    });
  }, [openPaywall, place, profile.avatarUrl, profile.firstName, scrollToEnd, user?.id]);

  /** Shared gate: quota, then the caption rules (a photo may have no caption). */
  const canDeliver = useCallback((body: string, requireText: boolean) => {
    if (!place || !user?.id || sendingRef.current) return false;
    if (requireText && !body) return false;
    if (messageAccess && !messageAccess.hasUnlimited && messageAccess.messagesRemaining <= 0) {
      openPaywall();
      return false;
    }
    if (body && !isMessageAllowed(body)) {
      Alert.alert(
        'Mesaj gönderilemedi',
        body.length > 500
          ? 'Mesaj en fazla 500 karakter olabilir.'
          : 'Mesaj topluluk kurallarına uygun görünmüyor.',
      );
      return false;
    }
    return true;
  }, [messageAccess, openPaywall, place, user?.id]);

  const send = useCallback(() => {
    const trimmed = text.trim();
    if (!canDeliver(trimmed, true)) return;
    void deliver(trimmed);
  }, [canDeliver, deliver, text]);

  /**
   * Adds to our story. Camera only: a live shot at the venue, with the typed
   * draft (if any) as the story caption.
   */
  const addStory = useCallback(async () => {
    const caption = text.trim();
    if (!canDeliver(caption, false)) return;
    Keyboard.dismiss();
    const uri = await takeCameraPhoto();
    if (!uri || sendingRef.current) return;
    void deliver(caption, uri);
  }, [canDeliver, deliver, text]);

  const openStory = useCallback(
    (userId: string) => {
      const story = storyOf.get(userId);
      if (!story) return;
      Keyboard.dismiss();
      setViewer({ userId, startIndex: storyStartIndex(story, seenIds) });
    },
    [seenIds, storyOf],
  );

  /** Story row taps. Without photo access every ring and the "+" lead to the paywall. */
  const onPersonPress = useCallback(
    (person: ChatPerson) => {
      if (!photoAccess) {
        openPaywall();
        return;
      }
      if (!person.isMe) {
        openStory(person.id);
        return;
      }
      if (!storyOf.has(person.id)) {
        void addStory();
        return;
      }
      Alert.alert('Hikâyen', undefined, [
        { text: 'Hikâyeni gör', onPress: () => openStory(person.id) },
        { text: 'Hikâyene ekle', onPress: () => void addStory() },
        { text: 'Vazgeç', style: 'cancel' },
      ]);
    },
    [addStory, openPaywall, openStory, photoAccess, storyOf],
  );

  const closeStory = useCallback(() => setViewer(null), []);
  const viewerStory = viewer ? storyOf.get(viewer.userId) ?? null : null;
  // A story that vanished (expired, failed upload, blocked) must not reopen later.
  useEffect(() => {
    if (viewer && !viewerStory) setViewer(null);
  }, [viewer, viewerStory]);

  const confirmLeave = useCallback(() => {
    if (!place) return;
    setLeaveOpen(false);
    checkOut(place.id);
    // Navigating while the sheet's Modal is still dismissing drops the push on iOS.
    // The rating is a card like this chat, so one replace swaps them with no
    // modal presentation racing the chat's own exit.
    const placeId = place.id;
    afterSheetClose(() => router.replace(`/rate/${placeId}`));
  }, [checkOut, place]);

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

  const quotaReached =
    messageAccess != null &&
    !messageAccess.hasUnlimited &&
    messageAccess.messagesRemaining <= 0;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 6 }]}>
      <View style={styles.header}>
        <IconButton icon="chevron-back" onPress={goBackOrHome} accessibilityLabel="Geri" />
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            {labelFor(place)}
          </Text>
          <View style={styles.subRow}>
            <LiveDot size={6} />
            {/* The people strip below already shows who is here; no count repeated. */}
            <Text style={styles.sub}>canlı</Text>
          </View>
        </View>
        <IconButton icon="exit-outline" onPress={() => setLeaveOpen(true)} accessibilityLabel="Çıkış yap" />
      </View>

      {storyRow.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.peopleRow}
          style={styles.peopleStrip}
          keyboardShouldPersistTaps="handled"
        >
          {storyRow.map((p) => {
            const ring = storyRing(storyOf.get(p.id), seenIds);
            const label = p.isMe ? 'Sen' : p.firstName;
            const avatar = (
              <>
                <View
                  style={[
                    styles.personRing,
                    ring === 'unseen' && styles.personRingUnseen,
                    ring === 'seen' && styles.personRingSeen,
                  ]}
                >
                  <Avatar uri={p.avatarUrl} name={p.firstName} size={44} />
                  {p.isMe ? (
                    <View style={styles.addBadge}>
                      <Ionicons name="add" size={14} color={colors.white} />
                    </View>
                  ) : null}
                </View>
                <Text style={styles.personName} numberOfLines={1}>
                  {label}
                </Text>
              </>
            );
            if (!p.isMe && ring === 'none') {
              return (
                <View key={p.id} style={styles.person}>
                  {avatar}
                </View>
              );
            }
            return (
              <PressableScale
                key={p.id}
                style={styles.person}
                onPress={() => onPersonPress(p)}
                disabled={p.isMe && sending}
                accessibilityRole="button"
                accessibilityLabel={
                  p.isMe
                    ? ring === 'none'
                      ? 'Hikâyene fotoğraf ekle'
                      : 'Hikâyen'
                    : `${p.firstName} hikâyesi${ring === 'unseen' ? ', yeni fotoğraf var' : ''}`
                }
                accessibilityHint={
                  !photoAccess
                    ? 'Fotoğraflar Raslash Pro ile açılır'
                    : p.isMe
                      ? ring === 'none'
                        ? 'Kamerayı açar; yazdığın metin fotoğrafın açıklaması olur.'
                        : 'Hikâyeni görebilir ya da yeni fotoğraf ekleyebilirsin'
                      : 'Hikâyeyi tam ekran açar'
                }
              >
                {avatar}
              </PressableScale>
            );
          })}
        </ScrollView>
      ) : null}

      <Animated.View style={[styles.flex, keyboardLiftStyle]}>
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
          ListEmptyComponent={
            <View style={styles.emptyChat}>
              {transcriptState === 'loading' ? (
                <ActivityIndicator color={colors.ink} />
              ) : (
                <>
                  <Text style={styles.emptyChatTitle}>
                    {transcriptState === 'error' ? 'Sohbet yüklenemedi' : 'Henüz mesaj yok'}
                  </Text>
                  <Text style={styles.emptyChatBody}>
                    {transcriptState === 'error'
                      ? 'Bağlantını kontrol edip ekranı yeniden açabilirsin.'
                      : 'İlk mesajı göndererek sohbeti başlatabilirsin.'}
                  </Text>
                </>
              )}
            </View>
          }
        />

        {quotaReached ? (
          <View style={styles.quotaReached}>
            <View style={styles.quotaCopy}>
              <Text style={styles.quotaTitle}>15 ücretsiz mesaj hakkın doldu</Text>
              <Text style={styles.quotaBody}>Pro ile sınırsız mesajlaşmaya devam et.</Text>
            </View>
            <PressableScale
              onPress={openPaywall}
              accessibilityRole="button"
              accessibilityLabel="Raslash Pro ile devam et"
              style={styles.proButton}
            >
              <Text style={styles.proButtonText}>Pro ol</Text>
            </PressableScale>
          </View>
        ) : (
          <View style={styles.composerArea}>
            {messageAccess && !messageAccess.hasUnlimited && messageAccess.messagesRemaining <= 3 ? (
              <Text style={styles.quotaHint} accessibilityLiveRegion="polite">
                {messageAccess.messagesRemaining} ücretsiz mesaj kaldı
              </Text>
            ) : null}
            <ChatComposer
              value={text}
              onChangeText={setText}
              onSend={send}
              placeholder="Buradakilere yaz…"
              sending={sending}
              disabled={transcriptState !== 'ready' || quotaReached}
              style={styles.composer}
            />
          </View>
        )}
      </Animated.View>

      <StoryViewer
        story={viewerStory}
        startIndex={viewer?.startIndex ?? 0}
        photoUrls={photoUrls}
        onSeen={markSeen}
        onClose={closeStory}
      />

      <Sheet
        visible={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        title="Mekândan ayrılıyor musun?"
        subtitle="Çıkış yaptığında sohbetten çıkarsın ve mekânı puanlama ekranına yönlendirilirsin."
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
  sub: { fontFamily: 'DMSans_400Regular', fontSize: 12.5, color: colors.muted },

  peopleStrip: { flexGrow: 0, marginBottom: spacing.sm },
  peopleRow: { gap: 14, paddingHorizontal: spacing.md, paddingVertical: 2 },
  person: { alignItems: 'center', gap: 5, width: 54 },
  // Same footprint with or without a story, so the row never shifts.
  personRing: {
    padding: 2,
    borderRadius: 27,
    borderWidth: 2.5,
    borderColor: 'transparent',
  },
  // The white padding is the gap between the ring and the photo.
  personRingUnseen: { borderColor: colors.green, backgroundColor: colors.white },
  personRingSeen: { borderColor: colors.mutedSoft, backgroundColor: colors.white },
  addBadge: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.bg,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  personName: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 11,
    color: colors.inkSoft,
    textAlign: 'center',
  },

  list: { paddingHorizontal: spacing.md, paddingBottom: 12, gap: 10 },
  emptyChat: {
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: 6,
  },
  emptyChatTitle: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 17,
    color: colors.ink,
    textAlign: 'center',
  },
  emptyChatBody: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 13,
    lineHeight: 19,
    color: colors.muted,
    textAlign: 'center',
  },
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
    fontSize: 11,
    color: colors.mutedSoft,
    alignSelf: 'flex-end',
  },
  timeMine: { color: 'rgba(255,255,255,0.5)' },

  composerArea: {
    backgroundColor: colors.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    paddingTop: 6,
  },
  quotaHint: {
    paddingHorizontal: spacing.md,
    paddingBottom: 3,
    fontFamily: 'DMSans_500Medium',
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
  },
  composer: {
    paddingHorizontal: spacing.md,
    paddingTop: 4,
    paddingBottom: 10,
    backgroundColor: colors.bg,
  },
  quotaReached: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    backgroundColor: colors.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  quotaCopy: { flex: 1, gap: 2 },
  quotaTitle: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 13.5,
    color: colors.ink,
  },
  quotaBody: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 12,
    lineHeight: 17,
    color: colors.muted,
  },
  proButton: {
    minWidth: 78,
    minHeight: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    backgroundColor: colors.ink,
  },
  proButtonText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 13.5,
    color: colors.white,
  },
});
