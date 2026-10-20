import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useApp } from '@/context/AppContext';
import { socialAction, socialErrorText } from '@/lib/socialDiscovery';

/**
 * Memory only; polls while focused and foreground. Data is keyed by account +
 * request, so a different account's rows are never returned, while the same
 * account keeps its last rows across Control Center, notifications, background
 * and blur and refreshes them silently.
 */
export function useSocialQuery<T>(action: string, payload: Record<string, unknown> = {}, enabled = true, interval = 15000) {
  const { user } = useApp();
  const key = `${user?.id ?? ''}:${action}:${JSON.stringify(payload)}:${enabled}`;
  const [state, setState] = useState<{ key: string; data?: T; error?: string; loading: boolean }>({ key, loading: true });
  const reloadRef = useRef<() => Promise<void>>(async () => {});
  useFocusEffect(useCallback(() => {
    let live = true, generation = 0, inFlight = false;
    const active = enabled && !!user?.id;
    const refresh = async () => {
      if (!live || !active || inFlight || AppState.currentState !== 'active') return;
      inFlight = true;
      const ticket = generation;
      try {
        const data = await socialAction<T>(action, payload);
        if (live && generation === ticket) setState({ key, data, loading: false });
      } catch (error) {
        if (live && generation === ticket) setState((previous) => previous.key === key && previous.data !== undefined
          // A failed background poll keeps the last good rows; the next poll retries.
          ? previous : { key, error: socialErrorText(error), loading: false });
      } finally { if (generation === ticket) inFlight = false; }
    };
    // Keep rows only when they belong to this exact key (same account and request).
    setState((previous) => previous.key === key && previous.data !== undefined ? previous : { key, loading: active });
    reloadRef.current = refresh;
    void refresh();
    const timer = setInterval(() => { void refresh(); }, interval);
    const sub = AppState.addEventListener('change', (next) => {
      // `inactive` (Control Center, notification banner, app switcher) is transient: ignore it.
      if (next === 'inactive') return;
      // Drop replies started before leaving, but keep showing the rows we have.
      generation += 1; inFlight = false;
      if (next === 'active') void refresh();
    });
    return () => { live = false; generation += 1; clearInterval(timer); sub.remove(); reloadRef.current = async () => {}; };
    // `key` contains all payload/auth inputs, avoiding a fresh object effect loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, interval]));
  const refresh = useCallback(() => reloadRef.current(), []);
  const current = state.key === key;
  return { data: current ? state.data : undefined,
    error: current ? state.error : undefined,
    loading: current ? state.loading : true, refresh };
}
