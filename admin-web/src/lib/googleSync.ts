import { upsertGooglePlaceRows } from './api';

const BLOCK =
  /çay\s*bahçesi|cay\s*bahcesi|çaybahçesi|bozacı|bozacisi|boza\b|nargile|ocakbaşı|ocakbasi|kebap|döner|pide\b|lahmacun|meyhane|birahane|kahvaltı\s*salonu|aile\s*çay/i;
const ALLOW =
  /starbucks|coffee|espresso|roastery|roast|gloria\s*jean|cafe|café|kahve|cowork|co-work|workspace|ofis|office|studio|specialty|filtre|kronotrop|petra|working\s*cafe|laptop/i;

const CAFE_IMAGES = [
  'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=800&q=80',
  'https://images.unsplash.com/photo-1521017432531-fbd92d768814?w=800&q=80',
  'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=800&q=80',
  'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=800&q=80',
  'https://images.unsplash.com/photo-1498804103079-a6351b050096?w=800&q=80',
  'https://images.unsplash.com/photo-1511920170033-f8396924c348?w=800&q=80',
];
const COWORK_IMAGES = [
  'https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&q=80',
  'https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=800&q=80',
  'https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=800&q=80',
  'https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=800&q=80',
];

const GRID = [
  { latitude: 41.0246, longitude: 28.977 },
  { latitude: 41.0351, longitude: 28.9784 },
  { latitude: 41.0422, longitude: 29.0067 },
  { latitude: 41.0501, longitude: 28.9928 },
  { latitude: 40.9909, longitude: 29.0303 },
  { latitude: 40.9842, longitude: 29.0254 },
  { latitude: 41.0814, longitude: 29.0122 },
  { latitude: 41.0602, longitude: 28.9877 },
  { latitude: 41.0256, longitude: 29.0156 },
  { latitude: 40.9796, longitude: 28.872 },
];

const TYPES = ['cafe', 'coffee_shop', 'coworking_space'] as const;

function hashId(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

function keep(name: string, types: string[] = []) {
  if (!name || BLOCK.test(name)) return false;
  if (types.includes('coworking_space')) return true;
  if (ALLOW.test(name)) return true;
  if (types.includes('coffee_shop')) return true;
  return false;
}

function categoryFromTypes(types: string[] = []) {
  if (types.includes('coworking_space')) return 'Cowork';
  return 'Cafe';
}

function imageFor(id: string, category: string) {
  const pool = category === 'Cowork' ? COWORK_IMAGES : CAFE_IMAGES;
  return pool[hashId(id) % pool.length];
}

export function isGoogleConfigured() {
  const key = import.meta.env.VITE_GOOGLE_PLACES_API_KEY as string | undefined;
  return Boolean(key && key.length > 20);
}

async function searchNearby(apiKey: string, lat: number, lng: number, type: string) {
  const res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask':
        'places.id,places.displayName,places.location,places.types,places.formattedAddress',
    },
    body: JSON.stringify({
      includedTypes: [type],
      maxResultCount: 20,
      languageCode: 'tr',
      regionCode: 'TR',
      locationRestriction: {
        circle: { center: { latitude: lat, longitude: lng }, radius: 3200.0 },
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`Google Places ${res.status}: ${(await res.text()).slice(0, 160)}`);
  }
  const json = (await res.json()) as { places?: Array<Record<string, unknown>> };
  return json.places ?? [];
}

export type SyncProgress = {
  phase: string;
  kept: number;
  filteredOut: number;
};

export async function syncGooglePlacesToSupabase(
  onProgress?: (p: SyncProgress) => void,
): Promise<{ kept: number; filteredOut: number; upserted: number }> {
  const apiKey = import.meta.env.VITE_GOOGLE_PLACES_API_KEY as string | undefined;
  if (!apiKey || apiKey.length < 20) {
    throw new Error('VITE_GOOGLE_PLACES_API_KEY eksik — admin-web/.env dosyasına ekle');
  }

  const byId = new Map<
    string,
    {
      google_place_id: string;
      name: string;
      category: string;
      city: string;
      latitude: number;
      longitude: number;
      image_url: string;
      source: 'google';
      status: 'approved';
      last_synced_at: string;
    }
  >();
  let filteredOut = 0;
  let scanned = 0;

  for (const cell of GRID) {
    for (const type of TYPES) {
      scanned += 1;
      onProgress?.({
        phase: `Google tarama ${scanned}/${GRID.length * TYPES.length}`,
        kept: byId.size,
        filteredOut,
      });
      const results = await searchNearby(apiKey, cell.latitude, cell.longitude, type);
      for (const raw of results) {
        const displayName = raw.displayName as { text?: string } | undefined;
        const name = displayName?.text?.trim() ?? '';
        const types = (raw.types as string[] | undefined) ?? [];
        const id = String(raw.id || '').replace(/^places\//, '');
        const location = raw.location as { latitude?: number; longitude?: number } | undefined;
        const lat = location?.latitude;
        const lng = location?.longitude;
        if (!id || !name || lat == null || lng == null) continue;
        if (!keep(name, types)) {
          filteredOut += 1;
          continue;
        }
        const category = categoryFromTypes(types);
        byId.set(id, {
          google_place_id: id,
          name,
          category,
          city: 'Istanbul',
          latitude: lat,
          longitude: lng,
          image_url: imageFor(id, category),
          source: 'google',
          status: 'approved',
          last_synced_at: new Date().toISOString(),
        });
      }
      await new Promise((r) => setTimeout(r, 80));
    }
  }

  const rows = [...byId.values()];
  onProgress?.({ phase: 'Supabase yazılıyor…', kept: rows.length, filteredOut });
  if (rows.length === 0) throw new Error('Filtreden geçen mekan yok');
  const upserted = await upsertGooglePlaceRows(rows);
  return { kept: rows.length, filteredOut, upserted };
}
