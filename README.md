# Base44 Project

Use this repository to run and edit the app locally, then publish changes back through Base44.

Any change pushed to the repo will also be reflected in the Base44 Builder.

## Prerequisites

1. Clone the repository using the project's Git URL.
2. Navigate to the project directory.
3. Install dependencies: `npm install`.
4. Install the Base44 CLI: `npm install -g base44@latest`.
5. Install [Deno](https://docs.deno.com/runtime/getting_started/installation/) — the local Base44 backend runs on it.

Run `base44 --help` (or see the [CLI reference](https://docs.base44.com/developers/references/cli/commands/introduction)) for the full command surface.

## Run Locally

Three commands, from the project root:

```bash
base44 login   # one-time per machine
base44 link    # one-time per clone
base44 dev     # local backend + frontend together
```

Open the frontend URL that `base44 dev` prints (typically `http://localhost:5173`).

Notes:

- **Every fresh clone needs `base44 link`.** It writes `base44/.app.jsonc` (the app-id pointer), which is deliberately gitignored. Your app id is in the Builder URL (`app.base44.com/apps/<id>/...`); `base44 link --help` shows the non-interactive flags.
- **`base44 dev` runs the frontend for you** (via `site.serveCommand` in this repo's `base44/config.jsonc`) — never run `npm run dev` yourself: alone it serves a UI with no backend behind it (`[base44] Proxy not enabled`, every `/api` call fails), and alongside `base44 dev` the second Vite silently takes the next port and you end up looking at the wrong one.
- **The app must be published at least once for the UI to load under `base44 dev`.** The frontend boots by fetching app settings from the hosted app; before the first publish that fails and every page redirects to login. The local API works regardless.
- Entities, functions, and auth run locally — entity data is **in-memory only**, wiped when `base44 dev` restarts. Everything else (Core integrations, OAuth login) is forwarded to your deployed app. Full breakdown: [Local development overview](https://docs.base44.com/developers/backend/overview/local-dev/local-development-overview).

## Frontend Only, Hosted Backend

To work on just the frontend against your app's live hosted backend:

```bash
base44 dev --remote
```

⚠️ In this mode writes go to your app's **production data** — plain `base44 dev` keeps everything local.

## Publish Your Changes

After pushing your changes to git, open the Base44 dashboard and publish the app:

```bash
base44 dashboard open
```

This repo syncs to Base44 through git, so publish from the dashboard rather than `base44 deploy` — a CLI deploy ships your local tree directly, bypassing the sync, and the deployed state silently diverges from the repo.

## Docs & Support

GitHub integration: [https://docs.base44.com/developers/app-code/local-development/github](https://docs.base44.com/developers/app-code/local-development/github)

Local development: [https://docs.base44.com/developers/backend/overview/local-dev/local-development-overview](https://docs.base44.com/developers/backend/overview/local-dev/local-development-overview)

Support: [https://app.base44.com/support](https://app.base44.com/support)








# CineMatch v2: Rebuild Brief

You are rebuilding CineMatch, a movie recommendation app originally generated on Base44. The original code is in this repo (unzipped from `cinematch-code.zip`, folder `cinematch/`). The goal is a better version the owner fully controls, built on **React + Vite + Supabase**, with real movie data, local cinema showtimes, smarter recommendations and social features.

Work **phase by phase**. At the end of each phase, stop, summarise what changed, list anything the owner must do manually, and wait for approval before starting the next phase.

---

## Ground rules

- Keep it simple and maintainable. No clever abstractions unless they remove real duplication.
- Keep the stack in JavaScript + JSX (same as the original) so existing components can be reused. Use JSDoc where types help.
- Reuse what is already good: `src/components/ui/*` (shadcn/ui), Tailwind config, `index.css`, layout and visual style.
- All code comments in English.
- Never commit secrets. Create `.env.example` with every variable, real values go in `.env.local` (gitignored) and Supabase secrets.
- API keys for TMDB, the LLM and showtimes live **only** in Supabase Edge Functions, never in the browser bundle.
- Never invent movie data. Every movie shown in the UI must resolve to a real TMDB ID.
- Don't scrape cinema websites. Showtimes come from a proper API or fall back to external links (see Phase 5).
- Mobile first. Every screen must work well at 375px width.

---

## Phase 0: Audit the original app (no code changes)

Read every file in `cinematch/` (skip `src/components/ui/*`, it is stock shadcn) and write `docs/AUDIT.md` covering:

1. **Features and routes**: what each page does (`Home`, `NowShowing`, `Watchlist`, auth pages) and how routing/protection works (`App.jsx`, `ProtectedRoute.jsx`, `Layout.jsx`).
2. **Quiz**: every question and answer option in `Quiz.jsx`, and how answers are sent to the backend.
3. **Backend functions**: exactly what `base44/functions/getMovieRecommendations/entry.ts` and `getNowShowing/entry.ts` do, including the full LLM prompts, the response schema, and where movie data comes from (AI-generated vs a real API).
4. **Data model**: fields in `base44/entities/WatchlistItem.jsonc` and `User.jsonc`.
5. **Base44 dependencies**: every import of `@base44/sdk`, `base44Client`, `AuthContext`, `app-params`, the Vite plugin, and any Base44-only pages (for example `OAuthConsent.jsx`, `UserNotRegisteredError.jsx`).
6. **Keep / change / drop**: a table of what to carry over (UI, copy, quiz logic, prompts) and what to replace.
7. **Weak points**: bugs, hallucination risks, missing loading/error states, performance issues.

Stop and wait for approval.

---

## Phase 1: Scaffold, Supabase and auth

**Setup**
- New Vite + React app at the repo root (or `app/`), React Router, TanStack Query (port `lib/query-client.js`), Tailwind, shadcn/ui (copy over `src/components/ui`, `components.json`, `tailwind.config.js`, `index.css`, `lib/utils.js`).
- Remove all Base44 code: `@base44/sdk`, the Base44 Vite plugin, `base44Client.js`, `app-params.js`, `UserNotRegisteredError.jsx`, `OAuthConsent.jsx`.
- `src/lib/supabase.js` creates the client from `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- Supabase CLI project structure: `supabase/migrations`, `supabase/functions`.

**Auth** (rewrite `AuthContext.jsx` on top of Supabase Auth)
- Email + password, password reset, email OTP / magic link, Google OAuth.
- Port the existing auth pages (`Login`, `Register`, `ForgotPassword`, `ResetPassword`, `AuthLayout`) to Supabase calls, keeping the design.
- Keep the "return to where you were after login" behaviour from `authReturnTo.js`.
- On sign up, a trigger creates a row in `profiles`.

**Owner must do manually** (list these clearly at the end of the phase):
- Create the Supabase project and copy the URL + anon key.
- Create Google OAuth credentials in Google Cloud and add them in Supabase Auth settings.
- Set the Site URL and redirect URLs in Supabase Auth.

---

## Phase 2: Real movie data (TMDB)

**Edge Function `tmdb`** (single proxy function, keeps the token server side)
- Uses `TMDB_READ_TOKEN` (v4 read access token, Bearer auth).
- Whitelisted operations only: `search`, `movie` (details), `discover`, `now_playing`, `upcoming`, `genres`, `providers`. Reject anything else.
- Movie details call uses `append_to_response=videos,credits,watch/providers,release_dates,similar,recommendations`.
- Caches responses in the `movies_cache` table (details: 7 days, lists like now_playing: 6 hours).

**Frontend**
- `MovieCard` shows the real poster (`https://image.tmdb.org/t/p/w342{poster_path}`), title, year, runtime, genres, rating. Use `srcset` with w185 / w342 / w500 and lazy loading.
- New **Movie detail page** `/movie/:tmdbId`: backdrop, poster, overview, director, top cast, certification for the user's country, runtime, genres.
- **Trailer**: pick from `videos` where `site = "YouTube"`, prefer `type = "Trailer"` and `official = true`, then the newest. Open it in a modal using `https://www.youtube-nocookie.com/embed/{key}`. Also show an "Open on YouTube" link.
- **Where to watch**: `watch/providers` for the user's country (default `NZ`), grouped by Stream / Rent / Buy, with provider logos. Show the required JustWatch attribution.
- Global search bar (debounced TMDB search).
- Footer with the required TMDB attribution and logo.

**Owner must do manually**: create a TMDB account, request an API key, and add `TMDB_READ_TOKEN` as a Supabase secret.

---

## Phase 3: Watchlist and ratings

Replace the Base44 `WatchlistItem` entity with Supabase tables (see the data model below).

- Add / remove from the watchlist on every card and on the detail page (optimistic updates with TanStack Query).
- Status: `want_to_watch` | `watched`.
- When marking as watched: optional 1 to 5 star rating plus quick reaction (loved it / fine / not for me).
- Watchlist page: filters (status, genre, where it is streaming in the user's country), sort (added date, release date, rating), and a "Coming soon" section using TMDB release dates for the user's region (this replaces the old `release_status` field).
- Port the existing Watchlist page UI where it makes sense.
- **Optional import**: a script `scripts/import-base44-watchlist.js` that takes a CSV export of the old WatchlistItem data, matches each row to TMDB by title + year, and inserts it. Log rows that could not be matched instead of guessing.

---

## Phase 4: Better recommendations

Replace `getMovieRecommendations` with a hybrid approach. The LLM never invents movies; it only picks from real candidates and explains why.

**Edge Function `recommend`**
1. **Build the taste profile** from: quiz answers, ratings and reactions, watchlist genres, and dismissed movies. Store a summary in `taste_profiles` (favourite genres with weights, liked movie IDs, disliked genres, preferred decades, runtime and mood preferences).
2. **Generate candidates from TMDB** (around 60 to 100):
   - `recommendations` and `similar` for the user's top-rated movies
   - `discover` using weighted genres, decades and minimum vote count (to avoid obscure junk)
   - Optionally: `now_playing` in the user's region if they asked for "in cinemas"
3. **Filter**: remove movies already in the watchlist, already watched, or dismissed.
4. **Rerank with the LLM**: send the taste profile + compact candidate list (tmdb_id, title, year, genres, overview trimmed). Ask for the best N as strict JSON: `[{ tmdb_id, reason }]`. Drop any tmdb_id not in the candidate list.
5. Return the enriched movies. Cache the result per user for a few hours in `recommendation_sets`.

**Frontend**
- Keep the quiz (port questions from the audit, improve wording if needed), and make it editable later from the profile.
- Recommendation cards show the personal "why" line.
- Actions on each card: add to watchlist, "not interested" (goes to `dismissed_movies`), "more like this" (re-runs with that movie as the seed).
- Mood / context chips on Home: "Tonight at home", "In cinemas", "With friends", "Short (< 100 min)".

**LLM config**: provider and model come from env (`LLM_PROVIDER`, `LLM_MODEL`, `LLM_API_KEY`). Port the useful parts of the original prompt from the audit.

---

## Phase 5: Location, cinemas and showtimes

**Location**
- Ask for browser geolocation, with a manual fallback (country + city search). Save `country_code`, `city`, `lat`, `lng` in `profiles`.
- Country drives TMDB `region`, certifications and watch providers.

**Now Showing** (replaces `getNowShowing`)
- TMDB `now_playing` + `upcoming` for the user's region, with real posters and trailers.

**Showtimes**
There is no good free global showtimes API, so build it behind an adapter:
- `supabase/functions/showtimes/providers/` with a common interface: `getCinemasNear(lat, lng)`, `getShowtimes(cinemaId, date)`, `getShowtimesForMovie(tmdbId or title, lat, lng, date)`.
- Implement a `links` provider first (works everywhere, no API): for each movie, show "Find showtimes near {city}" linking to a Google search for "{title} showtimes {city}", plus links to cinema websites the user saves as favourites.
- Prepare a second provider stub for a paid showtimes API (for example MovieGlu or SerpApi's Google showtimes results). **Do not pick one yourself**: list the options with NZ coverage, pricing and terms, and let the owner decide. The owner will check NZ coverage before signing up.
- UI: "Cinemas near you" list, and on the movie detail page a "Showtimes" tab that uses whichever provider is active.
- Users can save favourite cinemas.

---

## Phase 6: Social

**Shared lists**
- Users can create lists ("Date night", "Horror October"), invite others via a share link (random token), with roles `owner` | `editor` | `viewer`.
- Everyone sees who added each movie. Realtime updates with Supabase Realtime.

**Movie night picker**
- Host creates a session, invites friends by link.
- Candidate pool: a blend of every member's recommendations + shared list movies, filtered to what is streaming on the group's services or in cinemas.
- Everyone swipes yes / no. A movie everyone says yes to becomes a match. Show a live results screen (Realtime).
- Session expires after 24 hours.

**Profile**
- Public profile toggle, favourite movies, streaming services the user subscribes to (used to filter "where to watch").

---

## Phase 7: Polish and deploy

- Loading skeletons, empty states and error states on every data view.
- Accessibility: keyboard navigation, focus states, alt text, reduced motion.
- PWA manifest + icons so it can be installed on a phone.
- Basic SEO for the movie detail pages (title, description, OG image from the backdrop).
- Deploy to Vercel or Netlify. Document every env variable in `README.md` along with setup steps.

---

## Data model (Supabase / Postgres)

Write these as migrations. Enable RLS on every table.

```
profiles             id (uuid, = auth.users.id), display_name, avatar_url,
                     country_code (default 'NZ'), city, lat, lng,
                     streaming_services text[], is_public bool, created_at

movies_cache         tmdb_id (pk), data jsonb, fetched_at

watchlist_items      id, user_id, tmdb_id, status ('want_to_watch'|'watched'),
                     rating smallint null (1..5), reaction text null,
                     notes text, added_at, watched_at
                     unique (user_id, tmdb_id)

quiz_answers         user_id (pk), answers jsonb, updated_at
taste_profiles       user_id (pk), profile jsonb, updated_at
dismissed_movies     user_id, tmdb_id, created_at, pk (user_id, tmdb_id)
recommendation_sets  id, user_id, context text, items jsonb, created_at

favourite_cinemas    id, user_id, provider, external_id, name, address, lat, lng, url

lists                id, owner_id, name, description, share_token, created_at
list_members         list_id, user_id, role ('owner'|'editor'|'viewer'), pk (list_id, user_id)
list_items           id, list_id, tmdb_id, added_by, added_at, unique (list_id, tmdb_id)

movie_nights         id, host_id, name, share_token, expires_at, created_at
movie_night_members  movie_night_id, user_id, pk (movie_night_id, user_id)
movie_night_votes    movie_night_id, user_id, tmdb_id, vote bool,
                     pk (movie_night_id, user_id, tmdb_id)
```

RLS summary:
- Users read and write only their own rows in personal tables.
- `lists` / `list_items`: readable by members, writable by owner and editors.
- `movie_nights` and votes: readable and writable by members only.
- `movies_cache`: readable by everyone, writable only by Edge Functions (service role).
- Joining via share token goes through an Edge Function or RPC that validates the token, not a public insert.

---

## Suggested folder structure

```
src/
  components/        MovieCard, TrailerModal, WatchProviders, RatingInput, ...
  components/ui/     shadcn (copied from original)
  features/
    auth/
    movies/          detail page, search
    watchlist/
    recommendations/ quiz, recommendation feed
    cinemas/         now showing, showtimes, location
    social/          lists, movie night
  lib/               supabase.js, query-client.js, tmdb-images.js, utils.js
  pages/             route-level components
supabase/
  migrations/
  functions/
    tmdb/
    recommend/
    showtimes/
    join-by-token/
docs/
  AUDIT.md
```

---

## Environment variables

```
# Frontend (.env.local)
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=

# Supabase secrets (supabase secrets set ...)
TMDB_READ_TOKEN=
LLM_PROVIDER=
LLM_MODEL=
LLM_API_KEY=
SHOWTIMES_PROVIDER=links
SHOWTIMES_API_KEY=
```

---

## Definition of done per phase

- Runs locally with `npm run dev` and `supabase start` with no console errors.
- Every new table has RLS policies, and they have been tested with two different users.
- No API key in the client bundle (check the build output).
- Mobile (375px) and desktop layouts checked.
- Short summary of changes + manual steps for the owner.
