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

export type DashboardStats = {
  approved: number;
  pending: number;
  rejected: number;
  ratings: number;
};
