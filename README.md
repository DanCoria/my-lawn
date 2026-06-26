# My Lawn

My Lawn is a personalized lawn-care dashboard built with Vite, React, TypeScript, Tailwind CSS, and Supabase. It helps users track lawn activities, follow a grass-specific seasonal checklist, view weather-based lawn advice, and run AI-powered lawn photo scans.

## Features

- Email/password authentication with Supabase
- Onboarding for grass type and lawn location
- Dynamic weather advice based on saved lawn location
- Grass-specific dashboard, schedule, and seasonal checklist
- Activity log for mowing, fertilizing, pre-emergent, watering, aeration, and scalping
- Checklist completion synced with matching Activity Log entries
- AI lawn scan diagnosis via Supabase Edge Function
- Private Supabase Storage for scan images with signed URLs

## Tech stack

- React 18
- TypeScript
- Vite
- Tailwind CSS
- Supabase Auth, Postgres, Storage, and Edge Functions
- TanStack Query
- Open-Meteo weather/geocoding APIs

## Getting started

Install dependencies:

```bash
npm install
```

Create a `.env` file in the project root using `.env.example` as a template:

```bash
VITE_SUPABASE_PROJECT_ID="your_project_id"
VITE_SUPABASE_PUBLISHABLE_KEY="your_supabase_anon_key"
VITE_SUPABASE_URL="https://your_project_id.supabase.co"
```

Start the dev server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

## Supabase setup

Run the SQL files in `supabase/migrations` in order:

1. `001_initial.sql`
2. `002_lawn_scans.sql`
3. `003_user_profiles.sql`
4. `004_location_and_storage_scans.sql`
5. `005_private_lawn_scan_storage.sql`
6. `006_task_completions_by_grass_type.sql`

The app expects:

- `activities`
- `task_completions`
- `lawn_scans`
- `user_profiles`
- Supabase Storage bucket: `lawn-scans`
- Edge Function: `diagnose-lawn`

### Edge Function

The AI scan flow calls:

```text
supabase/functions/diagnose-lawn
```

Deploy this function to Supabase and configure any required AI provider secrets in the Supabase project settings.

## Deployment

This app is deployed with Vercel from the GitHub repository:

```text
DanCoria/my-lawn
```

Vercel needs the same environment variables listed in `.env.example`.

## Notes

- Weather is based on the user's saved lawn location when available. If no lawn location is saved, the app falls back to browser geolocation, then Dallas, TX.
- Checklist items can be completed manually or inferred from matching Activity Log entries within each task window.
- Scan images are stored privately in Supabase Storage and displayed with signed URLs.
- `npm run lint` currently needs an ESLint 9 flat config before it will run successfully.
