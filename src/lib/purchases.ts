import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

const apiKey =
  Platform.OS === 'ios'
    ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY
    : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;

/** Billing is opt-in so a store build cannot accidentally expose a demo paywall. */
export const isPaywallEnabled = process.env.EXPO_PUBLIC_ENABLE_PAYWALL === 'true';

/** Must match RevenueCat dashboard entitlement identifier */
export const ENTITLEMENT_ID = process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID || 'pro';

export const isRevenueCatConfigured = isPaywallEnabled && Boolean(apiKey && apiKey.length > 8);

let configured = false;

export type OfferSummary = {
  productId: string;
  title: string;
  priceString: string;
  packageIdentifier: string;
  periodLabel: string;
};

function periodLabel(period: string | null) {
  switch (period) {
    case 'P1W':
      return 'Haftalık';
    case 'P1M':
      return 'Aylık';
    case 'P2M':
      return '2 aylık';
    case 'P3M':
      return '3 aylık';
    case 'P6M':
      return '6 aylık';
    case 'P1Y':
      return 'Yıllık';
    default:
      return 'Abonelik';
  }
}

async function getPurchases() {
  try {
    const mod = await import('react-native-purchases');
    return mod.default;
  } catch {
    return null;
  }
}

export async function configurePurchases(appUserId?: string) {
  if (!isRevenueCatConfigured || configured) {
    if (configured && appUserId) {
      try {
        const Purchases = await getPurchases();
        await Purchases?.logIn(appUserId);
      } catch {
        // ignore
      }
    }
    return configured;
  }
  const Purchases = await getPurchases();
  if (!Purchases) return false;
  try {
    Purchases.configure({ apiKey: apiKey!, appUserID: appUserId });
    configured = true;
    return true;
  } catch {
    // Expo Go / missing native module
    return false;
  }
}

export async function syncPurchasesUser(appUserId: string | null) {
  if (!isRevenueCatConfigured || !configured) return;
  const Purchases = await getPurchases();
  if (!Purchases) return;
  try {
    if (appUserId) await Purchases.logIn(appUserId);
    else await Purchases.logOut();
  } catch {
    // ignore
  }
}

export async function hasActiveEntitlement(entitlementId = ENTITLEMENT_ID) {
  if (!isRevenueCatConfigured) return false;
  try {
    const Purchases = await getPurchases();
    if (!Purchases) return false;
    if (!configured) return false;
    const info = await Purchases.getCustomerInfo();
    return Boolean(info.entitlements.active[entitlementId]);
  } catch {
    return false;
  }
}

export async function getOffers(): Promise<OfferSummary[]> {
  if (!isRevenueCatConfigured) return [];
  try {
    const Purchases = await getPurchases();
    if (!Purchases || !configured) return [];
    const offerings = await Purchases.getOfferings();
    return (offerings.current?.availablePackages ?? []).map((pkg) => ({
      productId: pkg.product.identifier,
      title: pkg.product.title || 'RASLASH Pro',
      priceString: pkg.product.priceString,
      packageIdentifier: pkg.identifier,
      periodLabel: periodLabel(pkg.product.subscriptionPeriod),
    }));
  } catch {
    return [];
  }
}

export async function syncServerEntitlement() {
  if (!supabase) return false;
  const { data, error } = await supabase.functions.invoke('revenuecat-refresh');
  return !error && data?.active === true && data?.environment === 'production';
}

export async function purchaseOffer(packageIdentifier: string): Promise<
  { ok: true; serverSynced: boolean } | { ok: false; message: string; cancelled?: boolean }
> {
  if (!isRevenueCatConfigured) {
    return { ok: false, message: 'RevenueCat key yok' };
  }
  try {
    const Purchases = await getPurchases();
    if (!Purchases || !configured) {
      return {
        ok: false,
        message: 'Satın alma bu ortamda çalışmıyor (Expo Go / native build gerekir)',
      };
    }
    const offerings = await Purchases.getOfferings();
    const pkg = offerings.current?.availablePackages?.find(
      (candidate) => candidate.identifier === packageIdentifier,
    );
    if (!pkg) {
      return { ok: false, message: 'Seçilen paket bulunamadı — RevenueCat Offering kontrol et' };
    }
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    const active = Boolean(customerInfo.entitlements.active[ENTITLEMENT_ID]);
    if (!active) {
      return { ok: false, message: `Entitlement "${ENTITLEMENT_ID}" aktif değil` };
    }
    return { ok: true, serverSynced: await syncServerEntitlement() };
  } catch (e: unknown) {
    const err = e as { userCancelled?: boolean; message?: string };
    if (err?.userCancelled) {
      return { ok: false, message: 'İptal edildi', cancelled: true };
    }
    return {
      ok: false,
      message: err?.message || 'Satın alma başarısız',
    };
  }
}

export async function restorePurchases(): Promise<
  { ok: true; active: boolean; serverSynced: boolean } | { ok: false; message: string }
> {
  if (!isRevenueCatConfigured) {
    return { ok: false, message: 'RevenueCat key yok' };
  }
  try {
    const Purchases = await getPurchases();
    if (!Purchases || !configured) {
      return { ok: false, message: 'Restore bu ortamda çalışmıyor' };
    }
    const info = await Purchases.restorePurchases();
    const active = Boolean(info.entitlements.active[ENTITLEMENT_ID]);
    return {
      ok: true,
      active,
      serverSynced: active ? await syncServerEntitlement() : false,
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : 'Restore başarısız',
    };
  }
}
