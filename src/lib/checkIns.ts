import type { ChatPerson } from '@/data/types';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(id: string) {
  return UUID_RE.test(id);
}

/**
 * Chat polls every 20s, so a missing column or table would otherwise print the
 * same warning forever. Each distinct failure is surfaced once per session.
 */
const warned = new Set<string>();

function warnOnce(scope: string, message: string) {
  const key = `${scope}:${message}`;
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[supabase] ${scope}: ${message}`);
}

export async function startRemoteCheckIn(placeId: string, userId: string) {
  if (!isSupabaseConfigured || !supabase || !isUuid(placeId)) return null;
  // Önceki aktif check-in'i kapat
  await supabase
    .from('check_ins')
    .update({ is_active: false, checked_out_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('is_active', true);

  const { data, error } = await supabase
    .from('check_ins')
    .insert({ place_id: placeId, user_id: userId, is_active: true })
    .select('id')
    .maybeSingle();
  if (error) {
    warnOnce('check-in', error.message);
    return null;
  }
  return data?.id as string | undefined;
}

export async function endRemoteCheckIn(placeId: string, userId: string) {
  if (!isSupabaseConfigured || !supabase || !isUuid(placeId)) return;
  const { error } = await supabase
    .from('check_ins')
    .update({ is_active: false, checked_out_at: new Date().toISOString() })
    .eq('place_id', placeId)
    .eq('user_id', userId)
    .eq('is_active', true);
  if (error) warnOnce('check-out', error.message);
}

/**
 * Production databases lag behind the migrations, so the profile join is tried
 * from richest to poorest: full profile → names only → bare user ids. Each step
 * down is logged once instead of failing the whole screen.
 */
const ACTIVE_PEOPLE_SELECTS = [
  'user_id, profiles(first_name, last_name, avatar_url)',
  'user_id, profiles(first_name, last_name)',
  'user_id',
];

export async function fetchActivePeople(placeId: string): Promise<ChatPerson[]> {
  if (!isSupabaseConfigured || !supabase || !isUuid(placeId)) return [];

  for (const select of ACTIVE_PEOPLE_SELECTS) {
    const { data, error } = await supabase
      .from('check_ins')
      .select(select)
      .eq('place_id', placeId)
      .eq('is_active', true);

    if (!error) {
      // A user with a stale open check-in row would otherwise appear twice in
      // the active list (and collide on React keys).
      const byUser = new Map<string, ChatPerson>();
      for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
        const profile = row.profiles as
          | { first_name?: string; last_name?: string; avatar_url?: string }
          | null;
        const id = String(row.user_id);
        if (!id || byUser.has(id)) continue;
        byUser.set(id, {
          id,
          firstName: profile?.first_name?.trim() || 'Misafir',
          lastName: profile?.last_name?.trim() || '',
          avatarUrl: profile?.avatar_url || '',
        });
      }
      return [...byUser.values()];
    }

    warnOnce(`active people (${select})`, error.message);
  }
  return [];
}

export type RemoteMessage = {
  id: string;
  author: string;
  text: string;
  createdAt: string;
  userId: string;
};

export async function fetchPlaceMessages(placeId: string): Promise<RemoteMessage[] | null> {
  if (!isSupabaseConfigured || !supabase || !isUuid(placeId)) return null;
  const { data, error } = await supabase
    .from('messages')
    .select('id, body, created_at, user_id, profiles(first_name)')
    .eq('place_id', placeId)
    .order('created_at', { ascending: true })
    .limit(80);
  if (error) {
    warnOnce('messages fetch', error.message);
    return null;
  }
  return (data ?? []).map((row: Record<string, unknown>) => {
    const profile = row.profiles as { first_name?: string } | null;
    return {
      id: String(row.id),
      author: profile?.first_name?.trim() || 'Misafir',
      text: String(row.body ?? ''),
      createdAt: String(row.created_at),
      userId: String(row.user_id),
    };
  });
}

export async function sendPlaceMessage(placeId: string, userId: string, body: string) {
  if (!isSupabaseConfigured || !supabase || !isUuid(placeId)) return null;
  const { data, error } = await supabase
    .from('messages')
    .insert({ place_id: placeId, user_id: userId, body })
    .select('id, created_at')
    .maybeSingle();
  if (error) {
    warnOnce('message send', error.message);
    return null;
  }
  return data as { id: string; created_at: string } | null;
}

/**
 * Live message feed for one place.
 *
 * Returns an unsubscribe function; callers must invoke it on unmount. The
 * channel topic is per place, and the local `cancelled` flag stops late events
 * from touching component state between `removeChannel` and the socket close.
 * Realtime payloads carry no joined profile, so `author` is left empty for the
 * caller to resolve from the active-people list.
 */
export function subscribeToPlaceMessages(
  placeId: string,
  onInsert: (message: RemoteMessage) => void,
): () => void {
  if (!isSupabaseConfigured || !supabase || !isUuid(placeId)) return () => undefined;

  const client = supabase;
  let cancelled = false;

  const channel = client
    .channel(`place-messages:${placeId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `place_id=eq.${placeId}` },
      (payload) => {
        if (cancelled) return;
        const row = payload.new as Record<string, unknown>;
        if (!row?.id) return;
        onInsert({
          id: String(row.id),
          author: '',
          text: String(row.body ?? ''),
          createdAt: String(row.created_at ?? new Date().toISOString()),
          userId: String(row.user_id ?? ''),
        });
      },
    )
    .subscribe((status, error) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        // Realtime may simply not be enabled for the table; the screen keeps
        // working off the initial fetch and optimistic sends.
        warnOnce('messages realtime', error?.message ?? status);
      }
    });

  return () => {
    cancelled = true;
    void client.removeChannel(channel);
  };
}
