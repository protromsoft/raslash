import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { PhotoScreen } from '@/components/Screen';
import { IconButton, Button, TextButton } from '@/components/ui';
import { useApp } from '@/context/AppContext';
import {
  getDefaultOffer,
  isRevenueCatConfigured,
  purchaseDefaultPackage,
  restorePurchases,
  type OfferSummary,
} from '@/lib/purchases';
import { colors } from '@/theme/colors';
import { duration, easing, stagger } from '@/theme/motion';
import { radii, spacing } from '@/theme/spacing';

const perks = [
  { icon: 'log-in-outline' as const, label: 'Mekana check‑in yap' },
  { icon: 'chatbubbles-outline' as const, label: 'Oradaki insanlarla sohbete katıl' },
  { icon: 'star-outline' as const, label: 'Çıkışta puanla, listeyi sen şekillendir' },
  { icon: 'trophy-outline' as const, label: 'Müdavimler sıralamasında yerini al' },
];

export default function PaywallScreen() {
  const { placeId } = useLocalSearchParams<{ placeId?: string }>();
  const { setSubscribed, refreshSubscription, revenueCatReady } = useApp();
  const [offer, setOffer] = useState<OfferSummary | null>(null);
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
      const next = await getDefaultOffer();
      if (mounted) {
        setOffer(next);
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
        await finishUnlock();
        return;
      }
      const result = await purchaseDefaultPackage();
      if (!result.ok) {
        if (!result.cancelled) setError(result.message);
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
      await finishUnlock();
    } finally {
      setBusy(false);
    }
  };

  const ctaLabel = liveBilling
    ? offer
      ? `Üye ol · ${offer.priceString}`
      : 'Üye ol'
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
      <Animated.View entering={FadeInDown.duration(duration.slow).easing(easing.out)}>
        <Text style={styles.kicker}>RASLASH ÜYELİK</Text>
        <Text style={styles.title}>Çalıştığın yerde{'\n'}yeni insanlarla tanış</Text>
        <Text style={styles.body}>
          Mekan puanları herkese açık. Check‑in ve sohbet üyelere özel.
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

      {liveBilling && offer ? <Text style={styles.priceHint}>{offer.title}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Animated.View entering={FadeIn.delay(360).duration(duration.slow)} style={styles.footer}>
        {loadingOffer && liveBilling ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Button label={ctaLabel} tone="light" loading={busy} onPress={() => void onPurchase()} />
        )}
        {liveBilling ? (
          <TextButton label="Satın alımları geri yükle" onDark onPress={() => void onRestore()} />
        ) : null}
        <Text style={styles.fine}>
          {liveBilling
            ? 'App Store / Google Play üzerinden faturalanır · istediğin zaman iptal edebilirsin.'
            : 'Expo Go’da demo modu. Gerçek ödeme için RevenueCat anahtarı ve development build gerekir.'}
        </Text>
      </Animated.View>
    </PhotoScreen>
  );
}

const styles = StyleSheet.create({
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
  error: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 13.5,
    color: '#FFB4A2',
    textAlign: 'center',
  },
  footer: { gap: 4, paddingBottom: spacing.xs },
  fine: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 11.5,
    lineHeight: 16,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
  },
});
