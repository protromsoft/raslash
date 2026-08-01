# raslash

Map-based work-spot discovery with free reviews and membership check-in chat.

## Stack

- Expo SDK 54 (App Store Expo Go compatible) + Expo Router
- **Supabase** (auth, Postgres, RLS, notifications) — preferred over Firebase for this app
- Web admin: `admin-web/` (Vite + React)
- RevenueCat (membership / paywall)

### Supabase vs Firebase (why Supabase)

| | Supabase | Firebase |
|--|----------|----------|
| Data | Postgres + SQL (places/ratings joins easy) | NoSQL documents |
| Admin | Table editor + our web panel | Console is different model |
| Already in repo | `supabase/schema.sql` | would rework models |
| Mobile + web | One shared backend | Also fine, but duplicate work |

**Decision: Supabase.**

## Product rules

- Google Places: weekly sync of **name + location only** (no Google reviews)
- Raslash scores: wifi / comfort / outlets — submitted **after check-out**
- Ratings & comments: free to read
- Check-in → place chat: membership (paywall on check-in)
- Flow: Splash → Onboarding → App → Check-in → Chat → “Mekandan çıktım” → Rate → Publish

## Rating flow

1. User checks in (paid) → chat opens  
2. User taps **Mekandan çıktım**  
3. Score: Prizler / Wi‑Fi / Rahatlık (1–5) + optional comment  
4. Average publishes into Raslash place stats

## Run mobile

```bash
export PATH="$HOME/.local/node/bin:$PATH"
npm start
```

Then scan with Expo Go.

## Run web admin

```bash
npm run admin
```

Opens Vite app (usually `http://localhost:5173`).

- Without Supabase keys → **Demo mode** (localStorage)
- With keys in `admin-web/.env` → live Supabase

```bash
# admin-web/.env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

Then run `supabase/schema.sql` in the Supabase SQL editor. Mark your user `profiles.is_admin = true`.

## Configure

1. Copy `.env.example` → `.env` and set `EXPO_PUBLIC_GOOGLE_PLACES_API_KEY`
2. Enable **Places API (New)** in Google Cloud
3. Create a Supabase project and run `supabase/schema.sql` (optional for local cache demo)
4. Add RevenueCat keys later (Expo Go uses the demo membership toggle)

### Places sync & moderation

- Weekly Google sync (background / admin only) — users cannot force-refresh from the map
- Filter keeps Starbucks / coffee / cowork; drops çay bahçesi, bozacı, etc.
- Auto stock images assigned per place
- User-added places stay **pending** until admin approves → in-app notification
- In-app **Admin** (Profil → Demo admin): approve places, edit reviews/images, run sync

## Demo

Profile tab → **Demo: toggle membership** to unlock chat without RevenueCat.
