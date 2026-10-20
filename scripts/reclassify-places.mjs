/**
 * Re-applies the shared place rules (src/lib/placeFilter.ts) to the places
 * already in Supabase. Lists what would change; writes only with --apply.
 *
 *   node scripts/reclassify-places.mjs                 # dry run, prints the plan
 *   node scripts/reclassify-places.mjs --fetch-details # also look up missing Google types
 *   node scripts/reclassify-places.mjs --apply         # write the plan to Supabase
 *   node scripts/reclassify-places.mjs --city ankara   # one city only
 *   node scripts/reclassify-places.mjs --fetch-details --emit-sql plan.sql
 *       # writes the plan as one transaction instead of applying it, for
 *       # `supabase db query --linked -f plan.sql` (no service role key needed)
 *
 * Reads .env (EXPO_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or the anon
 * key, GOOGLE_PLACES_API_KEY). Never prints keys.
 *
 * Rows without stored Google types cannot be judged by the new rules. Without
 * --fetch-details they are reported, not changed; with it, one Place Details
 * request per such row (Pro SKU) fills google_primary_type / google_types /
 * business_status. The columns come from
 * supabase/migrations/20261019120000_add_place_google_metadata.sql.
 *
 * Before that migration is applied, a dry run falls back to an ESTIMATE: the
 * Google type is inferred from the stored category (Cowork → coworking_space,
 * Cafe → cafe). A real coffee_shop is then judged as a plain cafe, so the
 * estimate over-counts pending places; it never writes.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { classifyGooglePlace, reconcileStatus } from '../src/lib/placeFilter.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const FETCH_DETAILS = args.includes('--fetch-details');
const cityArg = args[args.indexOf('--city') + 1];
const CITY = args.includes('--city') ? cityArg : null;
const EMIT_SQL = args.includes('--emit-sql') ? args[args.indexOf('--emit-sql') + 1] : null;
// --rows file.json: rows exported with `supabase db query --linked`. The anon
// key only sees approved places (RLS), so pending/rejected rows need this.
const ROWS_FILE = args.includes('--rows') ? args[args.indexOf('--rows') + 1] : null;
if (args.includes('--emit-sql') && (!EMIT_SQL || EMIT_SQL.startsWith('--'))) {
  console.error('FAIL: --emit-sql bir dosya yolu ister');
  process.exit(1);
}
if (EMIT_SQL && APPLY) {
  console.error('FAIL: --emit-sql ve --apply birlikte kullanılamaz');
  process.exit(1);
}
const SAMPLE = 20;

function loadEnv() {
  const out = { ...process.env };
  for (const file of ['.env', 'admin-web/.env']) {
    const path = resolve(root, file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m && m[2].trim() && !out[m[1].trim()]) out[m[1].trim()] = m[2].trim();
    }
  }
  return out;
}

const env = loadEnv();
const supabaseUrl = env.EXPO_PUBLIC_SUPABASE_URL || env.VITE_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.EXPO_PUBLIC_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
const googleKey = env.GOOGLE_PLACES_API_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error('FAIL: Supabase URL/key missing (.env veya admin-web/.env)');
  process.exit(1);
}
if (APPLY && !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('FAIL: --apply için SUPABASE_SERVICE_ROLE_KEY gerekli');
  process.exit(1);
}
if (FETCH_DETAILS && !(googleKey && /^AIza[0-9A-Za-z_-]{30,}$/.test(googleKey))) {
  console.error(googleKey
    ? `FAIL: GOOGLE_PLACES_API_KEY geçerli bir Google anahtarı gibi görünmüyor (${googleKey.length} karakter).`
      + '\n      Gerçek anahtar "AIza" ile başlar ve ~39 karakterdir: Google Cloud Console › APIs & Services › Credentials.'
    : 'FAIL: --fetch-details için GOOGLE_PLACES_API_KEY gerekli (.env veya ortam değişkeni).');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

const FULL_COLUMNS = 'id,google_place_id,name,category,city,city_slug,status,google_primary_type,google_types,business_status';
const BASE_COLUMNS = 'id,google_place_id,name,category,city,city_slug,status';
let ESTIMATE = false;

async function fetchGooglePlaces(columns = FULL_COLUMNS) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    let query = supabase
      .from('places')
      .select(columns)
      .eq('source', 'google')
      .order('name')
      .range(from, from + 999);
    if (CITY) query = query.eq('city_slug', CITY);
    const { data, error } = await query;
    if (error) {
      if (columns === FULL_COLUMNS && /google_primary_type|google_types|business_status/.test(error.message)) {
        if (APPLY || FETCH_DETAILS) {
          console.error('FAIL: places tablosunda Google sütunları yok. Önce şu migration uygulanmalı:');
          console.error('      supabase/migrations/20261019120000_add_place_google_metadata.sql');
          process.exit(1);
        }
        ESTIMATE = true;
        return fetchGooglePlaces(BASE_COLUMNS);
      }
      throw error;
    }
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

// Paid lookups are cached on disk so a re-run (or a crash halfway) never pays
// for the same place twice. Lives under node_modules/.cache, outside git.
const CACHE_PATH = resolve(root, 'node_modules/.cache/raslash-place-details.json');
const cache = existsSync(CACHE_PATH) ? JSON.parse(readFileSync(CACHE_PATH, 'utf8')) : {};
function saveCache() {
  mkdirSync(dirname(CACHE_PATH), { recursive: true });
  writeFileSync(CACHE_PATH, JSON.stringify(cache));
}
const GOOGLE_ID = /^ChIJ[0-9A-Za-z_-]{10,}$/;

/** Returns details, or { invalid } when Google does not know the id. */
async function placeDetails(googlePlaceId) {
  if (cache[googlePlaceId]) return { ...cache[googlePlaceId], cached: true };
  if (!GOOGLE_ID.test(googlePlaceId)) return { invalid: 'Google kimliği biçimi geçersiz' };
  const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(googlePlaceId)}`, {
    headers: {
      'X-Goog-Api-Key': googleKey,
      'X-Goog-FieldMask': 'primaryType,types,businessStatus',
    },
  });
  if (res.status === 404) {
    cache[googlePlaceId] = { primaryType: null, types: [], businessStatus: 'CLOSED_PERMANENTLY' };
  } else if (res.status === 400) {
    return { invalid: 'Google bu kimliği tanımıyor (400)' };
  } else if (!res.ok) {
    saveCache();
    throw new Error(`Place Details ${res.status}: ${(await res.text()).slice(0, 200)}`);
  } else {
    const body = await res.json();
    cache[googlePlaceId] = { primaryType: body.primaryType ?? null, types: body.types ?? [], businessStatus: body.businessStatus ?? null };
  }
  if (Object.keys(cache).length % 25 === 0) saveCache();
  return cache[googlePlaceId];
}

function readRowsFile(path) {
  const text = readFileSync(resolve(process.cwd(), path), 'utf8');
  const parsed = JSON.parse(text.slice(text.indexOf('{')));
  const list = parsed.rows ?? parsed;
  return CITY ? list.filter((row) => row.city_slug === CITY) : list;
}
const rows = ROWS_FILE ? readRowsFile(ROWS_FILE) : await fetchGooglePlaces();
console.log(`${rows.length} Google mekânı okundu${CITY ? ` (${CITY})` : ''}`);
const before = rows.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {});
console.log('Şu anki durum:', Object.entries(before).map(([k, v]) => `${k} ${v}`).join(' · '));
if (ESTIMATE) {
  console.log('\n!! TAHMİN MODU: Google sütunları henüz yok (migration uygulanmadı).');
  console.log('   Tip, kayıtlı kategoriden çıkarılıyor: Cowork → coworking_space, Cafe → cafe.');
  console.log('   Gerçek coffee_shop olan bir kafe burada düz "cafe" sayılır; pending sayısı ÜST SINIRDIR.');
}

const plan = [];
let detailsRequests = 0;
let cacheHits = 0;
const unknown = [];
const invalid = [];
for (const row of rows) {
  let types = row.google_types ?? [];
  let primaryType = row.google_primary_type ?? null;
  let businessStatus = row.business_status ?? null;
  if (ESTIMATE) types = row.category === 'Cowork' ? ['coworking_space'] : row.category === 'Cafe' ? ['cafe'] : [];
  const hasTypes = ESTIMATE || types.length > 0 || !!primaryType;
  if (!hasTypes && FETCH_DETAILS && row.google_place_id) {
    const details = await placeDetails(row.google_place_id);
    if (details.invalid) {
      invalid.push({ ...row, reason: details.invalid });
      continue;
    }
    if (details.cached) cacheHits += 1;
    else {
      detailsRequests += 1;
      await new Promise((r) => setTimeout(r, 60));
    }
    types = details.types ?? [];
    primaryType = details.primaryType ?? null;
    businessStatus = details.businessStatus ?? null;
  } else if (!hasTypes) {
    unknown.push(row);
    continue;
  }
  const decision = classifyGooglePlace({ name: row.name, primaryType, types, businessStatus });
  // One-off cleanup: old name-based approvals are re-earned under the new rules.
  const status = reconcileStatus(row.status, decision, { strict: true });
  // Never demote an existing Cowork while Google still lists it as a coworking space:
  // Google often makes `cafe` the primary type of coworks that serve coffee.
  const keepCowork = row.category === 'Cowork' && (types.includes('coworking_space') || primaryType === 'coworking_space');
  const category = decision.keep && !keepCowork ? decision.category : row.category;
  const changed = status !== row.status || category !== row.category || (!ESTIMATE && !row.google_types?.length && !row.google_primary_type);
  if (changed) {
    plan.push({ id: row.id, name: row.name, city: row.city, from: row.status, to: status, category, reason: decision.reason,
      patch: { status, category, google_primary_type: primaryType, google_types: types, business_status: businessStatus } });
  }
}

const toPending = plan.filter((p) => p.to === 'pending' && p.from !== 'pending');
const toRejected = plan.filter((p) => p.to === 'rejected' && p.from !== 'rejected');
const reasons = toPending.reduce((acc, p) => ({ ...acc, [p.reason]: (acc[p.reason] ?? 0) + 1 }), {});
const metadataOnly = plan.filter((p) => p.to === p.from);
console.log(`\nPlan: ${plan.length} satır değişecek`);
// Every status transition, so queue → approved/rejected moves show up too.
const transitions = plan.filter((p) => p.from !== p.to)
  .reduce((acc, p) => ({ ...acc, [`${p.from} → ${p.to}`]: (acc[`${p.from} → ${p.to}`] ?? 0) + 1 }), {});
for (const [move, count] of Object.entries(transitions).sort((a, b) => b[1] - a[1])) console.log(`  ${move}: ${count}`);
console.log(`  kategori/metadata güncellemesi (durum aynı): ${metadataOnly.length}`);
console.log(`  tip bilgisi olmayan (dokunulmadı): ${unknown.length}`);
if (FETCH_DETAILS) {
  saveCache();
  console.log(`  Place Details isteği: ${detailsRequests} (önbellekten: ${cacheHits})`);
  console.log(`  geçersiz Google kimliği (dokunulmadı): ${invalid.length}`);
  for (const r of invalid) console.log(`    - ${r.name} · ${r.google_place_id} · ${r.reason}`);
}
if (toPending.length) {
  console.log('\nSebeplere göre:');
  for (const [reason, count] of Object.entries(reasons).sort((a, b) => b[1] - a[1])) console.log(`  ${count} · ${reason}`);
  const byCity = toPending.reduce((acc, p) => ({ ...acc, [p.city]: (acc[p.city] ?? 0) + 1 }), {});
  console.log('Şehirlere göre:', Object.entries(byCity).map(([k, v]) => `${k} ${v}`).join(' · '));
  console.log(`\nPending'e düşecek ilk ${Math.min(SAMPLE, toPending.length)}:`);
  for (const p of toPending.slice(0, SAMPLE)) console.log(`  - ${p.name} (${p.city}) · ${p.reason}`);
}
if (toRejected.length) {
  console.log(`\nRejected olacaklar (${toRejected.length}):`);
  for (const p of toRejected) console.log(`  - ${p.name} (${p.city}) · ${p.reason}`);
}
if (unknown.length && !FETCH_DETAILS) {
  console.log(`\n${unknown.length} mekânın Google tipi kayıtlı değil. --fetch-details ile ${unknown.length} Place Details isteği gerekir. İlk ${Math.min(SAMPLE, unknown.length)}:`);
  for (const r of unknown.slice(0, SAMPLE)) console.log(`  - ${r.name} (${r.city}) · şu an ${r.status}`);
}

if (EMIT_SQL) {
  const lit = (value) => value == null ? 'null' : `'${String(value).replace(/'/g, "''")}'`;
  const arr = (list) => `array[${(list ?? []).map(lit).join(',')}]::text[]`;
  const lines = [
    `-- reclassify-places ${new Date().toISOString()} · ${plan.length} satır`,
    `-- approved→pending ${toPending.length} · approved→rejected ${toRejected.length} · yalnızca metadata ${metadataOnly.length}`,
    '-- Her UPDATE, satırın durumu dry-run sırasındakiyle aynıysa uygulanır.',
    'begin;',
    ...plan.map((item) => `update public.places set status = ${lit(item.patch.status)}, category = ${lit(item.patch.category)}, `
      + `google_primary_type = ${lit(item.patch.google_primary_type)}, google_types = ${arr(item.patch.google_types)}, `
      + `business_status = ${lit(item.patch.business_status)} where id = ${lit(item.id)} and status = ${lit(item.from)};`),
    'commit;',
    '',
  ];
  writeFileSync(resolve(process.cwd(), EMIT_SQL), lines.join('\n'));
  console.log(`\nSQL yazıldı: ${EMIT_SQL} (${plan.length} UPDATE, tek transaction). Veritabanına hiçbir şey yazılmadı.`);
  process.exit(0);
}

if (!APPLY) {
  console.log('\nDry run: hiçbir şey yazılmadı. Uygulamak için --apply ekle.');
  process.exit(0);
}

let written = 0;
for (const item of plan) {
  const { error } = await supabase.from('places').update(item.patch).eq('id', item.id);
  if (error) {
    console.error(`UPDATE FAIL (${item.name}):`, error.message);
    process.exit(1);
  }
  written += 1;
}
console.log(`\n${written} satır güncellendi. OK`);
