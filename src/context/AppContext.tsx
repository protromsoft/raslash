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
import { unregisterPushToken } from '@/lib/pushNotifications';
import { resolveAvatarUrl } from '@/lib/avatar';
import { ensureProfileRow, fetchProfile, setOnboardingCompleted, upsertProfile } from '@/lib/profile';
import {
  configurePurchases,
  hasActiveEntitlement,
  isPaywallEnabled,
  isRevenueCatConfigured,
  listenForEntitlementChanges,
  syncServerEntitlement,
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

function parseStoredProfile(raw: string | null): Profile | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const row = parsed as Record<string, unknown>;
    const text = (key: keyof Profile) => (typeof row[key] === 'string' ? row[key] : '');
    return {
      firstName: text('firstName'),
      lastName: text('lastName'),
      age: text('age'),
      profession: text('profession'),
      gender: text('gender'),
      bio: text('bio'),
      avatarUrl: text('avatarUrl'),
      linkedin: text('linkedin'),
      instagram: text('instagram'),
    };
  } catch {
    return null;
  }
}

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
  const subscriptionRef = useRef(isSubscribed);
  subscriptionRef.current = isSubscribed;

  const authRequired = isSupabaseConfigured;

  const applySubscription = useCallback(async (value: boolean) => {
    setIsSubscribed(value);
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.subscribed, value ? '1' : '0');
    } catch (error) {
      console.warn('Subscription cache could not be written', error);
    }
  }, []);

  const refreshSubscription = useCallback(async () => {
    if (!isPaywallEnabled) {
      setIsSubscribed(true);
      return true;
    }
    if (!isRevenueCatConfigured || !revenueCatReady) {
      try {
        const cached = await AsyncStorage.getItem(STORAGE_KEYS.subscribed);
        const value = cached === '1';
        setIsSubscribed(value);
        return value;
      } catch (error) {
        console.warn('Subscription cache could not be read', error);
        return subscriptionRef.current;
      }
    }
    try {
      const active = await hasActiveEntitlement();
      await syncServerEntitlement();
      await applySubscription(active);
      return active;
    } catch (error) {
      // Membership refresh runs on profile focus. A store/network outage must
      // not become an unhandled promise rejection that takes down navigation.
      console.warn('Subscription refresh failed', error);
      return subscriptionRef.current;
    }
  }, [applySubscription, revenueCatReady]);

  /** The profile already mirrored into state, so repeat events don't refetch it. */
  const syncedUserId = useRef<string | null>(null);

  const applyRemoteProfile = useCallback(async (userId: string): Promise<boolean> => {
    // `ensureProfileRow` already read (or created) the row; refetching here
    // would only add a round trip to the gate at `/` that waits on this.
    const remote = await ensureProfileRow(userId);
    if (!remote) return false;
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
    try {
      await AsyncStorage.multiSet([
        [STORAGE_KEYS.profile, JSON.stringify(next)],
        [STORAGE_KEYS.onboarding, remote.onboardingComplete ? '1' : '0'],
        [STORAGE_KEYS.admin, remote.isAdmin ? '1' : '0'],
      ]);
    } catch (error) {
      // Supabase is authoritative. A full/temporarily unavailable device cache
      // must not make a successfully loaded profile look incomplete.
      console.warn('Profile cache could not be written', error);
    }
    return true;
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!session?.user?.id) return;
    await applyRemoteProfile(session.user.id);
  }, [applyRemoteProfile, session?.user?.id]);

  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | undefined;
    let unsubscribePurchases: (() => void) | undefined;
    let authRevision = 0;

    void (async () => {
      let onboarding: string | null = null;
      let storedProfile: string | null = null;
      let subscribed: string | null = null;
      let admin: string | null = null;
      try {
        [onboarding, storedProfile, subscribed, admin] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.onboarding),
          AsyncStorage.getItem(STORAGE_KEYS.profile),
          AsyncStorage.getItem(STORAGE_KEYS.subscribed),
          AsyncStorage.getItem(STORAGE_KEYS.admin),
        ]);
      } catch (error) {
        console.warn('App cache could not be read', error);
      }
      if (!mounted) return;

      setIsSubscribed(!isPaywallEnabled || subscribed === '1');
      const cachedProfile = parseStoredProfile(storedProfile);
      if (cachedProfile) setProfile(cachedProfile);

      if (!isSupabaseConfigured || !supabase) {
        setOnboardingComplete(onboarding === '1');
        setIsAdmin(admin === '1');
        let ok = false;
        try {
          ok = await configurePurchases();
        } catch (error) {
          console.warn('RevenueCat configuration failed', error);
        }
        if (mounted) {
          setRevenueCatReady(ok);
          if (ok) {
            try {
              const active = await hasActiveEntitlement();
              await syncServerEntitlement();
              await applySubscription(active);
            } catch (error) {
              console.warn('Subscription refresh failed', error);
            }
          }
          setReady(true);
        }
        return;
      }

      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) console.warn('Session restore failed', sessionError);
      if (!mounted) return;
      setSession(data.session);
      const userId = data.session?.user?.id;
      let ok = false;
      try {
        ok = await configurePurchases(userId);
      } catch (error) {
        console.warn('RevenueCat configuration failed', error);
      }
      if (mounted) setRevenueCatReady(ok);
      if (ok) {
        try {
          unsubscribePurchases = await listenForEntitlementChanges((active) => {
            if (!mounted) return;
            void applySubscription(active);
            void syncServerEntitlement();
          });
        } catch (error) {
          console.warn('RevenueCat listener failed', error);
        }
      }

      if (userId) {
        try {
          await applyRemoteProfile(userId);
        } catch (e) {
          console.warn('Profile load failed', e);
          setOnboardingComplete(onboarding === '1');
        }
        if (ok) {
          try {
            const active = await hasActiveEntitlement();
            await syncServerEntitlement();
            await applySubscription(active);
          } catch (error) {
            console.warn('Subscription refresh failed', error);
          }
        }
      } else {
        setOnboardingComplete(false);
        setIsAdmin(false);
      }
      setReady(true);

      const { data: sub } = supabase.auth.onAuthStateChange((event, nextSession) => {
        const nextId = nextSession?.user?.id ?? null;
        // The initial session and periodic token refreshes carry the user we
        // already loaded above; refetching on those just burns a round trip.
        const needsProfile = nextId != null && nextId !== syncedUserId.current;

        // The gate at `/` waits on this pair, and it has to see them together:
        // a session without a profile can't tell a returning member from
        // someone who never onboarded, and guessing sends completed users
        // back through onboarding.
        setSession(nextSession);
        if (needsProfile) {
          setSyncing(true);
          setProfile(defaultProfile);
          setOnboardingComplete(false);
          setIsAdmin(false);
        }
        if (nextId != null && !needsProfile) return;

        const revision = ++authRevision;
        // Supabase documents a gotrue-js deadlock when another async Supabase
        // call is awaited inside this callback. Leave the callback synchronously
        // and do profile/database work on the next task instead.
        setTimeout(() => {
          if (!mounted || revision !== authRevision) return;
          void (async () => {
            try {
              await syncPurchasesUser(nextId);
            } catch (error) {
              console.warn('Purchases user sync failed', error);
            }

            if (nextId) {
              let profileLoaded = false;
              try {
                profileLoaded = await applyRemoteProfile(nextId);
              } catch (e) {
                console.warn('Profile refresh failed', e);
              }
              if (!mounted || revision !== authRevision) return;
              // Routing only needs the profile; entitlements can land later.
              setSyncing(false);
              if (profileLoaded && isRevenueCatConfigured) {
                try {
                  const active = await hasActiveEntitlement();
                  await syncServerEntitlement();
                  await applySubscription(active);
                } catch (error) {
                  console.warn('Subscription refresh failed', error);
                }
              }
            } else if (event !== 'INITIAL_SESSION') {
              syncedUserId.current = null;
              setProfile(defaultProfile);
              setOnboardingComplete(false);
              setIsAdmin(false);
            }
          })()
            .catch((error) => console.warn('Auth state sync failed', error))
            .finally(() => {
              if (mounted && revision === authRevision && needsProfile) setSyncing(false);
            });
        }, 0);
      });
      unsubscribe = () => sub.subscription.unsubscribe();
    })().catch((error) => {
      console.warn('App bootstrap failed', error);
      if (mounted) {
        setSyncing(false);
        setReady(true);
      }
    });

    return () => {
      mounted = false;
      unsubscribe?.();
      unsubscribePurchases?.();
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
      if (userId && isSupabaseConfigured) {
        await upsertProfile(userId, merged, { onboardingCompleted: true });
        const remote = await fetchProfile(userId);
        if (!remote?.onboardingComplete) {
          throw new Error('Onboarding durumu sunucuda doğrulanamadı.');
        }
        setIsAdmin(remote.isAdmin);
      }
      // Route state is only committed after the remote flag is durable. A crash
      // can no longer leave local and Supabase onboarding state disagreeing.
      setProfile(merged);
      setOnboardingComplete(true);
      try {
        await AsyncStorage.multiSet([
          [STORAGE_KEYS.onboarding, '1'],
          [STORAGE_KEYS.profile, JSON.stringify(merged)],
        ]);
      } catch (error) {
        // The remote onboarding flag was verified above and will restore this
        // state on the next launch even if local storage is temporarily full.
        console.warn('Onboarding cache could not be written', error);
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
    try {
      await AsyncStorage.multiSet([
        [STORAGE_KEYS.onboarding, '0'],
        [STORAGE_KEYS.profile, JSON.stringify(defaultProfile)],
      ]);
      // Someone starting over must not inherit the previous account's answers.
      await AsyncStorage.removeItem(STORAGE_KEYS.onboardingDraft);
    } catch (error) {
      // State already moved to onboarding; cache cleanup can be retried on the
      // next launch without stranding the current navigation action.
      console.warn('Onboarding cache reset failed', error);
    }
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
    try {
      await syncPurchasesUser(null);
    } catch (error) {
      console.warn('Purchases logout sync failed', error);
    }
    syncedUserId.current = null;
    setSession(null);
    setProfile(defaultProfile);
    setOnboardingComplete(false);
    setIsAdmin(false);
    setIsSubscribed(!isPaywallEnabled);
    try {
      await AsyncStorage.multiRemove([
        STORAGE_KEYS.onboarding,
        STORAGE_KEYS.profile,
        STORAGE_KEYS.subscribed,
        STORAGE_KEYS.admin,
        STORAGE_KEYS.onboardingDraft,
      ]);
    } catch (error) {
      console.warn('Account cache could not be cleared', error);
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await unregisterPushToken(session?.user?.id);
    } catch (error) {
      console.warn('Push token logout failed', error);
    }
    try {
      await authSignOut();
    } catch (error) {
      // Signing out is first and foremost a local privacy boundary. A temporary
      // network failure must not leave the previous account visible on screen;
      // the auth client will retry/expire its remote session independently.
      console.warn('Auth sign out failed', error);
    } finally {
      await clearAccountState();
    }
  }, [clearAccountState, session?.user?.id]);

  const deleteAccount = useCallback(async () => {
    await deleteCurrentAccount();
    try {
      await unregisterPushToken();
    } catch (error) {
      console.warn('Push token cleanup failed', error);
    }
    await clearAccountState();
  }, [clearAccountState]);

  const resetDemo = useCallback(async () => {
    if (isSupabaseConfigured) {
      await signOut();
      return;
    }
    await AsyncStorage.multiRemove(
      Object.keys(STORAGE_KEYS).map((key) => STORAGE_KEYS[key as keyof typeof STORAGE_KEYS]),
    );
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
