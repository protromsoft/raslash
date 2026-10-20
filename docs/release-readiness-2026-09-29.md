# Release readiness — 2026-09-29

## RASLASH

- EAS latest binaries remain iOS 1.0.2 (24) and Android 1.0.1 (17).
- App Store Connect freshly verified: 1.0.2 is **Developer Rejected**,
  build 24 selected, manual release enabled. 1.0.1 is Ready for Distribution.
- Google Play freshly verified: production 1.0.1 (17) is **in review**;
  managed publishing remains enabled.
- Existing local startup fixes are not in these binaries. The last iOS
  WatchdogTermination root cause remains unconfirmed; no assertion of a
  proven crash fix or successful physical-device validation is made.

Validation rerun:

- TypeScript: passed.
- Startup, rendered startup components, nearest-city and notification
  regression tests: **20 passed, 0 failed**.
- `git diff --check`: passed.
- iOS and Android Metro/Hermes exports completed with `EXPO_NO_DOTENV=1`;
  output `/private/tmp/raslash-release-check.bEWPNd`.
- Device inventory failed because CoreDeviceService initialization timed out.
  No real-device test was performed.

These exports are not signed binaries. No new EAS build, submission,
production OTA or store release was initiated during the initial check.

## Subsequent iOS submission request

The owner then explicitly requested Apple review. Only the iOS workflow was
started; Android and Whale Harry remain unchanged.

- New production iOS **1.0.2 (25)** build:
  `3721e357-adac-4717-b0c2-02cac98d2380`.
- Remote build number incremented from 24 to 25. Existing signing credentials
  reused with `--freeze-credentials`.
- Initial automatic upload scheduling with `--what-to-test` was rejected by
  EAS because changelog submission requires Enterprise. The build itself was
  already created. No duplicate build or plan upgrade was made.
- Scheduled the same binary without a changelog using the existing production
  submit profile. EAS submission:
  `d29ab73a-45d2-4252-b89f-944149979f70`.
- Build **FINISHED** at 2026-09-29 13:58:00 Europe/Istanbul; Apple binary upload
  **FINISHED** at 14:00:49. This is upload completion, not App Review approval.
- Updated the existing 1.0.2 release/review notes with the font fallback and
  startup-routing changes. Four screenshots, existing review credentials and
  manual release setting preserved. At this stage build 24 is still selected
  until 25 finishes processing.
- Root cause of the original WatchdogTermination is still unconfirmed. This
  submission request does not establish that the native issue is fixed.

### App Review submission completed

- App Store Connect processed build 25 successfully. ASC build UUID:
  `2c3efbdf-8484-4248-b1fc-5c2713801ee5`.
- Replaced only the version's build association (24 → 25); did not delete
  either uploaded binary. Kept the four existing screenshots and manual
  release selection.
- Selected **Add for Review**, then **Submit for Review**. Apple confirmed
  **1 Item Submitted**.
- Verified final detail page: **Waiting for Review**, **1.0.2 (25)**,
  submitted **2026-09-29 14:06 Europe/Istanbul** by Oğuzhan Depecik.
- Review submission ID: `e29d509b-8e6e-45cf-997e-de7c90ea2e86`.
- [App Review record](https://appstoreconnect.apple.com/apps/6800468342/distribution/reviewsubmissions/details/e29d509b-8e6e-45cf-997e-de7c90ea2e86)
- No Android or Whale Harry changes, new production OTA, public release,
  git commit or git push were made in this workflow.

## Separate request: Whale Harry

Google Play app **Whale Harry: Investing Coach**, package
`com.whaleharry.app`, app ID `4973084661614481236`:

- Publishing overview shows **one change not yet sent for review**:
  production **8 (2.1.0)**, full rollout.
- Managed publishing is **disabled**, so approval would publish the release
  automatically.
- No pending review was shown. A claim that Google is delaying a pending
  review would therefore be unsupported.
- Asked the owner whether to submit this separate app for review with
  automatic publication, or only request a status clarification from support.
  No submission or support message was sent during the check.

## People and direct messages — test build preparation, 2026-10-03

This is a **test distribution**, not a new App Review or Google Play production
submission. Existing uncommitted application changes are included in the EAS
archive. Store screenshots, admin-web, database files and local `.env` files are
excluded by `.easignore`.

- App version/runtime: **1.0.3**, Expo SDK 54; existing signing credentials reused.
- iOS production/TestFlight build **27**:
  `766448cf-97e9-4ba2-90ea-788b0138c2c1`.
- Apple upload scheduled after that build:
  `6cbf7c59-051a-431a-9c23-4dcc17385fbf`.
- Android preview APK **18** (no Play submission):
  `5eaab687-407d-4c68-888f-f1fb2d955e88`.
- iOS build finished at **22:07:27 Europe/Istanbul**; EAS Apple upload finished
  at **22:09:49**. App Store Connect visibly lists **1.0.3 (27), Processing**.
  This confirms receipt, not yet tester availability. Android was still in its
  native Gradle build at this check.
- Subsequent Apple API check confirmed **1.0.3 (27): internal in beta testing**.
  App Store Connect shows the existing **Team (Expo)** group with **2 internal
  testers** on this build. ASC build ID:
  `ff51ae9c-967d-4a78-aae7-150d94861ada`.
  Live App Store version remains **1.0.2 (25)**, with no version in review.
- TypeScript, 55 application regression tests and `git diff --check` passed
  immediately before upload. Earlier isolated database coverage passed 23
  scenarios; this is not native-device or multi-connection load testing.
- People/DM backend migration was applied in the preceding implementation
  workflow. Existing accounts remain opted out of discovery and new DM requests.
- No production OTA, store review submission, Git commit or push was initiated.

### Required two-account device checks

1. Install the new build without deleting the existing app. Verify the session,
   map, city selection, venue photos and new bottom panel. Repeat on a clean
   installation using a separate test device/account.
2. On each consenting test account, use **Profile → Görünürlük ve mesajlar**
   to enable **Haritada görün** and **Mesaj istekleri**. Complete a valid venue
   check-in, then open **Kişiler** in the same city. No synthetic people or
   personal GPS coordinates should appear; markers represent the venue.
3. Send a request from A to B. A cannot send a follow-up and B cannot reply
   until B accepts. Accept on B and exchange messages. Check keyboard/composer
   visibility, long messages, rapid double taps and reopening the conversation.
4. Separately decline a new request, block/unblock the other test account and
   report an incoming test message. Only reported DM content is available to
   the admin report screen; arbitrary private conversations are not exposed.
5. Check opt-out, checkout, app background/foreground and account switching:
   discovery data must clear on refresh and a previous account's inbox must
   never remain visible. Accepted conversations continue after checkout unless
   a participant blocks the other.
6. With a dedicated non-Pro test account, verify the shared lifetime allowance
   of 15 venue-chat + direct messages and the subsequent paywall. Do not consume
   a real user's allowance for testing. Verify Pro separately without making
   an unintended real purchase.

DM currently refreshes while focused/foregrounded; background DM push alerts
are not included. An APK installed outside Google Play is suitable for map/chat
smoke tests, but is not proof that Play Billing purchases work.

## Magic-link and discovery motion — test builds, 2026-10-09

The owner requested continuation after confirming receipt of the branded SMTP
test email. This workflow prepares device-test binaries only. There is no App
Review submission, Google Play submission, production OTA or public release.

- Rechecked Expo SDK 54 documentation, Supabase PKCE guidance and changelog.
- All 77 application regression tests, TypeScript and `git diff --check` passed.
- iOS and Android Metro/Hermes exports passed with `EXPO_NO_DOTENV=1`:
  `/private/tmp/raslash-email-ios-check.TfVDoD` and
  `/private/tmp/raslash-email-android-check.fkvTPC`. These are compilation
  checks, not signed-device or end-to-end authentication tests.
- Confirmed the existing Expo account owns `@protrom/raslash`, project
  `259d28aa-9faf-4c19-b0c7-818245ea486a`. Required Supabase, Maps and Sentry
  environment variable names are present; no private values were revealed.
- Existing signing credentials reused with `--freeze-credentials`. Current
  uncommitted mobile changes, including magic-link login and discovery motion,
  are included; `.env`, admin-web, docs and Supabase files are excluded by
  `.easignore`. No credentials, schema or app version were changed.
- iOS production-profile test binary **1.0.3 (28)**:
  `af97013e-ed74-4cc5-bb7f-0d5622a8a96a`. EAS confirms **FINISHED** at
  **2026-10-09 19:56:08 Europe/Istanbul**, with its binary artifact available.
  Its automatic Apple binary upload is scheduled as
  `bfc20bc4-4ee9-4c26-9205-7919fce2081f`. This is TestFlight delivery, not a
  submission for App Review. EAS confirms the upload **FINISHED** at
  **2026-10-09 19:58:55 Europe/Istanbul**. A subsequent read-only App Store
  Connect status check confirms **VALID**, internal **IN_BETA_TESTING**,
  not expired, matched to this EAS build/submission. Internal TestFlight is
  available; external beta remains **READY_FOR_BETA_SUBMISSION**. No external
  beta review was requested. The owner was asked to run same-phone link QA.
- The first Android request incremented the remote version code to 19 but
  failed before a cloud build was created: local optional fingerprint generation
  hit `ETIMEDOUT: connection timed out, read`. A fresh EAS list confirmed the
  latest Android build was still the October 3 build 18. Stopped the failed CLI,
  then retried once with EAS CLI's supported `EAS_SKIP_AUTO_FINGERPRINT=1`.
  The appVersion runtime policy and signing checks remain unchanged; this only
  skips optional local fingerprint metadata. No duplicate native build 19 was
  created, and the unused version-code gap was not rolled back.
- Android preview APK **1.0.3 (20)** accepted by EAS:
  `11dede8c-eb31-4d67-9f83-f0671dddae4c`. Last check: **IN_PROGRESS**,
  native Gradle compilation after successful JavaScript bundling. Visible build
  logs confirm Sentry source maps uploaded to `protrom/raslash`, release
  `com.raslash.app@1.0.3+20`, dist `20` (server artifact processing pending).
  APK completion not yet verified; no Google Play upload scheduled. Do not
  treat a successful source-map upload as build completion or crash-free QA.

### Required email-link device QA

1. Install the new binary without deleting the current app. Check the existing
   session and onboarding are preserved. Use a separate device for clean-install
   coverage rather than deleting an owner's working data.
2. In the login screen select **E-posta bağlantısıyla giriş**, enter an existing
   registered account, and request the link from that phone. For the approved
   test, `info@protrom.com` is an existing account; the previously requested
   Gmail address is not registered. Do not silently create users for this test.
3. Open the latest mail on the same phone and tap its button. Verify a completed
   member reaches the main screen and a new member retains the onboarding gate.
   The earlier CLI delivery-test link is not valid device-login QA because its
   ephemeral PKCE verifier was not persisted to the phone.
4. Repeat a fresh request while the app is backgrounded and while fully closed;
   confirm both warm and cold callbacks. Check expiry/old-link feedback, a
   repeated tap, a link from another device, offline recovery and the cooldown.
5. Check password/Google/Apple login separately and verify logout/account
   switching clears the previous account's people and messages. Do not share
   actual email links, codes, tokens or passwords in chat or crash reports.
6. Smoke-test city/location selection, map filters, venue preview/member cards,
   Kişiler/Mekânlar swipe gestures, draggable panels, chat keyboard and paywall.
   Android APK testing is not proof of Google Play Billing behavior.

## Remaining UI polish — internal TestFlight, 2026-10-11

The owner requested the remaining UI corrections from `raslashui.pdf` and a new
internal TestFlight delivery. The existing October 11 discovery/motion changes
are preserved. No Git commit/push, App Review, Android build, production OTA,
credential change or live Supabase migration is part of this delivery.

- Shared primary controls now use an explicit disabled surface and readable
  label instead of fading the entire control. Busy indicators remain visible;
  accessibility exposes both disabled and busy states.
- The shared venue/DM composer grows from 46 to 120 points, scrolls longer
  drafts and resets after clearing. The 500-character cap and server-enforced
  message allowance remain unchanged.
- A regression check reproduced an inherited first-frame sheet issue: switching
  from an expanded venue panel to a newly mounted people panel kept the shared
  height at 550 instead of the new 190-point target. The initial UI-thread
  reaction now settles the shared height too, without committing navigation.
  That test failed before the fix and passes afterwards.
- Nearby people venues cluster at the current zoom with the actual visible
  member count, retain a separately selected venue and zoom into real members
  on tap. Fictional preview members remain explicitly labelled, device-only
  and unable to start a live DM.
- Selected/checked-in pins remain separately tappable. Overlapping cluster
  bubbles use bounded display offsets plus a non-tappable leader to their
  original centre. Their small native hit targets do not cover surrounding
  pins. Venue/member coordinates, check-in distance and zoom bounds are not
  changed or persisted.
- Venue suggestion and rating actions are pinned above the keyboard. Rapid
  duplicate submissions are guarded; recoverable failures show a safe notice.
  Suggestion/rating typography and input lengths were aligned with the shared
  UI. Search shows a fallback if a venue photo fails.
- Validation: **95/95** regression tests, `tsc --noEmit` and
  `git diff --check` passed. iOS Metro/Hermes export passed with
  `EXPO_NO_DOTENV=1` into `/private/tmp/raslash-ui-ios-check.Qc12vR`.
  After the first-frame panel fix, the final export passed into
  `/private/tmp/raslash-ui-final-ios-check.ZvgVTC` (Hermes bundle
  `entry-1038a5227cf3cf0827c48ca7f29606bd.hbc`).
- Native simulator inspection could not finish because the UI automation call
  hung and was interrupted. Automated rendering/layout checks are not proof
  of physical-device keyboard, Fabric map stability or end-to-end purchases.
  Run map mode switching, dense-cluster selection/zoom, sheet swipes and a
  long accepted DM on the new TestFlight build before a public submission.
- Inbox preview `Sen:` remains a server-contract follow-up: the existing inbox
  response has no last-sender field. Do not infer authorship from message text,
  open conversations just to derive it (which could mark them read), or weaken
  private-message access rules for a visual label.

Read-only preflight confirmed the live Apple release is **1.0.2 (25)**; 1.0.3
builds 27 and 28 are valid in internal beta and there is no release in review.
Existing EAS/Apple credentials were reused with `--freeze-credentials`.
Optional local fingerprint metadata was skipped with the existing CLI's
`EAS_SKIP_AUTO_FINGERPRINT=1`; the appVersion runtime policy remains 1.0.3.
The first 62.9 MB source archive uploaded successfully as **1.0.3 (29)**:

- EAS build: `3f2841c8-7374-4d69-ae6c-e8c88982862f`
- Automatic Apple binary upload: `6cf6d545-3b75-46e3-b002-eb38f4c1a613`

The first-frame sheet regression above was found during the final review while
29 was compiling. EAS Build cancellation succeeded before completion; 29 is
not the delivery candidate. Its number is not reused or rolled back. A corrected
replacement is prepared after rerunning the 95 tests and iOS export.

The replacement archive (62.9 MB) uploaded successfully as **1.0.3 (30)** at
**2026-10-11 21:03:26 Europe/Istanbul**:

- EAS build: `c6503c4f-820d-4e30-bac5-444de218ac79`
- Automatic Apple binary upload: `ace03cee-27fd-45b3-907f-6e842d0e2756`
- Source SHA-256 checkpoints at upload: MapSheet
  `510979769a6f090aa458782e6075d589bf78ddd08be1668eb049145045767b52`,
  ChatComposer `b787bf3dfda0ab7b0d4f3dcb1bd20fed8da24b69a388afcfa50c023de34e1c50`,
  mapClusters `c83609945c15988f7aa24f9d900f62699e63366cef9e866ce15bf5977504ad00`.

EAS confirms build 30 **FINISHED** at **2026-10-11 21:10:08 Europe/Istanbul**,
with its signed binary artifact available. Automatic Apple binary upload advanced
from **AWAITING_BUILD** through **IN_QUEUE** and **IN_PROGRESS**.

At **2026-10-11 21:14 Europe/Istanbul**, a separate read-only App Store Connect
status check confirmed build **1.0.3 (30)** is **VALID**, **IN_BETA_TESTING** for
internal testers, not expired, and matched to the EAS build/submission above.
Apple's upload time is **21:11:39 Europe/Istanbul**. External beta is
**READY_FOR_BETA_SUBMISSION**, not submitted. The live release remains
**1.0.2 (25), READY_FOR_DISTRIBUTION** and there is no App Review submission.
Internal TestFlight delivery is available; physical-device UI QA remains the
owner's next step, not a completed part of the automated checks.
EAS independently confirms the Apple upload **FINISHED** at
**2026-10-11 21:13:28 Europe/Istanbul**.

## Store review request — 2026-10-11/12

The owner subsequently explicitly requested App Review and Android review.
This authorizes review preparation/submission, not a public release or a
production OTA. No Git commit/push or credential reset was performed.

### Apple

- Prepared App Store version **1.0.3**, ID
  `94c4f6e4-0c1a-4417-b7f2-08356dbb03d0`, and associated the exact valid
  TestFlight build **30**, Apple build ID
  `062cf48d-436e-43bd-bee1-c722dc6f195a`.
- Preserved **MANUAL** release. Existing live **1.0.2 (25)** remains unchanged.
- Copied existing approved `en-US`/`tr` listing metadata and the existing review
  account/contact fields directly within Apple, without displaying or changing
  the password. Added release notes and review instructions for opt-in venue
  discovery, message-request acceptance, blocking/reporting and optional
  location permission.
- Verified inheritance of the four complete `APP_IPHONE_65` screenshots, with
  their existing order and file names preserved. No store artwork was deleted
  or replaced in this workflow. Turkish uses the existing primary-locale asset
  fallback; no new Turkish-specific screenshot set was uploaded.
- Age rating already declares messaging/chat and user-generated content.
  The public privacy URL responds HTTP 200 and renders a React privacy page.
  App Privacy data/publish-state endpoints are not available to the existing
  API-key authentication; those forms were not altered or claimed re-audited.
- **Submitted for App Review**, submission ID
  `2aaa7195-dab6-4c62-8f42-df36fbb7604e`. Direct App Store Connect verification
  returned **WAITING_FOR_REVIEW**, for **1.0.3 (30)** with manual release.
  [App Review record](https://appstoreconnect.apple.com/apps/6800468342/distribution/reviewsubmissions/details/2aaa7195-dab6-4c62-8f42-df36fbb7604e).
- Previous automated validation remains **95/95 tests**, TypeScript and iOS
  export passed. Physical-device gesture/keyboard/purchase QA was not completed
  or asserted by this review-submission workflow.

### Android

- Android Metro/Hermes export passed into
  `/private/tmp/raslash-review-android-check.I9zKIA`; bundle
  `entry-ffd1dac04de6adfba231efab9255fadd.hbc`.
- Built **1.0.3 (21)** as a production **AAB**, using existing remote signing
  and production environment. Build ID
  `4a8771c6-88b7-4cdd-b1f2-3d4fb1c8eaaf`, **FINISHED** at
  **2026-10-11 22:10:50 Europe/Istanbul**.
- Google Play upload ID `b765ce33-865b-4203-bedf-8d5c5fb041ce`, **FINISHED** at
  **2026-10-11 22:12:55 Europe/Istanbul**. Existing submit profile targets
  `production` with release status **DRAFT**.
- **A completed draft upload is not a verified review submission.** Browser
  control timed out. The previous managed-publishing setting was not treated
  as proof of its current state, and no release was promoted to `completed`
  through the API without that check.
- A separate authenticated, read-only Play release-lifecycle query confirmed
  production **21: RELEASE_LIFECYCLE_STATE_DRAFT** and the previous production
  **17: RELEASE_LIFECYCLE_STATE_PUBLISHED**. The existing EAS Google submission
  identity was reused solely for that read, with keys/tokens kept in memory.
- Requested the owner's current **RASLASH Publishing overview** screenshot to
  verify managed publishing and complete the final review action. Android is
  not claimed in review until its review lifecycle is actually confirmed.

## Android review submission initiated — 2026-10-14

The owner explicitly requested Android review and said they had handled Apple.
No Apple write, new build, Git push, OTA or public release was performed.

- Chrome's RASLASH Publishing overview was read and **managed publishing is
  enabled** was visibly confirmed. The existing production release **17**
  remains published.
- Finalized only the existing production **1.0.3 (21)** draft, with localized
  release notes for the new optional discovery/DM and UI/auth improvements.
  Existing store listings, screenshots, prices and signing were not changed.
- The scoped Google edit `12129136462048694907` validated and committed with
  `changesNotSentForReview=false` and
  `changesInReviewBehavior=ERROR_IF_IN_REVIEW`. This does not cancel an
  unrelated active review. The existing submission identity was reused, with
  keys/tokens kept in memory and never written to the repository.
- The immediate release API response was
  **RELEASE_LIFECYCLE_STATE_NOT_SENT_FOR_REVIEW**, not yet **IN_REVIEW**.
  Subsequent browser inspection showed **İncelenmekte olan değişiklikler**,
  production **1.0.3**, with **Sık karşılaşılan sorunlar için hızlı kontroller
  yapılıyor**. Google explicitly says the changes are automatically sent for
  review when these checks complete successfully. Submission has been
  initiated and the automatic pre-check queue is visible; a completed
  pre-check or final policy approval is not claimed.
- Captured the actual Publishing overview proof in
  `docs/android-review-2026-10-14.jpg` and kept the result tab open. Managed
  publishing remains enabled; approval will not itself trigger a public release.
