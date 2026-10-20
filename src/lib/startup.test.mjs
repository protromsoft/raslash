import assert from 'node:assert/strict';
import test from 'node:test';
import { fontsSettled, startupDestination } from './startup.ts';

const returningUser = {
  ready: true, syncing: false, hasSession: true,
  authRequired: true, onboardingComplete: true,
};

test('does not fade or redirect while initial state is loading', () => {
  assert.equal(startupDestination({ ...returningUser, ready: false }), null);
});

test('does not send a signed-in user to onboarding while their profile is loading', () => {
  assert.equal(startupDestination({
    ...returningUser, syncing: true, onboardingComplete: false,
  }), null);
  assert.equal(startupDestination(returningUser), '/(tabs)');
});

test('signed-out users go to login even if the local onboarding flag is stale', () => {
  assert.equal(startupDestination({ ...returningUser, hasSession: false }), '/auth/login');
});

test('onboarding is required only after the session/profile gate is ready', () => {
  assert.equal(startupDestination({ ...returningUser, onboardingComplete: false }), '/onboarding');
});

test('local demo mode preserves its onboarding route without a session', () => {
  assert.equal(startupDestination({
    ...returningUser, authRequired: false, hasSession: false,
  }), '/(tabs)');
});

test('font load failure releases the native splash just like successful loading', () => {
  assert.equal(fontsSettled(false, null), false);
  assert.equal(fontsSettled(true, null), true);
  assert.equal(fontsSettled(false, new Error('font unavailable')), true);
});
