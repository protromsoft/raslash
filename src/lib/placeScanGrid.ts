/**
 * Where the Google Places sync looks. Each supported city is a centre plus a
 * radius; the scan points are generated as a square lattice over that circle.
 *
 * Dependency-free on purpose: copied into supabase/functions/_shared/ by
 * `node scripts/sync-place-filter.cjs`, so the edge function and the Node
 * sync script scan exactly the same points.
 *
 * Not to be confused with SUPPORTED_CITY_GRID in src/data/cities.ts, which only
 * names districts for labels in the UI.
 */

export type ScanCity = {
  city: 'İstanbul' | 'Ankara' | 'İzmir';
  citySlug: 'istanbul' | 'ankara' | 'izmir';
  latitude: number;
  longitude: number;
  /** Everything within this distance of the centre is scanned. */
  radiusKm: number;
};

export type ScanPoint = {
  city: ScanCity['city'];
  citySlug: ScanCity['citySlug'];
  latitude: number;
  longitude: number;
};

export const SCAN_CITIES: readonly ScanCity[] = [
  { city: 'İstanbul', citySlug: 'istanbul', latitude: 41.0082, longitude: 28.9784, radiusKm: 25 },
  { city: 'Ankara', citySlug: 'ankara', latitude: 39.9334, longitude: 32.8597, radiusKm: 18 },
  { city: 'İzmir', citySlug: 'izmir', latitude: 38.4237, longitude: 27.1428, radiusKm: 15 },
];

/** Distance between neighbouring scan points. */
export const SCAN_SPACING_KM = 2.5;

/**
 * Search radius per point. Half the diagonal of a 2.5 km cell is 1.77 km, so
 * 1.8 km circles leave no gap between neighbours.
 */
export const SCAN_SEARCH_RADIUS_M = 1800;

const EARTH_RADIUS_KM = 6371;
const KM_PER_DEGREE_LAT = (Math.PI / 180) * EARTH_RADIUS_KM;

/** Square lattice of points covering the city's circle, centre included. */
export function scanPointsFor(city: ScanCity, spacingKm = SCAN_SPACING_KM): ScanPoint[] {
  const steps = Math.ceil(city.radiusKm / spacingKm);
  const kmPerDegreeLng = KM_PER_DEGREE_LAT * Math.cos((city.latitude * Math.PI) / 180);
  const points: ScanPoint[] = [];
  for (let row = -steps; row <= steps; row += 1) {
    for (let col = -steps; col <= steps; col += 1) {
      const northKm = row * spacingKm;
      const eastKm = col * spacingKm;
      if (Math.hypot(northKm, eastKm) > city.radiusKm) continue;
      points.push({
        city: city.city,
        citySlug: city.citySlug,
        latitude: Number((city.latitude + northKm / KM_PER_DEGREE_LAT).toFixed(5)),
        longitude: Number((city.longitude + eastKm / kmPerDegreeLng).toFixed(5)),
      });
    }
  }
  return points;
}

export function allScanPoints(cities: readonly ScanCity[] = SCAN_CITIES, spacingKm = SCAN_SPACING_KM) {
  return cities.flatMap((city) => scanPointsFor(city, spacingKm));
}
