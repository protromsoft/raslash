import { demoStore } from './demoStore';
import { isSupabaseConfigured, supabase } from './supabase';
import type { DashboardStats, Place, PlaceInput, Rating } from './types';

export async function getPendingPlaces(): Promise<Place[]> {
  if (!isSupabaseConfigured || !supabase) return demoStore.listPending();
  const { data, error } = await supabase
    .from('places')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Place[];
}

export async function getApprovedPlaces(): Promise<Place[]> {
  if (!isSupabaseConfigured || !supabase) return demoStore.listApproved();
  const { data, error } = await supabase
    .from('places')
    .select('*')
    .eq('status', 'approved')
    .order('name');
  if (error) throw error;
  return (data ?? []) as Place[];
}

export async function getRejectedPlaces(): Promise<Place[]> {
  if (!isSupabaseConfigured || !supabase) return demoStore.listRejected();
  const { data, error } = await supabase
    .from('places')
    .select('*')
    .eq('status', 'rejected')
    .order('name');
  if (error) throw error;
  return (data ?? []) as Place[];
}

export async function getAllPlaces(): Promise<Place[]> {
  if (!isSupabaseConfigured || !supabase) return demoStore.listPlaces();
  const { data, error } = await supabase.from('places').select('*').order('name');
  if (error) throw error;
  return (data ?? []) as Place[];
}

export async function getDashboardStats(): Promise<DashboardStats> {
  if (!isSupabaseConfigured || !supabase) {
    const places = demoStore.listPlaces();
    return {
      approved: places.filter((p) => p.status === 'approved').length,
      pending: places.filter((p) => p.status === 'pending').length,
      rejected: places.filter((p) => p.status === 'rejected').length,
      ratings: demoStore.listRatings().length,
    };
  }
  const [approved, pending, rejected, ratings] = await Promise.all([
    supabase.from('places').select('*', { count: 'exact', head: true }).eq('status', 'approved'),
    supabase.from('places').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('places').select('*', { count: 'exact', head: true }).eq('status', 'rejected'),
    supabase.from('ratings').select('*', { count: 'exact', head: true }),
  ]);
  if (approved.error) throw approved.error;
  if (pending.error) throw pending.error;
  if (rejected.error) throw rejected.error;
  if (ratings.error) throw ratings.error;
  return {
    approved: approved.count ?? 0,
    pending: pending.count ?? 0,
    rejected: rejected.count ?? 0,
    ratings: ratings.count ?? 0,
  };
}

export async function approvePlace(id: string) {
  if (!isSupabaseConfigured || !supabase) {
    demoStore.approve(id);
    return;
  }
  const { data: place, error } = await supabase
    .from('places')
    .update({ status: 'approved' })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  await supabase.from('notifications').insert({
    title: 'Mekanın onaylandı',
    body: `"${place.name}" artık haritada listeleniyor.`,
    type: 'place_approved',
    place_id: place.id,
    user_id: place.created_by,
  });
}

export async function rejectPlace(id: string) {
  if (!isSupabaseConfigured || !supabase) {
    demoStore.reject(id);
    return;
  }
  const { data: place, error } = await supabase
    .from('places')
    .update({ status: 'rejected' })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  await supabase.from('notifications').insert({
    title: 'Mekan reddedildi',
    body: `"${place.name}" listeye eklenmedi.`,
    type: 'place_rejected',
    place_id: place.id,
    user_id: place.created_by,
  });
}

export async function updatePlaceImage(id: string, image_url: string) {
  if (!isSupabaseConfigured || !supabase) {
    demoStore.updateImage(id, image_url);
    return;
  }
  const { error } = await supabase.from('places').update({ image_url }).eq('id', id);
  if (error) throw error;
}

export async function updatePlace(
  id: string,
  patch: Partial<
    Pick<
      Place,
      | 'name'
      | 'category'
      | 'city'
      | 'latitude'
      | 'longitude'
      | 'image_url'
      | 'status'
      | 'submitted_by_name'
    >
  >,
) {
  if (!isSupabaseConfigured || !supabase) {
    demoStore.updatePlace(id, patch);
    return;
  }
  const { error } = await supabase.from('places').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deletePlace(id: string) {
  if (!isSupabaseConfigured || !supabase) {
    demoStore.deletePlace(id);
    return;
  }
  const { error } = await supabase.from('places').delete().eq('id', id);
  if (error) throw error;
}

export async function createPlace(input: PlaceInput): Promise<Place> {
  if (!isSupabaseConfigured || !supabase) return demoStore.createPlace(input);
  const row = {
    name: input.name.trim(),
    category: input.category.trim() || 'Cafe',
    city: input.city.trim() || 'Istanbul',
    latitude: input.latitude,
    longitude: input.longitude,
    image_url: input.image_url ?? null,
    source: input.source ?? 'user',
    status: input.status ?? 'approved',
    submitted_by_name: input.submitted_by_name ?? 'Admin',
  };
  const { data, error } = await supabase.from('places').insert(row).select('*').single();
  if (error) throw error;
  return data as Place;
}

export async function getRatings(placeId: string): Promise<Rating[]> {
  if (!isSupabaseConfigured || !supabase) return demoStore.listRatings(placeId);
  const { data, error } = await supabase
    .from('ratings')
    .select('*, profiles(first_name,last_name)')
    .eq('place_id', placeId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => mapRating(row));
}

export async function getRecentRatings(limit = 80): Promise<Rating[]> {
  if (!isSupabaseConfigured || !supabase) {
    const places = demoStore.listPlaces();
    return demoStore
      .listRatings()
      .map((r) => ({
        ...r,
        place_name: places.find((p) => p.id === r.place_id)?.name,
      }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit);
  }
  const { data, error } = await supabase
    .from('ratings')
    .select('*, places(name), profiles(first_name,last_name)')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => {
    const places = row.places as { name?: string } | null;
    return { ...mapRating(row), place_name: places?.name };
  });
}

function mapRating(row: Record<string, unknown>): Rating {
  const profiles = row.profiles as { first_name?: string; last_name?: string } | null;
  return {
    id: String(row.id),
    place_id: String(row.place_id),
    author_name:
      (row.author_name as string | null) ||
      (profiles
        ? [profiles.first_name, profiles.last_name].filter(Boolean).join(' ')
        : 'User'),
    wifi: Number(row.wifi),
    comfort: Number(row.comfort),
    outlets: Number(row.outlets),
    review: (row.review as string | null) ?? null,
    created_at: String(row.created_at),
  };
}

export async function deleteRating(id: string) {
  if (!isSupabaseConfigured || !supabase) {
    demoStore.deleteRating(id);
    return;
  }
  const { error } = await supabase.from('ratings').delete().eq('id', id);
  if (error) throw error;
}

export async function addAdminRating(placeId: string, review: string) {
  if (!isSupabaseConfigured || !supabase) {
    demoStore.addRating(placeId, review);
    return;
  }
  const { error } = await supabase.from('ratings').insert({
    place_id: placeId,
    wifi: 4,
    comfort: 4,
    outlets: 4,
    review,
    author_name: 'Admin',
  });
  if (error) throw error;
}

export async function upsertGooglePlaceRows(
  rows: Array<{
    google_place_id: string;
    name: string;
    category: string;
    city: string;
    latitude: number;
    longitude: number;
    image_url: string;
    source: 'google';
    status: 'approved';
    last_synced_at: string;
  }>,
) {
  if (!isSupabaseConfigured || !supabase) {
    for (const row of rows) {
      const existing = demoStore.listPlaces().find((p) => p.google_place_id === row.google_place_id);
      if (existing) {
        demoStore.updatePlace(existing.id, {
          name: row.name,
          category: row.category,
          city: row.city,
          latitude: row.latitude,
          longitude: row.longitude,
          image_url: row.image_url,
          status: 'approved',
          source: 'google',
        });
      } else {
        demoStore.createPlace({
          ...row,
          source: 'google',
          status: 'approved',
        });
        const created = demoStore.listPlaces()[0];
        if (created) {
          demoStore.updatePlace(created.id, { google_place_id: row.google_place_id });
        }
      }
    }
    return rows.length;
  }
  let upserted = 0;
  for (let i = 0; i < rows.length; i += 50) {
    const chunk = rows.slice(i, i + 50);
    const { error } = await supabase.from('places').upsert(chunk, {
      onConflict: 'google_place_id',
    });
    if (error) throw error;
    upserted += chunk.length;
  }
  return upserted;
}

export function backendLabel() {
  return isSupabaseConfigured ? 'Supabase' : 'Demo (localStorage)';
}
