import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { classifyGooglePlace, reconcileStatus } from './placeFilter.ts';
import { SCAN_CITIES, SCAN_SPACING_KM, allScanPoints, scanPointsFor } from './placeScanGrid.ts';

const root = resolve(import.meta.dirname, '../..');

test('names never admit a place: an office without a Google type is dropped', () => {
  const decision = classifyGooglePlace({ name: 'X İnşaat Ofis', types: [], businessStatus: 'OPERATIONAL' });
  assert.equal(decision.keep, false);
  // Even with a generic type the office words do not help.
  assert.equal(classifyGooglePlace({ name: 'Remote Studio Office', types: ['point_of_interest'] }).keep, false);
});

test('coworking_space without a cowork name waits for an admin', () => {
  const decision = classifyGooglePlace({ name: 'Petra Market', types: ['coworking_space'], businessStatus: 'OPERATIONAL' });
  assert.deepEqual([decision.keep, decision.category, decision.status], [true, 'Cowork', 'pending']);
  const named = classifyGooglePlace({ name: 'Kolektif House Coworking', primaryType: 'coworking_space' });
  assert.deepEqual([named.keep, named.category, named.status], [true, 'Cowork', 'approved']);
});

test('a coffee shop with a coffee name is approved as Cafe', () => {
  const decision = classifyGooglePlace({ name: 'Kronotrop', primaryType: 'coffee_shop', types: ['coffee_shop', 'cafe'] });
  assert.deepEqual([decision.keep, decision.category, decision.status], [true, 'Cafe', 'approved']);
  const unsure = classifyGooglePlace({ name: 'Kennedy 41', types: ['coffee_shop'] });
  assert.deepEqual([unsure.keep, unsure.status], [true, 'pending']);
});

test('tea gardens and closed places are rejected whatever their type', () => {
  assert.equal(classifyGooglePlace({ name: 'Çay Bahçesi', types: ['cafe'] }).keep, false);
  assert.equal(classifyGooglePlace({ name: 'Sahil Çay Bahçesi', primaryType: 'coffee_shop' }).keep, false);
  assert.equal(classifyGooglePlace({ name: 'Kronotrop', primaryType: 'coffee_shop', businessStatus: 'CLOSED_PERMANENTLY' }).keep, false);
  // A plain `cafe` needs a coffee word; "Pastane" alone is not enough.
  assert.equal(classifyGooglePlace({ name: 'Güllüoğlu Pastanesi', types: ['cafe'] }).keep, false);
});

test('a plain cafe: strong coffee words approve, the bare word "cafe" waits for review', () => {
  for (const name of ['Aşşk Kahve', 'Espresso Lab', 'Arabica Coffee House']) {
    const d = classifyGooglePlace({ name, primaryType: 'cafe' });
    assert.deepEqual([d.keep, d.category, d.status], [true, 'Cafe', 'approved'], name);
  }
  for (const name of ['All Sports Cafe', 'Balkon Cafe & Restaurant', 'Mavi Kafe']) {
    const d = classifyGooglePlace({ name, primaryType: 'cafe' });
    assert.deepEqual([d.keep, d.status], [true, 'pending'], name);
  }
});

test('a coworking space Google files under cafe keeps the Cowork category when its name says so', () => {
  const gris = classifyGooglePlace({ name: 'Gris Collective - Studio/Coffee/Workspace', primaryType: 'cafe',
    types: ['cafe', 'coffee_shop', 'coworking_space'] });
  assert.deepEqual([gris.keep, gris.category, gris.status], [true, 'Cowork', 'approved']);
  const plain = classifyGooglePlace({ name: 'Kronotrop', primaryType: 'coffee_shop', types: ['coffee_shop', 'coworking_space'] });
  assert.equal(plain.category, 'Cafe');
});

test('permanently closed places are rejected, temporarily closed ones go to review', () => {
  const gone = classifyGooglePlace({ name: 'Kronotrop', primaryType: 'coffee_shop', businessStatus: 'CLOSED_PERMANENTLY' });
  assert.equal(gone.keep, false);
  assert.equal(reconcileStatus('approved', gone, { strict: true }), 'rejected');
  assert.equal(reconcileStatus('approved', gone), 'rejected');
  const paused = classifyGooglePlace({ name: 'Kronotrop', primaryType: 'coffee_shop', businessStatus: 'CLOSED_TEMPORARILY' });
  assert.equal(reconcileStatus('approved', paused, { strict: true }), 'pending');
});

test('existing approvals survive, rejections stick, dropped places fall back to pending', () => {
  const keep = classifyGooglePlace({ name: 'Kronotrop', primaryType: 'coffee_shop' });
  const drop = classifyGooglePlace({ name: 'X İnşaat Ofis', types: [] });
  assert.equal(reconcileStatus('approved', keep), 'approved');
  assert.equal(reconcileStatus('approved', drop), 'pending', 'no Google type: back to review');
  assert.equal(reconcileStatus('rejected', keep), 'rejected');
  assert.equal(reconcileStatus(null, keep), 'approved');
  assert.equal(reconcileStatus('pending', { keep: true, category: 'Cowork', status: 'pending', reason: '' }), 'pending');
  // The one-off cleanup is strict: an old auto-approval the new rules would not give is undone.
  const petra = classifyGooglePlace({ name: 'Petra Market', types: ['coworking_space'] });
  assert.equal(reconcileStatus('approved', petra), 'approved', 'routine sync keeps admin approvals');
  assert.equal(reconcileStatus('approved', petra, { strict: true }), 'pending');
  assert.equal(reconcileStatus('approved', keep, { strict: true }), 'approved');
  assert.equal(reconcileStatus('rejected', keep, { strict: true }), 'rejected');
});

test('the Deno copies of the shared rules match their sources', () => {
  execFileSync(process.execPath, [resolve(root, 'scripts/sync-place-filter.cjs'), '--check'], { stdio: 'pipe' });
  for (const name of ['placeFilter.ts', 'placeScanGrid.ts']) {
    const copy = readFileSync(resolve(root, 'supabase/functions/_shared', name), 'utf8');
    assert.ok(copy.startsWith('// GENERATED FROM src/lib/' + name));
    assert.ok(copy.endsWith(readFileSync(resolve(root, 'src/lib', name), 'utf8')));
  }
});

test('scan lattice covers each city circle at 2.5 km spacing and nothing outside it', () => {
  const haversineKm = (a, b) => {
    const toRad = (v) => (v * Math.PI) / 180;
    const dLat = toRad(b.latitude - a.latitude), dLng = toRad(b.longitude - a.longitude);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(h));
  };
  for (const city of SCAN_CITIES) {
    const points = scanPointsFor(city);
    assert.ok(points.some((p) => Math.abs(p.latitude - city.latitude) < 1e-4 && Math.abs(p.longitude - city.longitude) < 1e-4), 'centre included');
    for (const p of points) assert.ok(haversineKm(p, city) <= city.radiusKm + 0.1, `${city.city} point inside radius`);
    // Expected count is close to the circle's area over the cell area.
    const expected = (Math.PI * city.radiusKm ** 2) / SCAN_SPACING_KM ** 2;
    assert.ok(Math.abs(points.length - expected) / expected < 0.08, `${city.city}: ${points.length} vs ${expected.toFixed(0)}`);
    // Neighbours are one cell apart in both directions.
    const first = points[0];
    const neighbour = points.find((p) => Math.abs(haversineKm(p, first) - SCAN_SPACING_KM) < 0.05);
    assert.ok(neighbour, 'has a neighbour at exactly one spacing');
  }
  // The old 5-point grid never reached İncek (≈15 km from Kızılay); the 18 km circle does.
  const ankara = SCAN_CITIES.find((c) => c.city === 'Ankara');
  assert.ok(scanPointsFor(ankara).some((p) => haversineKm(p, { latitude: 39.852, longitude: 32.715 }) < 1.8), 'İncek covered');
  assert.equal(allScanPoints().length, SCAN_CITIES.reduce((sum, c) => sum + scanPointsFor(c).length, 0));
});

test('the Google fields admins review by survive the place cache sanitizer', async () => {
  const { sanitizePlaces } = await import('./placeData.ts');
  const [fromDb, fromCache] = sanitizePlaces([
    { id: 'a', name: 'Kronotrop', latitude: 41, longitude: 29, status: 'pending', source: 'google',
      google_primary_type: 'coffee_shop', google_types: ['coffee_shop', 'cafe', 7], business_status: 'OPERATIONAL' },
    { id: 'b', name: 'Eski kayıt', latitude: 41, longitude: 29, status: 'approved', source: 'google' },
  ]);
  assert.equal(fromDb.googlePrimaryType, 'coffee_shop');
  assert.deepEqual(fromDb.googleTypes, ['coffee_shop', 'cafe']);
  assert.equal(fromDb.businessStatus, 'OPERATIONAL');
  assert.equal(fromCache.googleTypes, undefined);
});

test('companies and non-cafe businesses are rejected, known chains are approved', () => {
  const reject = (input) => {
    const d = classifyGooglePlace(input);
    assert.equal(d.keep, false, input.name);
    assert.equal(reconcileStatus('pending', d, { strict: true }), 'rejected', input.name);
  };
  reject({ name: 'Nds Mühendislik Mimarlık ve İnşaat ltd. Şti.', primaryType: 'consultant', types: ['coworking_space'] });
  reject({ name: 'Beyaz Tahta A.Ş', primaryType: 'coworking_space' });
  reject({ name: 'Develi elektrik', primaryType: 'coworking_space' });
  reject({ name: 'Onur OTO YIKAMA (AUTO CLİNİC)', primaryType: 'car_wash', types: ['cafe'] });
  reject({ name: 'Georges Hotel Galata', primaryType: 'hotel', types: ['cafe'] });
  reject({ name: 'Republique Tunalı', primaryType: 'cocktail_bar', types: ['cafe'] });
  reject({ name: 'Onikiler Camii Ve Çay Ocağı', primaryType: 'mosque', types: ['cafe'] });
  // A restaurant that clearly says coffee waits for a human instead.
  const proof = classifyGooglePlace({ name: 'Proof Breakfast & Coffee Bostanlı', primaryType: 'breakfast_restaurant', types: ['cafe'] });
  assert.deepEqual([proof.keep, proof.status], [true, 'pending']);

  const approve = (input, category) => {
    const d = classifyGooglePlace(input);
    assert.deepEqual([d.keep, d.status, d.category], [true, 'approved', category], input.name);
  };
  approve({ name: 'Workinton Levent 199', primaryType: 'coworking_space' }, 'Cowork');
  approve({ name: 'Regus - Istanbul, Levent 193', primaryType: 'coworking_space' }, 'Cowork');
  approve({ name: 'HAN Spaces Piyalepaşa', primaryType: 'coworking_space' }, 'Cowork');
  approve({ name: 'Caffè Nero', primaryType: 'coffee_shop' }, 'Cafe');
  approve({ name: 'Kızılay Coffy', primaryType: 'coffee_shop' }, 'Cafe');
  approve({ name: 'Petra Roasting Co. Bebek', primaryType: 'cafe' }, 'Cafe');
  // A coworking chain Google files under real estate still counts.
  approve({ name: 'Workinton Sapphire', primaryType: 'real_estate_agency', types: ['coworking_space'] }, 'Cowork');
});

test('coffee chains approve cafe-typed places but never admit anything on their own', () => {
  for (const name of ['Federal Bilkent', 'Petra Topağacı', 'MOC Bomonti', 'Kronotrop', 'Mandabatmaz']) {
    const d = classifyGooglePlace({ name, primaryType: 'coffee_shop' });
    assert.deepEqual([d.keep, d.status], [true, 'approved'], name);
  }
  assert.equal(classifyGooglePlace({ name: 'Federal Lojistik', types: [] }).keep, false);
  assert.equal(classifyGooglePlace({ name: 'Petra Market', types: ['coworking_space'] }).status, 'pending');
});
