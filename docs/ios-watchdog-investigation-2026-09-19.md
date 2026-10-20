# iOS 1.0.2 (24): watchdog investigation

Status: **root cause unconfirmed**. The original release hold was superseded by
the owner's explicit Apple-review request on 2026-09-29. Build 1.0.2 (25), which
contains the startup mitigations below, was submitted and verified **Waiting
for Review**. This is not a claim that the watchdog root cause is fixed. See
[the release record](./release-readiness-2026-09-29.md).

## Observed evidence

- Sentry [RASLASH-4](https://protrom.sentry.io/issues/148099863/) is a new fatal
  `WatchdogTermination` on `com.raslash.app@1.0.2+24`, production, native iOS.
- At inspection, one event / one installation was reported, timestamp
  2026-09-19 19:15:23.971 Europe/Istanbul. Native Sentry SDK: 8.56.1.
- The event has no stack frames, device model, OS version or memory measurement.
  Its recorded app state was foreground. The last UI breadcrumb names an
  `RNSScreen` titled `index`; that alone does not distinguish the splash route
  from the map's index route.
- RevenueCat offerings returned 200. A subscriber attribute request returned
  404 before a subscriber fetch returned 201. This sequence does not establish
  that RevenueCat caused the termination.
- Sentry's [watchdog documentation](https://docs.sentry.io/platforms/apple/guides/ios/configuration/watchdog-terminations/)
  explains that these events are synthesized on a subsequent launch using
  heuristics. A memory leak / OOM cannot be concluded from the message alone.
  No native termination or Jetsam report has been matched to this event yet.

## Store action

With explicit owner approval, cancelled only the iOS 1.0.2 (24) submission
`f4fc7beb-20b0-49f3-9096-1b74dceb0caf`. Verified **Removed** in App Store Connect.
Existing published versions, screenshots, credentials and Android review were
not changed. No issue was resolved/archived and crash reporting stays enabled.

## Local changes (not deployed)

These address independently observable startup defects, **not a proven fix for
RASLASH-4**:

1. Handle the font loader's error result using Expo SDK 54's documented
   system-font fallback. Previously a rejected font load left the native
   splash visible indefinitely.
2. Only fade the branded splash after auth/profile routing has a destination.
   Previously it faded after a fixed delay even if app bootstrap was still
   waiting. If profile syncing resumes during a fade, cancel it and restore
   the visible logo. Clean up timers and animations on unmount.
3. Add fixed, allowlisted startup-stage labels and an OS memory-warning
   breadcrumb. No email, user ID, message content, URL, route parameter or GPS
   is added by these diagnostics. No replay or screenshot capture was enabled.

Supabase calls, authorization rules, account information and production data
were not changed. The Supabase skill's security checks were used while inspecting
the bootstrap flow; no CLI login or keychain access was required.

## Verification

- TypeScript: passed.
- Pure routing/font policy + existing city/notification regressions: 17 passed.
- Actual TSX component tests (React 19.1 renderer; native APIs mocked): 3 passed,
  covering a slow bootstrap, profile-sync interruption during fade, font failure,
  and cleanup of timers/listeners. Renderer dependency is dev-only and pinned
  to 19.1.0. Its upstream deprecation warning is expected.
- iOS and Android production-mode Metro/Hermes exports passed, using
  `EXPO_NO_DOTENV=1` (no live account configuration or source-map upload).
  These are JS bundle checks, **not signed builds or live purchase tests**.
- A combined export initially included web and could not proceed because this
  repo lacks `react-native-web`; reran the intended iOS/Android targets only.
  No unrelated web dependency was added.
- No usable iOS simulator runtime is installed. The paired iPhone appeared in
  device inventory, but opening the device connection failed. No app on the
  phone was started/stopped, replaced or removed.

## Required before claiming resolution or submitting again

1. Obtain a reproduction or native crash/Jetsam report for build 24. Establish
   whether the owner actually ran it or only received the alert.
2. Connect/unlock the test iPhone; test a release configuration with fresh and
   restored sessions, delayed/offline networking, login, onboarding, map,
   paywall, and repeated foreground/background transitions. Preserve user data.
3. Compare process memory and native termination logs; treat absent Sentry
   events alone as insufficient evidence of a fix.
4. Validate a replacement signed test build before requesting resubmission.
   No new EAS build, production OTA or store resubmission was made in this step.
