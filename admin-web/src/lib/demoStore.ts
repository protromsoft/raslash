import type { NotificationRow, Place, PlaceInput, Rating } from './types';

const KEYS = {
  places: 'raslash.admin.places',
  ratings: 'raslash.admin.ratings',
  notifications: 'raslash.admin.notifications',
};

const seedPlaces: Place[] = [
  {
    id: 'p1',
    name: 'Starbucks Karaköy',
    category: 'Cafe',
    city: 'Istanbul',
    latitude: 41.0246,
    longitude: 28.977,
    image_url: 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=800&q=80',
    source: 'google',
    status: 'approved',
  },
  {
    id: 'pending1',
    name: 'Kullanıcı Cafe Önerisi',
    category: 'Cafe',
    city: 'Istanbul',
    latitude: 41.03,
    longitude: 28.98,
    image_url: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=800&q=80',
    source: 'user',
    status: 'pending',
    submitted_by_name: 'Cem',
  },
];

const seedRatings: Rating[] = [
  {
    id: 'r1',
    place_id: 'p1',
    author_name: 'Elif',
    wifi: 5,
    comfort: 4,
    outlets: 5,
    review: 'Priz bol, wifi iyi.',
    created_at: new Date().toISOString(),
  },
];

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}

export const demoStore = {
  listPlaces(): Place[] {
    const places = read(KEYS.places, seedPlaces);
    if (!localStorage.getItem(KEYS.places)) write(KEYS.places, places);
    return places;
  },
  listPending(): Place[] {
    return this.listPlaces().filter((p) => p.status === 'pending');
  },
  listApproved(): Place[] {
    return this.listPlaces().filter((p) => p.status === 'approved');
  },
  listRejected(): Place[] {
    return this.listPlaces().filter((p) => p.status === 'rejected');
  },
  approve(id: string) {
    const places = this.listPlaces().map((p) =>
      p.id === id ? { ...p, status: 'approved' as const } : p,
    );
    write(KEYS.places, places);
    const place = places.find((p) => p.id === id);
    if (place) {
      this.pushNotification({
        title: 'Mekanın onaylandı',
        body: `"${place.name}" artık haritada listeleniyor.`,
        type: 'place_approved',
        place_id: place.id,
      });
    }
  },
  reject(id: string) {
    const places = this.listPlaces();
    const place = places.find((p) => p.id === id);
    write(
      KEYS.places,
      places.map((p) => (p.id === id ? { ...p, status: 'rejected' as const } : p)),
    );
    if (place) {
      this.pushNotification({
        title: 'Mekan reddedildi',
        body: `"${place.name}" listeye eklenmedi.`,
        type: 'place_rejected',
        place_id: place.id,
      });
    }
  },
  updateImage(id: string, image_url: string) {
    write(
      KEYS.places,
      this.listPlaces().map((p) => (p.id === id ? { ...p, image_url } : p)),
    );
  },
  updatePlace(id: string, patch: Partial<Place>) {
    write(
      KEYS.places,
      this.listPlaces().map((p) => (p.id === id ? { ...p, ...patch } : p)),
    );
  },
  deletePlace(id: string) {
    write(
      KEYS.places,
      this.listPlaces().filter((p) => p.id !== id),
    );
    write(
      KEYS.ratings,
      this.listRatings().filter((r) => r.place_id !== id),
    );
  },
  createPlace(input: PlaceInput): Place {
    const place: Place = {
      id: `p_${Date.now()}`,
      name: input.name,
      category: input.category,
      city: input.city,
      latitude: input.latitude,
      longitude: input.longitude,
      image_url: input.image_url ?? null,
      source: input.source ?? 'user',
      status: input.status ?? 'approved',
      submitted_by_name: input.submitted_by_name ?? 'Admin',
      created_at: new Date().toISOString(),
    };
    write(KEYS.places, [place, ...this.listPlaces()]);
    return place;
  },
  listRatings(placeId?: string): Rating[] {
    const ratings = read(KEYS.ratings, seedRatings);
    if (!localStorage.getItem(KEYS.ratings)) write(KEYS.ratings, ratings);
    return placeId ? ratings.filter((r) => r.place_id === placeId) : ratings;
  },
  deleteRating(id: string) {
    write(
      KEYS.ratings,
      this.listRatings().filter((r) => r.id !== id),
    );
  },
  addRating(placeId: string, review: string) {
    const row: Rating = {
      id: `r_${Date.now()}`,
      place_id: placeId,
      author_name: 'Admin',
      wifi: 4,
      comfort: 4,
      outlets: 4,
      review,
      created_at: new Date().toISOString(),
    };
    write(KEYS.ratings, [row, ...this.listRatings()]);
  },
  listNotifications(): NotificationRow[] {
    return read(KEYS.notifications, []);
  },
  pushNotification(input: {
    title: string;
    body: string;
    type: string;
    place_id?: string;
  }) {
    const row: NotificationRow = {
      id: `n_${Date.now()}`,
      title: input.title,
      body: input.body,
      type: input.type,
      place_id: input.place_id,
      read: false,
      created_at: new Date().toISOString(),
    };
    write(KEYS.notifications, [row, ...this.listNotifications()]);
  },
};
