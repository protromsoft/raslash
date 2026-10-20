import { Ionicons } from '@expo/vector-icons';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Avatar } from '@/components/Avatar';
import type { ChatPerson } from '@/data/types';
import { colors } from '@/theme/colors';

/** A count is public; identities must still come from the same-venue RPC. */
export function PlaceMembers({ people, canSeeMembers, count }: {
  people: ChatPerson[];
  canSeeMembers: boolean;
  count: number;
}) {
  const members = canSeeMembers ? people : [];
  const displayedCount = members.length || Math.max(0, count);
  return (
    <View style={styles.section}>
      <View style={styles.heading}>
        <Text style={styles.title}>Üyeler</Text>
        <Text style={[styles.count, displayedCount > 0 && styles.countLive]}>
          {displayedCount > 0 ? `${displayedCount} kişi şu an burada` : 'Şu an kimse yok'}</Text>
      </View>
      {members.length > 0 ? (
        <FlatList
          horizontal
          data={members}
          keyExtractor={(person) => person.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.members}
          initialNumToRender={7}
          maxToRenderPerBatch={7}
          windowSize={3}
          renderItem={({ item }) => (
            <View style={styles.member}>
              <Avatar uri={item.avatarUrl} name={item.firstName} size={48} ring />
              <Text style={styles.name} numberOfLines={1}>
                {item.isMe ? 'Sen' : item.firstName}
              </Text>
            </View>
          )}
        />
      ) : (
        <View style={styles.notice}>
          <Ionicons name={canSeeMembers ? 'people-outline' : 'lock-closed-outline'} size={18} color={colors.muted} />
          <Text style={styles.note}>
            {canSeeMembers
              ? 'Aktif üyeler burada görünür. Liste otomatik güncellenir.'
              : 'Üyelerin isim ve fotoğraflarını görmek için bu mekâna check-in yap.'}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  heading: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 },
  title: { fontFamily: 'DMSans_700Bold', fontSize: 17, color: colors.ink },
  count: { fontFamily: 'DMSans_400Regular', fontSize: 13, color: colors.muted },
  countLive: { fontFamily: 'DMSans_700Bold', color: colors.green },
  members: { gap: 12, paddingBottom: 2 },
  member: { width: 56, alignItems: 'center', gap: 5 },
  name: { fontFamily: 'DMSans_500Medium', fontSize: 12, color: colors.inkSoft, maxWidth: 56 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 6 },
  note: { flex: 1, fontFamily: 'DMSans_400Regular', fontSize: 13, lineHeight: 18, color: colors.muted },
});
