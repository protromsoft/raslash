/** Keep routing decisions independent of animation timing and store requests. */
export function startupDestination(state: {
  ready: boolean;
  syncing: boolean;
  hasSession: boolean;
  authRequired: boolean;
  onboardingComplete: boolean;
}): '/auth/login' | '/onboarding' | '/(tabs)' | null {
  if (!state.ready || (state.hasSession && state.syncing)) return null;
  if (state.authRequired && !state.hasSession) return '/auth/login';
  return state.onboardingComplete ? '/(tabs)' : '/onboarding';
}

/** Expo SDK 54 supports system-font fallback when runtime font loading fails. */
export function fontsSettled(loaded: boolean, error: Error | null): boolean {
  return loaded || error !== null;
}
