import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PressableScale } from '@/components/Motion';
import { tabBarSpace } from '@/components/TabBar';
import { EmptyState, Txt } from '@/components/ui';
import { usePlaces } from '@/context/PlacesContext';
import type { AppNotification } from '@/data/types';
import { colors } from '@/theme/colors';
import { duration, stagger } from '@/theme/motion';
import { spacing } from '@/theme/spacing';

const ICON: Record<AppNotification['type'], keyof typeof Ionicons.glyphMap> = {
  place_approved: 'checkmark-circle',
  place_rejected: 'close-circle',
  still_here: 'time',
  system: 'information-circle',
};

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'şimdi';
  if (mins < 60) return `${mins} dk önce`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} sa önce`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} gün önce`;
  return new Date(iso).toLocaleDateString('tr-TR');
}

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const {
    notifications,
    markNotificationRead,
    markAllNotificationsRead,
    clearNotifications,
    unreadCount,
    openStillHerePrompt,
  } = usePlaces();

  const confirmClear = () => {
    Alert.alert(
      'Bildirim geçmişini sil?',
      'Tüm geçmiş bildirimler kalıcı olarak silinecek.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Tümünü sil',
          style: 'destructive',
          onPress: () => {
            void clearNotifications().catch(() => {
              Alert.alert('Silinemedi', 'Bildirim geçmişi şu anda silinemedi. Lütfen tekrar dene.');
            });
          },
        },
      ],
    );
  };

  const onPress = (n: AppNotification) => {
    void markNotificationRead(n.id);
    // A reminder from a check-in that already ended opens the place instead of
    // asking "still there?" again.
    if (n.type === 'still_here' && n.placeId && openStillHerePrompt(n.placeId)) return;
    // Any other notification that names a place opens it, so taps are never dead.
    if (n.placeId) {
      router.push(`/place/${n.placeId}`);
    }
  };

  const options = () => {
    Alert.alert('Bildirimler', undefined, [
      { text: 'Geçmişi sil', style: 'destructive', onPress: confirmClear },
      { text: 'Vazgeç', style: 'cancel' },
    ]);
  };

  const sections = groupByDay(notifications);
  let index = 0;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.header}>
        <Txt variant="h1" style={{ flex: 1 }} numberOfLines={1}>Bildirimler</Txt>
        {unreadCount > 0 ? (
          <PressableScale onPress={markAllNotificationsRead} hitSlop={10} scaleTo={0.94} style={styles.markAllButton}
            accessibilityRole="button" accessibilityLabel="Tümünü okundu say">
            <Text style={styles.markAll}>Tümünü oku</Text>
          </PressableScale>
        ) : null}
        {notifications.length > 0 ? (
          <PressableScale onPress={options} hitSlop={6} scaleTo={0.94} style={styles.more}
            accessibilityRole="button" accessibilityLabel="Diğer seçenekler">
            <Ionicons name="ellipsis-horizontal" size={20} color={colors.ink} />
          </PressableScale>
        ) : null}
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.list,
          { paddingBottom: tabBarSpace(insets.bottom) + spacing.lg },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {notifications.length === 0 ? (
          <EmptyState
            icon="notifications-outline"
            title="Henüz bildirim yok"
            body="Mekân onayları ve check‑in hatırlatmaları burada görünecek."
          />
        ) : (
          sections.map((section) => (
            <View key={section.title} style={styles.section}>
              <Text style={styles.sectionTitle} accessibilityRole="header">{section.title}</Text>
              {section.items.map((n, i) => (
                <Animated.View
                  key={n.id}
                  entering={FadeInDown.delay(stagger(index++, 45)).duration(duration.base)}
                >
                  <PressableScale
                    onPress={() => onPress(n)}
                    scaleTo={0.99}
                    style={[styles.row, i === section.items.length - 1 && styles.rowLast]}
                    accessibilityRole="button"
                    accessibilityLabel={`${n.read ? '' : 'Okunmadı, '}${n.title}. ${n.body}`}
                  >
                    <View style={[styles.icon, !n.read && styles.iconUnread]}>
                      <Ionicons
                        name={ICON[n.type] ?? 'information-circle'}
                        size={19}
                        color={!n.read ? colors.ink : colors.muted}
                      />
                    </View>
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <Text style={[styles.title, n.read && styles.titleRead]} numberOfLines={1}>
                        {n.title}
                      </Text>
                      <Text style={styles.body} numberOfLines={2}>
                        {n.body}
                      </Text>
                      <Text style={styles.time}>{relativeTime(n.createdAt)}</Text>
                    </View>
                    {!n.read ? <View style={styles.dot} /> : null}
                  </PressableScale>
                </Animated.View>
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

/** Splits into "Bugün" and "Daha önce", keeping each group's order. */
function groupByDay(items: AppNotification[], now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const recent: AppNotification[] = [];
  const earlier: AppNotification[] = [];
  for (const n of items) {
    const time = new Date(n.createdAt).getTime();
    (Number.isFinite(time) && time >= today ? recent : earlier).push(n);
  }
  return [
    { title: 'Bugün', items: recent },
    { title: 'Daha önce', items: earlier },
  ].filter((section) => section.items.length > 0);
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xs,
  },
  markAllButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  markAll: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 14,
    color: colors.ink,
  },
  more: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginRight: -10 },
  list: { gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  section: { gap: 0 },
  sectionTitle: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 13,
    color: colors.muted,
    marginBottom: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  rowLast: { borderBottomWidth: 0 },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.bgSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconUnread: { backgroundColor: colors.greenSoft },
  title: { fontFamily: 'DMSans_700Bold', fontSize: 15, lineHeight: 21, color: colors.ink },
  titleRead: { color: colors.inkSoft },
  body: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 14,
    lineHeight: 19,
    color: colors.muted,
  },
  time: { fontFamily: 'DMSans_400Regular', fontSize: 12, color: colors.muted, marginTop: 2 },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.green,
    marginTop: 6,
  },
});
