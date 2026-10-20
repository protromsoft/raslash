import type { ImageSourcePropType } from 'react-native';
import type { SocialPerson } from '@/lib/socialDiscovery';

/** Fictional, device-only design fixtures. Never insert these into Auth/DB or send a DM to them. */
const profiles = [
  { id: 'demo:defne', first_name: 'Defne', profession: 'Ürün tasarımcısı', bio: 'Kahve, tasarım ve yeni fikirler.', portrait: require('../../assets/demo-people/defne-v1.png') },
  { id: 'demo:emre', first_name: 'Emre', profession: 'Yazılım geliştirici', bio: 'Birlikte üretmek her zaman daha keyifli.', portrait: require('../../assets/demo-people/emre-v1.png') },
  { id: 'demo:ece', first_name: 'Ece', profession: 'İçerik üreticisi', bio: 'Yeni mekânlar ve güzel sohbetler peşinde.', portrait: require('../../assets/demo-people/ece-v1.png') },
  { id: 'demo:kerem', first_name: 'Kerem', profession: 'Mimar', bio: 'Eskiz defterim ve kahvem hep yanımda.', portrait: require('../../assets/demo-people/kerem-v1.png') },
];

export function demoPortrait(id: string): ImageSourcePropType | undefined {
  return profiles.find((person) => person.id === id)?.portrait;
}

type Venue = { id: string; name: string; latitude: number; longitude: number; city: string };
export function discoveryDemoPeople(venues: Venue[]): SocialPerson[] {
  const usable = venues.filter((venue) => Number.isFinite(venue.latitude) && Math.abs(venue.latitude) <= 90
    && Number.isFinite(venue.longitude) && Math.abs(venue.longitude) <= 180);
  if (!usable.length) return [];
  // Use existing venue points for a visual preview, not invented live GPS locations.
  return profiles.map(({ portrait: _portrait, ...person }, index) => {
    const venue = usable[Math.floor(index * usable.length / profiles.length)];
    return { ...person, place_id: venue.id, place_name: venue.name, city: venue.city,
      latitude: venue.latitude, longitude: venue.longitude, allow_dm_requests: false };
  });
}
