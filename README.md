# CineMatch

Movie recommendations, watchlist and local showtimes. React + Vite + Supabase.

The rebuild plan (phases, data model, rules) is in [the brief below](#cinematch-v2-rebuild-brief). The audit of the original Base44 app is in [docs/AUDIT.md](docs/AUDIT.md).

## Run locally

Prerequisites: Node 20+ and Docker Desktop (running). The Supabase CLI is a dev dependency, so use it through `npx supabase`.

```bash
npm install
npx supabase start          # local Postgres, Auth, Studio and a test inbox (first run downloads images)
cp .env.example .env.local  # then fill in the two VITE_ values from `npx supabase status`
echo "TMDB_READ_TOKEN=<your token>" > supabase/functions/.env   # see "Movie data" below
npx supabase functions serve  # Edge Functions (keep running in its own terminal)
npm run dev                 # http://localhost:5173
```

Local services:

| What | URL |
|---|---|
| App | http://localhost:5173 |
| Supabase Studio (tables, users) | http://127.0.0.1:54323 |
| Mailpit (every email the app sends: codes, magic links, resets) | http://127.0.0.1:54324 |

Other commands:

```bash
npm run lint                # ESLint
npm run build               # production build into dist/
npx supabase db reset       # wipe the local database and re-run all migrations
npx supabase stop           # stop the local stack
```

The dev server always uses port 5173, because Supabase Auth redirects back to exactly that address.

## Environment variables

| Name | Where | What |
|---|---|---|
| `VITE_SUPABASE_URL` | `.env.local` / hosting env | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | `.env.local` / hosting env | Supabase anon (public) key. Safe in the browser; RLS protects the data |
| `TMDB_READ_TOKEN` | Supabase secret | TMDB v4 read token (Phase 2) |
| `LLM_PROVIDER`, `LLM_MODEL`, `LLM_API_KEY` | Supabase secrets | Recommendation reranker (optional, see [Recommendations](#recommendations)) |
| `SHOWTIMES_PROVIDER`, `SHOWTIMES_API_KEY` | Supabase secrets | Showtimes adapter, default `links` (see [Location, cinemas and showtimes](#location-cinemas-and-showtimes)) |
| `OSM_CONTACT` | Supabase secret (optional) | Contact sent to OpenStreetMap with each request |
| `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID`, `..._SECRET` | `supabase/.env` | Only to test Google sign-in against the local stack |

Only `VITE_` variables reach the browser. Everything else stays in Supabase. Locally, Edge Function secrets go in `supabase/functions/.env`. Never commit `.env.local`, `supabase/.env` or `supabase/functions/.env`.

## Movie data (TMDB)

All movie data comes from [TMDB](https://www.themoviedb.org) through the `tmdb` Edge Function (`supabase/functions/tmdb`), so the token never reaches the browser. It accepts only these operations: `search`, `movie`, `discover`, `now_playing`, `upcoming`, `genres`, `providers`. Only signed-in users can call it.

Responses are cached in Postgres: movie details in `movies_cache` for 7 days, lists in `tmdb_list_cache` for 6 hours (genres and provider lists for 7 days). To force fresh data locally, run `npx supabase db reset` or delete rows from those tables in Studio.

Get a token: create a free account at themoviedb.org, then go to Settings → API, request an API key (personal use is fine), and copy the **API Read Access Token** (the long one, not the short "API Key").

The app shows the required TMDB attribution in the footer and the JustWatch attribution next to "Where to watch".

## Auth

Supabase Auth with:

- email + password (sign up confirms the email with a 6-digit code or the link in the same email)
- passwordless sign in with an emailed code or magic link (`/login/code`)
- Google OAuth
- password reset by email link (`/forgot-password` → `/reset-password`)

Signed-out users who open a protected page are sent to `/login?returnTo=...` and come back to that page after signing in. OAuth and email links land on `/auth/callback`, which finishes the sign in and follows `returnTo`.

A trigger creates a row in `public.profiles` for every new user (see `supabase/migrations/`).

## Watchlist

Stored in `watchlist_items` (one row per user and TMDB movie, RLS: each user sees only their own rows). A trigger sets `watched_at` when a movie is marked watched, and ratings/reactions are only allowed on watched movies.

**Importing the old Base44 watchlist** (optional): export the `WatchlistItem` entity as CSV from Base44 (columns `title`, `year`, `status`, `user_rating`, `notes`, `created_date`), then:

```bash
export SUPABASE_URL=http://127.0.0.1:54321            # or https://<ref>.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=<service role key>   # `npx supabase status`, or Project Settings → API. Never commit it.
node scripts/import-base44-watchlist.js --file watchlist.csv --user-email you@example.com --dry-run
node scripts/import-base44-watchlist.js --file watchlist.csv --user-email you@example.com
```

A row is imported only when exactly one TMDB movie has the same title and year. Everything else is written to `watchlist.csv.unmatched.csv` with the reason, so you can fix those rows and re-run.

## Recommendations

Discover (`/`) runs the taste quiz once, then shows picks from the `recommend` Edge Function. Answers are saved in `quiz_answers` and can be edited on `/profile`.

How a set of picks is made (`supabase/functions/recommend/`):

1. **Taste profile** (`taste.ts`): genre weights from the quiz, the mood, ratings and reactions ("loved it" / "not for me") and the watchlist, plus liked and disliked films. Saved to `taste_profiles`.
2. **Candidates**, all from TMDB: `recommendations` and `similar` of the films they liked most, `discover` on their top genres and era, `now_playing` in their country for "In cinemas", or the seed movie's recommendations for "More like this". Anything in their watchlist, dismissed ("Not interested") or picked as a quiz favourite is removed.
3. **Ranking**: with an LLM configured, it picks the best 12 from the candidates and writes the "why" line. Any ID that isn't a candidate is dropped, so it can't invent films. Without an LLM, or if the call fails, a scoring formula ranks them and fills in template reasons ("Because you liked Parasite."). The response says which one ran (`ranked_by`).
4. **Cache**: sets are kept in `recommendation_sets` for 6 hours per occasion. A new quiz, rating or country skips the cache; "New picks" forces a fresh set (limited to 20 per user per hour).

The LLM is optional. To turn it on, add to `supabase/functions/.env` (local) or `npx supabase secrets set` (hosted):

```bash
LLM_PROVIDER=anthropic   # anthropic | openai | gemini
LLM_MODEL=claude-opus-5  # any model id from that provider
LLM_API_KEY=<key>
```

## Series, watch history and streaming services

- **Series** work everywhere movies do: search (both together), detail pages at `/tv/:id`, the watchlist and recommendations (a Movies / Series switch on Discover). TMDB movie and series ids overlap, so tables keyed by `tmdb_id` also store `media_type`.
- **What you've watched** (`/seen`): mark films and series as seen from any service, with an optional rating and where (`watched_on`). Recommendations learn from series too (their genres are mapped onto movie genres) and never suggest what's already watched.
- **Netflix import**: upload the CSV from Netflix's *Viewing activity → Download all*. It is parsed in the browser; titles are matched with the `tmdb` function's `match` op, which only accepts confident matches. The user reviews the list before anything is saved, and each title keeps its last watch date.
- **Streaming services** (profile): the services the user pays for (`profiles.streaming_services`, TMDB provider ids). Recommendations rank titles on them higher and show "On Neon", "On Netflix", etc.

## Together: shared lists and movie night

Under **Together** (`/together`):

- **Shared lists**: a user creates a list and invites people with a link. The owner chooses whether the link makes people editors ("Can add") or viewers, and can change roles or remove members. Everyone sees who added each title, and changes appear live (Supabase Realtime). Titles can also be added from any title page ("Add to list").
- **Movie night**: the host creates a night (movies or series, optionally from a list) and shares the link. When the host starts, the `movie-night` Edge Function builds a pool of up to 25 titles from everyone's watchlists and latest picks plus the list. It prefers what's streaming on any member's service in the host's country (or in cinemas), and leaves out what everyone has seen or anyone dismissed. Everyone swipes yes or no; a yes from everyone is a match, shown live. A night ends after 24 hours.

Invite links carry a random token. Joining goes through `join_list()` / `join_movie_night()` (database functions that check the token), never a public insert. Only the owner can read a list's token; members of a night can read its token. RLS keeps lists, nights and votes visible to members only, and people can see the names of those they share a list or night with.

## Alerts

The `alerts` Edge Function tells users when something on their watchlist becomes available: it lands on one of their streaming services, opens in cinemas in their country this week, or a series they're watching has a new episode. Alerts appear under the bell (`/alerts`). A user's first check only records what's already true, so they're told about changes, not everything at once.

It runs two ways:

- **When the app opens** (at most every 6 hours per device, 30 minutes per user on the server), for that user.
- **Daily at 18:00 UTC** (early morning in NZ) for everyone, through `pg_cron` + `pg_net` (see the alerts migration). The job needs the function URL and a shared secret in Vault, once per environment:

  ```sql
  -- Hosted: Project URL. Local: http://supabase_kong_cinematch:8000
  select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
  select vault.create_secret('<a long random string>', 'alerts_secret');
  ```

  Set the same string as the function's `ALERTS_SECRET` secret (`supabase/functions/.env` locally). `alerts` has the gateway's JWT check turned off in `supabase/config.toml`, because the cron call has no user token; the function checks the secret or the user itself.

**Email** (optional): users can turn on "Email alerts" in their profile. Emails are sent through [Resend](https://resend.com) only when `RESEND_API_KEY`, `EMAIL_FROM` and `APP_URL` are set. Push notifications need the installable app, which comes with deploying.

## Location, cinemas and showtimes

- **Location**: "Use my location" (browser geolocation) or a town/city search, on Now Showing, the profile page and the Showtimes tab. Only the town, country and a position rounded to about 1 km are saved in `profiles`. The country drives TMDB region, certifications, release dates and where to watch.
- **Cinemas near you** (Now Showing): cinemas within 15 km from [OpenStreetMap](https://www.openstreetmap.org/copyright), with their websites. Users can star cinemas (`favourite_cinemas`).
- **Showtimes** (tab on the movie page): comes from the `showtimes` Edge Function, which uses whichever provider `SHOWTIMES_PROVIDER` names. The default, `links`, is free and needs no key: it links to the country's showtimes site (Flicks in NZ and Australia, Fandango in the US), a web search for "{film} showtimes {town}", and the user's starred cinemas.
- **Real session times** need a paid API. The options, with pricing and what to ask about NZ coverage, are in [docs/SHOWTIMES_PROVIDERS.md](docs/SHOWTIMES_PROVIDERS.md). The adapter and a stub are ready in `supabase/functions/showtimes/providers/`.

OpenStreetMap's free services have usage policies: the function identifies the app, stays under one request per second, and caches results in `places_cache` (cinemas 7 days, places 30 days). The UI credits "© OpenStreetMap contributors". Optionally set `OSM_CONTACT` (an email or URL) as a secret, so OSM can reach you if needed.

## Set up the hosted Supabase project

1. Create a project at [supabase.com](https://supabase.com). Copy the **Project URL** and **anon key** from Project Settings → API into `.env.local` (and later into your hosting provider).
2. Link this repo and apply the migrations:
   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```
3. **Authentication → URL Configuration**: set **Site URL** to your production URL (use `http://localhost:5173` until you deploy) and add these **Redirect URLs**: `http://localhost:5173/**` and `https://<your-production-domain>/**`.
4. **Authentication → Providers → Email**: keep "Confirm email" on and set the minimum password length to 8.
5. **Authentication → Email Templates**: paste the contents of `supabase/templates/confirmation.html` ("Confirm signup"), `magic_link.html` ("Magic Link") and `recovery.html` ("Reset Password"). Without this the emails contain only a link, not the 6-digit code the app asks for.
6. **Google sign-in**: in [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create an OAuth client ID (type "Web application") with the authorized redirect URI `https://<your-project-ref>.supabase.co/auth/v1/callback`. Paste the client ID and secret into **Authentication → Providers → Google** and enable it.
7. **TMDB and recommendations**: set the token as a secret and deploy the functions:
   ```bash
   npx supabase secrets set TMDB_READ_TOKEN=<your token>
   npx supabase functions deploy tmdb
   npx supabase functions deploy recommend
   npx supabase functions deploy showtimes
   npx supabase functions deploy alerts   # then add the Vault secrets from "Alerts"
   npx supabase functions deploy movie-night
   # optional, for LLM-written picks (see "Recommendations"):
   npx supabase secrets set LLM_PROVIDER=anthropic LLM_MODEL=claude-opus-5 LLM_API_KEY=<key>
   ```
8. **Before real users**: Supabase's built-in email sender is heavily rate-limited and meant for testing. Add your own SMTP (e.g. Resend, Postmark) in **Project Settings → Auth → SMTP**.

---

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
