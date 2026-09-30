# Showtimes providers: options for real session times

CineMatch ships with the `links` provider: cinemas come from OpenStreetMap, and "showtimes" are links (a web search for the film in your town, plus your saved cinemas' websites). It is free and works in every country, but it shows no actual times.

To show real session times, a paid API has to be plugged into `supabase/functions/showtimes/providers/` (see `paid-api.ts` for the steps). **This is the owner's decision.** None of the vendors below publicly confirms New Zealand coverage, so check with them before signing up.

Researched 30 September 2026 from the vendors' public pages. Prices and coverage change, so treat everything here as a starting point.

## Summary

| | MovieGlu | International Showtimes | SerpApi (Google showtimes) |
|---|---|---|---|
| What it is | Showtimes API (cinemas, films, times) | Showtimes API (cinemas, films, times) | Google search results API; returns the showtimes box Google shows for a query and location |
| Claimed coverage | "Over 125 countries" (about page); the pricing page says "90+ countries" | "120+ countries", "over 25,000 cinema locations" | Wherever Google shows showtimes for that location |
| NZ confirmed publicly? | No | No | No (examples are US only) |
| Pricing | Quote only, "tiered pricing based on number of requests", startup-friendly rates mentioned | Free trial (7 days, all features); Basic from €149/month **per market**; Business from €299/month per market; Enterprise custom | Free plan (about 250 searches/month); paid monthly plans (third-party summaries quote about US$75/month for 5,000 searches) |
| Trial / sandbox | Free sandbox for development, per the developer site | 7-day free trial | Free plan |
| Fits CineMatch because | Built for exactly this use; per-cinema and per-film endpoints map straight onto our interface | Built for this use; one NZ market would be one subscription | Cheapest to try; no contract |
| Watch out for | Terms (caching, attribution) only after contacting them | Basic tier is for "students, not-for-profits & products in development"; posters/trailers and formats are in higher tiers (we already get those from TMDB) | It's scraped Google results: output depends on what Google shows, can change without notice, and Google's terms are a legal grey area for commercial use. Each lookup costs a search credit, so it needs heavy caching |

Other options I found but don't recommend starting with:

- **Gracenote (Nielsen) showtimes**: an enterprise data feed, generally sold to large media companies. Likely out of reach for a small app.
- **Flicks (flicks.co.nz)**: New Zealand's main showtimes site, owned by Vista Group (the NZ cinema software company). I found no public API. If NZ is the main market, it may be worth asking them about a data partnership.
- **Cinema chains directly** (Event, Hoyts, Reading, Lighthouse, Embassy...): many run on Vista's ticketing software, which has APIs, but access needs each cinema's permission. That's one agreement per chain, so it only makes sense later.

## Questions to ask a vendor before signing up

1. Which **New Zealand** cinemas do you cover? Ask for the list and check Event, Hoyts, Reading, Lighthouse, Embassy and a few independents near you.
2. How far ahead are sessions available, and how often are they updated?
3. Price for **one market (NZ)** at our expected volume, and what happens if we go over.
4. Can we **cache** responses (we'd cache per cinema per day), and what **attribution** do you require on screen?
5. Do you return a **booking link** per session?
6. Can we match your films to **TMDB ids** (or IMDb ids), or only by title?

## Sources

- [MovieGlu pricing](https://movieglu.com/pricing/)
- [MovieGlu about / coverage](https://movieglu.com/about/)
- [MovieGlu developer site](https://developer.movieglu.com/)
- [International Showtimes: showtimes API](https://www.internationalshowtimes.com/showtimes-api)
- [International Showtimes: pricing](https://www.internationalshowtimes.com/pricing)
- [SerpApi: Google showtimes results](https://serpapi.com/showtimes-results)
- [SerpApi: pricing](https://serpapi.com/pricing)
- [Gracenote movie showtimes API docs](https://developer.tmsapi.com/docs/read/data_v1_1/movies/movie_showtimes)
