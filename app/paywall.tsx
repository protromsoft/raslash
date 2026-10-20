import { Ionicons } from '@expo/vector-icons';
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
import { spacing } from '@/theme/spacing';
import { type } from '@/theme/typography';
import { goBackOrHome } from '@/lib/navigation';

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

// Keep these in step with the server: Pro lifts the daily check-in credit and
// the 15 free messages, in every supported city.
const perks = ['Sınırsız check-in', 'Sınırsız mesaj', 'İstanbul, Ankara ve İzmir’de tüm mekânlar'];

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
          const order: Record<string, number> = { ANNUAL: 0, MONTHLY: 1 };
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
    goBackOrHome();
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
    return percent > 0 && percent < 100 ? `%${percent} indirim` : null;
  }, [offers]);

  const purchaseDisabled =
    busy || (isCheckInCreditsEnabled && !liveBilling) || !selectedPackage;
  const storeName = Platform.OS === 'ios' ? 'App Store' : 'Google Play';
  const selectedPrice = selectedOffer ? displayedPrice(selectedOffer) : '';

  return (
    <View style={styles.page} onAccessibilityEscape={goBackOrHome}>
      <StatusBar style="dark" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 8 }]}
        showsVerticalScrollIndicator={false}
      >
        <PressableScale
          onPress={goBackOrHome}
          accessibilityRole="button"
          accessibilityLabel="Kapat"
          hitSlop={12}
          style={styles.closeButton}
        >
          <Ionicons name="close" size={20} color={colors.ink} />
        </PressableScale>

        <Animated.View entering={FadeInDown.duration(420)} style={styles.intro}>
          <Text style={styles.eyebrow}>RASLASH PRO</Text>
          <Text style={styles.title} accessibilityRole="header">
            Her gün, her mekânda sohbete katıl.
          </Text>
        </Animated.View>

        <View style={styles.perks}>
          {perks.map((perk, index) => (
            <Animated.View
              key={perk}
              entering={FadeIn.delay(90 + index * 55).duration(350)}
              style={styles.perkRow}
            >
              <Ionicons
                name="checkmark"
                size={20}
                color={colors.green}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              />
              <Text style={styles.perkText}>{perk}</Text>
            </Animated.View>
          ))}
        </View>

        {loadingOffer && liveBilling ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={colors.ink} />
            <Text style={styles.loadingText}>Paketler yükleniyor…</Text>
          </View>
        ) : offers.length > 0 ? (
          <View
            style={styles.plans}
            accessibilityRole="radiogroup"
            accessibilityLabel="Abonelik paketi seç"
          >
            {offers.map((item) => {
              const active = item.packageIdentifier === selectedPackage;
              const isAnnual = item.packageType === 'ANNUAL';
              const price = displayedPrice(item);
              const detail = isAnnual && annualDiscount ? `${price} · ${annualDiscount}` : price;
              return (
                <PressableScale
                  key={item.packageIdentifier}
                  onPress={() => setSelectedPackage(item.packageIdentifier)}
                  disabled={busy}
                  scaleTo={0.985}
                  accessibilityRole="radio"
                  accessibilityLabel={`${item.periodLabel} plan, ${detail}`}
                  accessibilityState={{ checked: active, disabled: busy }}
                  style={[styles.plan, active ? styles.planActive : styles.planInactive]}
                >
                  <View style={styles.planCopy}>
                    <Text style={styles.planName}>{item.periodLabel}</Text>
                    <Text style={styles.planPrice}>{detail}</Text>
                  </View>
                  <View style={[styles.radio, active && styles.radioActive]}>
                    {active ? <View style={styles.radioDot} /> : null}
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
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <PressableScale
          onPress={() => void onPurchase()}
          disabled={purchaseDisabled}
          accessibilityRole="button"
          accessibilityLabel={
            selectedOffer ? `Pro ol, ${selectedOffer.periodLabel} plan ${selectedPrice}` : 'Pro ol'
          }
          accessibilityState={{ disabled: purchaseDisabled, busy }}
          style={[styles.cta, purchaseDisabled && !busy && styles.ctaDisabled]}
        >
          {busy ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.ctaLabel}>Pro ol</Text>
          )}
        </PressableScale>

        <View style={styles.legalRow}>
          <PressableScale
            onPress={() => void onRestore()}
            disabled={!liveBilling || busy}
            accessibilityRole="button"
            accessibilityLabel="Satın alımları geri yükle"
            accessibilityState={{ disabled: !liveBilling || busy, busy }}
            style={styles.legalButton}
          >
            <Text style={[styles.legalText, !liveBilling && styles.legalTextDisabled]}>
              Geri yükle
            </Text>
          </PressableScale>
          <Text style={styles.legalDot} accessible={false}>
            ·
          </Text>
          <PressableScale
            onPress={() => void Linking.openURL(TERMS_OF_USE_URL)}
            accessibilityRole="link"
            accessibilityLabel="Kullanım şartları"
            style={styles.legalButton}
          >
            <Text style={styles.legalText}>Şartlar</Text>
          </PressableScale>
          <Text style={styles.legalDot} accessible={false}>
            ·
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
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: spacing.lg - 4, paddingBottom: spacing.md, gap: spacing.lg },
  closeButton: {
    alignSelf: 'flex-end',
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    ...shadows.soft,
  },
  intro: { gap: 8 },
  eyebrow: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 12,
    letterSpacing: 1.4,
    color: colors.green,
  },
  title: { ...type.h1 },
  perks: { gap: 12 },
  perkRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  perkText: {
    flex: 1,
    fontFamily: 'DMSans_500Medium',
    fontSize: 16,
    lineHeight: 22,
    color: colors.ink,
  },
  loadingBox: { minHeight: 82, alignItems: 'center', justifyContent: 'center', gap: 7 },
  loadingText: { fontFamily: 'DMSans_500Medium', fontSize: 13, color: colors.muted },
  retryButton: { minHeight: 44, paddingHorizontal: 16, justifyContent: 'center' },
  retryText: { fontFamily: 'DMSans_700Bold', fontSize: 13, color: colors.ink },
  plans: { gap: 10 },
  plan: {
    minHeight: 68,
    borderRadius: 18,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  planActive: { borderWidth: 2, borderColor: colors.ink },
  planInactive: { borderWidth: 1.4, borderColor: colors.lineStrong },
  planCopy: { flex: 1, minWidth: 0, gap: 2 },
  planName: { fontFamily: 'DMSans_700Bold', fontSize: 16, color: colors.ink },
  planPrice: { fontFamily: 'DMSans_400Regular', fontSize: 13, lineHeight: 18, color: colors.muted },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: 'rgba(17,17,16,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: { borderColor: colors.ink },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.ink },
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
    fontSize: 13,
    lineHeight: 18,
    color: colors.danger,
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: spacing.lg - 4,
    paddingTop: spacing.sm,
    backgroundColor: colors.bg,
    alignItems: 'center',
  },
  cta: {
    alignSelf: 'stretch',
    minHeight: 56,
    borderRadius: 28,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    ...shadows.soft,
  },
  ctaDisabled: { opacity: 0.45 },
  ctaLabel: { fontFamily: 'DMSans_700Bold', fontSize: 16, color: colors.white },
  legalRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 2,
  },
  legalButton: {
    minHeight: 44,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legalText: { fontFamily: 'DMSans_500Medium', fontSize: 13, color: colors.inkSoft },
  legalTextDisabled: { opacity: 0.5 },
  legalDot: { fontFamily: 'DMSans_700Bold', fontSize: 13, color: colors.muted },
  finePrint: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 11,
    lineHeight: 16,
    color: colors.muted,
    textAlign: 'center',
    paddingHorizontal: 6,
  },
});
