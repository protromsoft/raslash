import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { AppState } from 'react-native';
import { useApp } from '@/context/AppContext';
import { usePlaces } from '@/context/PlacesContext';
import type { ChatPerson } from '@/data/types';

export const NO_ACTIVE_PEOPLE: ChatPerson[] = [];

/** Same-place access only; never cache identities in persistent storage. */
export function useActivePeople(placeId?: string) {
  const { user } = useApp();
  const { activeCheckIn, getActivePeopleForPlace } = usePlaces();
  const allowed = !!user?.id && !!placeId && activeCheckIn?.placeId === placeId &&
    activeCheckIn.userId === user.id;
  const scope = allowed ? `${user!.id}:${placeId}:${activeCheckIn!.startedAt}` : null;
  const [snapshot, setSnapshot] = useState<{ scope: string; people: ChatPerson[] } | null>(null);

  useFocusEffect(useCallback(() => {
    setSnapshot(null);
    if (!scope || !placeId) return;
    let disposed = false;
    let generation = 0;
    let inFlight = false;
    let foreground = AppState.currentState === 'active';

    const refresh = async () => {
      if (disposed || !foreground || inFlight) return;
      inFlight = true;
      const requestGeneration = generation;
      try {
        const people = await getActivePeopleForPlace(placeId);
        if (!disposed && foreground && requestGeneration === generation) {
          setSnapshot({ scope, people });
        }
      } catch {
        if (!disposed && requestGeneration === generation) setSnapshot(null);
      } finally {
        inFlight = false;
        // A foreground transition during the previous request invalidated it.
        // Refresh immediately rather than leaving the strip empty for 20s.
        if (!disposed && foreground && requestGeneration !== generation) void refresh();
      }
    };
    void refresh();
    const poll = setInterval(() => void refresh(), 20_000);
    const listener = AppState.addEventListener('change', (state) => {
      foreground = state === 'active';
      generation += 1;
      setSnapshot(null);
      if (foreground) void refresh();
    });
    return () => {
      disposed = true;
      clearInterval(poll);
      listener.remove();
      setSnapshot(null);
    };
  }, [getActivePeopleForPlace, placeId, scope]));

  // The synchronous scope check prevents even a single render of another
  // account/place's snapshot before effect cleanup runs.
  return scope && snapshot?.scope === scope ? snapshot.people : NO_ACTIVE_PEOPLE;
}
