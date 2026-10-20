# Discovery design preview portraits · 2026-10-03

Built-in `image_gen` generation (not CLI). These four people are fictional adults, not real users.
Original generated PNGs are copied into this folder unchanged. Each image has its own prompt/call.

## Prompt set

Shared prompt:

> Use case: photorealistic-natural. Asset type: square social-app demo profile portrait. [SUBJECT] One invented adult only, not any real person. Natural editorial portrait photograph, visible skin texture, gentle daylight, head and shoulders centered, full top of head with comfortable crop margin, looking toward camera. Face in upper-middle of square, shoulders below, useful for both round avatar and portrait card crop. Authentic everyday style, no glamour retouching. No text, labels, logos, watermark or collage.

Subjects:

- `defne-v1.png`: A fictional Turkish woman aged 28, shoulder-length dark wavy hair, warm natural smile, cream linen shirt, a sunlit leafy Istanbul café softly blurred behind her.
- `emre-v1.png`: A fictional Turkish man aged 30, short curly dark hair, neat stubble, relaxed smile, forest green casual shirt, softly blurred warm Ankara coworking café.
- `ece-v1.png`: A fictional Turkish woman aged 27, auburn bob haircut, a few freckles, relaxed friendly expression, simple navy top, softly blurred bright Izmir coffee shop.
- `kerem-v1.png`: A fictional Turkish man aged 32, close cropped dark hair, thin round glasses, friendly candid smile, sand colored overshirt, softly blurred book-filled café.

## Usage boundaries

- Opt-in device-local design preview only, visible to admin / server-designated `app_review` accounts or development mode. Not offered to regular production users. Off by default; leaving People, leaving the map tab or changing account resets it.
- Header, map pins, cards and preview profile identify demo/fictional content.
- No Supabase Auth users, database rows, check-ins, push notifications, presence updates or DMs are created by these fixtures.
- Live discovery polling is disabled while previewing. Demo rows never mix with real profiles or the real active count.
- Coordinates depict existing venue points for illustration, not a person's GPS position or a real visit.
- Demo profile taps open an explanatory local preview, never a real profile/DM route.
- Real membership, opt-in visibility, blocking and DM rules are unchanged.

## Verification

- `npx tsc --noEmit` — passed.
- `node --test src/lib/*.test.cjs src/lib/*.test.mjs src/data/*.test.mjs` — 60 tests passed, including demo separation, no real profile/DM navigation, bounded markers, and compact panel sizing.
- iOS and Android Metro/Hermes export — passed. No native dependency added.
- Actual header/panel components rendered with native adapters at 390×844 and 320×568. Confirmed readable photo cards, demo profile open/close, demo exit clears fictional people, and no horizontal page overflow. The preview background is an illustrative map, not MapKit/Google Maps.
- Native device / TestFlight validation remains required; this change has not been deployed as an OTA, EAS build or store submission.
