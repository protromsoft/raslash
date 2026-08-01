export type RatingScores = {
  wifi: number;
  comfort: number;
  outlets: number;
};

export type Review = RatingScores & {
  id: string;
  author: string;
  text?: string;
  createdAt: string;
};

export type PlaceStatus = 'approved' | 'pending' | 'rejected';

export type Place = {
  id: string;
  googlePlaceId?: string;
  name: string;
  category: string;
  city: string;
  latitude: number;
  longitude: number;
  imageUrl?: string;
  source: 'google' | 'user';
  status: PlaceStatus;
  submittedByName?: string;
};

export type PlaceWithStats = Place & {
  wifi: number;
  comfort: number;
  outlets: number;
  overall: number;
  reviewCount: number;
  checkedInCount: number;
  reviews: Review[];
};

export type ActiveCheckIn = {
  placeId: string;
  startedAt: string;
  /** 3 saat hatırlatması gönderildi mi */
  remindedAt?: string;
  /** Kullanıcı "Mekandayım" dedi */
  confirmedAt?: string;
};

export type AppNotification = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  placeId?: string;
  type: 'place_approved' | 'place_rejected' | 'system' | 'still_here';
};

export type ChatPerson = {
  id: string;
  firstName: string;
  lastName?: string;
  avatarUrl?: string;
  isMe?: boolean;
};

export type Regular = {
  userKey: string;
  firstName: string;
  lastName?: string;
  avatarUrl?: string;
  visits: number;
  rank: number;
};
