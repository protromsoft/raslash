/**
 * Pull supported-city working cafes from Google Places and upsert into Supabase.
 * Does not print API keys.
 *
 * Prerequisite: run supabase/sync_policy.sql once in SQL Editor
 *   (or set SUPABASE_SERVICE_ROLE_KEY in .env to bypass RLS)
 *
 * Usage: node scripts/sync-places-to-supabase.mjs
 */
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { classifyGooglePlace, reconcileStatus } from '../src/lib/placeFilter.ts';
import { SCAN_CITIES, SCAN_SEARCH_RADIUS_M, scanPointsFor } from '../src/lib/placeScanGrid.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv() {
  const path = resolve(root, '.env');
  if (!existsSync(path)) throw new Error('.env missing');
  const out = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) out[m[1].trim()] = m[2].trim();
  }
  return out;
}

const CAFE_IMAGES = [
  'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=800&q=80',
  'https://images.unsplash.com/photo-1521017432531-fbd92d768814?w=800&q=80',
  'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=800&q=80',
  'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=800&q=80',
  'https://images.unsplash.com/photo-1498804103079-a6351b050096?w=800&q=80',
  'https://images.unsplash.com/photo-1511920170033-f8396924c348?w=800&q=80',
];
const COWORK_IMAGES = [
  'https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&q=80',
  'https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=800&q=80',
  'https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=800&q=80',
  'https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=800&q=80',
];

function hashId(id) {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

function imageFor(id, category) {
  const pool = category === 'Cowork' ? COWORK_IMAGES : CAFE_IMAGES;
  return pool[hashId(id) % pool.length];
}

const TYPES = ['cafe', 'coffee_shop', 'coworking_space'];
// --city istanbul|ankara|izmir scans one city; --combined-types sends the three
// types in one request per point (a third of the cost, max 20 results per point).
const args = process.argv.slice(2);
const cityArg = args.includes('--city') ? args[args.indexOf('--city') + 1] : null;
const cities = cityArg ? SCAN_CITIES.filter((c) => c.citySlug === cityArg) : SCAN_CITIES;
const typeBatches = args.includes('--combined-types') ? [TYPES] : TYPES.map((t) => [t]);
const GRID = cities.flatMap((city) => scanPointsFor(city));

async function searchNearby(apiKey, lat, lng, includedTypes) {
  const res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask':
        'places.id,places.displayName,places.location,places.types,places.primaryType,places.businessStatus',
    },
    body: JSON.stringify({
      includedTypes,
      maxResultCount: 20,
      languageCode: 'tr',
      regionCode: 'TR',
      locationRestriction: {
        circle: { center: { latitude: lat, longitude: lng }, radius: SCAN_SEARCH_RADIUS_M },
      },
    }),
  });
  if (!res.ok) throw new Error(`Places ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const json = await res.json();
  return json.places ?? [];
}

const env = loadEnv();
const googleKey = env.GOOGLE_PLACES_API_KEY;
const supabaseUrl = env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!googleKey || googleKey.length < 20) {
  console.error('FAIL: Google Places key missing');
  process.exit(1);
}
if (!supabaseUrl || !supabaseKey) {
  console.error('FAIL: Supabase URL/key missing');
  process.exit(1);
}

console.log('Using', env.SUPABASE_SERVICE_ROLE_KEY ? 'SERVICE_ROLE' : 'ANON', 'for upsert');
console.log(`Fetching Google places… ${GRID.length} nokta × ${typeBatches.length} istek = ${GRID.length * typeBatches.length} Nearby Search`);

const byId = new Map();
let filteredOut = 0;

for (const cell of GRID) {
  for (const includedTypes of typeBatches) {
    const results = await searchNearby(googleKey, cell.latitude, cell.longitude, includedTypes);
    for (const raw of results) {
      const name = raw.displayName?.text?.trim() ?? '';
      const id = (raw.id || '').replace(/^places\//, '');
      const lat = raw.location?.latitude;
      const lng = raw.location?.longitude;
      if (!id || !name || lat == null || lng == null || byId.has(id)) continue;
      const decision = classifyGooglePlace({
        name, primaryType: raw.primaryType, types: raw.types, businessStatus: raw.businessStatus,
      });
      if (!decision.keep) {
        filteredOut += 1;
        continue;
      }
      byId.set(id, {
        google_place_id: id,
        name,
        category: decision.category,
        city: cell.city,
        city_slug: cell.citySlug,
        latitude: lat,
        longitude: lng,
        image_url: imageFor(id, decision.category),
        source: 'google',
        status: decision.status,
        google_primary_type: raw.primaryType ?? null,
        google_types: raw.types ?? [],
        business_status: raw.businessStatus ?? null,
        last_synced_at: new Date().toISOString(),
      });
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Keep an admin's earlier decision: approved stays approved, rejected stays rejected.
const ids = [...byId.keys()];
for (let i = 0; i < ids.length; i += 200) {
  const { data, error } = await supabase
    .from('places')
    .select('google_place_id,status')
    .in('google_place_id', ids.slice(i, i + 200));
  if (error) {
    console.error('LOOKUP FAIL:', error.message);
    process.exit(1);
  }
  for (const row of data ?? []) {
    const draft = byId.get(row.google_place_id);
    if (draft) draft.status = reconcileStatus(row.status, { keep: true, category: draft.category, status: draft.status, reason: '' });
  }
}

const rows = [...byId.values()];
const pendingCount = rows.filter((r) => r.status === 'pending').length;
console.log('Kept', rows.length, `(${pendingCount} pending)`, '· filtered out', filteredOut);

if (rows.length === 0) {
  console.error('FAIL: nothing to upsert');
  process.exit(1);
}

let upserted = 0;
for (let i = 0; i < rows.length; i += 50) {
  const chunk = rows.slice(i, i + 50);
  const { error } = await supabase.from('places').upsert(chunk, {
    onConflict: 'google_place_id',
  });
  if (error) {
    console.error('UPSERT FAIL:', error.message);
    console.error('Hint: run supabase/sync_policy.sql in SQL Editor, then retry.');
    process.exit(1);
  }
  upserted += chunk.length;
}

const { count, error: countErr } = await supabase
  .from('places')
  .select('*', { count: 'exact', head: true })
  .eq('status', 'approved');

console.log('Upserted', upserted);
console.log('Approved places in DB', countErr ? 'unknown' : count);
console.log('OK');
