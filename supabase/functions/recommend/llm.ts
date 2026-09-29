// LLM adapter for reranking. Provider and model come from Supabase secrets:
//   LLM_PROVIDER = anthropic | openai | gemini
//   LLM_MODEL    = the provider's model id
//   LLM_API_KEY  = the provider's API key
// Every provider is asked for JSON matching `schema`; the caller still validates it.

import Anthropic from 'npm:@anthropic-ai/sdk@0.129';

const PROVIDER = Deno.env.get('LLM_PROVIDER')?.trim().toLowerCase();
const MODEL = Deno.env.get('LLM_MODEL')?.trim();
const API_KEY = Deno.env.get('LLM_API_KEY')?.trim();
// LLM_API_URL only exists so tests can point the Anthropic client at a stub server.
const BASE_URL = Deno.env.get('LLM_API_URL') || undefined;
const TIMEOUT_MS = 60_000;

type JsonSchema = Record<string, unknown>;
type Request = { system: string; user: string; schema: JsonSchema };

const PROVIDERS: Record<string, (req: Request) => Promise<string>> = {
  anthropic: async ({ system, user, schema }) => {
    const client = new Anthropic({ apiKey: API_KEY, baseURL: BASE_URL, timeout: TIMEOUT_MS, maxRetries: 1 });
    const response = await client.messages.create({
      model: MODEL!,
      max_tokens: 16000,
      system,
      messages: [{ role: 'user', content: user }],
      output_config: { format: { type: 'json_schema', schema } },
    });
    if (response.stop_reason === 'refusal') throw new Error('LLM refused the request');
    if (response.stop_reason === 'max_tokens') throw new Error('LLM response was cut off');
    const text = response.content.find((b) => b.type === 'text');
    if (!text || text.type !== 'text') throw new Error('LLM returned no text');
    return text.text;
  },

  openai: async ({ system, user, schema }) => {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        response_format: { type: 'json_schema', json_schema: { name: 'picks', strict: true, schema } },
      }),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new Error('LLM returned no text');
    return content;
  },

  gemini: async ({ system, user, schema }) => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL!)}:generateContent`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'x-goog-api-key': API_KEY!, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        // Gemini's schema dialect doesn't accept additionalProperties.
        generationConfig: { responseMimeType: 'application/json', responseSchema: withoutAdditionalProperties(schema) },
      }),
    });
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const content = data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('');
    if (!content) throw new Error('LLM returned no text');
    return content;
  },
};

/** True when LLM_PROVIDER, LLM_MODEL and LLM_API_KEY are set to something usable. */
export function llmConfigured(): boolean {
  return !!(PROVIDER && MODEL && API_KEY && Object.hasOwn(PROVIDERS, PROVIDER));
}

/** Ask the configured LLM for JSON matching `schema` and parse it. Throws on any failure. */
export async function askJson(req: Request): Promise<unknown> {
  if (!llmConfigured()) throw new Error('LLM is not configured');
  return JSON.parse(await PROVIDERS[PROVIDER!](req));
}

function withoutAdditionalProperties(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(withoutAdditionalProperties);
  if (!schema || typeof schema !== 'object') return schema;
  return Object.fromEntries(
    Object.entries(schema)
      .filter(([key]) => key !== 'additionalProperties')
      .map(([key, value]) => [key, withoutAdditionalProperties(value)]),
  );
}
