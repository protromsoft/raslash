import { createClient } from 'npm:@supabase/supabase-js@2.111.0';

type City = 'İstanbul' | 'Ankara' | 'İzmir';
type GooglePlace = {
  id?: string;
  displayName?: { text?: string };
  location?: { latitude?: number; longitude?: number };
  types?: string[];
};

const GRID: { city: City; latitude: number; longitude: number }[] = [
  { city: 'İstanbul', latitude: 41.0246, longitude: 28.977 },
  { city: 'İstanbul', latitude: 41.0351, longitude: 28.9784 },
  { city: 'İstanbul', latitude: 41.0422, longitude: 29.0067 },
  { city: 'İstanbul', latitude: 40.9909, longitude: 29.0303 },
  { city: 'İstanbul', latitude: 41.0814, longitude: 29.0122 },
  { city: 'Ankara', latitude: 39.9208, longitude: 32.8541 },
  { city: 'Ankara', latitude: 39.9023, longitude: 32.8647 },
  { city: 'Ankara', latitude: 39.9227, longitude: 32.8254 },
  { city: 'Ankara', latitude: 39.868, longitude: 32.7487 },
  { city: 'Ankara', latitude: 39.8955, longitude: 32.7047 },
  { city: 'İzmir', latitude: 38.437, longitude: 27.143 },
  { city: 'İzmir', latitude: 38.4192, longitude: 27.1287 },
  { city: 'İzmir', latitude: 38.4553, longitude: 27.1096 },
  { city: 'İzmir', latitude: 38.4567, longitude: 27.0953 },
  { city: 'İzmir', latitude: 38.4622, longitude: 27.2165 },
];

const PLACE_TYPES = ['cafe', 'coffee_shop', 'coworking_space'] as const;
const FIELD_MASK = 'places.id,places.displayName,places.location,places.types';
const BLOCK_NAME =
  /çay\s*bahçesi|cay\s*bahcesi|çaybahçesi|bozacı|bozacisi|boza\b|nargile|ocakbaşı|ocakbasi|kebap|kebapçı|döner|pide\b|lahmacun|balıkçısı|balikcisi|lokanta|aşevi|asevi|meyhane|birahane|kahvaltı\s*salonu|kahvalti\s*salonu|aile\s*çay|simit\s*sarayı|börek|borekçi/i;
const ALLOW_NAME =
  /starbucks|coffee|espresso|roastery|roast|gloria\s*jean|cafe|café|kahve|cowork|co-work|workspace|work\s*space|ofis|office|studio|third\s*wave|specialty|filtre|brewing|beanery|espresso\s*lab|kronotrop|petra|petrakahve|cup\s*of|working\s*cafe|laptop|remote/i;

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function citySlug(city: City) {
  if (city === 'Ankara') return 'ankara';
  if (city === 'İzmir') return 'izmir';
  return 'istanbul';
}

function category(types: string[]) {
  if (types.includes('coworking_space')) return 'Cowork';
  if (types.includes('cafe') || types.includes('coffee_shop')) return 'Cafe';
  return 'Workspace';
}

function shouldKeep(name: string, types: string[]) {
  if (!name || BLOCK_NAME.test(name)) return false;
  return (
    types.includes('coworking_space') ||
    ALLOW_NAME.test(name) ||
    types.includes('coffee_shop')
  );
}

async function searchNearby(
  apiKey: string,
  latitude: number,
  longitude: number,
  includedType: string,
) {
  const response = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
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
        circle: { center: { latitude, longitude }, radius: 3200 },
      },
    }),
  });
  if (!response.ok) throw new Error(`Google Places ${response.status}`);
  return ((await response.json()) as { places?: GooglePlace[] }).places ?? [];
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { message: 'Method not allowed' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const googleApiKey = Deno.env.get('GOOGLE_PLACES_API_KEY');
  const authorization = req.headers.get('Authorization');
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !googleApiKey || !authorization) {
    return json(500, { message: 'Server configuration missing' });
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser();
  const userId = authData.user?.id;
  if (authError || !userId) return json(401, { message: 'Invalid session' });

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('is_admin')
    .eq('id', userId)
    .maybeSingle();
  if (profileError || profile?.is_admin !== true) return json(403, { message: 'Admin required' });

  const rows = new Map<string, Record<string, unknown>>();
  let filteredOut = 0;
  try {
    for (const cell of GRID) {
      for (const placeType of PLACE_TYPES) {
        const places = await searchNearby(
          googleApiKey,
          cell.latitude,
          cell.longitude,
          placeType,
        );
        for (const place of places) {
          const googlePlaceId = place.id?.replace(/^places\//, '');
          const name = place.displayName?.text?.trim() ?? '';
          const latitude = place.location?.latitude;
          const longitude = place.location?.longitude;
          const types = place.types ?? [];
          if (!googlePlaceId || latitude == null || longitude == null || !shouldKeep(name, types)) {
            if (name) filteredOut += 1;
            continue;
          }
          rows.set(googlePlaceId, {
            google_place_id: googlePlaceId,
            name,
            category: category(types),
            city: cell.city,
            city_slug: citySlug(cell.city),
            latitude,
            longitude,
            source: 'google',
            status: 'approved',
            last_synced_at: new Date().toISOString(),
          });
        }
      }
    }
  } catch (error) {
    return json(502, {
      message: error instanceof Error ? error.message : 'Google Places sync failed',
    });
  }

  const allRows = [...rows.values()];
  for (let offset = 0; offset < allRows.length; offset += 100) {
    const { error } = await admin
      .from('places')
      .upsert(allRows.slice(offset, offset + 100), { onConflict: 'google_place_id' });
    if (error) return json(500, { message: 'Place upsert failed' });
  }

  return json(200, { imported: allRows.length, filteredOut });
});
