# Raslash store release checklist

## Crash-fix QA snapshot (2026-09-12)

- Sentry `RASLASH-1` is a native iOS Apple Maps marker insertion crash on
  `1.0.1 (16)`. The repository backports the upstream `react-native-maps`
  `AIRMap.m` guard for SDK 54's pinned version `1.20.1`; the EAS build log
  confirms the patch ran.
- iOS `1.0.1 (17)` build
  `872bf8fa-7a33-4c4b-a679-b97c4dc1ab06` finished and was uploaded to App
  Store Connect for TestFlight processing. It has **not** been submitted for
  App Review. Repeat map filtering, marker selection and panning on a physical
  iPhone before selecting this build for review or resolving the Sentry issue.
- Android internal test APK build
  `8225411f-8382-41a4-abdf-c6bed73fed88` finished. It installed and opened
  on a Pixel 9 emulator; login-to-sign-up navigation worked without an app
  fatal error. Map, check-in and messaging still need a signed-in device test.
- Do not submit Android for review yet: the Play subscription has no active
  base plan, the RevenueCat Play catalog/default offering has no Android
  products, Play still shows a broken-functionality rejection, and the current
  Android store screenshots contain an iPhone frame. Capture real Android
  screens from the final build and finish the purchase test first.

## Already configured

- Expo/EAS project: `@protrom/raslash`
- EAS project ID: `259d28aa-9faf-4c19-b0c7-818245ea486a`
- iOS bundle identifier: `com.raslash.app`
- Android package: `com.raslash.app`
- Store builds: `npx eas-cli@latest build --profile production --platform ios|android`
- Store submissions: `npx eas-cli@latest submit --profile production --platform ios|android`
- The previous Apple metadata targeted version `1.0`. The repository now prepares
  version `1.0.1`; the final remote build number and App Store Connect selection
  must be verified after the new production build completes.
- Historical EAS submission `ac567522-f435-4934-8f54-9efa644b1ccb` completed
  successfully for the earlier release; it is not the `1.0.1` submission.
- `store.config.json` now targets Apple version `1.0.1` and contains Turkish and
  English release notes. Sync it only after the `1.0.1` version exists in App Store Connect.

## Accounts and signing

- [x] Active Apple Developer Program membership
- [x] App created in App Store Connect with bundle ID `com.raslash.app`
- [ ] Re-verify the Google Play Console developer account and access roles in the console
- [ ] Re-verify the Play app record uses package `com.raslash.app`
- [ ] Verify whether Play Console still requires the first Android `.aab` upload manually

## Privacy and compliance

- [x] Publish and verify `https://raslash-privacy.expo.app/privacy`
- [x] Explain location use: nearby places and proximity-based check-in
- [x] Explain photo use: optional profile avatar upload
- [x] Document Supabase as the account/data processor
- [x] Document RevenueCat only when purchases are enabled
- [x] Complete App Store privacy nutrition labels, including Precise Location for App Functionality
- [x] Add the Expo push token disclosure to the metadata source as a user-linked Device ID used for App Functionality, not tracking
- [ ] Sync the Device ID disclosure to App Store Connect and complete the matching Google Play Data safety answer (`Device or other IDs`)
- [ ] Complete and submit the Google Play Data safety form
- [x] Provide account deletion instructions and an in-app deletion path before review
- [x] Add a public, privacy-safe external account-deletion request route at `/delete-account`
- [ ] Deploy and verify `https://raslash-privacy.expo.app/delete-account`, then enter it in Google Play's account-deletion URL field
- [x] Add in-app message reporting, user blocking, and basic objectionable-content filtering
- [x] Hide developer/demo controls from production builds
- [x] Remove seeded fake chat messages from production

## Store listing

- [x] Final app name
- [x] Subtitle / short description
- [x] Full description
- [x] Keywords (App Store)
- [x] Category draft
- [x] Age rating questionnaire (messaging, user-generated content, and mild profanity declared)
- [x] Support URL and contact email
- [x] Add Turkish and English `1.0.1` What's New text to the metadata source
- [ ] Optional: provide native iPhone 6.9-inch captures instead of relying on Apple's accepted 6.5-inch scaling
- [x] Provide three technically valid iPhone 6.5-inch JPEG assets (`1242×2688`)
- [ ] Replace or validate sample counts, people and venues in the iPhone Figma compositions against the final release build
- [ ] Capture native Android phone screenshots from the final Android build; do not use the current iPhone-framed mockups
- [ ] Add at least four 9:16 Android screenshots at 1080 px or greater for Google Play recommendation eligibility
- [x] App review notes and a confirmed review account (`appreview@protrom.com`; password kept out of git)
- [x] Restrict the proximity bypass to a server-managed App Review account flag

## Branding

- [x] Replace `assets/icon.png` with an opaque 1024×1024 RASLASH icon
- [x] Replace/check Android adaptive foreground and background assets
- [ ] Check splash assets on light and dark devices

## RevenueCat

- The repository keeps the paywall disabled unless `EXPO_PUBLIC_ENABLE_PAYWALL=true` is supplied by the selected EAS environment.
- [ ] Re-verify matching App Store and Play subscription products in their consoles
- [ ] Re-verify the RevenueCat apps, `pro` entitlement, `default` offering and monthly/yearly packages
- [ ] Re-verify iOS and Android public SDK keys in the EAS production environment without printing their values
- [ ] Enable the production paywall only after purchase, restore and entitlement refresh pass on physical iOS and Android devices

## Supabase production

- [x] Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in EAS preview and production
- [x] Confirm Email, Apple, and Google providers are enabled and `raslash://auth/callback` is allowed
- [x] Confirm the `delete-account` Edge Function is deployed
- [ ] Do not re-run `supabase/schema.sql` or `supabase/avatars_storage.sql` on the existing production project
- [ ] Do not use `supabase/sync_policy.sql` in production
- [x] Applied `supabase/migrations/20260802170136_harden_production_rls.sql` through the migration workflow
- [x] Applied `supabase/migrations/20260816171103_add_chat_moderation.sql` to production
- [x] Applied `supabase/migrations/20260825085342_add_onboarding_completed.sql` idempotently to production and verified profile RLS/column grants
- [x] Registered migration version `20260816171103` in the production migration history
- [x] Keep `supabase/rollback/20260802170136_harden_production_rls_rollback.sql` for emergency rollback only
- [x] Keep `SUPABASE_SERVICE_ROLE_KEY` server-side only
- [x] Run `node scripts/check-supabase.mjs` (`REST places status: 200`)
- [x] Verify moderation tables have RLS, authenticated grants, no anon grants, and scoped policies
- [x] Re-run Supabase security and performance advisors after the migration (0 errors; 1 pre-existing Auth warning)
