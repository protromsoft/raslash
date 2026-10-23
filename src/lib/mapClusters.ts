/**
 * Dependency-free clustering for map pins. Points closer than
 * CLUSTER_RADIUS_POINTS on screen (at the current zoom) are merged. A greedy
 * radius pass is used instead of a fixed grid: with a grid, two pins on either
 * side of a cell edge stayed separate however close they were. Points are
 * visited in id order, so the result does not depend on list order or panning.
 */
export const CLUSTER_RADIUS_POINTS = 64;
/**
 * Zoomed in to about a neighbourhood (this many degrees of longitude across the
 * map, ~1 km), pins are never merged: two venues in the same building used to
 * stay a "2" bubble at every zoom. Overlaps there are fanned out instead (see
 * `spreadOverlappingPoints`). Tapping a cluster always zooms in past this.
 */
export const NO_CLUSTER_LNG_DELTA = 0.012;
/** Pins closer than this on screen are fanned out around their centre. */
export const SPREAD_GAP_POINTS = 46;

type Point = { id: string; latitude: number; longitude: number };
/**
 * Only the horizontal span is trusted: MapKit reports latitude bounds for the
 * padded area between the header and the panel, while left/right padding is 0.
 * Vertical scale is derived from it (Web Mercator: degrees of latitude per
 * point = degrees of longitude per point × cos(latitude)).
 */
export type MapViewport = { longitudeDelta: number; width: number; latitude: number };
export type MapCluster<T extends Point> = {
  id: string; latitude: number; longitude: number; members: T[];
  /** Region that frames every member, used to zoom in on tap. */
  bounds: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };
};
export type MapItem<T extends Point> = { kind: 'point'; point: T } | { kind: 'cluster'; cluster: MapCluster<T> };

function validViewport(viewport: MapViewport | null): viewport is MapViewport {
  return !!viewport && Number.isFinite(viewport.width) && viewport.width > 0
    && Number.isFinite(viewport.longitudeDelta) && viewport.longitudeDelta > 0
    && Number.isFinite(viewport.latitude) && Math.abs(viewport.latitude) < 90;
}

export function clusterPoints<T extends Point>(points: T[], viewport: MapViewport | null,
  keepSeparate: ReadonlySet<string> = new Set(), radiusPoints = CLUSTER_RADIUS_POINTS): MapItem<T>[] {
  if (!validViewport(viewport) || !Number.isFinite(radiusPoints) || radiusPoints <= 0
    || viewport.longitudeDelta <= NO_CLUSTER_LNG_DELTA) {
    return points.map((point) => ({ kind: 'point', point }));
  }
  const lngRadius = viewport.longitudeDelta * radiusPoints / viewport.width;
  const latRadius = lngRadius * Math.cos(viewport.latitude * Math.PI / 180);
  const items: MapItem<T>[] = [];
  const candidates: T[] = [];
  for (const point of points) {
    // The selected place and the active check-in always stay individually tappable.
    if (keepSeparate.has(point.id)) items.push({ kind: 'point', point });
    else candidates.push(point);
  }
  candidates.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const taken = new Set<string>();
  const groups: T[][] = [];
  for (const seed of candidates) {
    if (taken.has(seed.id)) continue;
    const group = candidates.filter((other) => !taken.has(other.id)
      && Math.abs(other.latitude - seed.latitude) < latRadius
      && Math.abs(other.longitude - seed.longitude) < lngRadius);
    for (const member of group) taken.add(member.id);
    groups.push(group);
  }
  // A group's pin sits on its centroid, which can drift next to a neighbour's.
  // Merge groups whose centroids are still within the radius until none are.
  const centre = (group: T[]) => ({
    latitude: group.reduce((sum, m) => sum + m.latitude, 0) / group.length,
    longitude: group.reduce((sum, m) => sum + m.longitude, 0) / group.length,
  });
  for (let merged = true; merged;) {
    merged = false;
    outer: for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const a = centre(groups[i]), b = centre(groups[j]);
        if (Math.abs(a.latitude - b.latitude) < latRadius && Math.abs(a.longitude - b.longitude) < lngRadius) {
          groups[i] = [...groups[i], ...groups[j]]; groups.splice(j, 1); merged = true; break outer;
        }
      }
    }
  }
  for (const members of groups) {
    if (members.length === 1) { items.push({ kind: 'point', point: members[0] }); continue; }
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity, sumLat = 0, sumLng = 0;
    for (const m of members) {
      minLat = Math.min(minLat, m.latitude); maxLat = Math.max(maxLat, m.latitude);
      minLng = Math.min(minLng, m.longitude); maxLng = Math.max(maxLng, m.longitude);
      sumLat += m.latitude; sumLng += m.longitude;
    }
    items.push({ kind: 'cluster', cluster: {
      // Members are sorted so the key is stable however the input was ordered.
      id: members.map((m) => m.id).sort().join(','),
      latitude: sumLat / members.length, longitude: sumLng / members.length, members,
      bounds: {
        latitude: (minLat + maxLat) / 2, longitude: (minLng + maxLng) / 2,
        // Never zoom in further than a street-level view, even for identical coordinates,
        // and always far enough that clustering stops and the members show.
        latitudeDelta: Math.min(NO_CLUSTER_LNG_DELTA * 0.8, Math.max(0.004, (maxLat - minLat) * 1.8)),
        longitudeDelta: Math.min(NO_CLUSTER_LNG_DELTA * 0.8, Math.max(0.004, (maxLng - minLng) * 1.8)),
      },
    } });
  }
  return items;
}

export function mapItemCoordinate<T extends Point>(item: MapItem<T>) {
  return item.kind === 'point' ? item.point : item.cluster;
}

/** Screen-space artwork offsets only. Venue coordinates, member positions and
 * tap-to-zoom bounds remain untouched. A leader links an offset bubble to its
 * original cluster centre, so this never invents a user's location. */
export function clusterPinOffsets<T extends Point>(items: MapItem<T>[], viewport: MapViewport | null,
  keepSeparate: ReadonlySet<string>, minimumClearance = 56): Map<string, { x: number; y: number }> {
  const offsets = new Map<string, { x: number; y: number }>();
  if (!validViewport(viewport)) return offsets;
  const protectedPoints = items.filter((item) => item.kind === 'point' && keepSeparate.has(item.point.id))
    .map(mapItemCoordinate);
  if (!protectedPoints.length) return offsets;
  const lngPerPoint = viewport.longitudeDelta / viewport.width;
  const latPerPoint = lngPerPoint * Math.cos(viewport.latitude * Math.PI / 180);
  const clusters = items.filter((item) => item.kind === 'cluster').map((item) => item.cluster);
  for (const cluster of clusters) {
    const obstacles = [...protectedPoints, ...clusters.filter((other) => other.id !== cluster.id)]
      .map((point) => ({ x: (point.longitude - cluster.longitude) / lngPerPoint,
        y: (cluster.latitude - point.latitude) / latPerPoint }));
    const clearance = (x: number, y: number) => Math.min(...obstacles.map((p) => Math.hypot(x - p.x, y - p.y)));
    if (protectedPoints.every((point) => Math.hypot((point.longitude - cluster.longitude) / lngPerPoint,
      (cluster.latitude - point.latitude) / latPerPoint) >= minimumClearance)) continue;
    let best = { x: 0, y: 0 }, score = clearance(0, 0);
    for (const radius of [minimumClearance, 72]) {
      for (let step = 0; step < 8; step++) {
        const angle = step * Math.PI / 4;
        const x = Math.round(Math.cos(angle) * radius), y = Math.round(Math.sin(angle) * radius);
        const next = clearance(x, y);
        if (next > score) { best = { x, y }; score = next; }
        if (score >= minimumClearance) break;
      }
      if (score >= minimumClearance) break;
    }
    offsets.set(cluster.id, best);
  }
  return offsets;
}

/** Only cluster artwork uses this coordinate, never a person's pin or check-in
 * distance. A leader connects the compact bubble to the original centre. */
export function clusterArtworkCoordinate(point: { latitude: number; longitude: number },
  viewport: MapViewport | null, offset: { x: number; y: number }) {
  if (!validViewport(viewport) || !Number.isFinite(offset.x) || !Number.isFinite(offset.y)) {
    return { latitude: point.latitude, longitude: point.longitude };
  }
  const lngPerPoint = viewport.longitudeDelta / viewport.width;
  return {
    latitude: point.latitude - offset.y * lngPerPoint * Math.cos(viewport.latitude * Math.PI / 180),
    longitude: point.longitude + offset.x * lngPerPoint,
  };
}

/**
 * Display coordinates for pins that would sit on top of each other once
 * clustering has stopped (same building, same street corner). Each overlapping
 * group is laid out on a small ring around its centre, so every venue gets its
 * own tappable pin. Only the artwork moves; the venue's real coordinate is used
 * for everything else (distance, directions, check-in). Pins with room keep
 * their own position and are not in the returned map.
 */
export function spreadOverlappingPoints<T extends Point>(points: T[], viewport: MapViewport | null,
  gapPoints = SPREAD_GAP_POINTS): Map<string, { latitude: number; longitude: number }> {
  const spread = new Map<string, { latitude: number; longitude: number }>();
  if (!validViewport(viewport) || points.length < 2) return spread;
  const lngPerPoint = viewport.longitudeDelta / viewport.width;
  const latPerPoint = lngPerPoint * Math.cos(viewport.latitude * Math.PI / 180);
  const sorted = [...points].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const near = (a: T, b: T) => Math.hypot((a.longitude - b.longitude) / lngPerPoint,
    (a.latitude - b.latitude) / latPerPoint) < gapPoints;
  // Connected groups: a chain of close pins is one group.
  const taken = new Set<string>();
  for (const seed of sorted) {
    if (taken.has(seed.id)) continue;
    const group = [seed];
    taken.add(seed.id);
    for (let i = 0; i < group.length; i++) {
      for (const other of sorted) {
        if (!taken.has(other.id) && near(group[i], other)) { taken.add(other.id); group.push(other); }
      }
    }
    if (group.length < 2) continue;
    const centre = {
      latitude: group.reduce((sum, m) => sum + m.latitude, 0) / group.length,
      longitude: group.reduce((sum, m) => sum + m.longitude, 0) / group.length,
    };
    // Neighbours on the ring stay `gapPoints` apart: chord = 2r·sin(π/n).
    const radius = Math.max(gapPoints * 0.6, gapPoints / (2 * Math.sin(Math.PI / group.length)));
    group.forEach((member, index) => {
      const angle = -Math.PI / 2 + (2 * Math.PI * index) / group.length;
      spread.set(member.id, {
        latitude: centre.latitude - Math.sin(angle) * radius * latPerPoint,
        longitude: centre.longitude + Math.cos(angle) * radius * lngPerPoint,
      });
    });
  }
  return spread;
}
