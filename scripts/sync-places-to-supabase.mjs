/**
 * Pull Istanbul working cafes from Google Places and upsert into Supabase.
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

const BLOCK =
  /çay\s*bahçesi|cay\s*bahcesi|çaybahçesi|bozacı|bozacisi|boza\b|nargile|ocakbaşı|ocakbasi|kebap|döner|pide\b|lahmacun|meyhane|birahane|kahvaltı\s*salonu|aile\s*çay/i;
const ALLOW =
  /starbucks|coffee|espresso|roastery|roast|gloria\s*jean|cafe|café|kahve|cowork|co-work|workspace|ofis|office|studio|specialty|filtre|kronotrop|petra|working\s*cafe|laptop/i;

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

function keep(name, types = []) {
  if (!name || BLOCK.test(name)) return false;
  if (types.includes('coworking_space')) return true;
  if (ALLOW.test(name)) return true;
  if (types.includes('coffee_shop')) return true;
  return false;
}

function categoryFromTypes(types = []) {
  if (types.includes('coworking_space')) return 'Cowork';
  return 'Cafe';
}

function imageFor(id, category) {
  const pool = category === 'Cowork' ? COWORK_IMAGES : CAFE_IMAGES;
  return pool[hashId(id) % pool.length];
}

const GRID = [
  { latitude: 41.0246, longitude: 28.977 },
  { latitude: 41.0351, longitude: 28.9784 },
  { latitude: 41.0422, longitude: 29.0067 },
  { latitude: 41.0501, longitude: 28.9928 },
  { latitude: 40.9909, longitude: 29.0303 },
  { latitude: 40.9842, longitude: 29.0254 },
  { latitude: 41.0814, longitude: 29.0122 },
  { latitude: 41.0602, longitude: 28.9877 },
  { latitude: 41.0256, longitude: 29.0156 },
  { latitude: 40.9796, longitude: 28.872 },
];
const TYPES = ['cafe', 'coffee_shop', 'coworking_space'];

async function searchNearby(apiKey, lat, lng, type) {
  const res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask':
        'places.id,places.displayName,places.location,places.types,places.formattedAddress',
    },
    body: JSON.stringify({
      includedTypes: [type],
      maxResultCount: 20,
      languageCode: 'tr',
      regionCode: 'TR',
      locationRestriction: {
        circle: { center: { latitude: lat, longitude: lng }, radius: 3200.0 },
      },
    }),
  });
  if (!res.ok) throw new Error(`Places ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const json = await res.json();
  return json.places ?? [];
}

const env = loadEnv();
const googleKey = env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY;
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
console.log('Fetching Google places…');

const byId = new Map();
let filteredOut = 0;

for (const cell of GRID) {
  for (const type of TYPES) {
    const results = await searchNearby(googleKey, cell.latitude, cell.longitude, type);
    for (const raw of results) {
      const name = raw.displayName?.text?.trim() ?? '';
      const types = raw.types ?? [];
      const id = (raw.id || '').replace(/^places\//, '');
      const lat = raw.location?.latitude;
      const lng = raw.location?.longitude;
      if (!id || !name || lat == null || lng == null) continue;
      if (!keep(name, types)) {
        filteredOut += 1;
        continue;
      }
      const category = categoryFromTypes(types);
      byId.set(id, {
        google_place_id: id,
        name,
        category,
        city: 'Istanbul',
        latitude: lat,
        longitude: lng,
        image_url: imageFor(id, category),
        source: 'google',
        status: 'approved',
        last_synced_at: new Date().toISOString(),
      });
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}

const rows = [...byId.values()];
console.log('Kept', rows.length, '· filtered out', filteredOut);

if (rows.length === 0) {
  console.error('FAIL: nothing to upsert');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
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
