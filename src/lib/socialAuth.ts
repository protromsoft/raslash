import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import type { User } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

WebBrowser.maybeCompleteAuthSession();

export type SocialAuthResult =
  | { ok: true; user: User }
  | { ok: false; cancelled?: boolean; message: string };

const unavailable = (): SocialAuthResult => ({
  ok: false,
  message: 'Supabase yapılandırılmamış',
});

function readableProviderError(provider: 'Apple' | 'Google', message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes('unsupported provider') || normalized.includes('provider is not enabled')) {
    return `${provider} girişi henüz Supabase panelinde etkin değil.`;
  }
  return `${provider} ile giriş tamamlanamadı. ${message}`;
}

function randomNonce(bytes: Uint8Array) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

export async function signInWithApple(): Promise<SocialAuthResult> {
  if (!isSupabaseConfigured || !supabase) return unavailable();

  try {
    const rawNonce = randomNonce(await Crypto.getRandomBytesAsync(32));
    const hashedNonce = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      rawNonce,
    );
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });

    if (!credential.identityToken) {
      return { ok: false, message: 'Apple kimlik doğrulama tokenı alınamadı.' };
    }

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
      nonce: rawNonce,
    });
    if (error) {
      return { ok: false, message: readableProviderError('Apple', error.message) };
    }
    if (!data.user) return { ok: false, message: 'Apple ile giriş tamamlanamadı.' };

    // Apple only sends the name on the first authorization, so preserve it
    // immediately while it is available. Onboarding remains the source of the
    // public profile fields.
    const givenName = credential.fullName?.givenName?.trim() ?? '';
    const familyName = credential.fullName?.familyName?.trim() ?? '';
    const fullName = [givenName, familyName].filter(Boolean).join(' ');
    if (fullName) {
      await supabase.auth.updateUser({
        data: {
          full_name: fullName,
          given_name: givenName || undefined,
          family_name: familyName || undefined,
        },
      });
    }

    return { ok: true, user: data.user };
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? String(error.code) : '';
    if (code === 'ERR_REQUEST_CANCELED') {
      return { ok: false, cancelled: true, message: '' };
    }
    const message = error instanceof Error ? error.message : 'Bilinmeyen hata';
    return { ok: false, message: readableProviderError('Apple', message) };
  }
}

function authParams(url: string) {
  const parsed = new URL(url);
  const query = new URLSearchParams(parsed.search);
  const fragment = new URLSearchParams(parsed.hash.replace(/^#/, ''));
  return {
    code: query.get('code'),
    accessToken: fragment.get('access_token') ?? query.get('access_token'),
    refreshToken: fragment.get('refresh_token') ?? query.get('refresh_token'),
    errorDescription:
      fragment.get('error_description') ?? query.get('error_description') ?? undefined,
  };
}

export async function signInWithGoogle(): Promise<SocialAuthResult> {
  if (!isSupabaseConfigured || !supabase) return unavailable();

  const redirectTo = Linking.createURL('auth/callback');
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      queryParams: { access_type: 'offline', prompt: 'consent' },
    },
  });
  if (error) return { ok: false, message: readableProviderError('Google', error.message) };
  if (!data.url) return { ok: false, message: 'Google giriş adresi oluşturulamadı.' };

  const browserResult = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (browserResult.type !== 'success') {
    return { ok: false, cancelled: true, message: '' };
  }

  const params = authParams(browserResult.url);
  if (params.errorDescription) {
    return { ok: false, message: readableProviderError('Google', params.errorDescription) };
  }

  if (params.code) {
    const { data: sessionData, error: exchangeError } =
      await supabase.auth.exchangeCodeForSession(params.code);
    if (exchangeError) {
      return { ok: false, message: readableProviderError('Google', exchangeError.message) };
    }
    if (sessionData.user) return { ok: true, user: sessionData.user };
  }

  if (!params.accessToken || !params.refreshToken) {
    return { ok: false, message: 'Google oturumu uygulamaya aktarılamadı.' };
  }
  const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
    access_token: params.accessToken,
    refresh_token: params.refreshToken,
  });
  if (sessionError) {
    return { ok: false, message: readableProviderError('Google', sessionError.message) };
  }
  if (!sessionData.user) return { ok: false, message: 'Google ile giriş tamamlanamadı.' };
  return { ok: true, user: sessionData.user };
}
