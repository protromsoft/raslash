import { ISTANBUL_GRID } from '@/lib/googlePlacesSync';
import { haversineKm } from '@/lib/presence';

/** Extra neighbourhoods beyond the Google sync grid, used when parsing names. */
const EXTRA_DISTRICTS = [
  'Ataşehir',
  'Maltepe',
  'Kartal',
  'Pendik',
  'Sarıyer',
  'Eyüpsultan',
  'Fatih',
  'Zeytinburnu',
  'Bahçelievler',
  'Başakşehir',
  'Kağıthane',
  'Gaziosmanpaşa',
  'Etiler',
  'Maslak',
  'Taksim',
  'Galata',
  'Cihangir',
  'Ortaköy',
  'Bebek',
  'Arnavutköy',
  'Caddebostan',
  'Bostancı',
  'Kozyatağı',
  'Acıbadem',
  'Altunizade',
  'Mecidiyeköy',
  'Osmanbey',
  'Harbiye',
  'Teşvikiye',
  'Maçka',
  'Gayrettepe',
  'Zincirlikuyu',
  'Bomonti',
  'İstinye',
  'Florya',
  'Yeşilköy',
  'Avcılar',
  'Beylikdüzü',
];

const DISTRICTS = [
  ...ISTANBUL_GRID.map((g) => g.name),
  ...EXTRA_DISTRICTS,
].sort((a, b) => b.length - a.length); // longest match first

function fold(value: string) {
  return value
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** District already baked into a place name, e.g. "Starbucks Karaköy". */
function districtFromName(name: string): string | null {
  const folded = fold(name);
  for (const district of DISTRICTS) {
    const token = fold(district);
    if (
      folded.endsWith(` ${token}`) ||
      folded.endsWith(`-${token}`) ||
      folded.endsWith(` - ${token}`) ||
      folded.endsWith(`, ${token}`) ||
      folded.endsWith(`| ${token}`) ||
      folded.endsWith(`|${token}`)
    ) {
      return district;
    }
  }
  return null;
}

/** Brand without trailing district noise — "Starbucks Karaköy" → "Starbucks". */
export function brandBase(name: string): string {
  const district = districtFromName(name);
  let base = name.trim();
  if (district) {
    const re = new RegExp(`(?:\\s*[-|,]?\\s*${escapeRegExp(district)})\\s*$`, 'i');
    base = base.replace(re, '').trim();
  }
  return base || name.trim();
}

export function brandKey(name: string) {
  return fold(brandBase(name));
}

/** Closest Istanbul neighbourhood by coords, falling back to a name parse. */
export function districtForPlace(place: {
  name: string;
  latitude: number;
  longitude: number;
}): string {
  const fromName = districtFromName(place.name);
  if (fromName) return fromName;

  let best = ISTANBUL_GRID[0];
  let bestKm = Infinity;
  for (const cell of ISTANBUL_GRID) {
    const km = haversineKm(
      { latitude: place.latitude, longitude: place.longitude },
      { latitude: cell.latitude, longitude: cell.longitude },
    );
    if (km < bestKm) {
      bestKm = km;
      best = cell;
    }
  }
  // Ignore far-away places so we don't invent a random label.
  return bestKm <= 6 ? best.name : '';
}

export function buildBrandCounts(places: { name: string }[]) {
  const counts = new Map<string, number>();
  for (const place of places) {
    const key = brandKey(place.name);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * Chain venues (same brand, many branches) render as "Starbucks | Şişli".
 * Unique names stay untouched.
 */
export function displayPlaceName(
  place: { name: string; latitude: number; longitude: number },
  brandCounts: Map<string, number>,
) {
  const key = brandKey(place.name);
  if ((brandCounts.get(key) ?? 1) < 2) return place.name;

  const brand = brandBase(place.name);
  const district = districtForPlace(place);
  if (!district || fold(brand) === fold(district)) return place.name;
  return `${brand} | ${district}`;
}
