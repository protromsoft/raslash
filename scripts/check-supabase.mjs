/**
 * Validates Supabase env without printing secrets.
 * Usage: node scripts/check-supabase.mjs
 */
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    out[m[1].trim()] = m[2].trim();
  }
  return out;
}

const mobile = loadEnv(resolve(root, '.env'));
const admin = loadEnv(resolve(root, 'admin-web/.env'));

const url = mobile.EXPO_PUBLIC_SUPABASE_URL || admin.VITE_SUPABASE_URL || '';
const key = mobile.EXPO_PUBLIC_SUPABASE_ANON_KEY || admin.VITE_SUPABASE_ANON_KEY || '';

console.log('mobile URL', mobile.EXPO_PUBLIC_SUPABASE_URL ? 'SET' : 'EMPTY');
console.log('mobile ANON', mobile.EXPO_PUBLIC_SUPABASE_ANON_KEY ? 'SET' : 'EMPTY');
console.log('admin URL', admin.VITE_SUPABASE_URL ? 'SET' : 'EMPTY');
console.log('admin ANON', admin.VITE_SUPABASE_ANON_KEY ? 'SET' : 'EMPTY');

if (!url || !key) {
  console.log('\nNEXT: put URL + anon key into both .env files, then re-run.');
  process.exit(1);
}

const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/places?select=id&limit=1`, {
  headers: {
    apikey: key,
    Authorization: `Bearer ${key}`,
  },
});

console.log('\nREST places status:', res.status);
if (res.status === 200) console.log('OK — schema reachable (or empty table).');
else if (res.status === 404) console.log('Project OK but places table missing — run supabase/schema.sql');
else {
  const t = await res.text();
  console.log('Body:', t.slice(0, 200));
}
