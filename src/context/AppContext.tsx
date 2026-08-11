import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session, User } from '@supabase/supabase-js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { deleteCurrentAccount } from '@/lib/account';
import { signOut as authSignOut } from '@/lib/auth';
import { resolveAvatarUrl } from '@/lib/avatar';
import { ensureProfileRow, fetchProfile, setOnboardingCompleted, upsertProfile } from '@/lib/profile';
import {
  configurePurchases,
  hasActiveEntitlement,
  isPaywallEnabled,
  isRevenueCatConfigured,
  syncPurchasesUser,
} from '@/lib/purchases';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export type Profile = {
  firstName: string;
  lastName: string;
  age: string;
  profession: string;
  gender: string;
  bio?: string;
  avatarUrl?: string;
  linkedin?: string;
  instagram?: string;
};

type AppState = {
  ready: boolean;
  /** A profile is being pulled for the current session; its flags aren't final yet. */
  syncing: boolean;
  session: Session | null;
  user: User | null;
  authRequired: boolean;
  revenueCatReady: boolean;
  onboardingComplete: boolean;
  isSubscribed: boolean;
  isAdmin: boolean;
  profile: Profile;
  completeOnboarding: (profile: Partial<Profile>) => Promise<void>;
  updateProfile: (profile: Partial<Profile>) => Promise<void>;
  setSubscribed: (value: boolean) => Promise<void>;
  refreshSubscription: () => Promise<boolean>;
  setAdmin: (value: boolean) => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  restartOnboarding: () => Promise<void>;
  resetDemo: () => Promise<void>;
};

const STORAGE_KEYS = {
  onboarding: 'raslash.onboardingComplete',
  profile: 'raslash.profile',
  subscribed: 'raslash.isSubscribed',
  admin: 'raslash.isAdmin',
  onboardingDraft: 'raslash.onboardingDraft',
} as const;

/** Half-finished onboarding answers, owned by the onboarding stack. */
export const ONBOARDING_DRAFT_KEY = STORAGE_KEYS.onboardingDraft;

const defaultProfile: Profile = {
  firstName: '',
  lastName: '',
  age: '',
  profession: '',
  gender: '',
  bio: '',
  avatarUrl: '',
  linkedin: '',
  instagram: '',
};

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(!isPaywallEnabled);
  const [isAdmin, setIsAdmin] = useState(false);
  const [profile, setProfile] = useState<Profile>(defaultProfile);
  const [revenueCatReady, setRevenueCatReady] = useState(false);

  const authRequired = isSupabaseConfigured;

  const applySubscription = useCallback(async (value: boolean) => {
    setIsSubscribed(value);
    await AsyncStorage.setItem(STORAGE_KEYS.subscribed, value ? '1' : '0');
  }, []);

  const refreshSubscription = useCallback(async () => {
    if (!isPaywallEnabled) {
      setIsSubscribed(true);
      return true;
    }
    if (!isRevenueCatConfigured || !revenueCatReady) {
      const cached = await AsyncStorage.getItem(STORAGE_KEYS.subscribed);
      const value = cached === '1';
      setIsSubscribed(value);
      return value;
    }
    const active = await hasActiveEntitlement();
    await applySubscription(active);
    return active;
  }, [applySubscription, revenueCatReady]);

  /** The profile already mirrored into state, so repeat events don't refetch it. */
  const syncedUserId = useRef<string | null>(null);

  const applyRemoteProfile = useCallback(async (userId: string) => {
    // `ensureProfileRow` already read (or created) the row; refetching here
    // would only add a round trip to the gate at `/` that waits on this.
    const remote = await ensureProfileRow(userId);
    if (!remote) return;
    const next: Profile = {
      firstName: remote.firstName,
      lastName: remote.lastName,
      age: remote.age,
      profession: remote.profession,
      gender: remote.gender,
      bio: remote.bio,
      avatarUrl: remote.avatarUrl,
      linkedin: remote.linkedin,
      instagram: remote.instagram,
    };
    setProfile(next);
    setIsAdmin(remote.isAdmin);
    setOnboardingComplete(remote.onboardingComplete);
    syncedUserId.current = userId;
    await AsyncStorage.multiSet([
      [STORAGE_KEYS.profile, JSON.stringify(next)],
      [STORAGE_KEYS.onboarding, remote.onboardingComplete ? '1' : '0'],
      [STORAGE_KEYS.admin, remote.isAdmin ? '1' : '0'],
    ]);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!session?.user?.id) return;
    await applyRemoteProfile(session.user.id);
  }, [applyRemoteProfile, session?.user?.id]);

  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | undefined;

    (async () => {
      const [onboarding, storedProfile, subscribed, admin] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.onboarding),
        AsyncStorage.getItem(STORAGE_KEYS.profile),
        AsyncStorage.getItem(STORAGE_KEYS.subscribed),
        AsyncStorage.getItem(STORAGE_KEYS.admin),
      ]);
      if (!mounted) return;

      setIsSubscribed(!isPaywallEnabled || subscribed === '1');
      if (storedProfile) {
        setProfile({ ...defaultProfile, ...JSON.parse(storedProfile) });
      }

      if (!isSupabaseConfigured || !supabase) {
        setOnboardingComplete(onboarding === '1');
        setIsAdmin(admin === '1');
        const ok = await configurePurchases();
        if (mounted) {
          setRevenueCatReady(ok);
          if (ok) {
            const active = await hasActiveEntitlement();
            await applySubscription(active);
          }
          setReady(true);
        }
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(data.session);
      const userId = data.session?.user?.id;
      const ok = await configurePurchases(userId);
      if (mounted) setRevenueCatReady(ok);

      if (userId) {
        try {
          await applyRemoteProfile(userId);
        } catch (e) {
          console.warn('Profile load failed', e);
          setOnboardingComplete(onboarding === '1');
        }
        if (ok) {
          const active = await hasActiveEntitlement();
          await applySubscription(active);
        }
      } else {
        setOnboardingComplete(false);
        setIsAdmin(false);
      }
      setReady(true);

      const { data: sub } = supabase.auth.onAuthStateChange(async (event, nextSession) => {
        const nextId = nextSession?.user?.id ?? null;
        // The initial session and periodic token refreshes carry the user we
        // already loaded above; refetching on those just burns a round trip.
        const needsProfile = nextId != null && nextId !== syncedUserId.current;

        // The gate at `/` waits on this pair, and it has to see them together:
        // a session without a profile can't tell a returning member from
        // someone who never onboarded, and guessing sends completed users
        // back through onboarding.
        setSession(nextSession);
        if (needsProfile) setSyncing(true);
        if (nextId != null && !needsProfile) return;

        try {
          await syncPurchasesUser(nextId);
          if (nextId) {
            try {
              await applyRemoteProfile(nextId);
            } catch (e) {
              console.warn('Profile refresh failed', e);
            }
            // Routing only needs the profile; entitlements can land later.
            setSyncing(false);
            if (isRevenueCatConfigured) {
              const active = await hasActiveEntitlement();
              await applySubscription(active);
            }
          } else if (event !== 'INITIAL_SESSION') {
            syncedUserId.current = null;
            setProfile(defaultProfile);
            setOnboardingComplete(false);
            setIsAdmin(false);
          }
        } finally {
          // Nothing may leave the gate at `/` waiting on a sync that died.
          if (needsProfile) setSyncing(false);
        }
      });
      unsubscribe = () => sub.subscription.unsubscribe();
    })();

    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, [applyRemoteProfile, applySubscription]);

  const completeOnboarding = useCallback(
    async (next: Partial<Profile>) => {
      const userId = session?.user?.id;
      let merged = { ...defaultProfile, ...profile, ...next };
      // Upload a local picker URI before we persist — otherwise avatar_url is a
      // file:// path that only works on this device.
      if (userId && isSupabaseConfigured && merged.avatarUrl) {
        try {
          const publicUrl = await resolveAvatarUrl(userId, merged.avatarUrl);
          merged = { ...merged, avatarUrl: publicUrl };
        } catch (e) {
          console.warn('avatar upload during onboarding', e);
          // Don't trap the user in onboarding over a photo failure — clear the
          // local URI so we never write a device path into profiles.
          merged = { ...merged, avatarUrl: '' };
        }
      }
      setProfile(merged);
      setOnboardingComplete(true);
      await AsyncStorage.multiSet([
        [STORAGE_KEYS.onboarding, '1'],
        [STORAGE_KEYS.profile, JSON.stringify(merged)],
      ]);
      if (userId && isSupabaseConfigured) {
        await upsertProfile(userId, merged, { onboardingCompleted: true });
        const remote = await fetchProfile(userId);
        if (remote) setIsAdmin(remote.isAdmin);
      }
    },
    [profile, session?.user?.id],
  );

  const updateProfile = useCallback(
    async (next: Partial<Profile>) => {
      const userId = session?.user?.id;
      let merged = { ...profile, ...next };
      if (userId && isSupabaseConfigured && merged.avatarUrl) {
        const publicUrl = await resolveAvatarUrl(userId, merged.avatarUrl);
        merged = { ...merged, avatarUrl: publicUrl };
      }
      setProfile(merged);
      await AsyncStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(merged));
      if (userId && isSupabaseConfigured) {
        await upsertProfile(userId, merged);
      }
    },
    [profile, session?.user?.id],
  );

  const restartOnboarding = useCallback(async () => {
    setOnboardingComplete(false);
    setProfile(defaultProfile);
    await AsyncStorage.multiSet([
      [STORAGE_KEYS.onboarding, '0'],
      [STORAGE_KEYS.profile, JSON.stringify(defaultProfile)],
    ]);
    // Someone starting over must not inherit the previous account's answers.
    await AsyncStorage.removeItem(STORAGE_KEYS.onboardingDraft);
    if (session?.user?.id && isSupabaseConfigured) {
      try {
        await upsertProfile(session.user.id, defaultProfile, { onboardingCompleted: false });
      } catch (e) {
        console.warn('restartOnboarding remote', e);
        try {
          await setOnboardingCompleted(session.user.id, false);
        } catch {
          // ignore
        }
      }
    }
  }, [session?.user?.id]);

  const setSubscribed = useCallback(
    async (value: boolean) => {
      if (!isPaywallEnabled) {
        await applySubscription(true);
        return;
      }
      if (isRevenueCatConfigured && revenueCatReady) {
        const active = await hasActiveEntitlement();
        await applySubscription(active);
        return;
      }
      await applySubscription(value);
    },
    [applySubscription, revenueCatReady],
  );

  const setAdmin = useCallback(async (value: boolean) => {
    if (isSupabaseConfigured) return;
    setIsAdmin(value);
    await AsyncStorage.setItem(STORAGE_KEYS.admin, value ? '1' : '0');
  }, []);

  const clearAccountState = useCallback(async () => {
    await syncPurchasesUser(null);
    syncedUserId.current = null;
    setSession(null);
    setProfile(defaultProfile);
    setOnboardingComplete(false);
    setIsAdmin(false);
    setIsSubscribed(!isPaywallEnabled);
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.onboarding,
      STORAGE_KEYS.profile,
      STORAGE_KEYS.subscribed,
      STORAGE_KEYS.admin,
      STORAGE_KEYS.onboardingDraft,
    ]);
  }, []);

  const signOut = useCallback(async () => {
    await authSignOut();
    await clearAccountState();
  }, [clearAccountState]);

  const deleteAccount = useCallback(async () => {
    await deleteCurrentAccount();
    await clearAccountState();
  }, [clearAccountState]);

  const resetDemo = useCallback(async () => {
    if (isSupabaseConfigured) {
      await signOut();
      return;
    }
    await AsyncStorage.multiRemove(Object.values(STORAGE_KEYS));
    setOnboardingComplete(false);
    setIsSubscribed(!isPaywallEnabled);
    setIsAdmin(false);
    setProfile(defaultProfile);
  }, [signOut]);

  const value = useMemo(
    () => ({
      ready,
      syncing,
      session,
      user: session?.user ?? null,
      authRequired,
      revenueCatReady,
      onboardingComplete,
      isSubscribed,
      isAdmin,
      profile,
      completeOnboarding,
      updateProfile,
      setSubscribed,
      refreshSubscription,
      setAdmin,
      signOut,
      deleteAccount,
      refreshProfile,
      restartOnboarding,
      resetDemo,
    }),
    [
      ready,
      syncing,
      session,
      authRequired,
      revenueCatReady,
      onboardingComplete,
      isSubscribed,
      isAdmin,
      profile,
      completeOnboarding,
      updateProfile,
      setSubscribed,
      refreshSubscription,
      setAdmin,
      signOut,
      deleteAccount,
      refreshProfile,
      restartOnboarding,
      resetDemo,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
