# Check-in credits and RASLASH Pro rollout

Current status (2026-09-09): the additive database migration and three Edge
Functions are deployed to the RASLASH production Supabase project. RevenueCat
has the `pro` entitlement, `default` offering, App Store products, webhook and
Supabase secrets configured. Public iOS/Android SDK keys are present in the EAS
preview and production environments. Preview enables the paywall and credit
rules; production keeps both features disabled while version 1.0 is under App
Review. Google Play credentials and products are being completed before the
cross-platform sandbox test matrix is run.

## Product rule

- Every authenticated user gets one free check-in per `Europe/Istanbul` calendar day.
- Reopening the currently active venue does not consume another credit.
- Starting a different check-in, including after checkout, is a new access decision.
- An active RevenueCat-validated `pro` entitlement grants unlimited check-ins.
  Production purchases are used by store releases; sandbox purchases are also
  accepted so TestFlight, App Review and internal testers can verify the flow.
- The App Review account may be granted `app_metadata.app_review_access = true`; clients cannot set this value.

The database RPC is the source of truth. AsyncStorage and the RevenueCat SDK are UI caches only.

## RevenueCat contract

- Entitlement: `pro`
- Offering: `default`
- App Store products: `raslash_pro_monthly`, `raslash_pro_yearly`
- Google Play subscription: `raslash_pro`, with `monthly` and `yearly` base plans
- Configure both products in App Store Connect / Play Console first, then attach them to the RevenueCat offering.
- Add the iOS and Android public SDK keys to EAS as `EXPO_PUBLIC_REVENUECAT_IOS_KEY` and `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`.
- Add the RevenueCat secret REST API key to Supabase as `REVENUECAT_API_KEY`. Never use a public SDK key for the Edge Functions.
- Optional webhook URL: `<SUPABASE_URL>/functions/v1/revenuecat-webhook`; set its Authorization header to `Bearer <REVENUECAT_WEBHOOK_SECRET>`.

The app also calls `revenuecat-refresh` after purchase, restore, sign-in and a stale paywall decision. This keeps the core flow correct if webhook delivery is delayed. The webhook is still recommended for prompt refunds and transfers.

## Safe deployment order

1. Review and apply `supabase/migrations/20260908175819_add_checkin_credits_and_cities.sql`.
2. Set Supabase secrets: `GOOGLE_PLACES_API_KEY`, `REVENUECAT_API_KEY`, and optionally `REVENUECAT_WEBHOOK_SECRET`.
3. Deploy `revenuecat-refresh`, `revenuecat-webhook`, and `sync-places` Edge Functions. Keep JWT verification enabled.
4. Configure the `pro` entitlement, products and `default` offering in RevenueCat.
5. Produce an internal build with both `EXPO_PUBLIC_ENABLE_PAYWALL=true` and `EXPO_PUBLIC_ENABLE_CHECKIN_CREDITS=true`.
6. Complete the test matrix below on iPhone/iPad and Android before store submission.
7. Release the credits build. Do not apply `supabase/rollout/enforce_checkin_rpc_only.sql` while version 1.0 is still supported.
8. After the credits build is the minimum supported version, apply the enforcement SQL so direct table writes cannot bypass the quota.

## Required tests

- First daily check-in succeeds and the UI changes from `1 ücretsiz hak` to `0 ücretsiz hak`.
- Reopening the same active venue succeeds without another usage row.
- After checkout, a second free check-in opens the paywall and leaves the old state consistent.
- Two simultaneous first-check-in requests create one free usage and at most one active check-in.
- A production Pro account can switch venues without consuming the free credit.
- Purchase and restore update server access before returning to the venue.
- A RevenueCat-validated sandbox entitlement unlocks TestFlight/App Review testing and expires with the sandbox transaction; a client-only flag or cached value never unlocks server access.
- The free credit resets at midnight in Istanbul, including daylight-saving/time-zone boundary tests.
- Ankara and İzmir show only their own venues; switching cities re-centres the map.
- A non-admin cannot invoke `sync-places`; an admin can sync without exposing the Google key in the app bundle.
- Loss of network never creates a local-only phantom check-in.
- Version 1.0 can still check in before the RPC-only enforcement step.

## Emergency rollback

Turn `EXPO_PUBLIC_ENABLE_CHECKIN_CREDITS` off in a replacement build first. The data-preserving SQL rollback is in `supabase/rollback/20260908175819_add_checkin_credits_and_cities_rollback.sql`. It leaves cities, usage history and entitlement rows intact for investigation.
