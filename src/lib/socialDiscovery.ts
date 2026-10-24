import { supabase } from './supabase';

export type SocialPerson = {
  id: string; first_name: string; avatar_url?: string | null;
  bio?: string | null; profession?: string | null;
  place_id?: string; place_name?: string; city?: string;
  latitude?: number; longitude?: number; allow_dm_requests?: boolean;
  age?: number | null; languages?: string[] | null; interests?: string[] | null;
  /** Set by the server for viewers without Pro; details and photo are left out. */
  locked?: boolean;
};
/** Where the viewer stands with someone: friends, or a request either way. */
export type FriendStatus = 'none' | 'outgoing' | 'incoming' | 'friends';
export type SocialFriend = {
  id: string; first_name: string; avatar_url?: string | null;
  status: 'pending' | 'accepted'; direction: 'friends' | 'outgoing' | 'incoming';
};
export type SocialPreferences = { map_visible: boolean; allow_dm_requests: boolean };
export type DirectThread = {
  id: string; status: 'pending' | 'accepted'; requested_by: string;
  peer_id: string; first_name: string; avatar_url?: string;
  preview: string; unread: number; last_message_at: string;
};
export type DirectMessage = { id: string; sender_id: string; body: string; created_at: string };
export type DirectConversation = {
  thread_id: string; status: 'pending' | 'accepted'; requested_by: string;
  peer: SocialPerson; messages: DirectMessage[];
};

const errors: Record<string, string> = {
  authentication_required: 'Devam etmek için giriş yapmalısın.',
  profile_required: 'Önce profilini tamamla.',
  conversation_unavailable: 'Bu sohbet artık kullanılamıyor.',
  person_unavailable: 'Bu kişi artık görünür değil.',
  requests_closed: 'Bu kişi şu anda yeni mesaj isteği almıyor.',
  request_not_accepted: 'Karşı taraf isteğini kabul edene kadar yeni mesaj gönderemezsin.',
  request_rate_limit: '24 saatte en fazla 5 yeni kişiye mesaj isteği gönderebilirsin.',
  message_rate_limit: 'Çok hızlı mesaj gönderiyorsun. Bir dakika bekleyip tekrar dene.',
  message_limit_reached: '15 ücretsiz mesaj hakkın bitti. Sınırsız mesaj için Pro’ya geçebilirsin.',
  inappropriate_content: 'Lütfen mesajındaki uygunsuz ifadeleri değiştir.',
  invalid_message: 'Mesajın 1–500 karakter olmalı.',
  request_conflict: 'Mesaj doğrulanamadı. Ekranı kapatıp yeniden dene.',
  invalid_response: 'Bu isteğin durumu değişmiş. Sayfayı yenile.',
  not_friends: 'Doğrudan mesaj için arkadaş olmanız gerekiyor.',
  pro_required: 'Bu profili görmek için Raslash Pro gerekiyor.',
  friend_rate_limit: '24 saatte en fazla 20 arkadaşlık isteği gönderebilirsin.',
};
export const PRO_REQUIRED_TEXT = errors.pro_required;
export class SocialError extends Error {
  constructor(readonly code: string) { super(errors[code] ?? 'Bağlantı kurulamadı. Biraz sonra tekrar dene.'); }
}
/** No message text, profile data or raw database errors are logged. */
export async function socialAction<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  if (!supabase) throw new SocialError('unavailable');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  let result;
  try {
    result = await supabase.rpc('social_action', { p_action: action, p_payload: payload }).abortSignal(controller.signal);
  } catch { throw new SocialError('unavailable'); }
  finally { clearTimeout(timeout); }
  const { data, error } = result;
  if (error) {
    const code = Object.keys(errors).find((key) => error.message === key);
    if (error.code === 'PGRST202' || error.code === '42883') {
      throw new Error('Kişiler ve mesajlar henüz sunucuda etkinleştirilmedi. Mevcut mekân sohbetlerini kullanabilirsin.');
    }
    throw new SocialError(code ?? 'unavailable');
  }
  return data as T;
}
export function socialErrorText(error: unknown) {
  return error instanceof Error ? error.message : 'İşlem tamamlanamadı. Tekrar dene.';
}

/** "850 m uzakta" / "3.4 km uzakta" / "16 km uzakta". */
export function distanceLabel(km: number) {
  if (!Number.isFinite(km) || km < 0) return '';
  if (km < 1) return `${Math.max(50, Math.round((km * 1000) / 50) * 50)} m uzakta`;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km uzakta`;
}

/** Without Pro only the first few people cards open a profile. */
export const FREE_PROFILE_PREVIEWS = 2;
/** The server's `locked` flag wins; the index rule covers rows without it. */
export function isProfileLocked(index: number, proAccess: boolean, serverLocked?: boolean) {
  if (proAccess) return false;
  return serverLocked ?? index >= FREE_PROFILE_PREVIEWS;
}

export function pageOf<T>(rows: T[]) { return { items: rows.slice(0, 50), hasMore: rows.length > 50 }; }

/** A pin represents a venue, not a person's live location. Group colocated users. */
export function groupPeopleAtVenues(people: SocialPerson[]) {
  const venues = new Map<string, { id: string; latitude: number; longitude: number; people: SocialPerson[] }>();
  for (const person of people) {
    const { place_id, latitude, longitude } = person;
    if (!place_id || !Number.isFinite(latitude) || !Number.isFinite(longitude)
      || Math.abs(latitude!) > 90 || Math.abs(longitude!) > 180) continue;
    let venue = venues.get(place_id);
    if (!venue) {
      venue = { id: place_id, latitude: latitude!, longitude: longitude!, people: [] };
      venues.set(place_id, venue);
    }
    if (!venue.people.some((p) => p.id === person.id)) venue.people.push(person);
  }
  return [...venues.values()];
}
