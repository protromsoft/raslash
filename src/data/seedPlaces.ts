import type { Place, Review } from '@/data/types';
import { autoImageForPlace } from '@/lib/placeImages';

export const seedPlaces: Place[] = [
  {
    id: '1',
    googlePlaceId: 'google_karakoy_1',
    name: 'Starbucks Karaköy',
    category: 'Cafe',
    city: 'Istanbul',
    latitude: 41.0246,
    longitude: 28.977,
    imageUrl: autoImageForPlace('1', 'Cafe'),
    source: 'google',
    status: 'approved',
  },
  {
    id: '2',
    googlePlaceId: 'google_moda_2',
    name: 'Moda Workspace Cafe',
    category: 'Cowork',
    city: 'Istanbul',
    latitude: 40.9842,
    longitude: 29.0254,
    imageUrl: autoImageForPlace('2', 'Cowork'),
    source: 'google',
    status: 'approved',
  },
  {
    id: '3',
    googlePlaceId: 'google_nisantasi_3',
    name: 'Nişantaşı Coffee Lab',
    category: 'Cafe',
    city: 'Istanbul',
    latitude: 41.0501,
    longitude: 28.9928,
    imageUrl: autoImageForPlace('3', 'Cafe'),
    source: 'google',
    status: 'approved',
  },
];

export const seedReviews: Record<string, Review[]> = {
  '1': [
    {
      id: 'r1',
      author: 'Elif',
      text: 'Laptop için priz bol, wifi hızlı.',
      wifi: 5,
      comfort: 4,
      outlets: 5,
      createdAt: new Date().toISOString(),
    },
  ],
  '2': [
    {
      id: 'r3',
      author: 'Mert',
      text: 'Cowork masaları rahat.',
      wifi: 4,
      comfort: 5,
      outlets: 4,
      createdAt: new Date().toISOString(),
    },
  ],
  '3': [
    {
      id: 'r4',
      author: 'Selin',
      text: 'Specialty coffee, çalışmaya uygun.',
      wifi: 4,
      comfort: 5,
      outlets: 3,
      createdAt: new Date().toISOString(),
    },
  ],
};
