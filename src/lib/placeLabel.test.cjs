const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');

function load(file, mocks = {}) {
  const filename = path.resolve(__dirname, '../..', file);
  const code = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(code, { exports: mod.exports, require: name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    throw new Error(`Unmocked ${name}`);
  } }, { filename });
  return mod.exports;
}

const neighbourhoods = load('src/data/neighbourhoods.ts');
const presence = { haversineKm: (a, b) => {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
} };
const { districtForPlace, brandBase } = load('src/lib/placeLabel.ts', {
  '@/data/neighbourhoods': neighbourhoods,
  '@/lib/presence': presence,
});

test('an Üsküdar café is not labelled with Beşiktaş across the water', () => {
  // The reported case: name says Üsküdar mid-string, coordinates on the Asian side.
  assert.equal(districtForPlace({ name: 'Â La Lune Patisserie – Üsküdar (Kruvasan & Kahve)', latitude: 41.0235, longitude: 29.0153 }), 'Üsküdar');
  assert.equal(districtForPlace({ name: 'Adsız Kahve', latitude: 41.0240, longitude: 29.0160 }), 'Üsküdar');
});

test('Ankara places get Ankara neighbourhoods', () => {
  assert.equal(districtForPlace({ name: 'Luuq Coffee Çukurambar', latitude: 39.9105, longitude: 32.8075 }), 'Çukurambar');
  assert.equal(districtForPlace({ name: 'Bir Kafe', latitude: 39.9070, longitude: 32.8612 }), 'Tunalı');
});

test('a district word in the name only counts near that district', () => {
  // "Kartal" is an İstanbul district; a café of that name in Ankara is labelled by location.
  assert.equal(districtForPlace({ name: 'Kartal Yuvası Kafe', latitude: 39.9208, longitude: 32.8541 }), 'Kızılay');
  // Part of a longer word is not a match.
  assert.equal(districtForPlace({ name: 'Bebekler Kafe', latitude: 41.0230, longitude: 28.9772 }), 'Karaköy');
});

test('far from every neighbourhood there is no label', () => {
  assert.equal(districtForPlace({ name: 'Yol Üstü Kafe', latitude: 40.5, longitude: 30.5 }), '');
});

test('chain names still lose a trailing district', () => {
  assert.equal(brandBase('Starbucks Üsküdar'), 'Starbucks');
  assert.equal(brandBase('Kronotrop | Cihangir'), 'Kronotrop');
});
