import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Appear, PressableScale } from '@/components/Motion';
import { afterSheetClose, Sheet } from '@/components/Sheet';
import { tabBarSpace } from '@/components/TabBar';
import { Avatar, Button, Card, TextButton, Txt } from '@/components/ui';
import { useApp } from '@/context/AppContext';
import { usePlaces } from '@/context/PlacesContext';
import { useSocialQuery } from '@/hooks/useSocialQuery';
import { PRIVACY_POLICY_URL, TERMS_OF_USE_URL } from '@/lib/legal';
import {
  getNotificationPermissionStatus,
  openNotificationSettings,
  requestNotificationAccess,
  type NotificationPermissionState,
} from '@/lib/pushNotifications';
import { isRevenueCatConfigured, presentCustomerCenter } from '@/lib/purchases';
import { linkedInUrl, normalizeInstagram } from '@/lib/social';
import type { SocialPreferences } from '@/lib/socialDiscovery';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';

// Never expose test controls in TestFlight/App Store builds.
const SHOW_DEVELOPER_OPTIONS = __DEV__;

function Row({
  label,
  value,
  valueTone = 'muted',
  count,
  onPress,
  last,
}: {
  label: string;
  value?: string;
  /** `accent` marks the value as the row's call to action. */
  valueTone?: 'muted' | 'accent';
  /** Small dark pill after the label, e.g. pending admin approvals. */
  count?: number;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.99}
      style={[styles.row, !last && styles.rowBorder]}
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, ${value}` : label}
    >
      <Text style={styles.rowLabel} numberOfLines={1}>{label}</Text>
      {value ? (
        <Text
          style={[styles.rowValue, valueTone === 'accent' && styles.rowValueAccent]}
          numberOfLines={1}
        >
          {value}
        </Text>
      ) : null}
      {count ? (
        <View style={styles.countPill}>
          <Text style={styles.countText}>{count > 99 ? '99+' : count}</Text>
        </View>
      ) : null}
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
    deleteAccount,
    resetDemo,
    restartOnboarding,
  } = useApp();
  const { pendingPlaces, activeCheckIn, simulateStillHereReminder } = usePlaces();

  const [devOpen, setDevOpen] = useState(false);
  const [legalOpen, setLegalOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState('');
  const [notificationPermission, setNotificationPermission] =
    useState<NotificationPermissionState>('undetermined');
  const liveBilling = isRevenueCatConfigured && revenueCatReady;
  // Only the summary on the row needs it, so a slow poll is plenty; the
  // settings screen loads its own fresh copy.
  const socialPrefs = useSocialQuery<SocialPreferences>('preferences', NO_PAYLOAD, !!user?.id, 60_000);

  useEffect(() => {
    void refreshSubscription();
  }, [refreshSubscription]);

  useFocusEffect(
    useCallback(() => {
      void getNotificationPermissionStatus().then(setNotificationPermission);
    }, []),
  );

  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(' ') || 'Profilini tamamla';
  const links = [
    normalizeInstagram(profile.instagram) ? 'Instagram' : '',
    linkedInUrl(profile.linkedin) ? 'LinkedIn' : '',
  ].filter(Boolean);

  const visibility = socialPrefs.data
    ? socialPrefs.data.map_visible
      ? 'Açık'
      : 'Kapalı'
    : undefined;

  const notificationValue =
    notificationPermission === 'granted'
      ? 'Açık'
      : notificationPermission === 'denied'
        ? 'Kapalı'
        : 'Ayarla';

  const openLegal = (url: string) => {
    setLegalOpen(false);
    afterSheetClose(() => void Linking.openURL(url).catch(() => undefined));
  };

  const manageMembership = async () => {
    setMessage('');
    const result = await presentCustomerCenter();
    if (!result.ok) {
      setMessage(result.message);
      return;
    }

    const active = await refreshSubscription();
    setMessage(active ? 'Üyelik bilgilerin güncellendi.' : 'Aktif üyelik bulunamadı.');
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.lg, paddingBottom: tabBarSpace(insets.bottom) + spacing.lg },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Appear style={styles.identity}>
          <Avatar uri={profile.avatarUrl} name={profile.firstName} size={64} />
          <View style={styles.identityText}>
            <Txt variant="h2" numberOfLines={2} accessibilityRole="header">{fullName}</Txt>
            {profile.profession ? (
              <Txt variant="body" numberOfLines={1} style={styles.profession}>
                {profile.profession}
              </Txt>
            ) : null}
          </View>
          <Button
            label="Düzenle"
            tone="outline"
            size="sm"
            full={false}
            onPress={() => router.push('/profile-edit')}
          />
        </Appear>

        <Appear delay={60}>
          <Card padded={false} style={styles.group}>
            <Row
              label="Üyelik"
              value={isSubscribed ? 'Pro · Aktif' : 'Pro ol'}
              valueTone={isSubscribed ? 'muted' : 'accent'}
              onPress={
                isSubscribed && liveBilling
                  ? () => void manageMembership()
                  : () => router.push('/paywall')
              }
            />
            <Row
              label="Görünürlük ve mesajlar"
              value={visibility}
              onPress={() => router.push('/social-settings')}
            />
            <Row
              label="Bildirimler"
              value={notificationValue}
              onPress={() => {
                setMessage('');
                if (notificationPermission === 'denied') {
                  void openNotificationSettings();
                  return;
                }
                void requestNotificationAccess(user?.id).then((result) => {
                  setNotificationPermission(result.status);
                  if (result.status !== 'granted') {
                    setMessage('Bildirim izni verilmedi. Daha sonra Ayarlar’dan açabilirsin.');
                  }
                });
              }}
            />
            <Row
              label="Bağlantılar"
              value={links.length ? links.join(', ') : 'Ekle'}
              valueTone={links.length ? 'muted' : 'accent'}
              onPress={() => router.push('/profile-edit')}
              last
            />
          </Card>
        </Appear>

        <Appear delay={110}>
          <Card padded={false} style={styles.group}>
            {isAdmin ? (
              <Row
                label="Admin paneli"
                count={pendingPlaces.length}
                onPress={() => router.push('/admin')}
              />
            ) : null}
            {SHOW_DEVELOPER_OPTIONS ? (
              <Row label="Geliştirici seçenekleri" onPress={() => setDevOpen(true)} />
            ) : null}
            <Row label="Gizlilik ve koşullar" onPress={() => setLegalOpen(true)} />
            <Row
              label={authRequired ? 'Çıkış yap' : 'Demoyu sıfırla'}
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

        {authRequired ? (
          <PressableScale
            onPress={() => {
              setMessage('');
              setDeleteOpen(true);
            }}
            scaleTo={0.96}
            hitSlop={8}
            style={styles.deleteLink}
            accessibilityRole="button"
          >
            <Text style={styles.deleteLinkText}>Hesabı sil</Text>
          </PressableScale>
        ) : null}

        {message ? <Text style={styles.message}>{message}</Text> : null}
      </ScrollView>

      <Sheet
        visible={legalOpen}
        onClose={() => setLegalOpen(false)}
        title="Gizlilik ve koşullar"
      >
        <View style={{ gap: 8 }}>
          <Button
            label="Gizlilik politikası"
            tone="outline"
            icon="shield-checkmark-outline"
            onPress={() => openLegal(PRIVACY_POLICY_URL)}
          />
          <Button
            label="Kullanım koşulları"
            tone="outline"
            icon="document-text-outline"
            onPress={() => openLegal(TERMS_OF_USE_URL)}
          />
          <TextButton label="Kapat" onPress={() => setLegalOpen(false)} />
        </View>
      </Sheet>

      <Sheet
        visible={SHOW_DEVELOPER_OPTIONS && devOpen}
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
              afterSheetClose(() =>
                void restartOnboarding().then(() => router.replace('/onboarding')),
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
              label="'Mekânda mısın?' bildirimini tetikle"
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

      <Sheet
        visible={deleteOpen}
        onClose={() => {
          if (!deleting) setDeleteOpen(false);
        }}
        dismissable={!deleting}
        title="Hesabını kalıcı olarak sil?"
        subtitle="Profilin, fotoğrafın, mesajların, check-in'lerin ve puanların silinir. Eklediğin ortak mekân kayıtları kişisel bilgilerinden arındırılır. Bu işlem geri alınamaz."
      >
        <View style={{ gap: 8 }}>
          {message ? <Text style={styles.deleteError}>{message}</Text> : null}
          <Button
            label="Hesabımı kalıcı olarak sil"
            tone="dark"
            icon="trash-outline"
            loading={deleting}
            style={{ backgroundColor: colors.danger }}
            onPress={() => {
              setDeleting(true);
              setMessage('');
              void deleteAccount()
                .then(() => {
                  setDeleteOpen(false);
                  afterSheetClose(() => router.replace('/auth/login'));
                })
                .catch((error) => {
                  setMessage(error instanceof Error ? error.message : 'Hesap silinemedi.');
                })
                .finally(() => setDeleting(false));
            }}
          />
          <TextButton
            label="Vazgeç"
            onPress={() => {
              if (!deleting) setDeleteOpen(false);
            }}
          />
        </View>
      </Sheet>
    </View>
  );
}

const NO_PAYLOAD = {};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg, gap: spacing.md + 2 },

  identity: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  identityText: { flex: 1, minWidth: 0, gap: 2 },
  profession: { fontSize: 14, lineHeight: 19, color: colors.muted },

  group: { overflow: 'hidden', paddingHorizontal: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 54,
    paddingVertical: 12,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.lineStrong,
  },
  rowLabel: { flex: 1, minWidth: 0, fontFamily: 'DMSans_700Bold', fontSize: 15, color: colors.ink },
  rowValue: { fontFamily: 'DMSans_400Regular', fontSize: 14, color: colors.muted, flexShrink: 1 },
  rowValueAccent: { fontFamily: 'DMSans_700Bold', color: colors.green },
  countPill: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 7,
    borderRadius: 11,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: { fontFamily: 'DMSans_700Bold', fontSize: 12, color: colors.white },

  deleteLink: { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 12 },
  deleteLinkText: { fontFamily: 'DMSans_700Bold', fontSize: 14, color: colors.danger },

  message: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
  },
  deleteError: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 13,
    lineHeight: 19,
    color: colors.danger,
    textAlign: 'center',
    marginBottom: 4,
  },
});
