# EAS Update — RASLASH

Configured for Expo SDK 54 on 2026-09-18. The first update-enabled native build
must be installed before a device can receive OTA updates. Earlier builds cannot
receive them.

## Configuration

- Project: `@protrom/raslash` (`259d28aa-9faf-4c19-b0c7-818245ea486a`)
- Updates endpoint: `https://u.expo.dev/259d28aa-9faf-4c19-b0c7-818245ea486a`
- Runtime policy: `appVersion`; currently `1.0.1`
- Channels: `preview`, `screenshot`, `production` match their build profiles.
- All three profiles use the EAS **production environment**. Test builds use the
  real backend, RevenueCat configuration and Android Maps key. A channel selects
  updates; an environment supplies build/bundle configuration. They are distinct.

Never reuse the same app version for incompatible native changes. Changing a
native dependency, config plugin, permission, or native patch requires a new
build and a new `expo.version` with this runtime policy. Incrementing only the
iOS build number or Android versionCode does not change the runtime version.

## Build and publish

EAS CLI commands below use the version verified for this setup. `npx expo` is
the separate CLI supplied by the installed Expo SDK.

```sh
# Build installable test binaries, after checking the current working tree.
npx --yes eas-cli@24.7.0 build --profile preview --platform all

# Publish a tested JS/assets change only to update-enabled test builds.
# Keep production as the environment even though the channel is preview.
npx --yes eas-cli@24.7.0 update --channel preview --environment production --platform all --message "Describe the change"
```

Before publishing, review `git status` and the diff. An EAS upload includes local
changes, not just the last Git commit. A JS export succeeding is not a device
test. Verify the native preview binary and the downloaded update on devices
before publishing the same tested code to `production`.

The standard updater checks/downloads during a cold start and applies the
downloaded update on a later restart. Do not force-reload during chat or a
purchase. Confirm the update ID in device logs/Expo update metrics when testing;
opening the app once is not proof that it loaded the OTA update.

Publish the test update after the binary's embedded bundle was created. An
older OTA will not replace a newer embedded bundle. To test delivery of the
same already-exported code, `eas update:republish --group <group-id>` gives it a
new timestamp without rebuilding the bundle; explicitly target `preview`.

On this Mac, EAS CLI's optional automatic fingerprint scan stalled for both
build and update. Retrying with `EAS_SKIP_AUTO_FINGERPRINT=1` completed that
step. This skips diagnostic fingerprint calculation, not the configured
`appVersion` runtime matching or native compilation.

Production publishing is a release action:

```sh
npx --yes eas-cli@24.7.0 update --channel production --environment production --platform all --message "Describe the tested fix"
```

Use `eas update:rollback` with the intended channel/platform if a published update
causes a regression. Preserve the built-in embedded update and anti-bricking
defaults. Do not publish an OTA to work around an incompatible native build.

## Sentry source maps for OTA

Native EAS Build uploads do not replace the separate source-map upload required
for each OTA export. Upload the **exact export directory** that was published;
do not rebuild/export it again for this step, because its debug IDs may change.
Republishing the same bundles does not require new source maps.

The existing SDK supplies the uploader (no new dependency needed). The local
wrapper checks the export metadata, bundle/map pairs and debug IDs, then maps
the separate OTA credential to the uploader's SENTRY_AUTH_TOKEN in memory:

```sh
# Read-only preflight, no token or network needed.
npm run sentry:ota -- /path/to/exact-export --check

# Uses the production ENVIRONMENT, but does not publish any OTA or native build.
npx --yes eas-cli@24.7.0 env:exec production 'npm run sentry:ota -- /path/to/exact-export' --non-interactive
```

Run this after each successful OTA export/publication using that exact output
directory. It is a separate step, not an automatic hook on `eas update`.
Never commit tokens or place them in EXPO_PUBLIC_* variables. The wrapper pins
the destination to `protrom/raslash`, sets SENTRY_URL explicitly, and disables
dotenv loading so unrelated local environment files cannot replace the supplied
upload settings. It rejects missing maps/credentials and unsafe path characters
(the installed SDK helper internally uses a shell).

On 2026-09-18, `eas env:exec production` provided SENTRY_ORG and SENTRY_PROJECT,
but **not** the cloud-only SENTRY_AUTH_TOKEN. Following explicit approval, a
separate organization token named **RASLASH EAS Update Sourcemaps** was created
with `org:ci` (source-map upload, release creation, code mappings; organization
scope). It is stored as **SENTRY_OTA_AUTH_TOKEN**, project-scoped, **Sensitive**,
in the EAS production environment. Authorized project members/CLI can read it.
The original **RASLASH EAS Build** token and Secret visibility are unchanged.
The OTA token is not stored in this repository or embedded in the mobile app.

Verified source-map debug IDs for the initial OTA bundles:

- iOS: `4cdfa845-dc4c-46aa-859f-adf11c8a5e3d`
- Android: `5d32e8c8-4998-416a-8076-86539ec3a22f`

The exact export was preserved at
`dist/ota-preview-20260918.g3ZAv4` (relative to this repository). Every copied
file's SHA-256 was checked against the original temporary export. `dist/` is
excluded from both Git and EAS build uploads. This is a local copy, not a remote
backup. The SDK uploader subsequently normalized each map's `debug_id` field
from its existing `debugId`; bundles and mapping contents were not re-exported.

### Sentry acceptance — 2026-09-18

- Both exact bundle/map pairs uploaded successfully using the separate token.
- iOS artifact upload: `7ab5db09-f8e4-5b6a-9ebf-9dedfa8f808b`.
- Android artifact upload: `8bb14268-0c67-5788-b1c2-71ddf9199f2b`.
- Sentry's RASLASH Source Map Uploads page showed both upload IDs at 20:16
  (Europe/Istanbul), each containing two files. Uploads are matched by debug ID;
  no release/dist was explicitly attached to these OTA artifacts.
- Wrapper checks passed for valid export, missing export, unsafe path and
  missing credentials. The real authenticated upload also completed.
- This verifies artifact acceptance, **not** end-to-end symbolication of a new
  device crash. No artificial production crash was triggered.
- No new build, production-channel OTA or store submission was performed.

## Validation before the first builds

- Existing notification tests and the new nearest-city tests passed (11 tests).
- TypeScript check passed.
- iOS and Android production JavaScript exports passed.
- Actual OTA download, restart and native location/map behavior require an
  installed update-enabled test build.

## First preview rollout — 2026-09-18

- Android preview build **16**:
  [a1401b52-6aba-47f9-b4f8-2f5a90ae0848](https://expo.dev/accounts/protrom/projects/raslash/builds/a1401b52-6aba-47f9-b4f8-2f5a90ae0848).
- iOS preview build **22** (ad hoc, registered devices; not TestFlight):
  [b97d5316-3067-4f20-8a21-4e4c1dad43c3](https://expo.dev/accounts/protrom/projects/raslash/builds/b97d5316-3067-4f20-8a21-4e4c1dad43c3).
- Initial update group: `5f02097a-3ad1-41dc-91d9-db41c0977c6c`.
- An intermediate republish while native compilation was running used group
  `4e3b8a6f-8714-4bd7-b049-28846644dd5c`.
- Final test baseline republished after **both builds finished** (same bundles):
  [12ca365e-a9f9-4dda-baf3-594e241ebce8](https://expo.dev/accounts/protrom/projects/raslash/updates/12ca365e-a9f9-4dda-baf3-594e241ebce8).
  Android update ID: `01a0b55f-1aad-7fa8-8630-12091156a4f7`.
  iOS update ID: `01a0b55f-1aad-7290-aa15-34fc7791f05c`.
- Channel `preview`, runtime `1.0.1`, EAS environment `production`.
- No store submission or production-channel update was performed.
- TypeScript and all 11 city/notification tests passed again before device QA.
- The update endpoint returned HTTP 200 with the expected platform-specific
  update IDs for runtime `1.0.1`; an unknown runtime returned HTTP 204 and no
  bundle. This verifies server selection, not successful on-device application.
- The iOS build finished successfully. The user subsequently confirmed that
  Ankara places appear automatically on the registered iPhone after the
  build-22 location test ("tamam geliyor"). This is user-reported verification
  of city selection, not a complete iOS regression test or proof of iOS OTA
  application by update ID.
- Hermes source maps were generated for both OTA bundles and subsequently
  accepted by Sentry (see the acceptance record above). End-to-end device-event
  symbolication remains unverified.

### Android native/OTA smoke test

- Build 16 finished successfully and was installed with `adb install -r` over
  build 14 on the existing `Raslash_Pixel_9_API_36` emulator. App data was not
  cleared and the app was not uninstalled.
- APK manifest inspection confirmed updates enabled, channel `preview`, runtime
  `1.0.1`, the correct update URL, `ALWAYS` check-on-launch and zero launch wait.
- First cold start displayed the login screen successfully. The update database
  contained the final Android OTA ID with zero launches (download complete).
- After force-stop and restart, that same OTA ID had `successful_launch_count=1`
  and `failed_launch_count=0`; the login screen rendered again. The embedded
  update ID was `06a35c6b-be9e-45af-a70f-1e88a084416f`, so this verifies that the
  downloaded OTA, rather than only the embedded bundle, was launched.
- No AndroidRuntime crash was observed in these two startup checks.
- This is **not** a complete signed-in app/location/purchase test. The emulator
  was logged out; Android location/map behavior and physical-device QA remain
  open. The separate iPhone Ankara result is recorded above.
- Only OTA metadata was read from the emulator; account storage was not read.
  Temporary root access for that read was returned to normal afterward.

## Production binaries — 2026-09-18

Requested after the preview location test and Sentry OTA source-map setup.
Built from the current working tree; no Git commit or push was performed here.

- Profile/environment/channel: `production`; store distribution; app `1.0.1`.
- iOS build **23**:
  [33df0e89-b07e-47c5-aa13-99871a95860d](https://expo.dev/accounts/protrom/projects/raslash/builds/33df0e89-b07e-47c5-aa13-99871a95860d).
  Finished; IPA artifact HEAD returned HTTP 200 (30,534,409 bytes).
- Android build **17**:
  [43a4505d-87c0-4646-9db1-bdb6dac3d4ad](https://expo.dev/accounts/protrom/projects/raslash/builds/43a4505d-87c0-4646-9db1-bdb6dac3d4ad).
  Finished; AAB artifact HEAD returned HTTP 200 (80,179,641 bytes).
- TypeScript and all 11 city/notification tests passed before upload.
- Both remote logs confirmed successful Sentry source-map upload.
- The build command initialized the empty `production` update channel/branch.
  It did **not** publish a production OTA.
- These are store binaries, not direct-install preview APK/ad hoc IPA builds.
  No TestFlight/Google Play upload, review submission or public release was
  performed. Their on-device regression checks remain a separate step.

References: [SDK 54 Updates](https://docs.expo.dev/versions/v54.0.0/sdk/updates/),
[EAS Update deployment](https://docs.expo.dev/eas-update/deployment/),
[Sentry with EAS Update](https://docs.expo.dev/guides/using-sentry/#usage-with-eas-update).

## Store submission follow-up — 2026-09-19

The owner authorized an Apple update and Android resubmission with the corrected
first store image. These actions do not constitute a public release.

### iOS version correction and submission

- Uploading existing iOS `1.0.1 (23)` failed: Apple rejected the already-closed
  `1.0.1` train with ITMS-90186 and ITMS-90062. Failed EAS submission:
  `576a5461-34a1-4b9b-9694-1b4caa659c0e`. Do not retry that binary.
- Bumped the marketing version in `app.json`, `package.json` and both root
  package-lock entries to `1.0.2`; SDK 54 is unchanged. Remote build number
  incremented to `24`. The `appVersion` runtime policy makes its runtime `1.0.2`.
- TypeScript and all 11 city/notification tests passed before the replacement
  build. This is not a fresh complete device regression test.
- Production iOS build **24** finished:
  [f0cb6c44-cd19-4e41-8250-3eb69d1c4275](https://expo.dev/accounts/protrom/projects/raslash/builds/f0cb6c44-cd19-4e41-8250-3eb69d1c4275).
- Its automatic EAS Submit upload finished:
  [75d64c28-b380-4849-879d-8fe98b73b027](https://expo.dev/accounts/protrom/projects/raslash/submissions/75d64c28-b380-4849-879d-8fe98b73b027).
- Created the App Store Connect `1.0.2` record, attached build 24, completed
  English and Turkish release notes and updated the review notes. The four
  existing screenshots and manual-release setting were preserved.
- Reused the existing review-account credentials and authorized contact details;
  no password was reset. App Store Connect's accessible/DOM field values appeared
  empty even when the rendered form contained saved credentials, so those empty
  values must not be interpreted as proof of missing data. No credential is
  recorded here. The new review submission passed Apple's required-field checks.
- **Verified Waiting for Review**, submitted 2026-09-19 at 19:11 Istanbul time:
  [f4fc7beb-20b0-49f3-9096-1b74dceb0caf](https://appstoreconnect.apple.com/apps/6800468342/distribution/reviewsubmissions/details/f4fc7beb-20b0-49f3-9096-1b74dceb0caf).
- **Subsequently withdrawn with owner approval on 2026-09-19** after Sentry
  reported RASLASH-4 on build 24. App Store Connect now shows **Removed**.
  Do not resubmit/release this build based on the earlier Waiting for Review
  entry. See `ios-watchdog-investigation-2026-09-19.md` for evidence and test limits.
- No production OTA was published. Existing Android 17 remains runtime `1.0.1`;
  future updates must target each installed native runtime correctly.

### Android resubmission

- Existing production Android `1.0.1 (17)` uploaded successfully to the production
  draft via [a642b0e9-8f2c-40bc-8f70-d7662f72cf1d](https://expo.dev/accounts/protrom/projects/raslash/submissions/a642b0e9-8f2c-40bc-8f70-d7662f72cf1d).
- Saved release 17, corrected first screenshot and its AI-edit declaration.
  Updated stale review instructions which had incorrectly said the paywall was
  disabled. Existing review-account credentials were retained.
- **Verified under review** in Play Console after submitting the final access
  instructions. Managed publishing is enabled; no public Publish action taken.
- Play showed one non-blocking missing R8/deobfuscation-file warning, no device
  support reduction, and native debug symbols present.
- See `app-store-assets/android/review-fix-2026-09-18/README.md` for exact image
  scope and remaining genuine-Android-capture recommendations.

### Branded email

Custom SMTP remains disabled while the owner completes provider signup and DNS
verification. See `docs/branded-auth-email.md`. No live Auth configuration was
changed. No Git commit or push was performed in this follow-up.
