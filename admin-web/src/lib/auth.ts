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

export async function adminSignOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
}
