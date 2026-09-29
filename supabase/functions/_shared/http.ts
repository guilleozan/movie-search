// Request helpers shared by the Edge Functions.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from './cors.ts';

/** Service-role client: bypasses RLS, so only use it for rows the caller is allowed to touch. */
export const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

/** An error whose message is safe to show to the client. */
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** The signed-in user's id. The anon key alone is not enough. */
export async function requireUser(req: Request): Promise<string> {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'Sign in required');
  const { data, error } = await admin.auth.getClaims(token);
  if (error || data?.claims?.role !== 'authenticated' || !data.claims.sub) {
    throw new HttpError(401, 'Sign in required');
  }
  return data.claims.sub;
}

/**
 * Wrap a POST JSON handler with CORS, auth and error handling. Unexpected errors
 * are logged and reported as a generic 500, so internals never reach the client.
 */
export function serveJson(handler: (body: Record<string, unknown>, userId: string) => Promise<unknown>) {
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    try {
      if (req.method !== 'POST') throw new HttpError(405, 'Use POST');
      const userId = await requireUser(req);
      const body = await req.json().catch(() => null);
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Invalid body');
      return json(await handler(body, userId), 200);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status);
      console.error(err);
      return json({ error: 'Something went wrong' }, 500);
    }
  });
}
