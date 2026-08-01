import type { Place, PlaceWithStats, RatingScores, Review } from '@/data/types';

export function averageScores(reviews: Review[]): RatingScores & { overall: number } {
  if (reviews.length === 0) {
    return { wifi: 0, comfort: 0, outlets: 0, overall: 0 };
  }
  const wifi = reviews.reduce((s, r) => s + r.wifi, 0) / reviews.length;
  const comfort = reviews.reduce((s, r) => s + r.comfort, 0) / reviews.length;
  const outlets = reviews.reduce((s, r) => s + r.outlets, 0) / reviews.length;
  const overall = (wifi + comfort + outlets) / 3;
  return {
    wifi: round1(wifi),
    comfort: round1(comfort),
    outlets: round1(outlets),
    overall: round1(overall),
  };
}

export function withStats(
  place: Place,
  reviews: Review[],
  checkedInCount = 0,
): PlaceWithStats {
  const scores = averageScores(reviews);
  return {
    ...place,
    ...scores,
    reviewCount: reviews.length,
    checkedInCount,
    reviews: [...reviews].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    ),
  };
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
