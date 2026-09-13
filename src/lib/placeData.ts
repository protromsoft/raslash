import type { Place, PlaceStatus } from '@/data/types';

const VALID_STATUSES = new Set<PlaceStatus>(['approved', 'pending', 'rejected']);

function requiredString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function optionalString(value: unknown) {
  const text = requiredString(value);
  return text || undefined;
}

function finiteNumber(value: unknown) {
  if (typeof value !== 'number' && (typeof value !== 'string' || value.trim() === '')) return null;
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * Native map implementations do not tolerate NaN, infinity or out-of-range
 * marker coordinates. Keep this check at the data boundary instead of hoping
 * every caller remembers to guard the value before rendering a Marker.
 */
export function hasValidCoordinates(value: {
  latitude?: unknown;
  longitude?: unknown;
}) {
  const latitude = finiteNumber(value.latitude);
  const longitude = finiteNumber(value.longitude);
  return (
    latitude != null &&
    longitude != null &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

/**
 * Supabase and AsyncStorage are runtime inputs even when their TypeScript types
 * say `Place[]`. Invalid rows are dropped before they can reach MapKit, list
 * keys are de-duplicated, and harmless legacy omissions receive safe defaults.
 */
export function sanitizePlaces(value: unknown): Place[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const places: Place[] = [];

  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object') continue;
    const row = candidate as Record<string, unknown>;
    const id = requiredString(row.id);
    const name = requiredString(row.name);
    if (!id || !name || seen.has(id) || !hasValidCoordinates(row)) continue;

    const latitude = finiteNumber(row.latitude);
    const longitude = finiteNumber(row.longitude);
    // `hasValidCoordinates` has already proved these are finite numbers.
    if (latitude == null || longitude == null) continue;

    const rawStatus = requiredString(row.status) as PlaceStatus;
    const status = VALID_STATUSES.has(rawStatus) ? rawStatus : 'approved';
    const source = row.source === 'user' ? 'user' : 'google';

    places.push({
      id,
      googlePlaceId: optionalString(row.googlePlaceId ?? row.google_place_id),
      name,
      category: requiredString(row.category) || 'Cafe',
      city: requiredString(row.city) || 'Istanbul',
      latitude,
      longitude,
      imageUrl: optionalString(row.imageUrl ?? row.image_url),
      source,
      status,
      submittedByName: optionalString(row.submittedByName ?? row.submitted_by_name),
    });
    seen.add(id);
  }

  return places;
}
