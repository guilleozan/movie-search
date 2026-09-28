import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const prompt = `You are a film release tracker with up-to-date knowledge of what is currently showing in cinemas worldwide and what is scheduled to release in the next few months. Use your web access to confirm real, current titles and dates — never invent films or release dates.

Return two lists:
1. "in_theaters": real films CURRENTLY playing in cinemas right now (wide release). Aim for 8 varied, notable titles.
2. "upcoming": real films with a CONFIRMED upcoming release date (next ~3 months). Aim for 8 varied, notable titles.

For each film return: title, year (as a string), genre (primary), director, runtime (e.g. "142 min" or "" if unknown), rating (a widely known score like IMDb, or "N/A" if not yet released/rated), tagline (a short one-liner, or "" if none), release_status ("In theaters" for the first list, "Upcoming" for the second), release_date (a short human string like "In theaters now" or "Dec 5, 2025"), and a one-sentence reason describing what it is and why it's worth tracking.`;

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      add_context_from_internet: true,
      model: 'gemini_3_flash',
      response_json_schema: {
        type: 'object',
        properties: {
          in_theaters: {
            type: 'array',
            items: movieSchema()
          },
          upcoming: {
            type: 'array',
            items: movieSchema()
          }
        },
        required: ['in_theaters', 'upcoming']
      }
    });

    return Response.json({
      in_theaters: Array.isArray(result?.in_theaters) ? result.in_theaters : [],
      upcoming: Array.isArray(result?.upcoming) ? result.upcoming : []
    });
  } catch (error) {
    return Response.json({ error: error.message || 'Failed to load now-showing films' }, { status: 500 });
  }
}

function movieSchema() {
  return {
    type: 'object',
    properties: {
      title: { type: 'string' },
      year: { type: 'string' },
      genre: { type: 'string' },
      director: { type: 'string' },
      runtime: { type: 'string' },
      rating: { type: 'string' },
      tagline: { type: 'string' },
      release_status: { type: 'string', enum: ['In theaters', 'Upcoming'] },
      release_date: { type: 'string' },
      reason: { type: 'string' }
    },
    required: ['title', 'release_status', 'reason']
  };
}