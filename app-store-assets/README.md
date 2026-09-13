# RASLASH store asset readiness

Audit date: 2026-09-12

## Technically valid assets

### App Store Connect (iPhone 6.5-inch slot)

- `ios/upload/02-rate.jpg`
- `ios/upload/03-connect.jpg`
- `ios/upload/04-score.jpg`
- `ios/upload/01-discover.jpg` — format-valid draft only; replace before review.

All four files are JPEG, 1242 x 2688 pixels, and contain no alpha channel. This is an accepted iPhone 6.5-inch portrait size. The Expo configuration has `ios.supportsTablet: false`, so an iPad screenshot set is not required for this binary.

`ios/upload/01-discover.jpg` is a format conversion of Section 1's first frame. It is title/testimonial artwork without visible app UI, so replace it with a real discovery-screen capture before submitting for review. Apple App Review Guideline 2.3.3 says screenshots should show the app in use, not merely title art. The source PNG files contain an alpha channel, which App Store Connect does not accept.

### Google Play

- `android/upload/play-icon.png` — 512 x 512, 32-bit PNG with alpha, under 1 MB
- `android/upload/feature-graphic-play.jpg` — 1024 x 500 JPEG, no alpha
- `android/upload/02-rate.jpg`, `03-connect.jpg`, `04-score.jpg` are **not upload-ready**. Although their pixel dimensions pass the basic check, all three show an iPhone frame, Dynamic Island, and iOS UI. They misrepresent the Android build.

Capture at least two screenshots from the final Android release build; prefer four real Android screens at 1080 x 1920 or another exact 9:16 size for Google Play recommendation placement. Suggested screens: map/discovery, venue/check-in, chat, and Pro/paywall. Hide real user details and precise location in store assets.

The icon and feature graphic above are technically upload-ready. Verify the feature graphic's slogan against the final listing before use.

Do not upload `android/01-discover.*`: it is promotional/title art rather than an actual in-app screen. Do not use the existing `android/play-*.jpg` files either: their center crop cuts off headline text.

## Content accuracy gate

The remaining screenshots contain Figma/device-frame compositions and sample values such as “187 mekan”, “1881 aktif”, “14 kişi burada”, and “Raslash Coffee”. Before submission, confirm those screens and claims match the submitted build. Both stores require the listing to represent the current app accurately. Prefer screenshots captured from the final release build when possible.

## Official references

- Apple screenshot specifications: https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications
- Apple App Review Guidelines, section 2.3.3: https://developer.apple.com/app-store/review/guidelines/
- Google Play preview asset requirements: https://support.google.com/googleplay/android-developer/answer/9866151
