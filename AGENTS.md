# Raslash contribution rules

- This project currently uses Expo SDK 54. Use the versioned documentation at
  https://docs.expo.dev/versions/v54.0.0/ when changing Expo or React Native code.
- Do not upgrade Expo, React Native, or other major dependencies without a
  dedicated pull request and explicit approval.
- UI work belongs in `app/**`, `src/components/**`, and `src/theme/**`.
- Do not edit `supabase/**`, authentication, billing, RLS policies, or data
  access code in `src/lib/**` as part of a UI-only task.
- Never put secrets or service-role keys in source files. Values prefixed with
  `EXPO_PUBLIC_` or `VITE_` are public and must not grant privileged access.
- Do not call Supabase directly from screens or UI components. Keep remote data
  access behind functions in `src/lib/**`.
- Keep changes limited to the requested task. Do not rewrite unrelated files.
- Before requesting review, run `npm run check`.
- All changes must go through a feature branch and pull request. Never commit
  directly to `main`.
