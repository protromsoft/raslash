import { createClient } from 'npm:@supabase/supabase-js@2.111.0';
import { corsHeaders } from 'npm:@supabase/supabase-js@2.111.0/cors';
import { classifyGooglePlace, reconcileStatus } from '../_shared/placeFilter.ts';
import { SCAN_CITIES, SCAN_SEARCH_RADIUS_M, scanPointsFor, type ScanCity } from '../_shared/placeScanGrid.ts';

type GooglePlace = {
  id?: string;
  displayName?: { text?: string };
  location?: { latitude?: number; longitude?: number };
  types?: string[];
  primaryType?: string;
  businessStatus?: string;
};
type ExistingStatus = 'approved' | 'pending' | 'rejected';

/**
 * Three searches per point (one per type) return up to 60 places where one
 * combined search would stop at 20; dense Istanbul cells need that. Callers
 * can pass `{ combinedTypes: true }` to trade completeness for a third of the
 * requests.
 */
const PLACE_TYPES = ['cafe', 'coffee_shop', 'coworking_space'] as const;
const FIELD_MASK =
  'places.id,places.displayName,places.location,places.types,places.primaryType,places.businessStatus';
/**
 * Searches run in parallel batches: sequentially, Istanbul's ~950 requests
 * would outlast the edge function's wall-clock limit. 8 at a time stays well
 * inside Google's per-minute quota.
 */
const CONCURRENCY = 8;

async function runLimited<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (next < tasks.length) {
      const index = next++;
      results[index] = await tasks[index]();
    }
  });
  await Promise.all(workers);
  return results;
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

async function searchNearby(
  apiKey: string,
  latitude: number,
  longitude: number,
  includedTypes: readonly string[],
) {
  const response = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify({
      includedTypes,
      maxResultCount: 20,
      languageCode: 'tr',
      regionCode: 'TR',
      locationRestriction: {
        circle: { center: { latitude, longitude }, radius: SCAN_SEARCH_RADIUS_M },
      },
    }),
  });
  if (!response.ok) throw new Error(`Google Places ${response.status}`);
  return ((await response.json()) as { places?: GooglePlace[] }).places ?? [];
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { message: 'Method not allowed' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const googleApiKey = Deno.env.get('GOOGLE_PLACES_API_KEY');
  const authorization = req.headers.get('Authorization');
  if (!authorization) return json(401, { message: 'Invalid session' });
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !googleApiKey) {
    return json(500, { message: 'Server configuration missing' });
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser();
  const userId = authData.user?.id;
  if (authError || !userId) return json(401, { message: 'Invalid session' });

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('is_admin')
    .eq('id', userId)
    .maybeSingle();
  if (profileError || profile?.is_admin !== true) return json(403, { message: 'Admin required' });

  // Optional body: { city?: 'istanbul' | 'ankara' | 'izmir', combinedTypes?: boolean }
  // so an admin can scan one city at a time and keep the Google bill small.
  let options: { city?: string; combinedTypes?: boolean } = {};
  try {
    const text = await req.text();
    if (text) options = JSON.parse(text);
  } catch {
    return json(400, { message: 'Invalid request body' });
  }
  const cities: readonly ScanCity[] = options.city
    ? SCAN_CITIES.filter((city) => city.citySlug === options.city)
    : SCAN_CITIES;
  if (cities.length === 0) return json(400, { message: 'Unknown city' });
  const typeBatches: readonly (readonly string[])[] = options.combinedTypes
    ? [PLACE_TYPES]
    : PLACE_TYPES.map((type) => [type]);

  const rows = new Map<string, Record<string, unknown>>();
  let filteredOut = 0;
  let requests = 0;
  const syncedAt = new Date().toISOString();
  try {
    const searches = cities.flatMap((city) => scanPointsFor(city).flatMap((point) =>
      typeBatches.map((includedTypes) => ({ city, point, includedTypes }))));
    const results = await runLimited(searches.map((search) => async () => {
      requests += 1;
      const places = await searchNearby(googleApiKey, search.point.latitude, search.point.longitude, search.includedTypes);
      return { city: search.city, places };
    }), CONCURRENCY);
    // Merged in scan order, so a place seen from two points keeps the same city every run.
    for (const { city, places } of results) {
      for (const place of places) {
        const googlePlaceId = place.id?.replace(/^places\//, '');
        const name = place.displayName?.text?.trim() ?? '';
        const latitude = place.location?.latitude;
        const longitude = place.location?.longitude;
        if (!googlePlaceId || latitude == null || longitude == null) continue;
        if (rows.has(googlePlaceId)) continue;
        const decision = classifyGooglePlace({
          name,
          primaryType: place.primaryType,
          types: place.types,
          businessStatus: place.businessStatus,
        });
        if (!decision.keep) {
          if (name) filteredOut += 1;
          continue;
        }
        rows.set(googlePlaceId, {
          google_place_id: googlePlaceId,
          name,
          category: decision.category,
          city: city.city,
          city_slug: city.citySlug,
          latitude,
          longitude,
          source: 'google',
          // Replaced below for places the catalogue already knows.
          status: decision.status,
          google_primary_type: place.primaryType ?? null,
          google_types: place.types ?? [],
          business_status: place.businessStatus ?? null,
          last_synced_at: syncedAt,
        });
      }
    }
  } catch (error) {
    return json(502, {
      message: error instanceof Error ? error.message : 'Google Places sync failed',
      requests,
    });
  }

  // An admin's earlier approval or rejection must survive a re-sync.
  const ids = [...rows.keys()];
  const existing = new Map<string, ExistingStatus>();
  for (let offset = 0; offset < ids.length; offset += 200) {
    const { data, error } = await admin
      .from('places')
      .select('google_place_id,status')
      .in('google_place_id', ids.slice(offset, offset + 200));
    if (error) return json(500, { message: 'Place lookup failed' });
    for (const row of (data ?? []) as { google_place_id: string; status: ExistingStatus }[]) {
      existing.set(row.google_place_id, row.status);
    }
  }
  let pending = 0;
  for (const [id, row] of rows) {
    const decision = { keep: true as const, category: row.category as 'Cafe' | 'Cowork',
      status: row.status as 'approved' | 'pending', reason: '' };
    row.status = reconcileStatus(existing.get(id), decision);
    if (row.status === 'pending') pending += 1;
  }

  const allRows = [...rows.values()];
  for (let offset = 0; offset < allRows.length; offset += 100) {
    const { error } = await admin
      .from('places')
      .upsert(allRows.slice(offset, offset + 100), { onConflict: 'google_place_id' });
    if (error) return json(500, { message: 'Place upsert failed' });
  }

  return json(200, { imported: allRows.length, pending, filteredOut, requests });
});
