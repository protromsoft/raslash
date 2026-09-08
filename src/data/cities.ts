export const SUPPORTED_CITIES = [
  { key: 'istanbul', label: 'İstanbul', latitude: 41.0082, longitude: 28.9784 },
  { key: 'ankara', label: 'Ankara', latitude: 39.9334, longitude: 32.8597 },
  { key: 'izmir', label: 'İzmir', latitude: 38.4237, longitude: 27.1428 },
] as const;

export type CityKey = (typeof SUPPORTED_CITIES)[number]['key'];

/** Centres used only for nearby district labels in the mobile UI. */
export const SUPPORTED_CITY_GRID: {
  name: string;
  city: 'Istanbul' | 'Ankara' | 'Izmir';
  latitude: number;
  longitude: number;
}[] = [
  { name: 'Karaköy', city: 'Istanbul', latitude: 41.0246, longitude: 28.977 },
  { name: 'Beyoğlu', city: 'Istanbul', latitude: 41.0351, longitude: 28.9784 },
  { name: 'Beşiktaş', city: 'Istanbul', latitude: 41.0422, longitude: 29.0067 },
  { name: 'Kadıköy', city: 'Istanbul', latitude: 40.9909, longitude: 29.0303 },
  { name: 'Levent', city: 'Istanbul', latitude: 41.0814, longitude: 29.0122 },
  { name: 'Kızılay', city: 'Ankara', latitude: 39.9208, longitude: 32.8541 },
  { name: 'Çankaya', city: 'Ankara', latitude: 39.9023, longitude: 32.8647 },
  { name: 'Bahçelievler', city: 'Ankara', latitude: 39.9227, longitude: 32.8254 },
  { name: 'Bilkent', city: 'Ankara', latitude: 39.868, longitude: 32.7487 },
  { name: 'Ümitköy', city: 'Ankara', latitude: 39.8955, longitude: 32.7047 },
  { name: 'Alsancak', city: 'Izmir', latitude: 38.437, longitude: 27.143 },
  { name: 'Konak', city: 'Izmir', latitude: 38.4192, longitude: 27.1287 },
  { name: 'Karşıyaka', city: 'Izmir', latitude: 38.4553, longitude: 27.1096 },
  { name: 'Bostanlı', city: 'Izmir', latitude: 38.4567, longitude: 27.0953 },
  { name: 'Bornova', city: 'Izmir', latitude: 38.4622, longitude: 27.2165 },
];
