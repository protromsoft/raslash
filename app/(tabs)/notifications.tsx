import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PressableScale } from '@/components/Motion';
import { tabBarSpace } from '@/components/TabBar';
import { EmptyState, Txt } from '@/components/ui';
import { usePlaces } from '@/context/PlacesContext';
import type { AppNotification } from '@/data/types';
import { colors, shadows } from '@/theme/colors';
import { duration, stagger } from '@/theme/motion';
import { radii, spacing } from '@/theme/spacing';

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
    unreadCount,
    openStillHerePrompt,
  } = usePlaces();

  const onPress = (n: AppNotification) => {
    void markNotificationRead(n.id);
    if (n.type === 'still_here' && n.placeId) {
      openStillHerePrompt(n.placeId);
      return;
    }
    // Any other notification that names a place opens it, so taps are never dead.
    if (n.placeId) {
      router.push(`/place/${n.placeId}`);
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Txt variant="h1">Bildirimler</Txt>
          <Txt variant="body" style={{ marginTop: 2 }}>
            {unreadCount > 0 ? `${unreadCount} okunmamış` : 'Hepsi okundu'}
          </Txt>
        </View>
        {unreadCount > 0 ? (
          <PressableScale onPress={markAllNotificationsRead} hitSlop={10} scaleTo={0.94}>
            <Text style={styles.markAll}>Tümünü oku</Text>
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
            body="Mekan onayları ve check‑in hatırlatmaları burada görünecek."
          />
        ) : (
          notifications.map((n, i) => (
            <Animated.View
              key={n.id}
              entering={FadeInDown.delay(stagger(i, 45)).duration(duration.base)}
            >
              <PressableScale
                onPress={() => onPress(n)}
                scaleTo={0.985}
                style={[styles.card, !n.read && styles.cardUnread]}
              >
                <View style={[styles.icon, !n.read && styles.iconUnread]}>
                  <Ionicons
                    name={ICON[n.type] ?? 'information-circle'}
                    size={17}
                    color={!n.read ? colors.white : colors.muted}
                  />
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={styles.title} numberOfLines={1}>
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
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xs,
  },
  markAll: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 14,
    color: colors.muted,
    paddingBottom: 4,
  },
  // The scroller spans the full width so card shadows spill inside its bounds
  // instead of being clipped against it; the inset lives on the content.
  list: { gap: 10, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: colors.white,
    borderRadius: radii.md,
    padding: spacing.md,
    ...shadows.soft,
  },
  cardUnread: {
    ...shadows.card,
  },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.bgSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconUnread: { backgroundColor: colors.ink },
  title: { fontFamily: 'DMSans_700Bold', fontSize: 15, color: colors.ink },
  body: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 13.5,
    lineHeight: 19,
    color: colors.muted,
  },
  time: { fontFamily: 'DMSans_400Regular', fontSize: 11.5, color: colors.mutedSoft, marginTop: 2 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.green,
    marginTop: 6,
  },
});
