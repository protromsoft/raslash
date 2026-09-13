import { Platform } from 'react-native';
import type { CustomerInfo } from 'react-native-purchases';
import { supabase } from '@/lib/supabase';

const apiKey = Platform.select({
  ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
  android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
  default: undefined,
});

/** Billing is opt-in so a store build cannot accidentally expose a demo paywall. */
export const isPaywallEnabled = process.env.EXPO_PUBLIC_ENABLE_PAYWALL === 'true';

/** Must match RevenueCat dashboard entitlement identifier */
export const ENTITLEMENT_ID = process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID || 'pro';

export const isRevenueCatConfigured = isPaywallEnabled && Boolean(apiKey && apiKey.length > 8);

let configured = false;

export type OfferSummary = {
  productId: string;
  title: string;
  price: number;
  priceString: string;
  pricePerMonthString: string | null;
  pricePerWeekString: string | null;
  packageIdentifier: string;
  packageType: string;
  periodLabel: string;
  trialLabel: string | null;
};

export type OfferLoadResult =
  | { status: 'ready'; offers: OfferSummary[] }
  | {
      status:
        | 'disabled'
        | 'key_missing'
        | 'native_unavailable'
        | 'not_ready'
        | 'no_current_offering'
        | 'no_packages'
        | 'request_failed';
      offers: [];
    };

function trialLabel(
  introPrice: {
    price: number;
    periodNumberOfUnits: number;
    periodUnit: string;
  } | null,
) {
  if (!introPrice || introPrice.price !== 0) return null;
  const unit = introPrice.periodUnit.toUpperCase();
  const label =
    unit === 'DAY'
      ? 'Gün'
      : unit === 'WEEK'
        ? 'Hafta'
        : unit === 'MONTH'
          ? 'Ay'
          : unit === 'YEAR'
            ? 'Yıl'
            : null;
  return label ? `${introPrice.periodNumberOfUnits} ${label} Ücretsiz Dene!` : null;
}

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

export async function listenForEntitlementChanges(
  onChange: (active: boolean) => void,
): Promise<(() => void) | undefined> {
  if (!isRevenueCatConfigured || !configured) return undefined;
  const Purchases = await getPurchases();
  if (!Purchases) return undefined;
  const listener = (info: CustomerInfo) => {
    onChange(Boolean(info.entitlements.active[ENTITLEMENT_ID]));
  };
  Purchases.addCustomerInfoUpdateListener(listener);
  return () => {
    Purchases.removeCustomerInfoUpdateListener(listener);
  };
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

export async function loadOffers(): Promise<OfferLoadResult> {
  if (!isPaywallEnabled) return { status: 'disabled', offers: [] };
  if (!apiKey || apiKey.length <= 8) return { status: 'key_missing', offers: [] };
  const Purchases = await getPurchases();
  if (!Purchases) return { status: 'native_unavailable', offers: [] };
  if (!configured) return { status: 'not_ready', offers: [] };
  try {
    const offerings = await Purchases.getOfferings();
    if (!offerings.current) return { status: 'no_current_offering', offers: [] };
    const packages = offerings.current.availablePackages;
    if (!packages.length) return { status: 'no_packages', offers: [] };
    return {
      status: 'ready',
      offers: packages.map((pkg) => ({
        productId: pkg.product.identifier,
        title: pkg.product.title || 'RASLASH Pro',
        price: pkg.product.price,
        priceString: pkg.product.priceString,
        pricePerMonthString: pkg.product.pricePerMonthString,
        pricePerWeekString: pkg.product.pricePerWeekString,
        packageIdentifier: pkg.identifier,
        // A custom RevenueCat package can still contain a monthly/yearly store product.
        packageType:
          pkg.packageType === 'CUSTOM' || pkg.packageType === 'UNKNOWN'
            ? pkg.product.subscriptionPeriod === 'P1M'
              ? 'MONTHLY'
              : pkg.product.subscriptionPeriod === 'P1Y'
                ? 'ANNUAL'
                : pkg.packageType
            : pkg.packageType,
        periodLabel: periodLabel(pkg.product.subscriptionPeriod),
        trialLabel: trialLabel(pkg.product.introPrice),
      })),
    };
  } catch {
    // Never surface an SDK error verbatim: it may contain account identifiers.
    return { status: 'request_failed', offers: [] };
  }
}

export async function syncServerEntitlement() {
  if (!supabase) return false;
  const { data, error } = await supabase.functions.invoke('revenuecat-refresh');
  // RevenueCat validates both real store purchases and sandbox transactions
  // used by TestFlight/App Review. The database records the environment, but
  // either one is a trusted entitlement signal because clients cannot write it.
  return !error && data?.active === true;
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

export type DashboardPaywallResult =
  | { status: 'purchased' | 'restored'; serverSynced: boolean }
  | { status: 'cancelled' | 'not_presented' }
  | { status: 'error'; message: string };

/**
 * Opens the paywall attached to RevenueCat's current Offering. Its content is
 * downloaded by the native SDK, so dashboard edits do not require a new app
 * build after this integration has shipped.
 */
export async function presentDashboardPaywall(): Promise<DashboardPaywallResult> {
  if (!isRevenueCatConfigured || !configured) {
    return { status: 'error', message: 'RevenueCat paywall bu sürümde kullanılamıyor.' };
  }

  try {
    const mod = await import('react-native-purchases-ui');
    const result = await mod.default.presentPaywall({ displayCloseButton: true });

    if (result === mod.PAYWALL_RESULT.PURCHASED) {
      return { status: 'purchased', serverSynced: await syncServerEntitlement() };
    }
    if (result === mod.PAYWALL_RESULT.RESTORED) {
      return { status: 'restored', serverSynced: await syncServerEntitlement() };
    }
    if (result === mod.PAYWALL_RESULT.CANCELLED) {
      return { status: 'cancelled' };
    }
    if (result === mod.PAYWALL_RESULT.NOT_PRESENTED) {
      return { status: 'not_presented' };
    }
    return { status: 'error', message: 'RevenueCat paywall açılamadı.' };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'RevenueCat paywall açılamadı.',
    };
  }
}

export async function presentCustomerCenter(): Promise<
  { ok: true } | { ok: false; message: string }
> {
  if (!isRevenueCatConfigured) {
    return { ok: false, message: 'Üyelik yönetimi henüz etkin değil.' };
  }
  if (!configured) {
    return { ok: false, message: 'Üyelik yönetimi bu sürümde kullanılamıyor.' };
  }

  try {
    const mod = await import('react-native-purchases-ui');
    await mod.default.presentCustomerCenter();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : 'Üyelik yönetimi açılırken bir sorun oluştu.',
    };
  }
}
