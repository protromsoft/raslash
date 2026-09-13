import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PressableScale } from '@/components/Motion';
import { useApp } from '@/context/AppContext';
import { isCheckInCreditsEnabled } from '@/lib/checkIns';
import { PRIVACY_POLICY_URL, TERMS_OF_USE_URL } from '@/lib/legal';
import {
  loadOffers,
  isPaywallEnabled,
  isRevenueCatConfigured,
  purchaseOffer,
  restorePurchases,
  type OfferLoadResult,
  type OfferSummary,
} from '@/lib/purchases';
import { colors, shadows } from '@/theme/colors';

const HERO_ASPECT_RATIO = 1179 / 1092;

type OfferStatus = OfferLoadResult['status'] | 'no_supported_packages';

const offerMessages: Record<Exclude<OfferStatus, 'ready'>, string> = {
  disabled: 'Satın alma bu sürümde etkin değil. (RC-06)',
  key_missing: 'Mağaza bağlantısı bu sürümde eksik. (RC-07)',
  native_unavailable: 'Satın alma modülü bu sürümde kullanılamıyor. (RC-08)',
  not_ready: 'Mağaza bağlantısı kurulamadı. (RC-05)',
  no_current_offering: 'Şu anda etkin bir abonelik teklifi bulunamadı. (RC-01)',
  no_packages: 'Mağazadan satışa açık paket alınamadı. (RC-02)',
  no_supported_packages: 'Aylık veya yıllık paket bulunamadı. (RC-04)',
  request_failed: 'Mağaza paketleri şu an alınamadı. Tekrar deneyebilirsin. (RC-03)',
};

const perks = [
  {
    title: 'Sınırsız check-in.',
    body: 'Tüm mekanlara sınırsız check-in yapabilme hakkı.',
  },
  {
    title: 'Mekan sohbetlerine erişim.',
    body: 'Ücretsiz 15 mesajdan sonra sınırsız mesajlaşma hakkı.',
  },
  {
    title: 'İstanbul, Ankara ve İzmir’de keşfet!',
    body: 'Seçili lansman bölgelerinde sınırsız gezinme hakkı.',
  },
];

function billingSuffix(packageType: string) {
  if (packageType === 'ANNUAL') return '/yıl';
  if (packageType === 'MONTHLY') return '/ay';
  if (packageType === 'WEEKLY') return '/hafta';
  return '';
}

function displayedPrice(offer: OfferSummary) {
  return `${offer.priceString}${billingSuffix(offer.packageType)}`;
}

export default function PaywallScreen() {
  const { placeId } = useLocalSearchParams<{ placeId?: string }>();
  const { setSubscribed, refreshSubscription, revenueCatReady } = useApp();
  const { width, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [offers, setOffers] = useState<OfferSummary[]>([]);
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loadingOffer, setLoadingOffer] = useState(true);
  const [offerStatus, setOfferStatus] = useState<OfferStatus | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const liveBilling = isRevenueCatConfigured && revenueCatReady;

  useEffect(() => {
    let mounted = true;
    void (async () => {
      if (!liveBilling) {
        setOffers([]);
        setSelectedPackage(null);
        setOfferStatus(
          !isPaywallEnabled ? 'disabled' : !isRevenueCatConfigured ? 'key_missing' : 'not_ready',
        );
        setLoadingOffer(false);
        return;
      }
      setLoadingOffer(true);
      setOfferStatus(null);
      setOffers([]);
      setSelectedPackage(null);
      const result = await loadOffers();
      if (!mounted) return;
      const supported = result.offers
        .filter((offer) => offer.packageType === 'MONTHLY' || offer.packageType === 'ANNUAL')
        .sort((a, b) => {
          const order: Record<string, number> = { MONTHLY: 0, ANNUAL: 1 };
          return (order[a.packageType] ?? 2) - (order[b.packageType] ?? 2);
        });
      setOffers(supported);
      setSelectedPackage(supported[0]?.packageIdentifier ?? null);
      setOfferStatus(
        result.status === 'ready' && !supported.length ? 'no_supported_packages' : result.status,
      );
      setLoadingOffer(false);
    })();
    return () => {
      mounted = false;
    };
  }, [liveBilling, retryCount]);

  const continueAfterUnlock = useCallback(() => {
    if (placeId) {
      router.replace({ pathname: '/place/[id]', params: { id: placeId, intent: 'checkin' } });
      return;
    }
    router.back();
  }, [placeId]);

  const finishUnlock = async () => {
    if (liveBilling) await refreshSubscription();
    else await setSubscribed(true);
    continueAfterUnlock();
  };

  const onPurchase = async () => {
    if (busy) return;
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
        setError('Satın alma tamamlandı; üyelik doğrulanıyor. Birkaç saniye sonra tekrar dene.');
        return;
      }
      await finishUnlock();
    } finally {
      setBusy(false);
    }
  };

  const onRestore = async () => {
    if (busy || !liveBilling) return;
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
        setError('Üyelik bulundu; doğrulama sürüyor. Birkaç saniye sonra tekrar dene.');
        return;
      }
      await finishUnlock();
    } finally {
      setBusy(false);
    }
  };

  const selectedOffer = offers.find((item) => item.packageIdentifier === selectedPackage) ?? null;
  const annualDiscount = useMemo(() => {
    const monthly = offers.find((item) => item.packageType === 'MONTHLY');
    const annual = offers.find((item) => item.packageType === 'ANNUAL');
    if (!monthly || !annual || monthly.price <= 0) return null;
    const percent = Math.round((1 - annual.price / (monthly.price * 12)) * 100);
    return percent > 0 && percent < 100 ? `% -${percent} İndirim` : null;
  }, [offers]);

  const heroHeight = width / HERO_ASPECT_RATIO;
  const stackPlans = width < 390 || fontScale > 1.05;
  const purchaseDisabled =
    busy || (isCheckInCreditsEnabled && !liveBilling) || !selectedPackage;
  const storeName = Platform.OS === 'ios' ? 'App Store' : 'Google Play';
  const selectedPrice = selectedOffer ? displayedPrice(selectedOffer) : '';

  return (
    <View style={styles.page} onAccessibilityEscape={() => router.back()}>
      <StatusBar style="light" />
      <PressableScale
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Kapat"
        hitSlop={12}
        style={[styles.closeButton, { top: insets.top + 8 }]}
      >
        <Ionicons name="close" size={21} color={colors.ink} />
      </PressableScale>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={[styles.hero, { height: heroHeight }]}>
          <Image
            source={require('../assets/paywall/hero.png')}
            contentFit="cover"
            style={{ position: 'absolute', top: 0, width, height: heroHeight }}
            accessible
            accessibilityRole="image"
            accessibilityLabel="Çalış ve tanış"
          />
        </View>

        <Animated.View
          entering={FadeInDown.duration(420)}
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}
        >
          <View style={styles.wordmarkFrame}>
            <Image
              source={require('../assets/brand-logo.png')}
              contentFit="contain"
              tintColor={colors.ink}
              style={styles.wordmark}
              accessible
              accessibilityRole="image"
              accessibilityLabel="RASLASH"
            />
          </View>
          <Text style={styles.intro}>
            Her gün bir check-in ücretsiz. Raslash Pro ile sınırsız check-in yap ve bulunduğun
            mekândaki sohbete katıl.
          </Text>

          <View style={styles.divider} />

          <View style={styles.perks}>
            {perks.map((perk, index) => (
              <Animated.View
                key={perk.title}
                entering={FadeIn.delay(90 + index * 55).duration(350)}
                style={styles.perkRow}
              >
                <View
                  style={styles.checkCircle}
                  accessible={false}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                >
                  <Ionicons name="checkmark" size={13} color={colors.white} />
                </View>
                <View style={styles.perkCopy}>
                  <Text style={styles.perkTitle}>{perk.title}</Text>
                  <Text style={styles.perkBody}>{perk.body}</Text>
                </View>
              </Animated.View>
            ))}
          </View>

          <Text style={styles.sectionTitle}>Paket seç:</Text>

          {loadingOffer && liveBilling ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={colors.ink} />
              <Text style={styles.loadingText}>Paketler yükleniyor…</Text>
            </View>
          ) : offers.length > 0 ? (
            <View
              style={[styles.planGrid, stackPlans && styles.planGridStacked]}
              accessibilityRole="radiogroup"
              accessibilityLabel="Abonelik paketi seç"
            >
              {offers.map((item) => {
                const active = item.packageIdentifier === selectedPackage;
                const isAnnual = item.packageType === 'ANNUAL';
                const price = displayedPrice(item);
                return (
                  <PressableScale
                    key={item.packageIdentifier}
                    onPress={() => setSelectedPackage(item.packageIdentifier)}
                    disabled={busy}
                    accessibilityRole="radio"
                    accessibilityLabel={`${item.periodLabel} plan ${price}`}
                    accessibilityState={{ checked: active, disabled: busy }}
                    style={[styles.plan, active ? styles.planActive : styles.planInactive]}
                  >
                    <View style={styles.planCopy}>
                      <View style={styles.planHeader}>
                        <Text style={[styles.planName, active && styles.planTextActive]}>
                          {item.periodLabel} Plan
                        </Text>
                        {isAnnual && annualDiscount ? (
                          <Text style={styles.discountBadge}>{annualDiscount}</Text>
                        ) : null}
                      </View>
                      <Text
                        style={[styles.planPrice, active && styles.planTextActive]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                      >
                        {price}
                      </Text>
                    </View>
                    <View style={[styles.radio, active && styles.radioActive]}>
                      {active ? <Ionicons name="checkmark" size={17} color={colors.ink} /> : null}
                    </View>
                  </PressableScale>
                );
              })}
            </View>
          ) : (
            <View style={styles.loadingBox}>
              <Text
                style={styles.unavailable}
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
              >
                {offerStatus && offerStatus !== 'ready'
                  ? offerMessages[offerStatus]
                  : 'Paketler yüklenemedi.'}
              </Text>
              {liveBilling ? (
                <PressableScale
                  onPress={() => setRetryCount((count) => count + 1)}
                  accessibilityRole="button"
                  accessibilityLabel="Paketleri tekrar yükle"
                  style={styles.retryButton}
                >
                  <Text style={styles.retryText}>Tekrar dene</Text>
                </PressableScale>
              ) : null}
            </View>
          )}

          {error ? (
            <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}

          <PressableScale
            onPress={() => void onPurchase()}
            disabled={purchaseDisabled}
            accessibilityRole="button"
            accessibilityLabel={
              selectedOffer
                ? `Hemen Pro Ol, ${selectedOffer.periodLabel} plan ${selectedPrice}`
                : 'Hemen Pro Ol'
            }
            accessibilityState={{ disabled: purchaseDisabled, busy }}
            style={styles.cta}
          >
            {busy ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.ctaLabel}>Hemen Pro Ol</Text>
            )}
          </PressableScale>

          <View style={styles.legalRow}>
            <Text style={styles.legalDot} accessible={false}>
              •
            </Text>
            <PressableScale
              onPress={() => void onRestore()}
              disabled={!liveBilling || busy}
              accessibilityRole="button"
              accessibilityLabel="Satın alımları geri yükle"
              accessibilityState={{ disabled: !liveBilling || busy, busy }}
              style={styles.legalButton}
            >
              <Text style={[styles.legalText, !liveBilling && styles.legalTextDisabled]}>
                Alımları Geri Yükle
              </Text>
            </PressableScale>
            <Text style={styles.legalDot} accessible={false}>
              •
            </Text>
            <PressableScale
              onPress={() => void Linking.openURL(TERMS_OF_USE_URL)}
              accessibilityRole="link"
              accessibilityLabel="Kullanım şartları"
              style={styles.legalButton}
            >
              <Text style={styles.legalText}>Şartlar</Text>
            </PressableScale>
            <Text style={styles.legalText} accessible={false}>
              ve
            </Text>
            <PressableScale
              onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)}
              accessibilityRole="link"
              accessibilityLabel="Gizlilik politikası"
              style={styles.legalButton}
            >
              <Text style={styles.legalText}>Gizlilik</Text>
            </PressableScale>
          </View>

          {selectedOffer ? (
            <Text style={styles.finePrint}>
              RASLASH Pro {selectedOffer.periodLabel.toLocaleLowerCase('tr-TR')} aboneliği{' '}
              {selectedPrice}.{' '}
              {selectedOffer.trialLabel
                ? `${selectedOffer.trialLabel.replace(/!$/, '')}. Deneme süresi sona erdiğinde ${selectedPrice} ücretlendirilir. `
                : ''}
              Ödeme {storeName} hesabından alınır. Abonelik, mevcut dönem bitmeden en az 24 saat
              önce iptal edilmezse otomatik yenilenir.
            </Text>
          ) : null}
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.white },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  hero: { overflow: 'hidden', backgroundColor: '#3A78AA' },
  closeButton: {
    position: 'absolute',
    zIndex: 1,
    right: 14,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
    ...shadows.soft,
  },
  sheet: {
    flexGrow: 1,
    marginTop: -34,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  wordmarkFrame: { width: 100, height: 28, overflow: 'hidden', marginBottom: 3 },
  wordmark: { position: 'absolute', left: -23, top: -24, width: 136, height: 74 },
  intro: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 13.5,
    lineHeight: 18,
    color: '#3C3C3C',
  },
  divider: { height: 1, backgroundColor: '#D0CFCC', marginTop: 8, marginBottom: 9 },
  perks: { gap: 9 },
  perkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  checkCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.black,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  perkCopy: { flex: 1 },
  perkTitle: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 15,
    lineHeight: 19,
    color: colors.ink,
  },
  perkBody: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 12.5,
    lineHeight: 16,
    color: '#67645F',
  },
  sectionTitle: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 16,
    lineHeight: 21,
    color: colors.ink,
    marginTop: 11,
    marginBottom: 7,
  },
  loadingBox: { minHeight: 82, alignItems: 'center', justifyContent: 'center', gap: 7 },
  loadingText: { fontFamily: 'DMSans_500Medium', fontSize: 12.5, color: colors.muted },
  retryButton: { minHeight: 44, paddingHorizontal: 16, justifyContent: 'center' },
  retryText: { fontFamily: 'DMSans_700Bold', fontSize: 13, color: colors.ink },
  planGrid: { flexDirection: 'row', gap: 8 },
  planGridStacked: { flexDirection: 'column' },
  plan: {
    flex: 1,
    minWidth: 0,
    minHeight: 82,
    borderRadius: 13,
    borderWidth: 2,
    paddingHorizontal: 13,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  planActive: { backgroundColor: colors.black, borderColor: colors.black },
  planInactive: { backgroundColor: colors.white, borderColor: '#CECECE' },
  planCopy: { flex: 1, minWidth: 0, paddingRight: 6 },
  planHeader: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  planName: { fontFamily: 'DMSans_500Medium', fontSize: 12.5, color: colors.ink },
  planTextActive: { color: colors.white },
  discountBadge: {
    overflow: 'hidden',
    borderRadius: 6,
    backgroundColor: '#3A78AA',
    paddingHorizontal: 4,
    paddingVertical: 2,
    fontFamily: 'DMSans_700Bold',
    fontSize: 8.5,
    color: colors.white,
  },
  planPrice: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 16,
    lineHeight: 21,
    color: colors.ink,
    marginTop: 3,
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#CECECE',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  radioActive: { borderColor: colors.white, backgroundColor: colors.white },
  unavailable: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 13,
    lineHeight: 18,
    color: colors.danger,
    textAlign: 'center',
    paddingTop: 8,
  },
  error: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 12,
    lineHeight: 16,
    color: colors.danger,
    textAlign: 'center',
    marginTop: 7,
  },
  cta: {
    minHeight: 62,
    borderRadius: 31,
    backgroundColor: colors.black,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    marginTop: 12,
  },
  ctaLabel: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 22,
    letterSpacing: -0.4,
    color: colors.white,
  },
  legalRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 8,
  },
  legalButton: {
    minHeight: 44,
    paddingHorizontal: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legalText: { fontFamily: 'DMSans_500Medium', fontSize: 12, color: colors.ink },
  legalTextDisabled: { opacity: 0.5 },
  legalDot: { fontFamily: 'DMSans_700Bold', fontSize: 11, color: colors.ink },
  finePrint: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 11,
    lineHeight: 16,
    color: '#67645F',
    textAlign: 'center',
    marginTop: 2,
    paddingHorizontal: 6,
  },
});
