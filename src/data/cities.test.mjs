import assert from 'node:assert/strict';
import test from 'node:test';
import { nearestSupportedCityKey } from './cities.ts';

test('selects Ankara when the device is in central Ankara', () => {
  assert.equal(
    nearestSupportedCityKey({ latitude: 39.9208, longitude: 32.8541 }),
    'ankara',
  );
});

test('selects each supported city for nearby device coordinates', () => {
  assert.equal(
    nearestSupportedCityKey({ latitude: 41.0256, longitude: 28.9744 }),
    'istanbul',
  );
  assert.equal(
    nearestSupportedCityKey({ latitude: 38.437, longitude: 27.143 }),
    'izmir',
  );
});

test('returns null for invalid device coordinates', () => {
  assert.equal(nearestSupportedCityKey({ latitude: Number.NaN, longitude: 32.85 }), null);
  assert.equal(nearestSupportedCityKey({ latitude: 91, longitude: 32.85 }), null);
  assert.equal(nearestSupportedCityKey({ latitude: 39.93, longitude: 181 }), null);
});
