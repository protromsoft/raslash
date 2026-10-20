import { Redirect } from 'expo-router';

/**
 * Age and profession moved onto the profile step (`/onboarding/name`). The
 * route stays so an old link or a restored navigation state does not 404.
 */
export default function OnboardingDetailsRedirect() {
  return <Redirect href="/onboarding/name" />;
}
