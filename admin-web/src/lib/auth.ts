import { isSupabaseConfigured, supabase } from './supabase';

export type AdminAuthState = {
  ready: boolean;
  email: string | null;
  isAdmin: boolean;
};

export async function getAdminAuthState(): Promise<AdminAuthState> {
  if (!isSupabaseConfigured || !supabase) {
    return { ready: true, email: null, isAdmin: false };
  }
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user) return { ready: true, email: null, isAdmin: false };
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle();
  if (error) throw error;
  return {
    ready: true,
    email: user.email ?? null,
    isAdmin: Boolean(profile?.is_admin),
  };
}

export async function adminSignIn(email: string, password: string) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase yapılandırılmamış');
  }
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error) throw error;
  const user = data.user;
  if (!user) throw new Error('Giriş başarısız');

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError) {
    await supabase.auth.signOut();
    throw profileError;
  }
  if (!profile?.is_admin) {
    await supabase.auth.signOut();
    throw new Error('Bu hesap için yönetici yetkisi tanımlı değil.');
  }
  return user.email ?? email;
}

/** Emails a reset link that brings the admin back to this panel to pick a new password. */
export async function sendAdminPasswordReset(email: string) {
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase yapılandırılmamış');
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: window.location.origin,
  });
  if (error) throw error;
}

/** True when the page was opened from a password reset email. */
export function isPasswordRecoveryUrl() {
  return /type=recovery/.test(window.location.hash) || /type=recovery/.test(window.location.search);
}

/** Calls back once Supabase has turned a reset link into a recovery session. */
export function onPasswordRecovery(callback: () => void) {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') callback();
  });
  return () => data.subscription.unsubscribe();
}

export async function setAdminPassword(password: string) {
  if (!supabase) throw new Error('Supabase yapılandırılmamış');
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
  // Drop the recovery tokens from the address bar.
  window.history.replaceState(null, '', window.location.pathname);
}

export async function adminSignOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
}
