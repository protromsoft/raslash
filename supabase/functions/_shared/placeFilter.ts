// GENERATED FROM src/lib/placeFilter.ts by scripts/sync-place-filter.cjs. Do not edit here.
/**
 * Decides whether a Google place belongs in the catalogue and how it enters.
 *
 * Dependency-free on purpose: this file is copied verbatim into
 * supabase/functions/_shared/ by `node scripts/sync-place-filter.cjs`, so the
 * edge function (Deno) and the app/scripts (Node) share one rule set. The
 * placeFilter test fails when the generated copy drifts from this source.
 *
 * Rule summary:
 *  - A place is a candidate only if Google types it as a cafe, coffee shop or
 *    coworking space. A name alone never gets a place in.
 *  - Names only remove: BLOCK_NAME drops tea gardens, kebab houses, etc.
 *  - Google data wins over names when picking Cafe vs Cowork; the name only
 *    nudges a `cafe`-typed place towards Cowork when it clearly says so.
 *  - A plain `cafe` type is too broad in Türkiye (tea gardens, patisseries):
 *    it needs a coffee signal in the name or the `coffee_shop` type.
 *  - Everything new from Google is `pending` for an admin to approve; only a
 *    coffee shop with a coffee name, or a `cafe` whose name clearly says
 *    coffee (kahve, coffee, espresso…), is approved straight away. The bare
 *    word "cafe" is weak: "All Sports Cafe" or "Cafe & Restaurant" waits.
 *  - Closed places are never imported. A permanently closed place already in
 *    the catalogue is rejected; a temporarily closed one goes to review.
 */

export type PlaceCategory = 'Cafe' | 'Cowork';
export type PlaceImportStatus = 'approved' | 'pending';

export type GooglePlaceSignals = {
  name: string;
  /** Google's single best type for the place, e.g. "coffee_shop". */
  primaryType?: string | null;
  /** Every type Google attaches to the place. */
  types?: readonly string[] | null;
  /** "OPERATIONAL", "CLOSED_TEMPORARILY" or "CLOSED_PERMANENTLY". */
  businessStatus?: string | null;
};

export type PlaceDecision =
  | { keep: true; category: PlaceCategory; status: PlaceImportStatus; reason: string }
  /** `reject`: an existing row should be rejected, not just sent back to review. */
  | { keep: false; reason: string; reject?: boolean };

/** Google types that make a place a candidate at all. */
export const CANDIDATE_TYPES: readonly string[] = ['cafe', 'coffee_shop', 'coworking_space'];

/** Names that are never a working cafe, whatever Google says. */
export const BLOCK_NAME =
  /çay\s*bahçesi|cay\s*bahcesi|çaybahçesi|bozacı|bozacisi|boza\b|nargile|ocakbaşı|ocakbasi|kebap|kebapçı|döner|pide\b|lahmacun|balıkçısı|balikcisi|lokanta|aşevi|asevi|meyhane|birahane|kahvaltı\s*salonu|kahvalti\s*salonu|aile\s*çay|simit\s*sarayı|börek|borekçi|inşaat|insaat|emlak|nakliyat|otomotiv|eczane|kuaför|kuafor|berber/i;

/**
 * Coffee words. They never admit a place on their own; they confirm that a
 * `cafe`/`coffee_shop`-typed place really is about coffee.
 * STRONG words name coffee itself, or a Turkish coffee chain (Federal, Petra,
 * MOC, Kronotrop…), and are enough to approve a `cafe`/`coffee_shop`. They
 * never admit a place Google does not type as a cafe: "Petra Market" waits.
 * The bare word "cafe"/"café" is WEAK: restaurants and sports bars use it too.
 */
export const STRONG_COFFEE_NAME =
  /starbucks|coffee|espresso|roastery|roasting|roasters|gloria\s*jean|kahve|third\s*wave|specialty|filtre|brewing|beanery|kronotrop|petrakahve|cup\s*of|caff[eèé]\b|caffè|caffe nero|coffy|walker'?s|mandabatmaz|cremma|rawsters|kahve\s*dünyası|federal|petra\b|\bmoc\b|tchibo|\bnero\b|arabica|coffeemania|wandervogel|norm\b|story\b|brew\b|roast'?n/i;
export const WEAK_COFFEE_NAME = /cafe|café|kafe/i;
export const COFFEE_NAME = new RegExp(`${STRONG_COFFEE_NAME.source}|${WEAK_COFFEE_NAME.source}`, 'i');

/** Cowork words and operators. Only these turn a coworking_space into an approved Cowork. */
export const COWORK_NAME =
  /cowork|co-work|co\s+work|workspace|work\s*space|working\s*space|ofis|office|hub\b|kolektif|collective|regus|workinton|han\s*spaces|impact\s*hub|work\s*up\b|servcorp|business93|spaces\b/i;

/**
 * Company names: an A.Ş. or an engineering firm is never a place to sit and
 * work, whatever type Google gave it. These are rejected outright.
 */
export const COMPANY_NAME =
  /\ba\.?\s?ş\.?(?=\s|$)|\bltd\.?\b|\bşti\.?\b|\bsan\.?\s*(ve\s*)?tic\b|holding|mühendislik|mimarlık|elektrik|taşlama|\bcnc\b|liman|gemi\s*işletme|oto\s*yıkama|kuruyemiş|camii|kitabevi|vakfı|derneği|özel\s*ders|öğretim\s*kursu|strategic\s*partners/i;

/**
 * Google primary types that are never a working cafe or cowork, even when a
 * secondary type says "cafe". Rejected unless the name says coffee or cowork.
 */
export const NON_CAFE_PRIMARY_TYPES: readonly string[] = [
  'car_wash', 'consultant', 'corporate_office', 'manufacturer', 'mosque', 'hotel', 'pub', 'bar', 'cocktail_bar',
  'gastropub', 'food_store', 'book_store', 'store', 'service', 'association_or_organization', 'chocolate_shop',
  'dessert_shop', 'dessert_restaurant', 'bakery', 'pastry_shop', 'restaurant', 'turkish_restaurant',
  'italian_restaurant', 'lebanese_restaurant', 'hamburger_restaurant', 'pizza_restaurant', 'breakfast_restaurant',
];

/** Google business status values we import / act on. */
export const OPERATIONAL = 'OPERATIONAL';
export const CLOSED_PERMANENTLY = 'CLOSED_PERMANENTLY';

function normalise(value: string | null | undefined) {
  return (value ?? '').trim();
}

/** Decides keep/drop, category and import status for one Google place. */
export function classifyGooglePlace(input: GooglePlaceSignals): PlaceDecision {
  const name = normalise(input.name);
  if (!name) return { keep: false, reason: 'adı yok' };
  if (BLOCK_NAME.test(name)) return { keep: false, reason: 'adı engel listesinde', reject: true };
  if (COMPANY_NAME.test(name)) return { keep: false, reason: 'şirket adı', reject: true };

  const status = normalise(input.businessStatus);
  // Only an explicit non-operational status drops the place; missing data is
  // tolerated so legacy rows without the field can still be classified.
  if (status === CLOSED_PERMANENTLY) return { keep: false, reason: 'kalıcı olarak kapanmış', reject: true };
  if (status && status !== OPERATIONAL) return { keep: false, reason: `işletme durumu ${status}` };

  const primary = normalise(input.primaryType);
  const types = new Set<string>(input.types ?? []);
  if (primary) types.add(primary);
  const candidate = CANDIDATE_TYPES.some((type) => types.has(type));
  if (!candidate) return { keep: false, reason: 'Google tipi kafe/cowork değil' };

  const strongCoffee = STRONG_COFFEE_NAME.test(name);
  const coffeeName = strongCoffee || WEAK_COFFEE_NAME.test(name);
  const coworkName = COWORK_NAME.test(name);

  // Restaurants, bars, hotels and shops that also carry a `cafe` type.
  if (primary && NON_CAFE_PRIMARY_TYPES.includes(primary) && !coworkName) {
    return strongCoffee
      ? { keep: true, category: 'Cafe', status: 'pending', reason: `${primary}, adı kahve diyor` }
      : { keep: false, reason: `Google birincil tipi ${primary}`, reject: true };
  }

  if (types.has('coworking_space') && primary !== 'coffee_shop' && primary !== 'cafe') {
    // Google hands out coworking_space generously (offices, agencies, schools).
    // Only a name that says cowork earns automatic approval.
    return coworkName
      ? { keep: true, category: 'Cowork', status: 'approved', reason: 'coworking_space + adı cowork' }
      : { keep: true, category: 'Cowork', status: 'pending', reason: 'coworking_space, adı cowork demiyor' };
  }

  // A coworking place that also serves coffee: Google often makes `cafe` the
  // primary type. A name that says cowork keeps it a Cowork.
  const category: PlaceCategory = types.has('coworking_space') && coworkName ? 'Cowork' : 'Cafe';

  if (types.has('coffee_shop')) {
    return coffeeName
      ? { keep: true, category, status: 'approved', reason: 'coffee_shop + kahve adı' }
      : { keep: true, category, status: 'pending', reason: 'coffee_shop, adı kahve demiyor' };
  }

  // Plain `cafe`: tea gardens, patisseries and restaurants carry it too.
  if (coworkName) return { keep: true, category: 'Cowork', status: 'pending', reason: 'cafe tipi, adı cowork' };
  if (strongCoffee) return { keep: true, category, status: 'approved', reason: 'cafe tipi + güçlü kahve adı' };
  if (coffeeName) return { keep: true, category, status: 'pending', reason: 'cafe tipi, adında yalnızca "cafe"' };
  return { keep: false, reason: 'cafe tipi, kahve sinyali yok' };
}

/**
 * Status for a place the catalogue already has. A rejection always stands; a
 * place that no longer qualifies goes back to pending rather than vanishing.
 *
 * Routine syncs (default) keep an approved place approved while it still
 * qualifies, so an admin's manual approval survives every re-sync.
 * The one-off cleanup passes `strict: true`: an approval made by the old,
 * name-based rules stays only if the new rules would approve it on their own.
 */
export function reconcileStatus(
  existing: 'approved' | 'pending' | 'rejected' | null | undefined,
  decision: PlaceDecision,
  options: { strict?: boolean } = {},
): 'approved' | 'pending' | 'rejected' {
  if (existing === 'rejected') return 'rejected';
  if (!decision.keep) return decision.reject ? 'rejected' : 'pending';
  if (existing === 'approved' && !options.strict) return 'approved';
  return decision.status;
}

/** Kept for older call sites: true when the place would be imported at all. */
export function isWorkingCafePlace(input: { name: string; types?: string[]; category?: string }) {
  return classifyGooglePlace({ name: input.name, types: input.types }).keep;
}

export function shouldKeepGooglePlace(name: string, types: string[] = []) {
  return classifyGooglePlace({ name, types }).keep;
}
