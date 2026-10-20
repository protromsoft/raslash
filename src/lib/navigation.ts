import { router } from 'expo-router';

/**
 * Back, or the map when there is nothing to go back to: a screen opened from a
 * notification or link sits alone on the stack and `router.back()` throws there.
 */
export function goBackOrHome() {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)');
}
