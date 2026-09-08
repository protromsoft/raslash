import type { ChatPerson } from '@/data/types';
import * as Crypto from 'expo-crypto';
import { syncServerEntitlement } from '@/lib/purchases';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(id: string) {
  return UUID_RE.test(id);
}

export const isCheckInCreditsEnabled =
  process.env.EXPO_PUBLIC_ENABLE_CHECKIN_CREDITS === 'true';

export type CheckInAccessResult = {
  status: 'allowed' | 'paywall_required' | 'error';
  checkInId?: string;
  freeRemaining: number;
  decision?: string;
  message?: string;
};

export type CheckInAccessStatus = {
  freeRemaining: number;
  hasUnlimited: boolean;
  accessTier: 'free' | 'pro' | 'app_review';
  resetsAt: string;
};

export async function fetchCheckInAccessStatus(): Promise<CheckInAccessStatus | null> {
  if (!isCheckInCreditsEnabled || !isSupabaseConfigured || !supabase) return null;
  const { data, error } = await supabase.rpc('get_check_in_access');
  if (error) {
    warnOnce('check-in access status', error.message);
    return null;
  }
  const row = (data?.[0] ?? null) as
    | {
        free_remaining?: number;
        has_unlimited?: boolean;
        access_tier?: string;
        resets_at?: string;
      }
    | null;
  if (!row) return null;
  const tier = row.access_tier;
  return {
    freeRemaining: Number(row.free_remaining ?? 0),
    hasUnlimited: Boolean(row.has_unlimited),
    accessTier: tier === 'pro' || tier === 'app_review' ? tier : 'free',
    resetsAt: String(row.resets_at ?? ''),
  };
}

/**
 * Chat polls every 20s, so a missing column or table would otherwise print the
 * same warning forever. Each distinct failure is surfaced once per session.
 */
const warned = new Set<string>();

type PublicProfile = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
};

function warnOnce(scope: string, message: string) {
  const key = `${scope}:${message}`;
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[supabase] ${scope}: ${message}`);
}

async function fetchPublicProfiles(userIds: string[]) {
  if (!supabase || userIds.length === 0) return new Map<string, PublicProfile>();
  const uniqueIds = [...new Set(userIds)];
  const { data, error } = await supabase.rpc('get_public_profiles', {
    profile_ids: uniqueIds,
  });
  if (error) {
    warnOnce('public profiles', error.message);
    return new Map<string, PublicProfile>();
  }
  return new Map(
    ((data ?? []) as PublicProfile[]).map((profile) => [profile.id, profile]),
  );
}

export async function startRemoteCheckIn(
  placeId: string,
  userId: string,
): Promise<CheckInAccessResult> {
  if (!isUuid(placeId)) {
    return { status: 'error', freeRemaining: 0, message: 'Check-in servisine ulaşılamadı.' };
  }

  // Local/demo mode remains usable while the paid quota feature is off.
  if (!isSupabaseConfigured || !supabase) {
    return isCheckInCreditsEnabled
      ? { status: 'error', freeRemaining: 0, message: 'Check-in servisine ulaşılamadı.' }
      : { status: 'allowed', freeRemaining: 1, decision: 'local' };
  }

  if (isCheckInCreditsEnabled) {
    const idempotencyKey = Crypto.randomUUID();
    let response = await supabase.rpc('attempt_check_in', {
      target_place_id: placeId,
      idempotency_key: idempotencyKey,
    });
    if (response.error) {
      warnOnce('check-in access', response.error.message);
      return { status: 'error', freeRemaining: 0, message: 'Check-in başlatılamadı.' };
    }
    let row = (response.data?.[0] ?? null) as
      | { check_in_id?: string | null; decision?: string; free_remaining?: number }
      | null;

    // RevenueCat webhooks are eventually consistent. A paid member who hits a
    // stale server cache gets one authenticated refresh and an idempotent retry.
    if (row?.decision === 'paywall_required' && (await syncServerEntitlement())) {
      response = await supabase.rpc('attempt_check_in', {
        target_place_id: placeId,
        idempotency_key: idempotencyKey,
      });
      if (response.error) {
        warnOnce('check-in access retry', response.error.message);
        return { status: 'error', freeRemaining: 0, message: 'Check-in başlatılamadı.' };
      }
      row = (response.data?.[0] ?? null) as
        | { check_in_id?: string | null; decision?: string; free_remaining?: number }
        | null;
    }
    if (row?.decision === 'paywall_required') {
      return { status: 'paywall_required', freeRemaining: 0, decision: row.decision };
    }
    if (!row?.check_in_id) {
      return { status: 'error', freeRemaining: 0, message: 'Check-in doğrulanamadı.' };
    }
    return {
      status: 'allowed',
      checkInId: row.check_in_id,
      freeRemaining: Number(row.free_remaining ?? 0),
      decision: row.decision,
    };
  }

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
    return { status: 'error', freeRemaining: 0, message: 'Check-in başlatılamadı.' };
  }
  return {
    status: 'allowed',
    checkInId: data?.id as string | undefined,
    freeRemaining: 1,
    decision: 'legacy',
  };
}

export async function endRemoteCheckIn(placeId: string, userId: string) {
  if (!isSupabaseConfigured || !supabase || !isUuid(placeId)) return;
  if (isCheckInCreditsEnabled) {
    const { error } = await supabase.rpc('end_check_in', { target_place_id: placeId });
    if (error) warnOnce('check-out', error.message);
    return;
  }
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
export async function fetchActivePeople(placeId: string): Promise<ChatPerson[]> {
  if (!isSupabaseConfigured || !supabase || !isUuid(placeId)) return [];
  const { data, error } = await supabase.rpc('get_active_people', {
    target_place_id: placeId,
  });
  if (error) {
    warnOnce('active people', error.message);
    return [];
  }
  return ((data ?? []) as PublicProfile[]).map((profile) => {
    return {
      id: profile.id,
      firstName: profile?.first_name?.trim() || 'Misafir',
      lastName: profile?.last_name?.trim() || '',
      avatarUrl: profile?.avatar_url || '',
    };
  });
}

export type RemoteMessage = {
  id: string;
  author: string;
  text: string;
  createdAt: string;
  userId: string;
};

const OBJECTIONABLE_MESSAGE_RE =
  /\b(?:orospu|sik(?:eyim|erim)?|amk|piç|fuck|bitch|nigg(?:a|er))\b/i;

export function isMessageAllowed(body: string) {
  return body.trim().length > 0 && body.length <= 500 && !OBJECTIONABLE_MESSAGE_RE.test(body);
}

export async function blockUser(blockerId: string, blockedId: string) {
  if (!isSupabaseConfigured || !supabase || !isUuid(blockerId) || !isUuid(blockedId)) {
    return false;
  }
  const { error } = await supabase
    .from('user_blocks')
    .upsert({ blocker_id: blockerId, blocked_id: blockedId }, { onConflict: 'blocker_id,blocked_id' });
  if (error) {
    warnOnce('user block', error.message);
    return false;
  }
  return true;
}

export async function reportMessage(
  reporterId: string,
  messageId: string,
  reportedUserId: string,
) {
  if (
    !isSupabaseConfigured ||
    !supabase ||
    !isUuid(reporterId) ||
    !isUuid(messageId) ||
    !isUuid(reportedUserId)
  ) {
    return false;
  }
  const { error } = await supabase.from('message_reports').upsert(
    {
      reporter_id: reporterId,
      message_id: messageId,
      reported_user_id: reportedUserId,
      reason: 'inappropriate_content',
    },
    { onConflict: 'reporter_id,message_id', ignoreDuplicates: true },
  );
  if (error) {
    warnOnce('message report', error.message);
    return false;
  }
  return true;
}

export async function fetchPlaceMessages(placeId: string): Promise<RemoteMessage[] | null> {
  if (!isSupabaseConfigured || !supabase || !isUuid(placeId)) return null;
  const { data, error } = await supabase
    .from('messages')
    .select('id, body, created_at, user_id')
    .eq('place_id', placeId)
    .order('created_at', { ascending: true })
    .limit(80);
  if (error) {
    warnOnce('messages fetch', error.message);
    return null;
  }
  const rows = (data ?? []) as Record<string, unknown>[];
  const profiles = await fetchPublicProfiles(rows.map((row) => String(row.user_id)));
  return rows.map((row) => {
    const profile = profiles.get(String(row.user_id));
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
