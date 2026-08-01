import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Appear, PressableScale } from '@/components/Motion';
import { afterSheetClose, Sheet } from '@/components/Sheet';
import { Avatar, Badge, Button, Card, TextButton, Txt } from '@/components/ui';
import { useApp } from '@/context/AppContext';
import { usePlaces } from '@/context/PlacesContext';
import { isRevenueCatConfigured } from '@/lib/purchases';
import { instagramUrl, linkedInUrl, normalizeInstagram } from '@/lib/social';
import { colors, shadows } from '@/theme/colors';
import { radii, spacing, TAB_BAR_HEIGHT } from '@/theme/spacing';

function Row({
  icon,
  label,
  value,
  onPress,
  danger,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
  last?: boolean;
}) {
  const body = (
    <>
      <View style={[styles.rowIcon, danger && { backgroundColor: 'rgba(180,70,47,0.1)' }]}>
        <Ionicons name={icon} size={16} color={danger ? colors.danger : colors.ink} />
      </View>
      <Text style={[styles.rowLabel, danger && { color: colors.danger }]}>{label}</Text>
      {value ? <Text style={styles.rowValue}>{value}</Text> : null}
      {onPress ? <Ionicons name="chevron-forward" size={16} color={colors.mutedSoft} /> : null}
    </>
  );

  // Rows without an action stay inert instead of animating like a button.
  if (!onPress) {
    return <View style={[styles.row, !last && styles.rowBorder]}>{body}</View>;
  }

  return (
    <PressableScale onPress={onPress} scaleTo={0.99} style={[styles.row, !last && styles.rowBorder]}>
      {body}
    </PressableScale>
  );
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const {
    profile,
    isSubscribed,
    setSubscribed,
    refreshSubscription,
    isAdmin,
    setAdmin,
    authRequired,
    revenueCatReady,
    user,
    signOut,
    resetDemo,
    restartOnboarding,
  } = useApp();
  const { pendingPlaces, activeCheckIn, simulateStillHereReminder } = usePlaces();

  const [devOpen, setDevOpen] = useState(false);
  const [message, setMessage] = useState('');
  const liveBilling = isRevenueCatConfigured && revenueCatReady;

  useEffect(() => {
    void refreshSubscription();
  }, [refreshSubscription]);

  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(' ') || 'Profilini tamamla';
  const igHandle = normalizeInstagram(profile.instagram);

  const openSocial = async (kind: 'instagram' | 'linkedin') => {
    const url = kind === 'instagram' ? instagramUrl(profile.instagram) : linkedInUrl(profile.linkedin);
    if (url) await Linking.openURL(url);
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + TAB_BAR_HEIGHT + 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Appear style={styles.hero}>
          <Avatar uri={profile.avatarUrl} name={profile.firstName} size={92} />
          <View style={styles.heroText}>
            <Txt variant="h2">{fullName}</Txt>
            {profile.profession ? <Txt variant="body">{profile.profession}</Txt> : null}
            {user?.email ? <Txt variant="caption">{user.email}</Txt> : null}
          </View>
          <View style={styles.badges}>
            <Badge label={isSubscribed ? 'Üye' : 'Ücretsiz'} tone={isSubscribed ? 'dark' : 'neutral'} />
            {profile.age ? <Badge label={`${profile.age} yaş`} tone="neutral" /> : null}
            {isAdmin ? <Badge label="Admin" tone="warm" icon="shield-checkmark" /> : null}
          </View>
          <Button
            label="Profili düzenle"
            tone="outline"
            icon="create-outline"
            onPress={() => router.push('/profile-edit')}
          />
        </Appear>

        {profile.bio ? (
          <Appear delay={60}>
            <Card style={styles.bioCard}>
              <Text style={styles.bioLabel}>Hakkında</Text>
              <Text style={styles.bio}>{profile.bio}</Text>
            </Card>
          </Appear>
        ) : null}

        {!isSubscribed ? (
          <Appear delay={80}>
            <PressableScale onPress={() => router.push('/paywall')} style={styles.upsell}>
              <View style={styles.upsellIcon}>
                <Ionicons name="sparkles" size={18} color={colors.white} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.upsellTitle}>Raslash üyeliği</Text>
                <Text style={styles.upsellBody}>
                  Check‑in yap, mekandaki sohbete katıl, müdavim ol.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.6)" />
            </PressableScale>
          </Appear>
        ) : null}

        <Appear delay={110}>
          <Text style={styles.sectionLabel}>Bağlantılar</Text>
          <Card padded={false} style={styles.group}>
            <Row
              icon="logo-instagram"
              label="Instagram"
              value={igHandle ? `@${igHandle}` : 'Ekli değil'}
              onPress={igHandle ? () => void openSocial('instagram') : undefined}
            />
            <Row
              icon="logo-linkedin"
              label="LinkedIn"
              value={linkedInUrl(profile.linkedin) ? 'Açık' : 'Ekli değil'}
              onPress={linkedInUrl(profile.linkedin) ? () => void openSocial('linkedin') : undefined}
              last
            />
          </Card>
        </Appear>

        <Appear delay={140}>
          <Text style={styles.sectionLabel}>Hesap</Text>
          <Card padded={false} style={styles.group}>
            <Row
              icon="card-outline"
              label="Üyelik"
              value={isSubscribed ? 'Aktif' : 'Yok'}
              onPress={() =>
                void refreshSubscription().then((active) =>
                  setMessage(active ? 'Üyelik aktif.' : 'Aktif üyelik bulunamadı.'),
                )
              }
            />
            {isAdmin ? (
              <Row
                icon="shield-checkmark-outline"
                label="Admin paneli"
                value={pendingPlaces.length > 0 ? `${pendingPlaces.length} onay` : undefined}
                onPress={() => router.push('/admin')}
              />
            ) : null}
            <Row
              icon="construct-outline"
              label="Geliştirici seçenekleri"
              onPress={() => setDevOpen(true)}
            />
            <Row
              icon="log-out-outline"
              label={authRequired ? 'Çıkış yap' : 'Demoyu sıfırla'}
              danger
              last
              onPress={() => {
                if (authRequired) {
                  void signOut().then(() => router.replace('/auth/login'));
                } else {
                  void resetDemo();
                }
              }}
            />
          </Card>
        </Appear>

        {message ? <Text style={styles.message}>{message}</Text> : null}
      </ScrollView>

      <Sheet
        visible={devOpen}
        onClose={() => setDevOpen(false)}
        title="Geliştirici seçenekleri"
        subtitle="Sadece test için — akışları elle tetikle."
      >
        <View style={{ gap: 8 }}>
          <Button
            label="Onboarding'i yeniden başlat"
            tone="outline"
            icon="refresh"
            onPress={() => {
              setDevOpen(false);
              void restartOnboarding().then(() =>
                afterSheetClose(() => router.replace('/onboarding')),
              );
            }}
          />
          {!liveBilling ? (
            <Button
              label={`Demo üyelik: ${isSubscribed ? 'açık' : 'kapalı'}`}
              tone="outline"
              icon="toggle-outline"
              onPress={() => void setSubscribed(!isSubscribed)}
            />
          ) : null}
          {!authRequired ? (
            <Button
              label={`Demo admin: ${isAdmin ? 'açık' : 'kapalı'}`}
              tone="outline"
              icon="shield-outline"
              onPress={() => void setAdmin(!isAdmin)}
            />
          ) : null}
          {activeCheckIn ? (
            <Button
              label="'Mekanda mısın?' bildirimini tetikle"
              tone="outline"
              icon="notifications-outline"
              onPress={() => {
                setDevOpen(false);
                // The global prompt is its own modal; let this one close first.
                afterSheetClose(simulateStillHereReminder);
              }}
            />
          ) : null}
          <TextButton label="Kapat" onPress={() => setDevOpen(false)} />
        </View>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg, gap: spacing.lg },

  hero: { alignItems: 'center', gap: 10 },
  heroText: { alignItems: 'center', gap: 2 },
  badges: { flexDirection: 'row', gap: 6, marginTop: 2, marginBottom: 6 },

  bioCard: { gap: 6 },
  bioLabel: { fontFamily: 'DMSans_500Medium', fontSize: 12, color: colors.muted },
  bio: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 14.5,
    lineHeight: 21,
    color: colors.inkSoft,
  },

  upsell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.ink,
    borderRadius: radii.lg,
    padding: spacing.md,
    ...shadows.card,
  },
  upsellIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  upsellTitle: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 16, color: colors.white },
  upsellBody: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 12.5,
    lineHeight: 18,
    color: 'rgba(255,255,255,0.68)',
    marginTop: 2,
  },

  sectionLabel: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.muted,
    marginBottom: 8,
    marginLeft: 4,
  },
  group: { overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  rowIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.bgSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: { flex: 1, fontFamily: 'DMSans_500Medium', fontSize: 15, color: colors.ink },
  rowValue: { fontFamily: 'DMSans_400Regular', fontSize: 13.5, color: colors.muted },

  message: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
  },
});
