import type { AppNotification, Place, PlaceStatus, RatingScores, Review } from '@/data/types';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { autoImageForPlace } from '@/lib/placeImages';

type DbPlace = {
  id: string;
  google_place_id: string | null;
  name: string;
  category: string | null;
  city: string | null;
  city_slug: string | null;
  latitude: number;
  longitude: number;
  image_url: string | null;
  source: 'google' | 'user';
  status: PlaceStatus;
  submitted_by_name: string | null;
  google_primary_type?: string | null;
  google_types?: string[] | null;
  business_status?: string | null;
};

function fromDb(row: DbPlace): Place {
  const category = row.category || 'Cafe';
  return {
    id: row.id,
    googlePlaceId: row.google_place_id ?? undefined,
    name: row.name,
    category,
    city: row.city || 'Istanbul',
    latitude: row.latitude,
    longitude: row.longitude,
    imageUrl: row.image_url || autoImageForPlace(row.id, category),
    source: row.source,
    status: row.status,
    submittedByName: row.submitted_by_name ?? undefined,
    googlePrimaryType: row.google_primary_type ?? undefined,
    googleTypes: row.google_types ?? undefined,
    businessStatus: row.business_status ?? undefined,
  };
}

function toDb(place: Place, opts?: { includeId?: boolean }) {
  const normalizedCity = place.city.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const row: Record<string, unknown> = {
    google_place_id: place.googlePlaceId ?? null,
    name: place.name,
    category: place.category,
    city: place.city,
    city_slug: normalizedCity.includes('ankara')
      ? 'ankara'
      : normalizedCity.includes('izmir')
        ? 'izmir'
        : 'istanbul',
    latitude: place.latitude,
    longitude: place.longitude,
    image_url: place.imageUrl ?? autoImageForPlace(place.id, place.category),
    source: place.source,
    status: place.status,
    submitted_by_name: place.submittedByName ?? null,
    last_synced_at: place.source === 'google' ? new Date().toISOString() : null,
  };
  if (opts?.includeId) row.id = place.id;
  return row;
}

export async function fetchApprovedPlaces(): Promise<Place[] | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  const { data, error } = await supabase
    .from('places')
    .select('*')
    .eq('status', 'approved')
    .order('name');
  if (error) throw error;
  return ((data ?? []) as DbPlace[]).map(fromDb);
}

export async function fetchPendingPlaces(): Promise<Place[] | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  const { data, error } = await supabase
    .from('places')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as DbPlace[]).map(fromDb);
}

export async function insertPendingPlace(place: Place, userId: string) {
  if (!isSupabaseConfigured || !supabase) return false;
  const { error } = await supabase
    .from('places')
    .insert({
      ...toDb({ ...place, status: 'pending' }, { includeId: true }),
      created_by: userId,
    });
  if (error) throw error;
  return true;
}

export async function updatePlaceStatus(id: string, status: PlaceStatus) {
  if (!isSupabaseConfigured || !supabase) return false;
  const { error } = await supabase.from('places').update({ status }).eq('id', id);
  if (error) throw error;
  return true;
}

/** One request per 100 ids, for admin bulk approval/rejection. */
export async function updatePlacesStatus(ids: string[], status: PlaceStatus) {
  if (!isSupabaseConfigured || !supabase) return false;
  for (let offset = 0; offset < ids.length; offset += 100) {
    const { error } = await supabase.from('places').update({ status }).in('id', ids.slice(offset, offset + 100));
    if (error) throw error;
  }
  return true;
}

export async function updatePlaceImageRemote(id: string, imageUrl: string) {
  if (!isSupabaseConfigured || !supabase) return false;
  const { error } = await supabase.from('places').update({ image_url: imageUrl }).eq('id', id);
  if (error) throw error;
  return true;
}

export async function insertNotificationRemote(n: {
  userId: string;
  title: string;
  body: string;
  type: string;
  placeId?: string;
}) {
  if (!isSupabaseConfigured || !supabase) return false;
  const { error } = await supabase.from('notifications').insert({
    user_id: n.userId,
    title: n.title,
    body: n.body,
    type: n.type,
    place_id: n.placeId ?? null,
    read: false,
  });
  if (error) throw error;
  return true;
}

export async function fetchNotificationsRemote(): Promise<AppNotification[] | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: String(row.id),
    title: String(row.title),
    body: String(row.body),
    type: row.type as AppNotification['type'],
    placeId: row.place_id ? String(row.place_id) : undefined,
    read: Boolean(row.read),
    createdAt: String(row.created_at),
  }));
}

export async function deleteNotificationsRemote(userId: string) {
  if (!isSupabaseConfigured || !supabase) return false;
  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('user_id', userId);
  if (error) throw error;
  return true;
}

type DbRating = {
  id: string;
  place_id: string;
  author_name: string | null;
  wifi: number;
  comfort: number;
  outlets: number;
  review: string | null;
  photo_path?: string | null;
  created_at: string;
};

/**
 * Every rating, grouped by place. Ratings are public (RLS "Ratings public
 * read") and few enough to load in one request; newest first.
 */
export async function fetchRatingsByPlace(): Promise<Record<string, Review[]> | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  const client = supabase;
  const columns = 'id, place_id, author_name, wifi, comfort, outlets, review, created_at';
  const query = (select: string) => client
    .from('ratings')
    .select(select)
    .order('created_at', { ascending: false })
    .limit(5000);
  let { data, error } = await query(`${columns}, photo_path`);
  // Until the place-photos migration runs the column is missing (42703);
  // ratings still load, just without photos.
  if (error?.code === '42703') ({ data, error } = await query(columns));
  if (error) throw error;
  const grouped: Record<string, Review[]> = {};
  for (const row of (data ?? []) as unknown as DbRating[]) {
    (grouped[row.place_id] ??= []).push({
      id: row.id,
      author: row.author_name?.trim() || 'Raslash üyesi',
      text: row.review?.trim() || undefined,
      photoPath: row.photo_path?.trim() || undefined,
      wifi: Number(row.wifi),
      comfort: Number(row.comfort),
      outlets: Number(row.outlets),
      createdAt: row.created_at,
    });
  }
  return grouped;
}

export async function insertRatingRemote(input: {
  placeId: string;
  userId: string;
  author: string;
  scores: RatingScores;
  text?: string;
  /** Already uploaded `review-photos` path. */
  photoPath?: string;
}): Promise<Review> {
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase bağlantısı yok');
  const { data, error } = await supabase
    .from('ratings')
    .insert({
      place_id: input.placeId,
      user_id: input.userId,
      author_name: input.author,
      wifi: input.scores.wifi,
      comfort: input.scores.comfort,
      outlets: input.scores.outlets,
      review: input.text?.trim() || null,
      // Only sent with a photo, so a database without the column still saves text ratings.
      ...(input.photoPath ? { photo_path: input.photoPath } : {}),
    })
    .select('id, created_at')
    .single();
  if (error) throw error;
  return {
    id: data.id as string,
    author: input.author,
    text: input.text?.trim() || undefined,
    photoPath: input.photoPath || undefined,
    ...input.scores,
    createdAt: data.created_at as string,
  };
}

export async function deleteRatingRemote(id: string) {
  if (!isSupabaseConfigured || !supabase) return false;
  const { error } = await supabase.from('ratings').delete().eq('id', id);
  if (error) throw error;
  return true;
}
