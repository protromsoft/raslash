# Push notifications rollout

## Implemented

- Expo SDK 54 compatible `expo-notifications` and `expo-device` packages.
- Optional onboarding permission step with **Devam** and **Şimdilik geç** actions.
- Notification status and Settings shortcut under Profile.
- Expo push token registration in `public.push_devices` with per-user RLS.
- Token removal on sign-out and automatic deletion when the account is deleted.
- A three-hour local check-in reminder, cancelled on check-out.
- Notification taps open the related place and the active check-in confirmation prompt.
- Admin-only `send-push-notification` Edge Function and Admin > Bildirim composer.

## Native credentials configured (2026-09-09)

1. APNs push key is assigned in EAS credentials for `com.raslash.app`.
2. Firebase project `raslash` contains the Android app `com.raslash.app`.
3. `google-services.json` is referenced by `expo.android.googleServicesFile`.
4. A dedicated FCM service account with only the Firebase Cloud Messaging API Admin role is
   assigned to EAS for FCM V1.

## Required before release

1. Create fresh EAS production builds. The notification config plugin changes native projects;
   an older installed binary cannot receive these changes.
2. On a physical iPhone and Android phone:
   - uninstall the previous build;
   - install the fresh build;
   - complete onboarding with **Devam** and grant the system permission;
   - confirm a row appears in `public.push_devices`;
   - send a short message from Admin > Bildirim;
   - make and end a check-in, confirming the scheduled reminder is cancelled.

## Store privacy answers

- App Store Connect: disclose the push token under **Identifiers / Device ID**, linked to the user,
  used for **App Functionality**, not for tracking.
- Google Play Data safety: disclose **Device or other IDs**, collected for app functionality, not
  shared or used for advertising.

Remote push requires a physical device and a development/production build. On Android, remote push
is not available in Expo Go; local notifications still work there.
