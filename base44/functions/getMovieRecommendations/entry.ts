import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const genres = Array.isArray(body.genres) ? body.genres.filter((g: string) => typeof g === 'string').slice(0, 8) : [];
    const mood = typeof body.mood === 'string' ? body.mood.slice(0, 60) : '';
    const era = typeof body.era === 'string' ? body.era.slice(0, 60) : '';
    const favorites = typeof body.favorites === 'string' ? body.favorites.slice(0, 400) : '';
    const count = Math.min(Math.max(Number(body.count) || 6, 3), 10);

    if (!genres.length && !mood && !favorites) {
      return Response.json({ error: 'Please share at least one preference.' }, { status: 400 });
    }

    const prompt = `You are a thoughtful film curator with deep, current knowledge of world cinema — including films currently showing in theaters and upcoming releases.
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
- reason (1-2 sentences explaining why this specific film fits THIS user's taste, referencing their quiz answers where relevant)`;

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      add_context_from_internet: true,
      model: 'gemini_3_flash',
      response_json_schema: {
        type: 'object',
        properties: {
          movies: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                year: { type: 'string' },
                genre: { type: 'string' },
                director: { type: 'string' },
                runtime: { type: 'string' },
                rating: { type: 'string' },
                tagline: { type: 'string' },
                release_status: { type: 'string', enum: ['Released', 'In theaters', 'Upcoming'] },
                release_date: { type: 'string' },
                reason: { type: 'string' }
              },
              required: ['title', 'year', 'genre', 'release_status', 'reason']
            }
          }
        },
        required: ['movies']
      }
    });

    const movies = Array.isArray(result?.movies) ? result.movies : [];
    return Response.json({ movies });
  } catch (error) {
    return Response.json({ error: error.message || 'Failed to generate recommendations' }, { status: 500 });
  }
}