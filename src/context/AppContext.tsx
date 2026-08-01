import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session, User } from '@supabase/supabase-js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { signOut as authSignOut } from '@/lib/auth';
import { ensureProfileRow, fetchProfile, setOnboardingCompleted, upsertProfile } from '@/lib/profile';
import {
  configurePurchases,
  hasActiveEntitlement,
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
  refreshProfile: () => Promise<void>;
  restartOnboarding: () => Promise<void>;
  resetDemo: () => Promise<void>;
};

const STORAGE_KEYS = {
  onboarding: 'raslash.onboardingComplete',
  profile: 'raslash.profile',
  subscribed: 'raslash.isSubscribed',
  admin: 'raslash.isAdmin',
} as const;

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
  const [session, setSession] = useState<Session | null>(null);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [profile, setProfile] = useState<Profile>(defaultProfile);
  const [revenueCatReady, setRevenueCatReady] = useState(false);

  const authRequired = isSupabaseConfigured;

  const applySubscription = useCallback(async (value: boolean) => {
    setIsSubscribed(value);
    await AsyncStorage.setItem(STORAGE_KEYS.subscribed, value ? '1' : '0');
  }, []);

  const refreshSubscription = useCallback(async () => {
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

  const applyRemoteProfile = useCallback(async (userId: string) => {
    await ensureProfileRow(userId);
    const remote = await fetchProfile(userId);
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

      setIsSubscribed(subscribed === '1');
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

      const { data: sub } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
        setSession(nextSession);
        const nextId = nextSession?.user?.id ?? null;
        await syncPurchasesUser(nextId);
        if (nextId) {
          try {
            await applyRemoteProfile(nextId);
          } catch (e) {
            console.warn('Profile refresh failed', e);
          }
          if (isRevenueCatConfigured) {
            const active = await hasActiveEntitlement();
            await applySubscription(active);
          }
        } else {
          setProfile(defaultProfile);
          setOnboardingComplete(false);
          setIsAdmin(false);
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
      const merged = { ...defaultProfile, ...profile, ...next };
      setProfile(merged);
      setOnboardingComplete(true);
      await AsyncStorage.multiSet([
        [STORAGE_KEYS.onboarding, '1'],
        [STORAGE_KEYS.profile, JSON.stringify(merged)],
      ]);
      if (session?.user?.id && isSupabaseConfigured) {
        await upsertProfile(session.user.id, merged, { onboardingCompleted: true });
        const remote = await fetchProfile(session.user.id);
        if (remote) setIsAdmin(remote.isAdmin);
      }
    },
    [profile, session?.user?.id],
  );

  const updateProfile = useCallback(
    async (next: Partial<Profile>) => {
      const merged = { ...profile, ...next };
      setProfile(merged);
      await AsyncStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(merged));
      if (session?.user?.id && isSupabaseConfigured) {
        await upsertProfile(session.user.id, merged);
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

  const signOut = useCallback(async () => {
    await authSignOut();
    await syncPurchasesUser(null);
    setSession(null);
    setProfile(defaultProfile);
    setOnboardingComplete(false);
    setIsAdmin(false);
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.onboarding,
      STORAGE_KEYS.profile,
      STORAGE_KEYS.admin,
    ]);
  }, []);

  const resetDemo = useCallback(async () => {
    if (isSupabaseConfigured) {
      await signOut();
      return;
    }
    await AsyncStorage.multiRemove(Object.values(STORAGE_KEYS));
    setOnboardingComplete(false);
    setIsSubscribed(false);
    setIsAdmin(false);
    setProfile(defaultProfile);
  }, [signOut]);

  const value = useMemo(
    () => ({
      ready,
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
      refreshProfile,
      restartOnboarding,
      resetDemo,
    }),
    [
      ready,
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
