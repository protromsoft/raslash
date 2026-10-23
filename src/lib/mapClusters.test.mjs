import assert from 'node:assert/strict';
import test from 'node:test';
import { clusterPoints, clusterPinOffsets, clusterArtworkCoordinate, mapItemCoordinate } from './mapClusters.ts';

// 0.2° of longitude across a 390pt map at 41°N: the 64pt radius is ~0.033° of
// longitude and ~0.025° of latitude.
const cityView = { longitudeDelta: 0.2, width: 390, latitude: 41 };
const streetView = { longitudeDelta: 0.002, width: 390, latitude: 41 };
const p = (id, latitude, longitude) => ({ id, latitude, longitude });

test('overlapping pins merge into one cluster with a count and a framing region', () => {
  const items = clusterPoints([p('a', 41.0001, 29.0001), p('b', 41.0002, 29.0002), p('c', 41.0003, 29.0003)], cityView);
  assert.equal(items.length, 1);
  const [item] = items;
  assert.equal(item.kind, 'cluster');
  assert.equal(item.cluster.members.length, 3);
  assert.ok(Math.abs(item.cluster.latitude - 41.0002) < 1e-9);
  assert.ok(item.cluster.bounds.latitudeDelta >= 0.004, 'tap never zooms past street level');
  assert.deepEqual(mapItemCoordinate(item), item.cluster);
});

test('distant pins and a zoomed-in map stay individual', () => {
  const far = clusterPoints([p('a', 41, 29), p('b', 41.1, 29.1)], cityView);
  assert.deepEqual(far.map((i) => i.kind), ['point', 'point']);
  const close = [p('a', 41.0001, 29.0001), p('b', 41.0006, 29.0006)];
  assert.equal(clusterPoints(close, cityView).length, 1);
  assert.deepEqual(clusterPoints(close, streetView).map((i) => i.kind), ['point', 'point']);
});

test('selected / active places are never hidden inside a cluster', () => {
  const items = clusterPoints([p('a', 41.0001, 29.0001), p('b', 41.0002, 29.0002), p('c', 41.0003, 29.0003)],
    cityView, new Set(['b']));
  const points = items.filter((i) => i.kind === 'point').map((i) => i.point.id);
  assert.deepEqual(points, ['b']);
  assert.equal(items.find((i) => i.kind === 'cluster').cluster.members.length, 2);
});

test('cluster ids are independent of input order; no viewport means no clustering', () => {
  const pts = [p('a', 41.0001, 29.0001), p('b', 41.0002, 29.0002)];
  assert.equal(clusterPoints(pts, cityView)[0].cluster.id, clusterPoints([...pts].reverse(), cityView)[0].cluster.id);
  assert.equal(clusterPoints(pts, null).length, 2);
  assert.equal(clusterPoints(pts, { ...cityView, width: 0 }).length, 2);
});

test('pins on either side of where a grid edge would be still merge', () => {
  // 0.0001° apart but straddling a multiple of any plausible cell size.
  const items = clusterPoints([p('a', 40.99995, 28.99995), p('b', 41.00005, 29.00005)], cityView);
  assert.equal(items.length, 1);
});

test('no two resulting pins end up closer than the radius', () => {
  // Seed 'a' takes 'b' (just inside the radius) but not 'c'; the {a,b} pin then sits
  // on its centroid, right next to 'c'. Without the merge pass the two pins touch.
  const pts = [p('a', 41.0, 29.0), p('b', 41.024, 29.0), p('c', 41.0255, 29.0)];
  const items = clusterPoints(pts, cityView).map(mapItemCoordinate);
  assert.equal(items.length, 1);
  const lngR = cityView.longitudeDelta * 64 / cityView.width, latR = lngR * Math.cos(41 * Math.PI / 180);
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    assert.ok(!(Math.abs(items[i].latitude - items[j].latitude) < latR && Math.abs(items[i].longitude - items[j].longitude) < lngR));
  }
});

test('vertical radius follows the horizontal scale, not the padded latitude span', () => {
  // 0.02° of latitude ≈ 50pt here: inside the radius, so the pins merge.
  assert.equal(clusterPoints([p('a', 41.0, 29.0), p('b', 41.02, 29.0)], cityView).length, 1);
  assert.equal(clusterPoints([p('a', 41.0, 29.0), p('b', 41.04, 29.0)], cityView).length, 2);
});

test('cluster artwork clears a selected pin without changing coordinates or zoom bounds', () => {
  const pts = [p('selected', 41, 29), p('a', 41, 29), p('b', 41, 29)];
  const protectedIds = new Set(['selected']);
  const items = clusterPoints(pts, cityView, protectedIds);
  const snapshot = JSON.stringify(items);
  const offsets = clusterPinOffsets(items, cityView, protectedIds);
  const cluster = items.find((item) => item.kind === 'cluster').cluster;
  const offset = offsets.get(cluster.id);
  assert.ok(Math.hypot(offset.x, offset.y) >= 56);
  assert.ok(Math.hypot(offset.x, offset.y) <= 73, 'bounded native bitmap artwork');
  assert.equal(JSON.stringify(items), snapshot, 'never jitter venue or member locations');
  const artwork = clusterArtworkCoordinate(cluster, cityView, offset);
  assert.ok(Math.abs(artwork.longitude - cluster.longitude) > 0 || Math.abs(artwork.latitude - cluster.latitude) > 0);
  assert.equal(cluster.latitude, 41);
  assert.equal(cluster.longitude, 29);
  assert.deepEqual(clusterArtworkCoordinate(cluster, null, offset), { latitude: 41, longitude: 29 });
  assert.deepEqual(clusterPinOffsets(clusterPoints([...pts].reverse(), cityView, protectedIds), cityView, protectedIds), offsets);
});

test('normal clusters stay centred; missing/invalid camera measurements never produce offsets', () => {
  const protectedIds = new Set(['selected']);
  const items = clusterPoints([p('selected', 42, 30), p('a', 41, 29), p('b', 41, 29)], cityView, protectedIds);
  assert.equal(clusterPinOffsets(items, cityView, protectedIds).size, 0);
  for (const viewport of [null, { ...cityView, width: Infinity }, { ...cityView, longitudeDelta: NaN }, { ...cityView, latitude: 90 }]) {
    assert.equal(clusterPinOffsets(items, viewport, protectedIds).size, 0);
    assert.equal(clusterPoints([p('a', 41, 29), p('b', 41, 29)], viewport).length, 2);
  }
});

test('people clusters retain every member and keep the selected venue separately tappable', () => {
  const groups = [
    { ...p('selected', 41, 29), people: [{ id: 'owner' }] },
    { ...p('a', 41, 29), people: [{ id: '1' }, { id: '2' }] },
    { ...p('b', 41, 29), people: [{ id: '3' }] },
  ];
  const items = clusterPoints(groups, cityView, new Set(['selected']), 82);
  assert.equal(items.find((item) => item.kind === 'point').point.id, 'selected');
  const cluster = items.find((item) => item.kind === 'cluster').cluster;
  assert.equal(cluster.members.reduce((sum, group) => sum + group.people.length, 0), 3);
  const offset = clusterPinOffsets(items, cityView, new Set(['selected']), 72).get(cluster.id);
  assert.ok(Math.hypot(offset.x, offset.y) >= 72);
});

test('zoomed in to a neighbourhood nothing clusters; overlapping venues fan out around their centre', async () => {
  const { spreadOverlappingPoints, NO_CLUSTER_LNG_DELTA } = await import('./mapClusters.ts');
  const near = { longitudeDelta: NO_CLUSTER_LNG_DELTA, width: 390, latitude: 41 };
  // Same building: identical coordinates used to stay a "2" bubble at every zoom.
  const same = [p('a', 41.01, 29.01), p('b', 41.01, 29.01), p('c', 41.02, 29.03)];
  assert.deepEqual(clusterPoints(same, near).map((i) => i.kind), ['point', 'point', 'point']);
  const spread = spreadOverlappingPoints(same, near);
  assert.deepEqual([...spread.keys()].sort(), ['a', 'b'], 'a pin with room keeps its own position');
  const lngPerPt = near.longitudeDelta / near.width, latPerPt = lngPerPt * Math.cos(41 * Math.PI / 180);
  const a = spread.get('a'), b = spread.get('b');
  const gap = Math.hypot((a.longitude - b.longitude) / lngPerPt, (a.latitude - b.latitude) / latPerPt);
  assert.ok(gap >= 45, `fanned pins are a tap apart (${gap.toFixed(1)}pt)`);
  // Centred on the real location.
  assert.ok(Math.abs((a.latitude + b.latitude) / 2 - 41.01) < 1e-9 && Math.abs((a.longitude + b.longitude) / 2 - 29.01) < 1e-9);
  assert.equal(spreadOverlappingPoints(same, null).size, 0);
});

test('tapping a cluster zooms in past the no-cluster level', async () => {
  const { NO_CLUSTER_LNG_DELTA } = await import('./mapClusters.ts');
  const [item] = clusterPoints([p('a', 41.0, 29.0), p('b', 41.01, 29.01)], cityView);
  assert.equal(item.kind, 'cluster');
  assert.ok(item.cluster.bounds.longitudeDelta < NO_CLUSTER_LNG_DELTA);
});
