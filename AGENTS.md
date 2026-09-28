# AGENTS.md

## Project Context

CineMatch: a movie recommendation app, being rebuilt from a Base44 export onto **React + Vite + Supabase**. Treat it as user-owned application code, keep changes focused on the user's request, and preserve existing project conventions.

- `README.md` has local setup, environment variables and the full rebuild brief (phases, data model, ground rules). Follow the brief's ground rules.
- `docs/AUDIT.md` documents the original Base44 app (quiz, prompts, weak points).

## Key Files

- `src/`: frontend (JavaScript + JSX, shadcn/ui in `src/components/ui`, Tailwind).
- `src/lib/supabase.js`: the only Supabase client.
- `src/lib/AuthContext.jsx`: session state (`useAuth()`).
- `supabase/migrations/`: database schema. Every table needs RLS.
- `supabase/functions/`: Edge Functions (Deno/TypeScript). API keys live only here, as Supabase secrets.
- `.env.local`: local-only values; never commit secrets.

## Working Notes

- Local dev: `npx supabase start` (needs Docker) and `npm run dev`. Emails go to Mailpit at http://127.0.0.1:54324.
- Schema changes go in a new migration file, never by editing an applied one.
- Run `npm run lint` and `npm run build` before finishing code changes.
