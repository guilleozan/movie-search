# CineMatch: Audit of the Original Base44 App

Phase 0 of the v2 rebuild. No code was changed in this phase.

> **Note on paths:** the brief says the original code is in a `cinematch/` folder. It actually sits at the repo root (`src/`, `base44/`, config files). All paths below are relative to the repo root.

Files reviewed: everything outside `src/components/ui/*`, plus a quick scan of `src/components/ui/*` for Base44-specific code (a few files there are not stock shadcn, see §5).

---

## 1. Features and routes

### Routing (`src/App.jsx`)

Provider order: `AuthProvider` → `QueryClientProvider` → `BrowserRouter` → `ScrollToTop` + `AuthenticatedApp`, plus a global `<Toaster />` (shadcn toast).

`AuthenticatedApp`:
1. Shows a full-screen spinner while `isLoadingPublicSettings || isLoadingAuth`.
2. If `authError.type === 'user_not_registered'`, renders `UserNotRegisteredError`.
3. If `authError.type === 'auth_required'`, calls `navigateToLogin()` **during render**, which sends the user to the **Base44-hosted** login (`base44.auth.redirectToLogin`), not the app's own `/login`.
4. Otherwise renders the routes:

| Path | Component | Protected | Layout |
|---|---|---|---|
| `/login` | `Login` | no | `AuthLayout` |
| `/register` | `Register` | no | `AuthLayout` |
| `/forgot-password` | `ForgotPassword` | no | `AuthLayout` |
| `/reset-password` | `ResetPassword` | no | `AuthLayout` |
| `/` | `Home` (Discover) | yes | `Layout` |
| `/now-showing` | `NowShowing` | yes | `Layout` |
| `/watchlist` | `Watchlist` | yes | `Layout` |
| `*` | `PageNotFound` | no | none |

`OAuthConsent.jsx` exists but is **not routed**, so it is dead code in this app.

### Protection (`src/components/ProtectedRoute.jsx`)

A layout route. If auth hasn't been checked yet, it calls `checkUserAuth()` and shows a spinner. On `user_not_registered` it renders `UserNotRegisteredError`. On any other auth error, or if the user is not authenticated, it renders `unauthenticatedElement` (`<Navigate to="/login" replace />`). Otherwise it renders `<Outlet />`.

It does **not** append `?returnTo=` when redirecting to `/login`, so the "return to where you were" logic in `authReturnTo.js` is only used when some other flow provides `returnTo`. In practice, a signed-out user who opens `/watchlist` lands on `/` after logging in.

### Layout (`src/components/Layout.jsx`)

- Dark theme hard-coded with Tailwind classes (`bg-slate-950`, `text-slate-100`, amber-400 accents). This does not use the shadcn CSS variables in `index.css`.
- Desktop: a 240px left sidebar with the logo (clapperboard icon + **"Reel"**, not "CineMatch") and nav items Discover `/`, Now Showing `/now-showing`, Watchlist `/watchlist`. Footer copy: "Picks curated for your taste."
- Mobile: a fixed 56px top bar with the logo and the same three nav links (icon + label).
- No logout button or user menu anywhere in the app.

### Pages

**Home / Discover (`src/pages/Home.jsx`)**
- Hero copy: "AI taste quiz" pill, heading "Find your next favorite film", subtitle "Answer a few questions about your taste and get a curated list of films picked just for you."
- Renders `Quiz`. On completion it calls `base44.functions.invoke('getMovieRecommendations', answers)`.
- Loading: pulsing film icon, "Curating your picks…" / "Searching world cinema for matches."
- Error: message plus a "Try again" link that resets to the quiz.
- Results: "Your picks" with the text "{n} films matched to your taste. Tap the bookmark to save." A "New quiz" button and a 1/2/3-column grid of `MovieCard`.
- On mount it loads up to 200 `WatchlistItem`s to mark saved cards. The key is `title + '|' + year`.
- `toggleSave` creates or deletes a `WatchlistItem` that copies all AI-generated fields. There is no optimistic update and no error handling.
- Results live only in component state, so a refresh loses them.

**Now Showing (`src/pages/NowShowing.jsx`)**
- Header pill "Now showing", heading "In cinemas & coming soon", subtitle "What's playing right now and what's headed to the big screen. Bookmark anything you want to catch.", and a Refresh button.
- Calls `getNowShowing` on every mount and every refresh, with no cache.
- Two sections: "In theaters now" and "Coming soon". Each uses a `MovieCard` grid.
- The watchlist toggle logic is duplicated verbatim from Home.

**Watchlist (`src/pages/Watchlist.jsx`)**
- Lists up to 200 items, newest first.
- Filter tabs: all / unwatched / watched, with counts.
- Each card shows a release-status badge, year, genre, runtime, rating, tagline and reason, a trash button (delete), and a "Mark as watched" / "Watched" toggle.
- There is a loading spinner and an empty state ("Your watchlist is empty… Take the quiz on Discover…"). A load error silently shows the empty state.
- `user_rating` and `notes` exist on the entity but have no UI.

**Auth pages**
- `Login`: Google button (`loginWithProvider('google', returnTo)`), email + password (`loginViaEmailPassword`), a "Forgot password?" link and a "Create one" link. Both links preserve `returnTo`. After login it runs `window.location.href = returnTo`.
- `Register`: Google button, email + password + confirm. It calls `auth.register`, then an **email OTP step** (6-digit `InputOTP`, `verifyOtp`, `setToken`, "Resend" → `resendOtp`), then redirects to `safeReturnTo()`.
- `ForgotPassword`: `resetPasswordRequest(email)`. It always shows "If an account exists…", which is good because it doesn't reveal whether an account exists.
- `ResetPassword`: reads `?token=`, then `resetPassword({ resetToken, newPassword })`, then goes to `/login`. It has an "Invalid reset link" state when the token is missing.
- `AuthLayout`: centred card with an icon tile, title, subtitle and footer. It uses the **light** shadcn tokens (`bg-background`, `bg-card`), so auth pages render white while the app is dark slate.

**Other**
- `PageNotFound` (`src/lib/`): light-theme 404. It calls `base44.auth.me()` to show an "Admin Note" about asking the AI to implement the page.
- `ScrollToTop`: scrolls to the top on PUSH/REPLACE navigation, or to the `#hash` target. Generic, worth keeping.
- `GoogleIcon`: inline SVG. Keep.

---

## 2. Quiz (`src/components/Quiz.jsx`)

Five steps with a progress bar and Back / Continue buttons. The last button reads "Get my picks" ("Curating…" while loading).

| # | Step id | Title | Hint | Input | Required |
|---|---|---|---|---|---|
| 1 | `genres` | "What genres pull you in?" | "Pick all that speak to you." | Multi-select chips | ≥ 1 |
| 2 | `mood` | "What mood are you after?" | "Choose the feeling you want." | Single choice | yes |
| 3 | `era` | "When should it be from?" | "Any era preference?" | Single choice | yes |
| 4 | `favorites` | "Films you love" | "Optional — name a few favorites to sharpen the picks." | Free text, placeholder "e.g. Blade Runner 2049, Parasite, Lady Bird" | no |
| 5 | `count` | "How many picks?" | "We'll curate a list for you." | 5 / 8 / 10 buttons (default 8) | yes |

**Genres (value = label):** Drama, Thriller, Sci-Fi, Comedy, Romance, Horror, Action, Crime, Fantasy, Animation, Documentary, Mystery.

**Moods (id → label):**
- `cozy` → Cozy & comforting
- `thrilling` → Edge-of-seat thrilling
- `thoughtful` → Slow & thought-provoking
- `funny` → Laugh-out-loud funny
- `dark` → Dark & unsettling
- `uplifting` → Warm & uplifting

**Eras (id → label):**
- `classic` → Classics (pre-1980)
- `8090` → 80s & 90s
- `2000s` → 2000s
- `recent` → Recent (last 10 years)
- `mixed` → Mix it up

**How answers are sent:** `onComplete({ genres, mood, era, favorites, count })` passes them to `Home.runQuiz`, which calls `base44.functions.invoke('getMovieRecommendations', answers)` as the JSON body. **The ids are sent, not the labels**, so the LLM sees `mood: cozy` and `era: 8090`. Answers are not persisted anywhere.

---

## 3. Backend functions

Both are Deno functions using `npm:@base44/sdk@0.8.49`. Both authenticate with `createClientFromRequest(req)` and `base44.auth.me()`, and return 401 if there is no user. Both call `base44.asServiceRole.integrations.Core.InvokeLLM` with `model: 'gemini_3_flash'` and `add_context_from_internet: true`.

**Every piece of movie data comes from the LLM. No real movie API is used.** Title, year, director, runtime, rating, release status and dates are all generated text. There are no IDs and no posters.

### 3.1 `base44/functions/getMovieRecommendations/entry.ts`

**Input sanitising:**
- `genres`: string array, max 8 items.
- `mood`, `era`: strings, max 60 chars.
- `favorites`: string, max 400 chars.
- `count`: number clamped to 3–10, default 6.
- Returns 400 "Please share at least one preference." if genres, mood and favorites are all empty.

**Full prompt:**
```
You are a thoughtful film curator with deep, current knowledge of world cinema — including films currently showing in theaters and upcoming releases.
A user took a taste quiz. Recommend ${count} real movies that match their taste.
Prefer acclaimed, genuinely good films the user is likely to enjoy. Vary the selection — mix familiar classics, hidden gems, and where relevant a couple of films that are CURRENTLY IN THEATERS or UPCOMING (about to be released). Use your web access to confirm what is actually in cinemas or scheduled to release soon; never invent a release status. Never invent films; every title must be a real movie with the correct year and director.

User taste profile:
- Favorite genres: ${genres.join(', ') || 'open'}
- Mood they want: ${mood || 'open'}
- Era preference: ${era || 'any era'}
- Films they love: ${favorites || 'none given'}

For each movie return:
- title, year (as a string), genre (primary), director, runtime (e.g. "142 min")
- rating (e.g. "8.3/10" — a widely known score like IMDb, or "N/A" if not yet released/rated)
- tagline (a short memorable one-liner for the film)
- release_status: one of "Released", "In theaters", or "Upcoming" — use "In theaters" only if it is currently playing in cinemas, "Upcoming" if it has a confirmed release date but has not premiered yet, otherwise "Released"
- release_date: a short human string like "In theaters now", "Dec 2025", or "" if unknown
- reason (1-2 sentences explaining why this specific film fits THIS user's taste, referencing their quiz answers where relevant)
```

**Response schema:**
```json
{
  "type": "object",
  "properties": {
    "movies": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "title": {"type": "string"}, "year": {"type": "string"},
          "genre": {"type": "string"}, "director": {"type": "string"},
          "runtime": {"type": "string"}, "rating": {"type": "string"},
          "tagline": {"type": "string"},
          "release_status": {"type": "string", "enum": ["Released", "In theaters", "Upcoming"]},
          "release_date": {"type": "string"}, "reason": {"type": "string"}
        },
        "required": ["title", "year", "genre", "release_status", "reason"]
      }
    }
  },
  "required": ["movies"]
}
```

**Output:** `{ movies }`, with an empty array if the model returned a non-array. The count is not enforced after generation. On error it returns 500 with the raw `error.message`.

### 3.2 `base44/functions/getNowShowing/entry.ts`

Takes no input. There is **no region**: the prompt says "worldwide".

**Full prompt:**
```
You are a film release tracker with up-to-date knowledge of what is currently showing in cinemas worldwide and what is scheduled to release in the next few months. Use your web access to confirm real, current titles and dates — never invent films or release dates.

Return two lists:
1. "in_theaters": real films CURRENTLY playing in cinemas right now (wide release). Aim for 8 varied, notable titles.
2. "upcoming": real films with a CONFIRMED upcoming release date (next ~3 months). Aim for 8 varied, notable titles.

For each film return: title, year (as a string), genre (primary), director, runtime (e.g. "142 min" or "" if unknown), rating (a widely known score like IMDb, or "N/A" if not yet released/rated), tagline (a short one-liner, or "" if none), release_status ("In theaters" for the first list, "Upcoming" for the second), release_date (a short human string like "In theaters now" or "Dec 5, 2025"), and a one-sentence reason describing what it is and why it's worth tracking.
```

**Response schema:** `{ in_theaters: Movie[], upcoming: Movie[] }`. Both are required. `Movie` has the same fields as above, but `release_status` is limited to `["In theaters", "Upcoming"]` and only `title`, `release_status` and `reason` are required.

**Output:** `{ in_theaters, upcoming }`, with arrays defaulting to `[]`. There is no caching, so every page view costs a web-grounded LLM call.

---

## 4. Data model

### `base44/entities/WatchlistItem.jsonc`

| Field | Type | Notes |
|---|---|---|
| `title` | string | **required**, the only identity; there is no movie ID |
| `year` | string | |
| `genre` | string | single primary genre |
| `director` | string | |
| `runtime` | string | e.g. "142 min" |
| `rating` | string | LLM-reported score, e.g. "8.3/10" |
| `reason` | string | LLM "why" text, frozen at save time |
| `tagline` | string | LLM-generated, may be invented |
| `release_status` | enum `Released` \| `In theaters` \| `Upcoming` | default `Released`; frozen at save time, so it goes stale |
| `release_date` | string | free text |
| `status` | enum `unwatched` \| `watched` | default `unwatched` |
| `user_rating` | number | unused in the UI |
| `notes` | string | unused in the UI |

Implicit Base44 fields: `id`, `created_by_id`, `created_date` (used for sorting). RLS allows read, create, update and delete only where `created_by_id = {{user.id}}`. There is no uniqueness constraint, so duplicates are possible.

### `base44/entities/User.jsonc`

Only `role`: enum `admin` \| `user`, required. Email and name come from the Base44 platform. `role` is only used by `PageNotFound` to show the admin note, so v2 can drop it.

---

## 5. Base44 dependencies

| Where | What | v2 action |
|---|---|---|
| `package.json` | `@base44/sdk`, `@base44/vite-plugin` | remove |
| `package.json` (dev) | `nitro` (Base44 deploy tooling) | remove |
| `vite.config.js` | `@base44/vite-plugin` with `legacySDKImports`, `hmrNotifier`, `navigationNotifier`, `analyticsTracker`, `visualEditAgent` | remove the plugin; add an `@` alias via `resolve.alias` (the plugin currently provides it) |
| `src/api/base44Client.js` | `createClient` from `@base44/sdk` | delete; replaced by `src/lib/supabase.js` |
| `src/lib/app-params.js` | `getAccessToken` from `@base44/sdk`; reads `VITE_BASE44_APP_ID`, `VITE_BASE44_FUNCTIONS_VERSION`, `VITE_BASE44_APP_BASE_URL`; `clear_access_token` query param | delete |
| `src/lib/AuthContext.jsx` | `base44`, `appParams`: `app.getPublicSettings`, `auth.me`, `auth.logout`, `auth.redirectToLogin` | rewrite on Supabase Auth |
| `src/lib/PageNotFound.jsx` | `base44.auth.me()` + admin "ask the AI" note | restyle to the dark theme and drop the Base44 call |
| `src/pages/Home.jsx`, `NowShowing.jsx`, `Watchlist.jsx` | `base44.entities.WatchlistItem.*`, `base44.functions.invoke(...)` | replace with Supabase + Edge Functions via TanStack Query |
| `src/pages/Login.jsx` | `auth.loginViaEmailPassword`, `auth.loginWithProvider` | Supabase `signInWithPassword`, `signInWithOAuth` |
| `src/pages/Register.jsx` | `auth.register`, `auth.verifyOtp`, `auth.setToken`, `auth.resendOtp` | Supabase `signUp` + `verifyOtp({ type: 'signup' })` + `resend` |
| `src/pages/ForgotPassword.jsx` | `auth.resetPasswordRequest` | `resetPasswordForEmail(email, { redirectTo })` |
| `src/pages/ResetPassword.jsx` | `auth.resetPassword({ resetToken })` with `?token=` | Supabase recovery session (`PASSWORD_RECOVERY` event) + `updateUser({ password })` |
| `src/lib/authReturnTo.js` | strips Base44 bootstrap params (`access_token`, `app_id`, …) | keep the open-redirect guard; drop the Base44 param list |
| `src/pages/OAuthConsent.jsx` | Base44 MCP OAuth consent (`/api/apps/{appId}/mcp/...`) | **drop** (not routed anyway) |
| `src/components/UserNotRegisteredError.jsx` | Base44 "private app" error | **drop** |
| `src/lib/utils.js` | `isIframe` (Base44 editor preview helper, unused) | drop `isIframe`; keep `cn` |
| `src/utils/index.ts` | `createPageUrl` (Base44 template helper, unused) | drop |
| `src/components/ui/image.jsx`, `image-helpers.js`, `responsive-image.jsx`, `use-responsive-image.jsx` | **Not stock shadcn**: Wix/Base44 image CDN transforms, `data-base44-image`, `base44:image-replace` event, Wix fallback image URL | drop; TMDB posters use a plain `<img srcset>` |
| `src/hooks/use-size.jsx` | only used by `use-responsive-image` | drop along with it |
| `base44/` folder | `config.jsonc`, `entities/*`, `functions/*` | delete once v2 replaces it; keep the prompts in this doc as reference |
| `index.html` | Base44 favicon, `<title>Base44 APP</title>`, `/manifest.json` link (**the file doesn't exist**, there is no `public/`) | new title, favicon and a real manifest (Phase 7) |
| `README.md`, `AGENTS.md`, `CLAUDE.md` | Base44 workflow instructions (`base44 dev`, publish via dashboard) | rewrite for Supabase in Phase 1; AGENTS.md currently tells agents to use Base44 tooling, which conflicts with the rebuild |
| `.gitignore` | `base44/.app.jsonc` | fine to leave; add `supabase/.temp`, `supabase/.branches` |

---

## 6. Keep / change / drop

| Item | Decision | Notes |
|---|---|---|
| `src/components/ui/*` (shadcn) | **Keep** | except the four Base44 image files above |
| `components.json`, `tailwind.config.js`, `postcss.config.js`, `index.css`, `lib/utils.js` (`cn`) | **Keep** | `tailwind.config.js` uses `module.exports` in an ESM package; it works via Tailwind's loader but should be converted to `export default` |
| Visual style: dark slate-950 + amber-400, rounded-2xl cards, framer-motion entrances | **Keep** | move the colours into the CSS variables and apply the `.dark` class so shadcn components and auth pages match |
| `Layout.jsx` structure (sidebar + mobile top bar) | **Keep, change** | rename "Reel" to "CineMatch"; add search, profile/logout and more nav items; mobile needs a bottom tab bar once there are more than 3 items (3 labelled links barely fit at 375px) |
| `AuthLayout`, `GoogleIcon`, auth page designs and copy | **Keep** | port to Supabase calls |
| `authReturnTo.js` (`safeReturnTo`) | **Keep** | also make `ProtectedRoute` send `?returnTo=` |
| `ScrollToTop`, `query-client.js`, `use-mobile.jsx` | **Keep** | |
| Quiz UI and question set | **Keep, change** | send labels, not ids; persist to `quiz_answers`; drop the "How many picks?" step (make it a setting) or keep it as optional; `favorites` should become TMDB-search-backed picks with real IDs instead of free text |
| Home / NowShowing / Watchlist copy | **Keep** | good tone, reuse the strings |
| `MovieCard` layout | **Change** | add a poster, TMDB genres/runtime/rating and `tmdb_id`; keep the genre accent colours as a fallback when there is no poster |
| Recommendation prompt | **Change** | reuse the curator persona, "reason referencing quiz answers" and "vary the selection" ideas; drop every factual field (year, director, runtime, rating, release status) because TMDB supplies them; the LLM only ranks given candidates |
| Now Showing prompt | **Drop** | replaced by TMDB `now_playing` / `upcoming` with a region |
| `WatchlistItem` entity | **Replace** | `watchlist_items` keyed by `(user_id, tmdb_id)`; `unwatched` becomes `want_to_watch`; `user_rating` becomes a 1–5 `rating`; add `reaction`; drop all denormalised AI fields |
| `User.role` | **Drop** | `profiles` replaces it |
| `OAuthConsent`, `UserNotRegisteredError`, `app-params`, `base44Client`, Base44 Vite plugin, image CDN helpers, `createPageUrl`, `isIframe` | **Drop** | |
| Unused npm deps: `@stripe/*`, `three`, `react-leaflet`, `jspdf`, `html2canvas`, `react-quill-new`, `moment`, `lodash`, `canvas-confetti`, `react-markdown`, `@hello-pangea/dnd`, `react-hot-toast`, `zod`, `date-fns` | **Drop** | none are imported anywhere; `date-fns` is only a peer of `react-day-picker`, so re-add it if the calendar is used |

---

## 7. Weak points

### Hallucination and data accuracy (the biggest problem)
1. **All movie data is LLM-generated**, including ratings ("IMDb-like"), runtimes, directors, taglines and release dates. Web grounding reduces errors but doesn't prevent them, and nothing is checked afterwards.
2. **There is no stable movie identity.** Title + year is the key, so remakes, retitled releases and "2023" vs "2024" mismatches between calls break "saved" detection and create duplicates.
3. **Release status is frozen** when the movie is saved to the watchlist. "Upcoming" never becomes "Released".
4. **Now Showing is "worldwide"**, so it doesn't reflect what is playing in NZ. It is also slow (a web-grounded LLM call on every visit) and costs money every time.
5. **The model can return fewer or more movies than asked**, and the count isn't enforced.
6. **The prompt receives quiz ids, not labels** (`era: 8090`, `mood: cozy`), so the model has to guess what they mean.
7. **Recommendations ignore history.** The function never sees the watchlist, so it can recommend films the user already saved or watched.

### Bugs
8. `App.jsx` calls `navigateToLogin()` during render (a side effect in render), and it goes to the Base44-hosted login instead of `/login`.
9. `ProtectedRoute` redirects to `/login` without `returnTo`, so deep links are lost after login.
10. `Layout.jsx` uses `h-4.5 w-4.5`, which isn't a default Tailwind 3 spacing value. The classes do nothing and the sidebar icons render at lucide's default 24px.
11. Auth pages and the 404 page use the light shadcn theme while the app is dark. The `.dark` class is never applied, so the theme is inconsistent.
12. `index.html` links a `/manifest.json` that doesn't exist (a 404 in the console).
13. Branding is inconsistent: "Reel" (layout), "CineMatch" (config) and "Base44 APP" (tab title).
14. `toggleSave` and `toggleStatus`/`remove` have no error handling. A failed request throws an unhandled rejection, and the UI state can drift from the server. Rapid double-clicks can create duplicate rows.
15. A Watchlist load error is swallowed (`.catch(() => setItems([]))`) and shows as "Your watchlist is empty".
16. Watchlist saved-state and the list are fetched separately on each page and never shared, so there is stale state between pages. TanStack Query is installed but never used for data.
17. There is no logout anywhere in the UI.
18. The backend returns raw `error.message` to the client, which can leak internal details.
19. `eslint.config.js` targets `src/Layout.jsx` (doesn't exist), and `jsconfig.json` includes `src/components/**/*.js` (misses `.jsx`), so lint and typecheck coverage is patchy.

### Missing states and UX
20. Loading is a spinner or pulsing icon. There are no skeletons.
21. Quiz results are lost on refresh or navigation, and the quiz must be retaken every time.
22. There are no posters, trailers, "where to watch" info or detail page. Cards are text-only.
23. `user_rating` and `notes` exist on the entity but have no UI.
24. Accessibility: quiz chips and options are `<button>`s without `aria-pressed` / `role="radio"`; framer-motion animations ignore `prefers-reduced-motion`; there are no focus-visible styles on custom buttons.
25. Mobile: three labelled nav links plus the logo fit the 375px top bar only barely, and there's no room to add more.

### Performance
26. Every recommendation and every Now Showing visit is a fresh LLM call with web search, which takes several seconds and costs money each time. There is no caching.
27. `list('-created_date', 200)` runs on three pages independently, with a hard cap of 200 items.
28. The bundle carries many unused heavy dependencies (three.js, jspdf, html2canvas, quill, leaflet, stripe). Tree-shaking keeps most of them out of the build, but they slow installs and add noise.

---

## Questions for the owner before Phase 1

1. **Location of the new app:** build at the **repo root**, replacing the Base44 files (my recommendation, since the original stays in git history and the zip), or in `app/`?
2. **Git:** this folder is not a git repository yet. Should I `git init` and commit the original as a baseline before Phase 1?
3. **Name:** use "CineMatch" everywhere, dropping "Reel"?
