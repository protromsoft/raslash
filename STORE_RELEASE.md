# Raslash store release checklist

## Already configured

- Expo/EAS project: `@protrom/raslash`
- EAS project ID: `259d28aa-9faf-4c19-b0c7-818245ea486a`
- iOS bundle identifier: `com.raslash.app`
- Android package: `com.raslash.app`
- Store builds: `npx eas-cli@latest build --profile production --platform ios|android`
- Store submissions: `npx eas-cli@latest submit --profile production --platform ios|android`
- Latest store build is iOS `1.0.0 (4)` from commit `75b1813`; EAS submission
  `ac567522-f435-4934-8f54-9efa644b1ccb` finished successfully.
- Validated `store.config.json` metadata was synced to App Store Connect.

## Accounts and signing

- [x] Active Apple Developer Program membership
- [x] App created in App Store Connect with bundle ID `com.raslash.app`
- [ ] Google Play Console developer account
- [ ] App created in Play Console with package `com.raslash.app`
- [ ] First Android `.aab` uploaded manually if Play Console requires it

## Privacy and compliance

- [x] Publish and verify `https://raslash-privacy.expo.app/privacy`
- [x] Explain location use: nearby places and proximity-based check-in
- [x] Explain photo use: optional profile avatar upload
- [x] Document Supabase as the account/data processor
- [x] Document RevenueCat only when purchases are enabled
- [ ] Complete App Store privacy nutrition labels
- [ ] Complete Google Play Data safety form
- [x] Provide account deletion instructions and an in-app deletion path before review
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
- [ ] iPhone 6.9-inch screenshots
- [ ] iPhone 6.5-inch screenshots only if 6.9-inch screenshots are not provided
- [ ] Android phone screenshots
- [x] App review notes and a confirmed review account (`appreview@protrom.com`; password kept out of git)
- [x] Restrict the proximity bypass to a server-managed App Review account flag

## Branding

- [x] Replace `assets/icon.png` with an opaque 1024×1024 RASLASH icon
- [x] Replace/check Android adaptive foreground and background assets
- [ ] Check splash assets on light and dark devices

## RevenueCat

- Paywall is disabled by default with `EXPO_PUBLIC_ENABLE_PAYWALL=false`.
- [ ] Create matching App Store and Play subscription products
- [ ] Configure RevenueCat apps, `pro` entitlement, offering, and packages
- [ ] Add iOS and Android public SDK keys to EAS production environment variables
- [ ] Set `EXPO_PUBLIC_ENABLE_PAYWALL=true` only after sandbox purchases and restore pass

## Supabase production

- [x] Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in EAS preview and production
- [x] Confirm Email, Apple, and Google providers are enabled and `raslash://auth/callback` is allowed
- [x] Confirm the `delete-account` Edge Function is deployed
- [ ] Do not re-run `supabase/schema.sql` or `supabase/avatars_storage.sql` on the existing production project
- [ ] Do not use `supabase/sync_policy.sql` in production
- [x] Applied `supabase/migrations/20260802170136_harden_production_rls.sql` through the migration workflow
- [x] Applied `supabase/migrations/20260816171103_add_chat_moderation.sql` to production
- [x] Registered migration version `20260816171103` in the production migration history
- [x] Keep `supabase/rollback/20260802170136_harden_production_rls_rollback.sql` for emergency rollback only
- [x] Keep `SUPABASE_SERVICE_ROLE_KEY` server-side only
- [x] Run `node scripts/check-supabase.mjs` (`REST places status: 200`)
- [x] Verify moderation tables have RLS, authenticated grants, no anon grants, and scoped policies
- [x] Re-run Supabase security and performance advisors after the migration (0 errors; 1 pre-existing Auth warning)
