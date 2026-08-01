/**
 * Weekly Google Places sync — name + location only.
 * Filters to working cafes / Starbucks / cowork. Auto-assigns stock images.
 */

import type { Place } from '@/data/types';
import { shouldKeepGooglePlace } from '@/lib/placeFilter';
import { autoImageForPlace } from '@/lib/placeImages';

export type SyncResult = {
  ok: boolean;
  imported: number;
  filteredOut: number;
  message: string;
  places: Place[];
  reason?: 'missing_api_key' | 'api_error' | 'empty';
};

type GooglePlace = {
  id?: string;
  displayName?: { text?: string };
  location?: { latitude?: number; longitude?: number };
  types?: string[];
  formattedAddress?: string;
};

const apiKey = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY ?? '';
export const isGooglePlacesConfigured = apiKey.trim().length > 10;

export const ISTANBUL_GRID: { name: string; latitude: number; longitude: number }[] = [
  { name: 'Karaköy', latitude: 41.0246, longitude: 28.977 },
  { name: 'Beyoğlu', latitude: 41.0351, longitude: 28.9784 },
  { name: 'Beşiktaş', latitude: 41.0422, longitude: 29.0067 },
  { name: 'Nişantaşı', latitude: 41.0501, longitude: 28.9928 },
  { name: 'Kadıköy', latitude: 40.9909, longitude: 29.0303 },
  { name: 'Moda', latitude: 40.9842, longitude: 29.0254 },
  { name: 'Levent', latitude: 41.0814, longitude: 29.0122 },
  { name: 'Şişli', latitude: 41.0602, longitude: 28.9877 },
  { name: 'Üsküdar', latitude: 41.0256, longitude: 29.0156 },
  { name: 'Bakırköy', latitude: 40.9796, longitude: 28.872 },
];

const PLACE_TYPES = ['cafe', 'coffee_shop', 'coworking_space'] as const;
const FIELD_MASK = 'places.id,places.displayName,places.location,places.types,places.formattedAddress';
const RADIUS_M = 3200;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function isSyncStale(lastSyncedAt: string | null | undefined) {
  if (!lastSyncedAt) return true;
  const t = new Date(lastSyncedAt).getTime();
  if (Number.isNaN(t)) return true;
  return Date.now() - t > WEEK_MS;
}

function categoryFromTypes(types: string[] = []) {
  if (types.includes('coworking_space')) return 'Cowork';
  if (types.includes('cafe') || types.includes('coffee_shop')) return 'Cafe';
  return 'Workspace';
}

function cityFromAddress(address?: string) {
  if (!address) return 'Istanbul';
  if (/ankara/i.test(address)) return 'Ankara';
  if (/izmir/i.test(address)) return 'Izmir';
  return 'Istanbul';
}

function mapGooglePlace(raw: GooglePlace): Place | null {
  const googlePlaceId = raw.id;
  const name = raw.displayName?.text?.trim();
  const latitude = raw.location?.latitude;
  const longitude = raw.location?.longitude;
  const types = raw.types ?? [];
  if (!googlePlaceId || !name || latitude == null || longitude == null) return null;
  if (!shouldKeepGooglePlace(name, types)) return null;

  const id = googlePlaceId.replace(/^places\//, '');
  const category = categoryFromTypes(types);

  return {
    id,
    googlePlaceId: id,
    name,
    category,
    city: cityFromAddress(raw.formattedAddress),
    latitude,
    longitude,
    imageUrl: autoImageForPlace(id, category),
    source: 'google',
    status: 'approved',
  };
}

async function searchNearby(
  latitude: number,
  longitude: number,
  includedType: string,
): Promise<GooglePlace[]> {
  const res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify({
      includedTypes: [includedType],
      maxResultCount: 20,
      languageCode: 'tr',
      regionCode: 'TR',
      locationRestriction: {
        circle: {
          center: { latitude, longitude },
          radius: RADIUS_M,
        },
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Places Nearby ${res.status}: ${body.slice(0, 200)}`);
  }

  const json = (await res.json()) as { places?: GooglePlace[] };
  return json.places ?? [];
}

export async function syncIstanbulPlaces(): Promise<SyncResult> {
  if (!isGooglePlacesConfigured) {
    return {
      ok: false,
      imported: 0,
      filteredOut: 0,
      places: [],
      reason: 'missing_api_key',
      message: 'Google Places API key missing in .env',
    };
  }

  const byId = new Map<string, Place>();
  let filteredOut = 0;

  try {
    for (const cell of ISTANBUL_GRID) {
      for (const type of PLACE_TYPES) {
        const results = await searchNearby(cell.latitude, cell.longitude, type);
        for (const raw of results) {
          const name = raw.displayName?.text?.trim() ?? '';
          const mapped = mapGooglePlace(raw);
          if (!mapped) {
            if (name) filteredOut += 1;
            continue;
          }
          byId.set(mapped.id, mapped);
        }
        await new Promise((r) => setTimeout(r, 120));
      }
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown Places API error';
    return {
      ok: false,
      imported: byId.size,
      filteredOut,
      places: [...byId.values()],
      reason: 'api_error',
      message,
    };
  }

  const places = [...byId.values()];
  if (places.length === 0) {
    return {
      ok: false,
      imported: 0,
      filteredOut,
      places: [],
      reason: 'empty',
      message: 'Filtre sonrası mekan kalmadı. Places API veya filtreyi kontrol et.',
    };
  }

  return {
    ok: true,
    imported: places.length,
    filteredOut,
    places,
    message: `${places.length} working cafe/cowork · ${filteredOut} elendi`,
  };
}

export async function syncPlacesWeekly() {
  return syncIstanbulPlaces();
}
