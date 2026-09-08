import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { PressableScale } from '@/components/Motion';
import { PhotoScreen } from '@/components/Screen';
import { IconButton, Button, TextButton } from '@/components/ui';
import { useApp } from '@/context/AppContext';
import {
  getOffers,
  isRevenueCatConfigured,
  purchaseOffer,
  restorePurchases,
  type OfferSummary,
} from '@/lib/purchases';
import { PRIVACY_POLICY_URL, TERMS_OF_USE_URL } from '@/lib/legal';
import { isCheckInCreditsEnabled } from '@/lib/checkIns';
import { colors } from '@/theme/colors';
import { duration, easing, stagger } from '@/theme/motion';
import { radii, spacing } from '@/theme/spacing';

const perks = [
  { icon: 'ticket-outline' as const, label: 'Her gün 1 check‑in ücretsiz' },
  { icon: 'infinite-outline' as const, label: 'Pro ile sınırsız check‑in ve sohbet' },
  { icon: 'location-outline' as const, label: 'İstanbul, Ankara ve İzmir’de keşfet' },
  { icon: 'trophy-outline' as const, label: 'Müdavimler sıralamasında yerini al' },
];

export default function PaywallScreen() {
  const { placeId } = useLocalSearchParams<{ placeId?: string }>();
  const { setSubscribed, refreshSubscription, revenueCatReady } = useApp();
  const [offers, setOffers] = useState<OfferSummary[]>([]);
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loadingOffer, setLoadingOffer] = useState(true);
  const liveBilling = isRevenueCatConfigured && revenueCatReady;

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!liveBilling) {
        setLoadingOffer(false);
        return;
      }
      const next = await getOffers();
      if (mounted) {
        setOffers(next);
        setSelectedPackage(next[0]?.packageIdentifier ?? null);
        setLoadingOffer(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [liveBilling]);

  const finishUnlock = async () => {
    if (liveBilling) await refreshSubscription();
    else await setSubscribed(true);
    if (placeId) {
      // Location confirmation happens on the place screen right after unlocking.
      router.replace({ pathname: '/place/[id]', params: { id: placeId, intent: 'checkin' } });
      return;
    }
    router.back();
  };

  const onPurchase = async () => {
    setBusy(true);
    setError('');
    try {
      if (!liveBilling) {
        if (isCheckInCreditsEnabled) {
          setError('Satın alma şu anda kullanılamıyor. Lütfen daha sonra tekrar dene.');
          return;
        }
        await finishUnlock();
        return;
      }
      if (!selectedPackage) {
        setError('Satın alınabilir paket bulunamadı. Lütfen daha sonra tekrar dene.');
        return;
      }
      const result = await purchaseOffer(selectedPackage);
      if (!result.ok) {
        if (!result.cancelled) setError(result.message);
        return;
      }
      if (!result.serverSynced) {
        setError('Satın alma tamamlandı; üyelik doğrulanıyor. Birkaç saniye sonra geri yüklemeyi dene.');
        return;
      }
      await finishUnlock();
    } finally {
      setBusy(false);
    }
  };

  const onRestore = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await restorePurchases();
      if (!result.ok) {
        setError(result.message);
        return;
      }
      if (!result.active) {
        setError('Geri yüklenecek üyelik bulunamadı.');
        return;
      }
      if (!result.serverSynced) {
        setError('Üyelik bulundu; sunucu doğrulaması henüz tamamlanmadı. Birkaç saniye sonra tekrar dene.');
        return;
      }
      await finishUnlock();
    } finally {
      setBusy(false);
    }
  };

  const selectedOffer = offers.find((item) => item.packageIdentifier === selectedPackage) ?? null;
  const ctaLabel = liveBilling
    ? selectedOffer
      ? `Pro’ya geç · ${selectedOffer.priceString}`
      : 'Pro’ya geç'
    : isCheckInCreditsEnabled
      ? 'Satın alma kullanılamıyor'
      : 'Demo üyeliği aç';

  return (
    <PhotoScreen
      sheet
      source={require('../assets/photos/meet.jpg')}
      header={
        <View style={styles.header}>
          <IconButton icon="close" tone="blur" onPress={() => router.back()} />
        </View>
      }
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.duration(duration.slow).easing(easing.out)}>
          <Text style={styles.kicker}>RASLASH PRO</Text>
          <Text style={styles.title}>Daha çok check‑in,{'\n'}daha çok bağlantı</Text>
          <Text style={styles.body}>
            Günlük ücretsiz hakkın bittiğinde Pro ile sınırsız devam et.
          </Text>
        </Animated.View>

        <View style={styles.perks}>
          {perks.map((perk, i) => (
            <Animated.View
              key={perk.label}
              entering={FadeInDown.delay(120 + stagger(i, 60)).duration(duration.slow)}
              style={styles.perkRow}
            >
              <View style={styles.perkIcon}>
                <Ionicons name={perk.icon} size={15} color={colors.white} />
              </View>
              <Text style={styles.perkLabel}>{perk.label}</Text>
            </Animated.View>
          ))}
        </View>

        {liveBilling && offers.length > 0 ? (
          <View style={styles.plans}>
            {offers.map((item) => {
              const active = item.packageIdentifier === selectedPackage;
              return (
                <PressableScale
                  key={item.packageIdentifier}
                  onPress={() => setSelectedPackage(item.packageIdentifier)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: active }}
                  style={[styles.plan, active && styles.planActive]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.planPeriod}>{item.periodLabel}</Text>
                    <Text style={styles.planTitle} numberOfLines={1}>{item.title}</Text>
                  </View>
                  <Text style={styles.planPrice}>{item.priceString}</Text>
                  <Ionicons
                    name={active ? 'radio-button-on' : 'radio-button-off'}
                    size={20}
                    color={colors.white}
                  />
                </PressableScale>
              );
            })}
          </View>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Animated.View entering={FadeIn.delay(360).duration(duration.slow)} style={styles.footer}>
          {loadingOffer && liveBilling ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Button
              label={ctaLabel}
              tone="light"
              loading={busy}
              disabled={isCheckInCreditsEnabled && !liveBilling}
              onPress={() => void onPurchase()}
            />
          )}
          {liveBilling ? (
            <TextButton label="Satın alımları geri yükle" onDark onPress={() => void onRestore()} />
          ) : null}
          <View style={styles.legalRow}>
            <TextButton
              label="Kullanım Koşulları"
              onDark
              onPress={() => void Linking.openURL(TERMS_OF_USE_URL)}
            />
            <Text style={styles.legalDot}>·</Text>
            <TextButton
              label="Gizlilik Politikası"
              onDark
              onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)}
            />
          </View>
          <Text style={styles.fine}>
            {liveBilling
              ? `${selectedOffer?.periodLabel ?? 'Abonelik'} planı ${selectedOffer?.priceString ?? ''}. Ödeme Apple/Google hesabından alınır; iptal edilmedikçe otomatik yenilenir.`
              : isCheckInCreditsEnabled
                ? 'Üyelik ürünleri yüklenemedi. İnternet bağlantını kontrol edip tekrar dene.'
                : 'Expo Go’da demo modu. Gerçek ödeme için RevenueCat anahtarı ve development build gerekir.'}
          </Text>
        </Animated.View>
      </ScrollView>
    </PhotoScreen>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'flex-end', gap: spacing.md },
  header: { flex: 1, alignItems: 'flex-end' },
  kicker: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 11,
    letterSpacing: 1.6,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 8,
  },
  title: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 32,
    lineHeight: 37,
    letterSpacing: -1,
    color: colors.white,
  },
  body: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 15,
    lineHeight: 22,
    color: 'rgba(255,255,255,0.72)',
    marginTop: 10,
  },
  perks: { gap: 10 },
  perkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.16)',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  perkIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  perkLabel: {
    flex: 1,
    fontFamily: 'DMSans_500Medium',
    fontSize: 14.5,
    color: colors.white,
  },
  priceHint: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
  },
  plans: { gap: 8 },
  plan: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  planActive: {
    borderColor: 'rgba(255,255,255,0.82)',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  planPeriod: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 14,
    color: colors.white,
  },
  planTitle: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 11.5,
    color: 'rgba(255,255,255,0.58)',
    marginTop: 1,
  },
  planPrice: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 14,
    color: colors.white,
  },
  error: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 13.5,
    color: '#FFB4A2',
    textAlign: 'center',
  },
  footer: { gap: 4, paddingBottom: spacing.xs },
  legalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  legalDot: {
    color: 'rgba(255,255,255,0.46)',
  },
  fine: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 11.5,
    lineHeight: 16,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
  },
});
