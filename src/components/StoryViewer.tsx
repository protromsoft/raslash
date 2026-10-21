import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  Modal,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type AccessibilityActionEvent,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PressableScale } from '@/components/Motion';
import { afterSheetClose, Sheet } from '@/components/Sheet';
import { Avatar, Button, IconButton } from '@/components/ui';
import { blockUser, reportMessage } from '@/lib/checkIns';
import { removeOwnStoryPhoto } from '@/lib/placeModeration';
import { chatPhotoUrls } from '@/lib/placePhotos';
import {
  canDeleteOwnStoryItem,
  canModerateStory,
  formatStoryAge,
  remainingStoryMs,
  type PersonStory,
  type StoryItem,
} from '@/lib/placeStories';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';

/** How long one photo stays on screen before the next one. */
export const STORY_ITEM_MS = 5000;
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 900;

/** Our own just-taken shot stays on its local file; everything else needs a signed URL. */
/** How long a photo may wait for its link before the viewer says it failed and moves on. */
const SIGN_TIMEOUT_MS = 14000;
/** The viewer's fade-out; an alert raised while it is still leaving can be dropped on iOS. */
const VIEWER_EXIT_MS = 400;

function itemUri(item: StoryItem | undefined, signed: Record<string, string>) {
  if (!item) return undefined;
  return item.localPhotoUri ?? (item.photoPath ? signed[item.photoPath] : undefined);
}

/**
 * Full-screen, Instagram-style viewer for one person's place photos. `story`
 * null keeps it closed. Tap the right half for the next photo, the left half
 * for the previous one; swipe down or the X closes, and so does finishing the
 * last photo.
 *
 * Someone else's story has a "…" menu (report the photo, block the person).
 * Its sheet is rendered in here, so its Modal stacks above the viewer's.
 */
export function StoryViewer({
  story,
  startIndex,
  photoUrls,
  viewerId,
  onSeen,
  onBlocked,
  onDeleted,
  onClose,
}: {
  story: PersonStory | null;
  startIndex: number;
  photoUrls: Record<string, string>;
  /** The signed-in user; without one there is nothing to report with. */
  viewerId?: string | null;
  onSeen: (id: string) => void;
  /** After a successful block: drop that person's messages and stories locally. */
  onBlocked?: (userId: string) => void;
  /** Your own story photo was deleted (message id). */
  onDeleted?: (messageId: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal
      visible={!!story}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <GestureHandlerRootView style={styles.root}>
        {story ? (
          <StoryContent
            key={story.userId}
            story={story}
            startIndex={startIndex}
            photoUrls={photoUrls}
            viewerId={viewerId}
            onSeen={onSeen}
            onBlocked={onBlocked}
            onDeleted={onDeleted}
            onClose={onClose}
          />
        ) : null}
      </GestureHandlerRootView>
    </Modal>
  );
}

function StoryContent({
  story,
  startIndex,
  photoUrls,
  viewerId,
  onSeen,
  onBlocked,
  onDeleted,
  onClose,
}: {
  story: PersonStory;
  startIndex: number;
  photoUrls: Record<string, string>;
  viewerId?: string | null;
  onSeen: (id: string) => void;
  onBlocked?: (userId: string) => void;
  /** Your own story photo was deleted (message id). */
  onDeleted?: (messageId: string) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const count = story.items.length;
  const [index, setIndex] = useState(() => Math.min(Math.max(startIndex, 0), Math.max(count - 1, 0)));
  // Bumped to replay the current photo (tapping back on the first one).
  const [cycle, setCycle] = useState(0);
  const [loadedUri, setLoadedUri] = useState<string | null>(null);
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const [screenReader, setScreenReader] = useState(false);
  // The options sheet, and the alerts that follow it, hold the current photo.
  const [menuOpen, setMenuOpen] = useState(false);
  const [holding, setHolding] = useState(false);
  const paused = menuOpen || holding;
  const progress = useSharedValue(0);
  const dragY = useSharedValue(0);

  const safeIndex = Math.min(index, Math.max(count - 1, 0));
  const item = story.items[safeIndex];
  // URLs signed here when the chat's batch missed one (a failed or slow
  // request); without this the viewer waited on a spinner forever.
  const [ownUrls, setOwnUrls] = useState<Record<string, string>>({});
  const [unsignable, setUnsignable] = useState<string | null>(null);
  const uri = itemUri(item, { ...ownUrls, ...photoUrls });
  const missingPath = !uri && item?.photoPath && !item.localPhotoUri ? item.photoPath : null;
  const failed = (!!uri && failedUri === uri) || (!!missingPath && unsignable === missingPath);
  const ready = (!!uri && (loadedUri === uri || failedUri === uri)) || failed;

  useEffect(() => {
    if (!missingPath) return;
    let cancelled = false;
    setUnsignable(null);
    const giveUp = setTimeout(() => { if (!cancelled) setUnsignable(missingPath); }, SIGN_TIMEOUT_MS);
    // Two tries: the first may have waited on a stalled request that the
    // cache has just dropped, so a second call signs afresh.
    void (async () => {
      for (let attempt = 0; attempt < 2 && !cancelled; attempt += 1) {
        const urls = await chatPhotoUrls.resolve([missingPath]);
        if (cancelled) return;
        if (urls[missingPath]) {
          clearTimeout(giveUp);
          setOwnUrls((prev) => ({ ...prev, ...urls }));
          return;
        }
      }
      if (!cancelled) setUnsignable(missingPath);
    })();
    return () => { cancelled = true; clearTimeout(giveUp); };
  }, [missingPath]);

  // The story can shrink while open (a photo expired, an upload failed).
  useEffect(() => {
    if (count === 0) onClose();
  }, [count, onClose]);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isScreenReaderEnabled().then((on) => {
      if (mounted) setScreenReader(on);
    });
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', setScreenReader);
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  const goNext = useCallback(() => {
    if (safeIndex >= count - 1) onClose();
    else setIndex(safeIndex + 1);
  }, [count, onClose, safeIndex]);

  const goPrevious = useCallback(() => {
    if (safeIndex > 0) setIndex(safeIndex - 1);
    else setCycle((value) => value + 1);
  }, [safeIndex]);

  // Worklet callbacks reach the latest handlers through a ref.
  const handlers = useRef({ goNext, goPrevious, onClose });
  handlers.current = { goNext, goPrevious, onClose };
  const advance = useCallback(() => handlers.current.goNext(), []);
  const close = useCallback(() => handlers.current.onClose(), []);
  const onTapAt = useCallback(
    (x: number) => (x < width / 2 ? handlers.current.goPrevious() : handlers.current.goNext()),
    [width],
  );

  const seenId = item && !item.pending ? item.id : null;
  useEffect(() => {
    if (seenId) onSeen(seenId);
  }, [onSeen, seenId]);

  // A new photo (or a replay) starts its bar from empty. Declared before the
  // effect below so the reset lands first when both re-run.
  useEffect(() => {
    cancelAnimation(progress);
    progress.value = 0;
  }, [cycle, progress, safeIndex]);

  // Each photo runs its bar once it is on screen; a screen reader user moves on
  // with the accessibility actions instead of a timer. A pause keeps the bar
  // where it is and resumes with only the time that was left.
  useEffect(() => {
    if (!ready || screenReader || paused) {
      cancelAnimation(progress);
      return;
    }
    const left = remainingStoryMs(progress.value, STORY_ITEM_MS);
    progress.value = withTiming(1, { duration: left, easing: Easing.linear }, (finished) => {
      if (finished) runOnJS(advance)();
    });
    return () => cancelAnimation(progress);
  }, [advance, cycle, paused, progress, ready, safeIndex, screenReader]);

  const canModerate = canModerateStory(story, item, viewerId);
  const canDelete = canDeleteOwnStoryItem(story, item);
  const resume = useCallback(() => setHolding(false), []);
  const openMenu = useCallback(() => setMenuOpen(true), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const reportItem = () => {
    if (!item || !viewerId || !canModerate) return;
    const messageId = item.id;
    const authorId = story.userId;
    setHolding(true);
    setMenuOpen(false);
    // An alert raised while the sheet's Modal is still leaving can be lost on iOS.
    afterSheetClose(() => {
      void reportMessage(viewerId, messageId, authorId).then((ok) => {
        Alert.alert(
          ok ? 'Şikâyet alındı' : 'Şikâyet gönderilemedi',
          ok
            ? 'İncelemek üzere kaydettik. Teşekkür ederiz.'
            : 'Bağlantını kontrol edip tekrar deneyebilirsin.',
          [{ text: 'Tamam', onPress: resume }],
          { cancelable: true, onDismiss: resume },
        );
      });
    });
  };

  const deleteOwnItem = () => {
    if (!item || !canDelete || !item.photoPath) return;
    const target = { messageId: item.id, photoPath: item.photoPath };
    setHolding(true);
    setMenuOpen(false);
    afterSheetClose(() => {
      Alert.alert(
        'Fotoğraf silinsin mi?',
        'Bu fotoğraf hikâyenden kalkar ve kimse göremez.',
        [
          { text: 'Vazgeç', style: 'cancel', onPress: resume },
          {
            text: 'Sil',
            style: 'destructive',
            onPress: () => {
              void removeOwnStoryPhoto(target)
                .then(() => {
                  // The parent drops the item; the viewer moves on or closes.
                  onDeleted?.(target.messageId);
                  resume();
                })
                .catch(() => {
                  Alert.alert(
                    'Fotoğraf silinemedi',
                    'Bağlantını kontrol edip tekrar deneyebilirsin.',
                    [{ text: 'Tamam', onPress: resume }],
                    { cancelable: true, onDismiss: resume },
                  );
                });
            },
          },
        ],
        { cancelable: true, onDismiss: resume },
      );
    });
  };

  const blockAuthor = () => {
    if (!viewerId || !canModerate) return;
    const blockerId = viewerId;
    const targetId = story.userId;
    const confirmed = () => {
      void blockUser(blockerId, targetId).then((ok) => {
        if (!ok) {
          Alert.alert(
            'Engelleme başarısız',
            'Bağlantını kontrol edip tekrar deneyebilirsin.',
            [{ text: 'Tamam', onPress: resume }],
            { cancelable: true, onDismiss: resume },
          );
          return;
        }
        onBlocked?.(targetId);
        onClose();
        setTimeout(() => {
          Alert.alert('Kullanıcı engellendi', 'Bu kullanıcının mesajlarını artık görmeyeceksin.');
        }, VIEWER_EXIT_MS);
      });
    };
    setHolding(true);
    setMenuOpen(false);
    afterSheetClose(() => {
      Alert.alert(
        `${story.author} engellensin mi?`,
        'Bu kişinin mesajlarını ve hikâyelerini artık görmeyeceksin.',
        [
          { text: 'Vazgeç', style: 'cancel', onPress: resume },
          { text: 'Engelle', style: 'destructive', onPress: confirmed },
        ],
        { cancelable: true, onDismiss: resume },
      );
    });
  };

  const pan = Gesture.Pan()
    .activeOffsetY(12)
    .failOffsetX([-30, 30])
    .onUpdate((e) => {
      dragY.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY) {
        runOnJS(close)();
      } else {
        dragY.value = withSpring(0);
      }
    });
  const tap = Gesture.Tap()
    .maxDuration(400)
    .onEnd((e, success) => {
      if (success) runOnJS(onTapAt)(e.x);
    });
  const gesture = Gesture.Race(pan, tap);

  const dragStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dragY.value }],
    opacity: 1 - Math.min(dragY.value / 600, 0.4),
  }));

  const onAccessibilityAction = useCallback(
    (event: AccessibilityActionEvent) => {
      if (event.nativeEvent.actionName === 'increment') goNext();
      else if (event.nativeEvent.actionName === 'decrement') goPrevious();
    },
    [goNext, goPrevious],
  );

  const name = story.mine ? 'Sen' : story.author;
  const age = item?.pending ? 'Gönderiliyor…' : item ? formatStoryAge(item.createdAt, Date.now()) : '';

  return (
    <>
      <GestureDetector gesture={gesture}>
        <Animated.View style={[styles.root, dragStyle]}>
          <View
            style={styles.stage}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={`${story.mine ? 'Senin' : `${story.author} adlı kişinin`} hikâyesi, fotoğraf ${safeIndex + 1} / ${count}`}
            accessibilityHint="Sonraki ya da önceki fotoğraf için yukarı veya aşağı kaydır"
            accessibilityActions={[
              { name: 'increment', label: 'Sonraki fotoğraf' },
              { name: 'decrement', label: 'Önceki fotoğraf' },
            ]}
            onAccessibilityAction={onAccessibilityAction}
          >
            {uri ? (
              <Image
                key={uri}
                source={{ uri }}
                style={StyleSheet.absoluteFill}
                contentFit="contain"
                onLoad={() => setLoadedUri(uri)}
                onError={() => setFailedUri(uri)}
              />
            ) : null}
            {!ready ? <ActivityIndicator color={colors.white} /> : null}
            {failed ? <Text style={styles.failed}>Fotoğraf yüklenemedi</Text> : null}
          </View>

          <View style={[styles.top, { paddingTop: insets.top + spacing.sm }]} pointerEvents="box-none">
            <View style={styles.bars} pointerEvents="none">
              {story.items.map((entry, i) => (
                <Segment
                  key={entry.id}
                  state={i < safeIndex ? 'done' : i === safeIndex ? 'active' : 'todo'}
                  progress={progress}
                />
              ))}
            </View>
            <View style={styles.header} pointerEvents="box-none">
              <Avatar uri={story.avatarUrl} name={story.author} size={32} />
              <View style={styles.headerText} pointerEvents="none">
                <Text style={styles.name} numberOfLines={1}>
                  {name}
                </Text>
                {age ? <Text style={styles.age}>{age}</Text> : null}
              </View>
              {canModerate || canDelete ? (
                <IconButton
                  icon="ellipsis-horizontal"
                  tone="blur"
                  onPress={openMenu}
                  accessibilityLabel="Hikâye seçenekleri"
                />
              ) : null}
              <IconButton icon="close" tone="blur" onPress={onClose} accessibilityLabel="Hikâyeyi kapat" />
            </View>
          </View>

          {item?.caption ? (
            <View
              style={[styles.captionWrap, { paddingBottom: insets.bottom + spacing.md }]}
              pointerEvents="none"
            >
              <Text style={styles.caption}>{item.caption}</Text>
            </View>
          ) : null}
        </Animated.View>
      </GestureDetector>

      {/* Inside the viewer's Modal, so this sheet's own Modal opens above it. */}
      <Sheet visible={menuOpen} onClose={closeMenu} title="Hikâye seçenekleri" scroll={false}>
        {canDelete ? (
          <View style={styles.menu}>
            <PressableScale onPress={deleteOwnItem} scaleTo={0.98} style={styles.menuRow}
              accessibilityRole="button" accessibilityLabel="Hikâyeden sil">
              <View style={styles.menuIcon}><Ionicons name="trash-outline" size={18} color={colors.danger} /></View>
              <Text style={[styles.menuLabel, styles.menuDanger]}>Hikâyeden sil</Text>
            </PressableScale>
            <Button label="Vazgeç" onPress={closeMenu} style={styles.menuCancel} />
          </View>
        ) : (
        <View style={styles.menu}>
          <PressableScale onPress={reportItem} scaleTo={0.98} style={styles.menuRow}
            accessibilityRole="button" accessibilityLabel="Şikâyet et">
            <View style={styles.menuIcon}><Ionicons name="flag-outline" size={18} color={colors.ink} /></View>
            <Text style={styles.menuLabel}>Şikâyet et</Text>
          </PressableScale>
          <PressableScale onPress={blockAuthor} scaleTo={0.98} style={styles.menuRow}
            accessibilityRole="button" accessibilityLabel="Kullanıcıyı engelle">
            <View style={styles.menuIcon}><Ionicons name="ban-outline" size={18} color={colors.danger} /></View>
            <Text style={[styles.menuLabel, styles.menuDanger]}>Kullanıcıyı engelle</Text>
          </PressableScale>
          <Button label="Vazgeç" onPress={closeMenu} style={styles.menuCancel} />
        </View>
        )}
      </Sheet>
    </>
  );
}

function Segment({
  state,
  progress,
}: {
  state: 'done' | 'active' | 'todo';
  progress: SharedValue<number>;
}) {
  const fillStyle = useAnimatedStyle(() => ({
    width: `${(state === 'done' ? 1 : state === 'active' ? progress.value : 0) * 100}%`,
  }));
  return (
    <View style={styles.segment}>
      <Animated.View style={[styles.segmentFill, fillStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.night },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  failed: { fontFamily: 'DMSans_500Medium', fontSize: 13, color: 'rgba(255,255,255,0.75)' },
  top: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.sm,
    gap: spacing.sm,
  },
  bars: { flexDirection: 'row', gap: 4 },
  segment: {
    flex: 1,
    height: 2.5,
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.32)',
  },
  segmentFill: { height: '100%', backgroundColor: colors.white },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 4 },
  headerText: { flex: 1, flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  name: { flexShrink: 1, fontFamily: 'DMSans_700Bold', fontSize: 14, color: colors.white },
  age: { fontFamily: 'DMSans_400Regular', fontSize: 12, color: 'rgba(255,255,255,0.72)' },
  captionWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  menu: { gap: 6 },
  menuRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, borderRadius: 18 },
  menuIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  menuLabel: { flex: 1, fontFamily: 'DMSans_700Bold', fontSize: 16, color: colors.ink },
  menuDanger: { color: colors.danger },
  menuCancel: { marginTop: 10 },
  caption: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 15,
    lineHeight: 21,
    color: colors.white,
    textAlign: 'center',
  },
});
