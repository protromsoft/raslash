import { supabase } from '@/lib/supabase';

// Stable production scheme, not an Expo Go URL or a caller-supplied redirect.
export const EMAIL_AUTH_REDIRECT = 'raslash://auth/email-callback';
export const EMAIL_LINK_COOLDOWN_MS = 60_000;
export const EMAIL_LINK_INVALID = 'Bu bağlantı geçersiz, süresi dolmuş veya kullanılmış olabilir. Yeni bir bağlantı iste.';
export const EMAIL_LINK_DEVICE = 'Bağlantıyı istediğin telefonda aç. Başka bir cihazdan veya eski bir bağlantıdan giriş yapılamaz.';

type LinkResult = { ok: true; userId: string } | { ok: false; message: string };
type SendResult = { ok: true; retryAt: number } | { ok: false; message: string; retryAt?: number };

export function normalizeAuthEmail(email: string) { return email.trim().toLowerCase(); }
export function validAuthEmail(email: string) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizeAuthEmail(email));
}

export function emailLinkError(error: { code?: string; status?: number } | null | undefined) {
  if (error?.status === 429 || error?.code?.includes('rate_limit')) {
    return 'Çok sık denendi. Biraz bekleyip yeniden bağlantı iste.';
  }
  if (error?.code === 'flow_state_not_found' || error?.code === 'bad_code_verifier' || error?.code === 'pkce_code_verifier_not_found') {
    return EMAIL_LINK_DEVICE;
  }
  return EMAIL_LINK_INVALID;
}

/** Only consume codes on our exact email route; never accept bearer tokens. */
export function parseEmailAuthLink(raw: string): { code: string } | { message: string } {
  try {
    if (raw.length > 4096) return { message: EMAIL_LINK_INVALID };
    const url = new URL(raw);
    const route = url.hostname ? `${url.hostname}${url.pathname}` : url.pathname.replace(/^\//, '');
    if (url.protocol !== 'raslash:' || url.username || url.password || url.port || route !== 'auth/email-callback') {
      return { message: EMAIL_LINK_INVALID };
    }
    const params = url.searchParams;
    if (url.hash || params.has('error') || params.has('error_code') || params.has('access_token') || params.has('refresh_token') || params.has('token_hash')) {
      return { message: EMAIL_LINK_INVALID };
    }
    const type = params.get('type');
    if (params.getAll('type').length > 1 || (type && type !== 'signup' && type !== 'magiclink')) return { message: EMAIL_LINK_INVALID };
    const codes = params.getAll('code');
    if (codes.length !== 1 || !/^[A-Za-z0-9._~-]{8,2048}$/.test(codes[0])) return { message: EMAIL_LINK_INVALID };
    return { code: codes[0] };
  } catch {
    return { message: EMAIL_LINK_INVALID };
  }
}

let sendInFlight: Promise<SendResult> | null = null;
let retryAt = 0;
export function emailLinkRetryAt() { return retryAt; }

export function sendEmailSignInLink(email: string): Promise<SendResult> {
  if (!validAuthEmail(email)) return Promise.resolve({ ok: false, message: 'Geçerli bir e-posta gir.' });
  if (sendInFlight) return sendInFlight;
  if (Date.now() < retryAt) return Promise.resolve({ ok: false, message: 'Yeni bağlantı için biraz bekle.', retryAt });
  if (!supabase) return Promise.resolve({ ok: false, message: 'Giriş hizmetine şu an ulaşılamıyor.' });
  sendInFlight = (async (): Promise<SendResult> => {
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: normalizeAuthEmail(email),
        options: { emailRedirectTo: EMAIL_AUTH_REDIRECT, shouldCreateUser: false },
      });
      if (error) {
        if (error.status === 429 || error.code?.includes('rate_limit')) {
          retryAt = Date.now() + EMAIL_LINK_COOLDOWN_MS;
          return { ok: false, message: emailLinkError(error), retryAt };
        }
        // Do not expose account existence, SMTP details or raw auth errors.
        return { ok: false, message: 'Bağlantı gönderilemedi. Kayıtlı e-postanı ve bağlantını kontrol edip tekrar dene.' };
      }
      retryAt = Date.now() + EMAIL_LINK_COOLDOWN_MS;
      return { ok: true, retryAt };
    } catch {
      return { ok: false, message: 'Bağlantı gönderilemedi. İnternetini kontrol edip tekrar dene.' };
    }
  })().finally(() => { sendInFlight = null; });
  return sendInFlight;
}

// React Strict Mode and repeated warm links must not redeem a one-use code twice.
// Codes stay only in memory, briefly; never in logs, analytics or persisted UI.
const exchanges = new Map<string, { at: number; result: Promise<LinkResult> }>();
export function completeEmailSignIn(raw: string): Promise<LinkResult> {
  const parsed = parseEmailAuthLink(raw);
  if ('message' in parsed) return Promise.resolve({ ok: false, message: parsed.message });
  for (const [code, entry] of exchanges) {
    if (Date.now() - entry.at > 5 * 60_000) exchanges.delete(code);
  }
  const existing = exchanges.get(parsed.code);
  if (existing) return existing.result;
  if (!supabase) return Promise.resolve({ ok: false, message: 'Giriş hizmetine şu an ulaşılamıyor.' });
  const result = (async (): Promise<LinkResult> => {
    try {
      const { data, error } = await supabase.auth.exchangeCodeForSession(parsed.code);
      if (error) return { ok: false, message: emailLinkError(error) };
      if (!data.session?.user.id) return { ok: false, message: EMAIL_LINK_INVALID };
      return { ok: true, userId: data.session.user.id };
    } catch {
      return { ok: false, message: 'Giriş tamamlanamadı. Bağlantını kontrol edip yeni bir e-posta bağlantısı iste.' };
    }
  })();
  if (exchanges.size >= 8) exchanges.delete(exchanges.keys().next().value!);
  exchanges.set(parsed.code, { at: Date.now(), result });
  return result;
}
