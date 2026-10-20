import { NEIGHBOURHOODS } from '@/data/neighbourhoods';
import { haversineKm } from '@/lib/presence';

const DISTRICTS = [...new Set(NEIGHBOURHOODS.filter((n) => n.inName !== false).map((n) => n.name))]
  .sort((a, b) => b.length - a.length); // longest match first

/** A name may say "Üsküdar" only if an Üsküdar centre is this close to the place. */
const NAME_MATCH_RADIUS_KM = 15;
/** Beyond this from every centre, a coordinate label would be a guess. */
const NEAREST_RADIUS_KM = 2.5;

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

// Folded district tokens are computed once: the name parse below runs for every
// place on every keystroke in search, and re-folding 60+ strings each time was
// the bulk of that work.
const DISTRICT_TOKENS = DISTRICTS.map((district) => ({ district, token: fold(district) }));
const NAME_TOKENS = NEIGHBOURHOODS.filter((n) => n.inName !== false)
  .map((n) => ({ ...n, token: fold(n.name) }))
  .sort((a, b) => b.token.length - a.token.length);
const WORD_CHAR = /[a-z0-9çğöşü]/;

/**
 * Label lookups are pure functions of the place, and the catalogue is bounded
 * (a few hundred venues), so results are cached for the lifetime of the app.
 */
const nameDistrictCache = new Map<string, string | null>();
const brandBaseCache = new Map<string, string>();
const districtCache = new Map<string, string>();

/** District already baked into a place name, e.g. "Starbucks Karaköy". */
function districtFromName(name: string): string | null {
  const cached = nameDistrictCache.get(name);
  if (cached !== undefined) return cached;

  const folded = fold(name);
  let found: string | null = null;
  for (const { district, token } of DISTRICT_TOKENS) {
    if (
      folded.endsWith(` ${token}`) ||
      folded.endsWith(`-${token}`) ||
      folded.endsWith(` - ${token}`) ||
      folded.endsWith(`, ${token}`) ||
      folded.endsWith(`| ${token}`) ||
      folded.endsWith(`|${token}`)
    ) {
      found = district;
      break;
    }
  }
  nameDistrictCache.set(name, found);
  return found;
}

/** Brand without trailing district noise — "Starbucks Karaköy" → "Starbucks". */
export function brandBase(name: string): string {
  const cached = brandBaseCache.get(name);
  if (cached !== undefined) return cached;

  const district = districtFromName(name);
  let base = name.trim();
  if (district) {
    const re = new RegExp(`(?:\\s*[-|,]?\\s*${escapeRegExp(district)})\\s*$`, 'i');
    base = base.replace(re, '').trim();
  }
  const result = base || name.trim();
  brandBaseCache.set(name, result);
  return result;
}

export function brandKey(name: string) {
  return fold(brandBase(name));
}

/**
 * District written anywhere in the name ("Â La Lune – Üsküdar (Kruvasan)"),
 * accepted only when that district is actually near the place, so a café
 * called "Kartal Yuvası" in Ankara is not labelled Kartal.
 */
function districtMentioned(place: { name: string; latitude: number; longitude: number }): string | null {
  const folded = fold(place.name);
  for (const candidate of NAME_TOKENS) {
    let at = folded.indexOf(candidate.token);
    while (at !== -1) {
      const before = folded[at - 1];
      const after = folded[at + candidate.token.length];
      const wholeWord = (!before || !WORD_CHAR.test(before)) && (!after || !WORD_CHAR.test(after));
      if (wholeWord && haversineKm(place, candidate) <= NAME_MATCH_RADIUS_KM) return candidate.name;
      at = folded.indexOf(candidate.token, at + 1);
    }
  }
  return null;
}

/** District named in the place's name, else the nearest neighbourhood centre. */
export function districtForPlace(place: {
  name: string;
  latitude: number;
  longitude: number;
}): string {
  const cacheKey = `${place.name}@${place.latitude},${place.longitude}`;
  const cached = districtCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const fromName = districtMentioned(place);
  if (fromName) {
    districtCache.set(cacheKey, fromName);
    return fromName;
  }

  let best: string | null = null;
  let bestKm = Infinity;
  for (const point of NEIGHBOURHOODS) {
    const km = haversineKm(place, point);
    if (km < bestKm) {
      bestKm = km;
      best = point.name;
    }
  }
  // Ignore far-away places so we don't invent a random label.
  const result = best && bestKm <= NEAREST_RADIUS_KM ? best : '';
  districtCache.set(cacheKey, result);
  return result;
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
