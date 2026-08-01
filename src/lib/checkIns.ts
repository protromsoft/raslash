import type { ChatPerson } from '@/data/types';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(id: string) {
  return UUID_RE.test(id);
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
    console.warn('check-in remote', error.message);
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
  if (error) console.warn('check-out remote', error.message);
}

export async function fetchActivePeople(placeId: string): Promise<ChatPerson[]> {
  if (!isSupabaseConfigured || !supabase || !isUuid(placeId)) return [];
  let { data, error } = await supabase
    .from('check_ins')
    .select('user_id, profiles(first_name, last_name, avatar_url)')
    .eq('place_id', placeId)
    .eq('is_active', true);

  if (error?.message.includes('avatar_url')) {
    // avatar_url kolonu yoksa (migration eksik) sadece isimlerle devam et
    const fallback = await supabase
      .from('check_ins')
      .select('user_id, profiles(first_name, last_name)')
      .eq('place_id', placeId)
      .eq('is_active', true);
    data = fallback.data as typeof data;
    error = fallback.error;
  }

  if (error) {
    console.warn('active people', error.message);
    return [];
  }
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => {
    const profile = row.profiles as
      | { first_name?: string; last_name?: string; avatar_url?: string }
      | null;
    return {
      id: String(row.user_id),
      firstName: profile?.first_name?.trim() || 'Misafir',
      lastName: profile?.last_name?.trim() || '',
      avatarUrl: profile?.avatar_url || '',
    };
  });
}

export async function fetchPlaceMessages(placeId: string) {
  if (!isSupabaseConfigured || !supabase || !isUuid(placeId)) return null;
  const { data, error } = await supabase
    .from('messages')
    .select('id, body, created_at, user_id, profiles(first_name)')
    .eq('place_id', placeId)
    .order('created_at', { ascending: true })
    .limit(80);
  if (error) {
    console.warn('messages fetch', error.message);
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
    console.warn('message send', error.message);
    return null;
  }
  return data as { id: string; created_at: string } | null;
}
