import type { AppNotification, Place, PlaceStatus } from '@/data/types';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { autoImageForPlace } from '@/lib/placeImages';

type DbPlace = {
  id: string;
  google_place_id: string | null;
  name: string;
  category: string | null;
  city: string | null;
  latitude: number;
  longitude: number;
  image_url: string | null;
  source: 'google' | 'user';
  status: PlaceStatus;
  submitted_by_name: string | null;
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
  };
}

function toDb(place: Place, opts?: { includeId?: boolean }) {
  const row: Record<string, unknown> = {
    google_place_id: place.googlePlaceId ?? null,
    name: place.name,
    category: place.category,
    city: place.city,
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

export async function upsertGooglePlaces(places: Place[]) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase not configured');
  }
  const rows = places.map((p) =>
    toDb({
      ...p,
      googlePlaceId: p.googlePlaceId || p.id,
      status: 'approved',
      source: 'google',
    }),
  );
  const chunkSize = 50;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase.from('places').upsert(chunk, {
      onConflict: 'google_place_id',
    });
    if (error) throw error;
  }
}

export async function insertPendingPlace(place: Place) {
  if (!isSupabaseConfigured || !supabase) return false;
  const { error } = await supabase
    .from('places')
    .insert(toDb({ ...place, status: 'pending' }, { includeId: true }));
  if (error) throw error;
  return true;
}

export async function updatePlaceStatus(id: string, status: PlaceStatus) {
  if (!isSupabaseConfigured || !supabase) return false;
  const { error } = await supabase.from('places').update({ status }).eq('id', id);
  if (error) throw error;
  return true;
}

export async function updatePlaceImageRemote(id: string, imageUrl: string) {
  if (!isSupabaseConfigured || !supabase) return false;
  const { error } = await supabase.from('places').update({ image_url: imageUrl }).eq('id', id);
  if (error) throw error;
  return true;
}

export async function insertNotificationRemote(n: {
  title: string;
  body: string;
  type: string;
  placeId?: string;
}) {
  if (!isSupabaseConfigured || !supabase) return false;
  const { error } = await supabase.from('notifications').insert({
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
