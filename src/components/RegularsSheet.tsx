import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Sheet } from '@/components/Sheet';
import { Avatar, Badge } from '@/components/ui';
import type { Regular } from '@/data/types';
import { colors } from '@/theme/colors';
import { duration, stagger } from '@/theme/motion';
import { radii, spacing } from '@/theme/spacing';

type Props = {
  visible: boolean;
  placeName?: string;
  regulars: Regular[];
  onClose: () => void;
};

const PODIUM = ['#C9A227', '#A8A29E', '#B07A46'];

export function RegularsSheet({ visible, placeName, regulars, onClose }: Props) {
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Müdavimler"
      subtitle={placeName ? `${placeName} · bu ay` : 'Bu ay'}
    >
      <View style={styles.legend}>
        <Badge label="Her ay sıfırlanır" tone="neutral" icon="refresh" />
        <Badge label="İlk 10" tone="dark" icon="trophy" />
      </View>

      {regulars.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Ionicons name="trophy-outline" size={24} color={colors.muted} />
          </View>
          <Text style={styles.emptyTitle}>Bu ay henüz müdavim yok</Text>
          <Text style={styles.emptyHint}>Check‑in yap, listenin başına geç.</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {regulars.map((r, i) => (
            <Animated.View
              key={r.userKey}
              entering={FadeInDown.delay(stagger(i, 40)).duration(duration.base)}
              style={[styles.row, r.rank <= 3 && styles.rowTop]}
            >
              <Text
                style={[
                  styles.rank,
                  r.rank <= 3 && { color: PODIUM[r.rank - 1] },
                ]}
              >
                {r.rank}
              </Text>
              <Avatar uri={r.avatarUrl} name={r.firstName} size={40} />
              <View style={styles.meta}>
                <Text style={styles.name} numberOfLines={1}>
                  {[r.firstName, r.lastName].filter(Boolean).join(' ')}
                </Text>
                <Text style={styles.visits}>{r.visits} geliş</Text>
              </View>
              {r.rank === 1 ? <Ionicons name="flame" size={18} color={colors.amber} /> : null}
            </Animated.View>
          ))}
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: spacing.sm,
  },
  list: {
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.white,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  rowTop: {
    borderWidth: 1,
    borderColor: colors.line,
  },
  rank: {
    width: 22,
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 17,
    textAlign: 'center',
    color: colors.mutedSoft,
  },
  meta: { flex: 1, gap: 2 },
  name: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 15,
    color: colors.ink,
  },
  visits: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 12,
    color: colors.muted,
  },
  empty: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: 32,
  },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.bgSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 16,
    color: colors.ink,
  },
  emptyHint: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 13,
    color: colors.muted,
  },
});
