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

async function readStore(): Promise<Store> {
  const monthKey = currentMonthKey();
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return { monthKey, byPlace: {} };
    const parsed = JSON.parse(raw) as Store;
    if (parsed.monthKey !== monthKey) {
      const fresh: Store = { monthKey, byPlace: {} };
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
      return fresh;
    }
    return parsed;
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

export async function getRegulars(placeId: string, limit = 10): Promise<Regular[]> {
  const store = await readStore();
  const list = [...(store.byPlace[placeId] ?? [])].sort((a, b) => b.visits - a.visits);
  return list.slice(0, limit).map((p, i) => ({
    ...p,
    rank: i + 1,
  }));
}

export async function getRegularsPreview(placeId: string, limit = 3) {
  return getRegulars(placeId, limit);
}
