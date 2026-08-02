import type { Profile } from '@/context/AppContext';
import { normalizeInstagram, normalizeLinkedIn } from '@/lib/social';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export type RemoteProfile = Profile & {
  isAdmin: boolean;
  onboardingComplete: boolean;
};

function fromRow(row: Record<string, unknown>): RemoteProfile {
  const firstName = String(row.first_name ?? '');
  const lastName = String(row.last_name ?? '');
  const flagged =
    typeof row.onboarding_completed === 'boolean'
      ? Boolean(row.onboarding_completed)
      : firstName.trim().length > 0;
  return {
    firstName,
    lastName,
    age: row.age != null ? String(row.age) : '',
    profession: String(row.profession ?? ''),
    gender: String(row.gender ?? ''),
    bio: (row.bio as string | null) ?? '',
    avatarUrl: (row.avatar_url as string | null) ?? '',
    linkedin: (row.linkedin as string | null) ?? '',
    instagram: (row.instagram as string | null) ?? '',
    isAdmin: Boolean(row.is_admin),
    onboardingComplete: flagged,
  };
}

export async function fetchProfile(userId: string): Promise<RemoteProfile | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return fromRow(data as Record<string, unknown>);
}

export async function upsertProfile(
  userId: string,
  profile: Profile,
  opts?: { onboardingCompleted?: boolean },
) {
  if (!isSupabaseConfigured || !supabase) return;
  const ageNum = Number.parseInt(profile.age, 10);
  const row: Record<string, unknown> = {
    id: userId,
    first_name: profile.firstName.trim() || null,
    last_name: profile.lastName.trim() || null,
    age: Number.isFinite(ageNum) ? ageNum : null,
    profession: profile.profession.trim() || null,
    gender: profile.gender.trim() || null,
    bio: profile.bio?.trim() || null,
    avatar_url: profile.avatarUrl?.trim() || null,
    linkedin: normalizeLinkedIn(profile.linkedin) || null,
    instagram: normalizeInstagram(profile.instagram) || null,
  };
  if (typeof opts?.onboardingCompleted === 'boolean') {
    row.onboarding_completed = opts.onboardingCompleted;
  }

  // Projects that haven't run every migration yet are missing columns like
  // avatar_url; drop them one by one instead of losing the whole save.
  for (let attempt = 0; attempt < Object.keys(row).length; attempt += 1) {
    const { error } = await supabase.from('profiles').upsert(row, { onConflict: 'id' });
    if (!error) return;
    const missing = missingColumnFrom(error.message);
    if (!missing || !(missing in row) || missing === 'id') throw error;
    console.warn(`[profile] "${missing}" kolonu yok, bu alan atlandı`);
    delete row[missing];
  }
}

/** Reads the column name out of a PostgREST "schema cache" error. */
function missingColumnFrom(message: string) {
  const match = /'([a-z_]+)' column/i.exec(message) ?? /column ["']?([a-z_.]+)["']? does not exist/i.exec(message);
  return match?.[1]?.split('.').pop();
}

export async function setOnboardingCompleted(userId: string, completed: boolean) {
  if (!isSupabaseConfigured || !supabase) return;
  const { error } = await supabase
    .from('profiles')
    .upsert({ id: userId, onboarding_completed: completed }, { onConflict: 'id' });
  if (error) {
    // Migration yoksa sessiz geç — local bayrak yine çalışır
    console.warn('onboarding_completed update skipped', error.message);
  }
}

/**
 * Returns the profile row for a user, creating an empty one the first time.
 * Callers can use the result directly instead of fetching again.
 */
export async function ensureProfileRow(userId: string): Promise<RemoteProfile | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  const existing = await fetchProfile(userId);
  if (existing) return existing;
  const { error } = await supabase.from('profiles').insert({
    id: userId,
    onboarding_completed: false,
  });
  if (error) {
    if (error.message.toLowerCase().includes('duplicate')) {
      return (await fetchProfile(userId)) ?? null;
    }
    // kolon yoksa sade insert
    const plain = await supabase.from('profiles').insert({ id: userId });
    if (plain.error && !plain.error.message.toLowerCase().includes('duplicate')) {
      throw plain.error;
    }
  }
  return (await fetchProfile(userId)) ?? null;
}
