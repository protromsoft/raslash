import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Regular } from '@/data/types';

const STORAGE_KEY = 'raslash.monthlyRegulars.v1';

export function currentMonthKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

type PersonRow = {
  userKey: string;
  firstName: string;
  lastName?: string;
  avatarUrl?: string;
  visits: number;
};

type Store = {
  monthKey: string;
  byPlace: Record<string, PersonRow[]>;
};

function sanitizeStore(value: unknown, monthKey: string): Store {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { monthKey, byPlace: {} };
  }
  const raw = value as Record<string, unknown>;
  if (raw.monthKey !== monthKey || !raw.byPlace || typeof raw.byPlace !== 'object') {
    return { monthKey, byPlace: {} };
  }

  const byPlace: Record<string, PersonRow[]> = {};
  for (const [placeId, rows] of Object.entries(raw.byPlace as Record<string, unknown>)) {
    if (!Array.isArray(rows)) continue;
    byPlace[placeId] = rows.flatMap((candidate) => {
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return [];
      const row = candidate as Record<string, unknown>;
      const userKey = typeof row.userKey === 'string' ? row.userKey : '';
      const firstName = typeof row.firstName === 'string' ? row.firstName : '';
      const visits = Number(row.visits);
      if (!userKey || !firstName || !Number.isFinite(visits) || visits < 0) return [];
      return [{
        userKey,
        firstName,
        lastName: typeof row.lastName === 'string' ? row.lastName : undefined,
        avatarUrl: typeof row.avatarUrl === 'string' ? row.avatarUrl : undefined,
        visits: Math.floor(visits),
      }];
    });
  }
  return { monthKey, byPlace };
}

async function readStore(): Promise<Store> {
  const monthKey = currentMonthKey();
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return { monthKey, byPlace: {} };
    const decoded = JSON.parse(raw) as unknown;
    const storedMonth =
      decoded && typeof decoded === 'object' && !Array.isArray(decoded)
        ? (decoded as Record<string, unknown>).monthKey
        : null;
    if (storedMonth !== monthKey) {
      const fresh: Store = { monthKey, byPlace: {} };
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
      return fresh;
    }
    return sanitizeStore(decoded, monthKey);
  } catch {
    return { monthKey, byPlace: {} };
  }
}

async function writeStore(store: Store) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

/** Check-in tamamlandığında (veya başladığında) aylık ziyaret sayısını artırır. */
export async function recordVisit(input: {
  placeId: string;
  userKey: string;
  firstName: string;
  lastName?: string;
  avatarUrl?: string;
}) {
  const store = await readStore();
  const list = store.byPlace[input.placeId] ?? [];
  const idx = list.findIndex((p) => p.userKey === input.userKey);
  if (idx >= 0) {
    list[idx] = {
      ...list[idx],
      visits: list[idx].visits + 1,
      firstName: input.firstName || list[idx].firstName,
      lastName: input.lastName ?? list[idx].lastName,
      avatarUrl: input.avatarUrl ?? list[idx].avatarUrl,
    };
  } else {
    list.push({
      userKey: input.userKey,
      firstName: input.firstName || 'Misafir',
      lastName: input.lastName,
      avatarUrl: input.avatarUrl,
      visits: 1,
    });
  }
  store.byPlace[input.placeId] = list;
  await writeStore(store);
}

/**
 * The single place where a stored month's rows become a ranked list — both the
 * per-place and the batch reader go through it so the two can never drift.
 * `sort` is stable, so people on the same visit count keep their first-seen order.
 */
function rankTop(rows: PersonRow[] | undefined, limit: number): Regular[] {
  return [...(rows ?? [])]
    .sort((a, b) => b.visits - a.visits)
    .slice(0, limit)
    .map((p, i) => ({ ...p, rank: i + 1 }));
}

export async function getRegulars(placeId: string, limit = 10): Promise<Regular[]> {
  const store = await readStore();
  return rankTop(store.byPlace[placeId], limit);
}

/**
 * Batch version for screens that need many places at once (the map lists ~60).
 * Everything lives under one storage key, so this reads and parses that blob a
 * single time instead of once per place.
 */
export async function getRegularsMap(
  placeIds: string[],
  limit = 10,
): Promise<Record<string, Regular[]>> {
  const store = await readStore();
  const out: Record<string, Regular[]> = {};
  for (const placeId of placeIds) {
    out[placeId] = rankTop(store.byPlace[placeId], limit);
  }
  return out;
}
