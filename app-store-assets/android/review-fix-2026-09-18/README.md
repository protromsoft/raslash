# Google Play metadata remediation — RASLASH

Updated: 2026-09-19. **First phone image replacement submitted with production build 17. Google Play shows the changes under review. Not publicly released.**

## Current scope: first image only

The user explicitly chose to replace only the first phone image and keep the other three unchanged. The remaining full-set recommendations below are not part of this narrowed edit.

Replacement: `01-play-cover-no-ratings-1080x1920.png` (1080 × 1920, opaque PNG, approximately 1.7 MB). The exact current Play asset was identified in the UI as `DRAFT-01-title-art-1512x2688.jpg`, 9:16, uploaded 2026-09-12. Its matching local source was edited using built-in image generation, then mechanically normalized to exact 9:16 dimensions. Stars and the quotation are absent. The iPhone mockup remains deliberately unchanged in scope; this is not a guarantee of policy acceptance.

An initial upload attempt was blocked by Chrome's file-URL access permission. After the user confirmed the correct Chrome profile, the replacement was uploaded successfully, added to the phone screenshots, and moved to the first position. The old first image was removed from this listing only; the original asset remains available in Google's asset library as well as locally.

The “Taslak olarak kaydet” action completed with “Değişiklikleriniz kaydedildi”. The saved four-image order was visually verified:

1. `01-play-cover-no-ratings-1080x1920.png` — new first image, no stars or quotation.
2. `DRAFT-02-iphone-mockup-1512x2688.jpg` — unchanged map image.
3. `play-03-connect.jpg` — unchanged chat image.
4. `play-04-score.jpg` — unchanged venue image.

The image-editing step did not change descriptions, icon, feature graphic or pricing.

### Authorized resubmission — 2026-09-19

- Completed the listing's Next/Save flow so the draft became ready for review.
- Labelled only `01-play-cover-no-ratings-1080x1920.png` as AI-edited in
  Google's asset declaration; the other three images were left unchanged.
- Uploaded production build `17 (1.0.1)` through EAS Submit, selected it in the
  production release and saved location/discovery release notes.
- Submitted the listing, build and existing required content declarations.
- Updated the existing review account's stale "paywall disabled" instructions
  to describe current Pro, free quotas and review check-in access. Credentials
  were not changed. Sent those instructions by restarting the just-created
  review as required by the Google UI.
- Verified: **"Değişiklikleriniz şu anda inceleniyor"** and no remaining
  unsent-change section. Managed publishing remains enabled; no public
  Publish action was taken. Approval is not guaranteed.

### Final replacement prompt

Use case: precise-object-edit. Edit target: the attached 1512x2688 RASLASH first Google Play marketing image. Keep the exact 9:16 portrait canvas and entire existing composition including blue side margins. Remove ONLY the row of FIVE WHITE STARS in the middle and the two-line Turkish quote below them, beginning “Gerçek kullanıcı yorumlarıyla” and ending “mağdur olma!!”. Fill the removed area smoothly with matching plain blue. Preserve the small white Raslash wordmark below the quote, exact large “ÇALIŞ & TANIŞ” lettering, all clouds, emojis, phone frame, screen, black pinwheel logo and positions. No new text or ratings, no restyling, no additional imagery, no cropping. Output must retain 9:16 portrait aspect, ideally 1080x1920 or 1512x2688.

## Verified rejection

- Google Play app: `com.raslash.app` / RASLASH.
- Rejection dated 2026-09-18, Metadata policy.
- Reported location: store listing screenshots, `en-US`.
- Google's evidence highlights the five-star row on the blue “ÇALIŞ & TANIŞ” artwork.
- Before this replacement, the listing contained four phone images and the first phone-cover variant contained the five-star row and quotation. The remaining images use iPhone device frames and were left unchanged at the user's request.

## Prepared artwork — not a finished Android screenshot set

| File | Source | Status |
| --- | --- | --- |
| `01-discover-no-ratings.png` | `../01-discover.png` | Stars and testimonial-style quotation removed. Promotional artwork only; no in-app experience. Do not use as a substitute for a real Android capture. |
| `DRAFT-phone-cover-no-ratings.png` | `../../ios/upload/01-user-cover.jpg` | Stars and quotation removed. Still contains an iPhone frame and splash-only mockup. **Not ready for the Android listing.** |

Original files are unchanged. These are AI-assisted edits, not pixel-identical exports from Figma. Visually inspected: star rows and quoted claims are absent; no replacement ratings or claims were added.

## Remaining full-set recommendations (outside the first-image-only edit)

1. Capture at least two genuine current Android screens: map/discovery and venue details. Prefer four, adding a chat screen without personal messages and a working Pro screen.
2. Use an authorized test account. Do not manufacture active-user counts, reviews, messages, successful purchases or other functionality for screenshots.
3. Avoid keyboard/volume overlays, personal details and the user's precise location. Use a public venue and a test account; do not remove required map attribution.
4. Use lossless PNG or JPEG, ideally 1080 × 1920 (9:16), under 8 MB per image. Check every image for readable UI and clipping.
5. Check all configured listing languages and any tablet screenshots for the same stars/claims. The `en-US` phone listing was inspected; other locales/device slots are not yet verified.
6. A broader replacement with genuine Android captures remains outside the
   user's first-image-only scope. The limited corrected set above has now been
   submitted under the user's separate resubmission authorization.

The existing English name/short/full descriptions were read. They contain no “#1”, app-of-the-year or star-rating claims. This is not a complete privacy or functionality audit of those descriptions.

## Capture handoff

Requested from the user: two current Android screenshots, **map** and **venue detail**, without keyboard/volume overlays or personal messages. A connected emulator was detected, but no authenticated Android screen was captured in this task. No credentials were retrieved or changed.

## Generation record

Mode: built-in `image_gen` (no CLI fallback). Source files were viewed before editing.

### Prompt for `01-discover-no-ratings.png`

Use case: precise-object-edit. Asset type: RASLASH promotional artwork, not a fabricated application screenshot. Input image 1 is the edit target. Primary request: Remove ONLY the entire row of five white stars and the two-line testimonial-style Turkish quote beneath them (beginning “Gerçek kullanıcı yorumlarıyla” and ending “mağdur olma!!”). Seamlessly fill those removed areas using the same blue backdrop. Preserve the portrait canvas, large exact white headline “ÇALIŞ & TANIŞ”, Raslash wordmark under the removed quote, all clouds, unicorn, eyes, speech bubble and briefcase, their scale and placement, shadows, and color palette. Do not add new text, badges, ratings, people, phone frames or app UI. Do not restyle or crop. Keep source composition as closely as possible.

### Prompt for `DRAFT-phone-cover-no-ratings.png`

Use case: precise-object-edit. Input image is edit target RASLASH promotional artwork. Remove ONLY the row of five white rating stars and the two-line quotation below it (starting “Gerçek kullanıcı yorumlarıyla” ending “mağdur olma!!”). Inpaint those areas with the same blue background. Keep the white Raslash wordmark below that quotation. Preserve all remaining content: exact headline “ÇALIŞ & TANIŞ”, blue sky, clouds, emojis, phone frame, phone screen and black pinwheel mark. Do not invent app screens. No added content or new copy, no cropping, no restyling, preserve original portrait proportions. This is a non-destructive artwork correction draft, NOT evidence of actual Android UI.

## Sources

- [Observed Play policy issue](https://play.google.com/console/u/0/developers/5935634260644674885/app/4974391677097350293/policy-center/issues/4988303541762884025/details)
- [Metadata policy](https://support.google.com/googleplay/android-developer/answer/9898842?hl=en)
- [Preview assets and actual in-app experience requirements](https://support.google.com/googleplay/android-developer/answer/9866151?hl=en-GB)
- [Store listing best practices](https://support.google.com/googleplay/android-developer/answer/13393723?hl=en)
