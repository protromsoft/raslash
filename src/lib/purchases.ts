import { Platform } from 'react-native';

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
};

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

export async function getDefaultOffer(): Promise<OfferSummary | null> {
  if (!isRevenueCatConfigured) return null;
  try {
    const Purchases = await getPurchases();
    if (!Purchases || !configured) return null;
    const offerings = await Purchases.getOfferings();
    const current = offerings.current;
    const pkg = current?.availablePackages?.[0];
    if (!pkg) return null;
    return {
      productId: pkg.product.identifier,
      title: pkg.product.title || 'Raslash Membership',
      priceString: pkg.product.priceString,
      packageIdentifier: pkg.identifier,
    };
  } catch {
    return null;
  }
}

export async function purchaseDefaultPackage(): Promise<
  { ok: true } | { ok: false; message: string; cancelled?: boolean }
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
    const pkg = offerings.current?.availablePackages?.[0];
    if (!pkg) {
      return { ok: false, message: 'Aktif paket yok — RevenueCat Offering kontrol et' };
    }
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    const active = Boolean(customerInfo.entitlements.active[ENTITLEMENT_ID]);
    if (!active) {
      return { ok: false, message: `Entitlement "${ENTITLEMENT_ID}" aktif değil` };
    }
    return { ok: true };
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
  { ok: true; active: boolean } | { ok: false; message: string }
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
    return {
      ok: true,
      active: Boolean(info.entitlements.active[ENTITLEMENT_ID]),
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : 'Restore başarısız',
    };
  }
}
