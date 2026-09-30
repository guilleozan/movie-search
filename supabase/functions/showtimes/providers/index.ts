import { linksProvider } from './links.ts';
import { paidApiStub } from './paid-api.ts';
import type { ShowtimesProvider } from './types.ts';

const PROVIDERS: Record<string, ShowtimesProvider> = {
  links: linksProvider,
  'paid-api-stub': paidApiStub,
};

/** The provider named by SHOWTIMES_PROVIDER, defaulting to `links`. */
export function activeProvider(): ShowtimesProvider {
  const name = Deno.env.get('SHOWTIMES_PROVIDER')?.trim() || 'links';
  const provider = PROVIDERS[name];
  if (!provider) {
    console.error(`Unknown SHOWTIMES_PROVIDER "${name}", using links`);
    return linksProvider;
  }
  return provider;
}
