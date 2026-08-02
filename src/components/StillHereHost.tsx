import { router } from 'expo-router';
import { afterSheetClose } from '@/components/Sheet';
import { StillHerePrompt } from '@/components/StillHerePrompt';
import { usePlaces } from '@/context/PlacesContext';

/** Global “Mekanda mısınız?” popup — bildirim veya başka ekranlardan açılır. */
export function StillHereHost() {
  const {
    stillHerePlaceId,
    getPlace,
    labelFor,
    confirmStillHere,
    dismissStillHerePrompt,
    leaveFromStillHere,
  } = usePlaces();
  const place = stillHerePlaceId ? getPlace(stillHerePlaceId) : undefined;

  return (
    <StillHerePrompt
      visible={stillHerePlaceId != null}
      placeName={place ? labelFor(place) : undefined}
      onStay={confirmStillHere}
      onLeave={() => {
        const placeId = leaveFromStillHere();
        if (placeId) afterSheetClose(() => router.push(`/rate/${placeId}`));
      }}
      onDismiss={dismissStillHerePrompt}
    />
  );
}
