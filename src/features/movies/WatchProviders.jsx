import React from 'react';
import { tmdbImage } from '@/lib/tmdb-images';
import { countryName, providersFor } from '@/lib/tmdb';

const GROUPS = [
  { key: 'stream', label: 'Stream' },
  { key: 'rent', label: 'Rent' },
  { key: 'buy', label: 'Buy' },
];

/**
 * Where to watch in the user's country, grouped Stream / Rent / Buy.
 * Provider data comes from JustWatch via TMDB, which requires the attribution below.
 *
 * @param {{ watchProviders: import('@/lib/tmdb').MovieDetails['watch_providers'], country: string }} props
 */
export default function WatchProviders({ watchProviders, country }) {
  const options = providersFor(watchProviders, country);
  const hasAny = GROUPS.some((g) => options[g.key].length > 0);

  return (
    <section aria-labelledby="where-to-watch">
      <h2 id="where-to-watch" className="font-display text-lg font-semibold text-white">
        Where to watch <span className="text-sm font-normal text-slate-500">in {countryName(country)}</span>
      </h2>

      {hasAny ? (
        <div className="mt-4 space-y-4">
          {GROUPS.filter((g) => options[g.key].length > 0).map((group) => (
            <div key={group.key}>
              <h3 className="text-xs font-medium uppercase tracking-wider text-slate-400">{group.label}</h3>
              <ul className="mt-2 flex flex-wrap gap-2">
                {options[group.key].map((p) => (
                  <li key={p.provider_id}>
                    <a
                      href={options.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={p.provider_name}
                      className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                    >
                      {p.logo_path ? (
                        <img
                          src={tmdbImage(p.logo_path, 'w92')}
                          alt={p.provider_name}
                          loading="lazy"
                          className="h-12 w-12 rounded-xl border border-white/10 object-cover"
                        />
                      ) : (
                        <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-white/5 p-1 text-center text-[10px] text-slate-300">
                          {p.provider_name}
                        </span>
                      )}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm text-slate-400">
          Not available to stream, rent or buy in {countryName(country)} right now.
        </p>
      )}

      <p className="mt-4 text-xs text-slate-500">
        Availability data from{' '}
        <a href="https://www.justwatch.com" target="_blank" rel="noopener noreferrer" className="text-slate-400 underline hover:text-slate-200">
          JustWatch
        </a>
        {options.link && (
          <>
            {' · '}
            <a href={options.link} target="_blank" rel="noopener noreferrer" className="text-slate-400 underline hover:text-slate-200">
              All options on TMDB
            </a>
          </>
        )}
      </p>
    </section>
  );
}
