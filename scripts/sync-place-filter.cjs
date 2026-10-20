#!/usr/bin/env node
/**
 * Copies the shared place rules into the Deno edge function tree.
 *
 *   node scripts/sync-place-filter.cjs          # write the copies
 *   node scripts/sync-place-filter.cjs --check  # exit 1 if a copy is stale
 *
 * The sources under src/lib are the only place to edit these rules; the
 * copies carry a header saying so. src/lib/placeFilter.test.mjs runs --check.
 */
const { readFileSync, writeFileSync, mkdirSync, existsSync } = require('node:fs');
const { resolve, dirname } = require('node:path');

const root = resolve(__dirname, '..');
const SHARED = ['placeFilter.ts', 'placeScanGrid.ts'];
const HEADER = (name) =>
  `// GENERATED FROM src/lib/${name} by scripts/sync-place-filter.cjs. Do not edit here.\n`;

function generated(name) {
  return HEADER(name) + readFileSync(resolve(root, 'src/lib', name), 'utf8');
}

function targetPath(name) {
  return resolve(root, 'supabase/functions/_shared', name);
}

const check = process.argv.includes('--check');
let stale = 0;
for (const name of SHARED) {
  const expected = generated(name);
  const target = targetPath(name);
  const current = existsSync(target) ? readFileSync(target, 'utf8') : null;
  if (current === expected) continue;
  stale += 1;
  if (check) {
    console.error(`STALE: supabase/functions/_shared/${name} differs from src/lib/${name}`);
  } else {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, expected);
    console.log(`wrote supabase/functions/_shared/${name}`);
  }
}
if (check && stale) {
  console.error('Run: node scripts/sync-place-filter.cjs');
  process.exit(1);
}
if (!check && !stale) console.log('shared place rules already up to date');
