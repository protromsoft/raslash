/**
 * Smoke-test Places sync without printing the API key.
 * Usage: node scripts/sync-places-smoke.mjs
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(root, '.env');

function loadEnv() {
  const raw = readFileSync(envPath, 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    const key = m[1].trim();
    const val = m[2].trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnv();

const apiKey = process.env.GOOGLE_PLACES_API_KEY ?? '';
if (apiKey.length < 20) {
  console.error('FAIL: GOOGLE_PLACES_API_KEY missing in .env');
  process.exit(1);
}
console.log('KEY_PRESENT');

const body = {
  includedTypes: ['cafe'],
  maxResultCount: 5,
  languageCode: 'tr',
  regionCode: 'TR',
  locationRestriction: {
    circle: {
      center: { latitude: 41.0246, longitude: 28.977 },
      radius: 2000.0,
    },
  },
};

const res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Goog-Api-Key': apiKey,
    'X-Goog-FieldMask': 'places.id,places.displayName,places.location,places.types',
  },
  body: JSON.stringify(body),
});

const text = await res.text();
if (!res.ok) {
  console.error('FAIL status', res.status);
  console.error(text.slice(0, 300));
  process.exit(1);
}

const json = JSON.parse(text);
const count = json.places?.length ?? 0;
const names = (json.places ?? []).map((p) => p.displayName?.text).filter(Boolean);
console.log('OK places=', count);
console.log('sample=', names.slice(0, 3).join(' | ') || '(none)');
