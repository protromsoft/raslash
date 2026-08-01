import { router } from 'expo-router';
import { StillHerePrompt } from '@/components/StillHerePrompt';
import { usePlaces } from '@/context/PlacesContext';

/** Global “Mekanda mısınız?” popup — bildirim veya başka ekranlardan açılır. */
export function StillHereHost() {
  const {
    stillHerePlaceId,
    getPlace,
    confirmStillHere,
    dismissStillHerePrompt,
    leaveFromStillHere,
  } = usePlaces();
  const place = stillHerePlaceId ? getPlace(stillHerePlaceId) : undefined;

  return (
    <StillHerePrompt
      visible={stillHerePlaceId != null}
      placeName={place?.name}
      onStay={confirmStillHere}
      onLeave={() => {
        const placeId = leaveFromStillHere();
        if (placeId) router.push(`/rate/${placeId}`);
      }}
      onDismiss={dismissStillHerePrompt}
    />
  );
}
