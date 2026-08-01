/** Keep Starbucks / working cafes / cowork — drop tea gardens, boza shops, etc. */

const BLOCK_NAME =
  /çay\s*bahçesi|cay\s*bahcesi|çaybahçesi|bozacı|bozacisi|boza\b|nargile|ocakbaşı|ocakbasi|kebap|kebapçı|döner|pide\b|lahmacun|balıkçısı|balikcisi|lokanta|aşevi|asevi|meyhane|birahane|kahvaltı\s*salonu|kahvalti\s*salonu|aile\s*çay|simit\s*sarayı|börek|borekçi/i;

const ALLOW_NAME =
  /starbucks|coffee|espresso|roastery|roast|gloria\s*jean|cafe|café|kahve|cowork|co-work|workspace|work\s*space|ofis|office|studio|third\s*wave|specialty|filtre|brewing|beanery|espresso\s*lab|kronotrop|petra|federal|petra|petrakahve|cup\s*of|working\s*cafe|laptop|remote/i;

const ALLOW_TYPES = new Set(['coworking_space', 'coffee_shop']);

export function isWorkingCafePlace(input: {
  name: string;
  types?: string[];
  category?: string;
}) {
  const name = input.name.trim();
  if (!name) return false;
  if (BLOCK_NAME.test(name)) return false;

  const types = input.types ?? [];
  if (types.includes('coworking_space')) return true;
  if (input.category === 'Cowork') return true;
  if (ALLOW_NAME.test(name)) return true;
  // Generic "cafe" type alone is too noisy in TR — require name signal or coffee_shop
  if (types.includes('coffee_shop') && !BLOCK_NAME.test(name)) return true;

  return false;
}

export function shouldKeepGooglePlace(name: string, types: string[] = []) {
  return isWorkingCafePlace({ name, types });
}

export { ALLOW_TYPES };
