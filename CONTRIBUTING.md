# Contributing to Raslash

## Branches

- `main`: protected, releasable code only
- `develop`: optional integration branch for changes that must be tested together
- `feature/ui-<name>`: screens, components, styles, and animation
- `feature/backend-<name>`: data access and backend integration
- `fix/<name>`: focused bug fixes

Create a fresh branch from the target branch:

```bash
git switch main
git pull --ff-only
git switch -c feature/ui-map-redesign
```

Commit only the files related to the task, push the branch, and open a pull
request. Do not merge when CI is failing or a required reviewer has not approved.

## Ownership boundaries

UI contributors normally work in:

- `app/**`
- `src/components/**`
- `src/theme/**`
- visual assets

The repository owner reviews and controls:

- `supabase/**` and all RLS policies
- `src/lib/**` remote data access
- authentication, membership, RevenueCat, and admin authorization
- dependencies, workflows, environment configuration, and releases

Shared types should be agreed on before either side changes them. Screens should
consume typed service functions instead of calling Supabase directly.

## Required checks

Run before opening a pull request:

```bash
npm ci
npm --prefix admin-web ci
npm run check
```

Never commit `.env` files. Public client variables are not secrets and must never
carry administrator privileges.

## Pull request size

Prefer one screen or one backend concern per pull request. A UI pull request
should include before/after screenshots and list the devices or screen sizes that
were tested.
