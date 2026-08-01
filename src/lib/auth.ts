import type { Session, User } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export type AuthResult = { ok: true; user: User } | { ok: false; message: string };

function mapAuthError(message: string) {
  const m = message.toLowerCase();
  if (m.includes('invalid login')) return 'E-posta veya şifre hatalı';
  if (m.includes('email not confirmed')) {
    return 'E-posta henüz onaylanmamış. Supabase Auth’ta confirm’i kapatabilir veya maili onayla.';
  }
  if (m.includes('user already registered')) return 'Bu e-posta zaten kayıtlı. Giriş yap.';
  if (m.includes('password')) return 'Şifre en az 6 karakter olmalı';
  return message;
}

export async function signUp(email: string, password: string): Promise<AuthResult> {
  if (!isSupabaseConfigured || !supabase) {
    return { ok: false, message: 'Supabase yapılandırılmamış' };
  }
  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error) return { ok: false, message: mapAuthError(error.message) };
  if (!data.user) return { ok: false, message: 'Kayıt tamamlanamadı' };
  return { ok: true, user: data.user };
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  if (!isSupabaseConfigured || !supabase) {
    return { ok: false, message: 'Supabase yapılandırılmamış' };
  }
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error) return { ok: false, message: mapAuthError(error.message) };
  if (!data.user) return { ok: false, message: 'Giriş başarısız' };
  return { ok: true, user: data.user };
}

export async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
}

export async function getSession(): Promise<Session | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}
