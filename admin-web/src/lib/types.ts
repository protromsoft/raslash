export type PlaceStatus = 'approved' | 'pending' | 'rejected';

export type Place = {
  id: string;
  google_place_id?: string | null;
  name: string;
  category: string | null;
  city: string | null;
  latitude: number;
  longitude: number;
  image_url: string | null;
  source: 'google' | 'user';
  status: PlaceStatus;
  submitted_by_name?: string | null;
  created_at?: string;
  last_synced_at?: string | null;
};

export type PlaceInput = {
  name: string;
  category: string;
  city: string;
  latitude: number;
  longitude: number;
  image_url?: string | null;
  source?: 'google' | 'user';
  status?: PlaceStatus;
  submitted_by_name?: string | null;
};

export type Rating = {
  id: string;
  place_id: string;
  place_name?: string;
  author_name?: string | null;
  wifi: number;
  comfort: number;
  outlets: number;
  review: string | null;
  created_at: string;
};

export type NotificationRow = {
  id: string;
  title: string;
  body: string;
  type: string;
  place_id?: string | null;
  read: boolean;
  created_at: string;
};

export type AdminMessage = {
  id: string;
  placeId: string;
  placeName: string;
  userId: string;
  userName: string;
  body: string;
  createdAt: string;
};

export type AdminNotification = {
  id: string;
  recipientId: string | null;
  recipientName: string;
  title: string;
  body: string;
  type: string;
  placeId: string | null;
  placeName: string | null;
  read: boolean;
  createdAt: string;
};

export type AdminPage<T> = {
  items: T[];
  total: number;
};

export type DashboardStats = {
  approved: number;
  pending: number;
  rejected: number;
  ratings: number;
};
