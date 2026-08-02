# Raslash store release checklist

## Already configured

- Expo/EAS project: `@protrom/raslash`
- EAS project ID: `259d28aa-9faf-4c19-b0c7-818245ea486a`
- iOS bundle identifier: `com.raslash.app`
- Android package: `com.raslash.app`
- Store builds: `npx eas-cli@latest build --profile production --platform ios|android`
- Store submissions: `npx eas-cli@latest submit --profile production --platform ios|android`

## Accounts and signing

- [ ] Active Apple Developer Program membership
- [ ] App created in App Store Connect with bundle ID `com.raslash.app`
- [ ] Google Play Console developer account
- [ ] App created in Play Console with package `com.raslash.app`
- [ ] First Android `.aab` uploaded manually if Play Console requires it

## Privacy and compliance

- [ ] Publish a public HTTPS Privacy Policy URL
- [ ] Explain location use: nearby places and proximity-based check-in
- [ ] Explain photo use: optional profile avatar upload
- [ ] Document Supabase as the account/data processor
- [ ] Document RevenueCat only when purchases are enabled
- [ ] Complete App Store privacy nutrition labels
- [ ] Complete Google Play Data safety form
- [ ] Provide account deletion instructions and an in-app deletion path before review

## Store listing

- [ ] Final app name
- [ ] Subtitle / short description
- [ ] Full description
- [ ] Keywords (App Store)
- [ ] Category
- [ ] Age rating questionnaire
- [ ] Support URL and contact email
- [ ] iPhone 6.7-inch screenshots
- [ ] iPhone 6.5-inch screenshots if required for the selected device coverage
- [ ] Android phone screenshots
- [ ] App review notes and a working review account

## Branding

- [ ] Replace `assets/icon.png`; it is still the Expo template icon
- [ ] Replace/check Android adaptive foreground and background assets
- [ ] Check splash assets on light and dark devices

## RevenueCat

- Paywall is disabled by default with `EXPO_PUBLIC_ENABLE_PAYWALL=false`.
- [ ] Create matching App Store and Play subscription products
- [ ] Configure RevenueCat apps, `pro` entitlement, offering, and packages
- [ ] Add iOS and Android public SDK keys to EAS production environment variables
- [ ] Set `EXPO_PUBLIC_ENABLE_PAYWALL=true` only after sandbox purchases and restore pass

## Supabase production

- [x] Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in EAS preview and production
- [ ] Do not re-run `supabase/schema.sql` or `supabase/avatars_storage.sql` on the existing production project
- [ ] Do not use `supabase/sync_policy.sql` in production
- [x] Applied `supabase/migrations/20260802170136_harden_production_rls.sql` through the migration workflow
- [x] Keep `supabase/rollback/20260802170136_harden_production_rls_rollback.sql` for emergency rollback only
- [ ] Keep `SUPABASE_SERVICE_ROLE_KEY` server-side only
- [x] Run `node scripts/check-supabase.mjs` (`REST places status: 200`)
- [ ] Verify RLS with anonymous, normal-user, and admin sessions
- [ ] Re-run Supabase security and performance advisors after the migration
