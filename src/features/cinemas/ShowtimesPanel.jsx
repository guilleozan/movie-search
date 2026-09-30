import React, { useState } from 'react';
import { ExternalLink, MapPin, Search, Star, Ticket } from 'lucide-react';
import { cn } from '@/lib/utils';
import ErrorBox from '@/components/ErrorBox';
import { useProfile } from '@/hooks/use-profile';
import { countryName } from '@/lib/tmdb';
import { useMovieShowtimes } from '@/features/cinemas/hooks';
import LocationPicker from '@/features/cinemas/LocationPicker';

/**
 * Showtimes for a movie from the active provider. With the `links` provider this is
 * a web search for the user's town plus their saved cinemas.
 *
 * @param {{ movie: { id: number, title: string }, country: string, inCinemas: boolean }} props
 */
export default function ShowtimesPanel({ movie, country, inCinemas }) {
  const { data: profile } = useProfile();
  const showtimes = useMovieShowtimes(movie.id);
  const [settingLocation, setSettingLocation] = useState(false);
  const hasLocation = profile?.city != null;

  const byCinema = groupByCinema(showtimes.data?.showtimes ?? []);
  const searchLinks = (showtimes.data?.links ?? []).filter((l) => l.kind === 'search');
  const cinemaLinks = (showtimes.data?.links ?? []).filter((l) => l.kind === 'cinema');

  return (
    <section aria-labelledby="showtimes-heading">
      <h2 id="showtimes-heading" className="font-display text-lg font-semibold text-white">
        Showtimes {hasLocation && <span className="text-sm font-normal text-slate-500">near {profile.city}</span>}
      </h2>
      {!inCinemas && (
        <p className="mt-2 text-sm text-slate-400">
          Not listed as showing in cinemas in {countryName(country)} right now, but you can still check.
        </p>
      )}

      {showtimes.isPending && <div className="mt-4 h-24 animate-pulse rounded-xl bg-white/5" aria-busy="true" />}
      {showtimes.isError && <div className="mt-4"><ErrorBox message={showtimes.error.message} onRetry={() => showtimes.refetch()} /></div>}

      {byCinema.length > 0 && (
        <ul className="mt-4 space-y-4">
          {byCinema.map(({ name, times }) => (
            <li key={name}>
              <h3 className="text-sm font-medium text-slate-200">{name}</h3>
              <ul className="mt-2 flex flex-wrap gap-2">
                {times.map((t) => (
                  <li key={t.starts_at + (t.format ?? '')}>
                    <a
                      href={t.booking_url ?? undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-sm text-slate-100 hover:border-amber-400"
                    >
                      {formatTime(t.starts_at)}
                      {t.format && <span className="ml-1 text-xs text-slate-400">{t.format}</span>}
                    </a>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      {showtimes.isSuccess && (
        <div className="mt-4 space-y-2">
          {/* The first link (the country's showtimes site, else a web search) is the main action. */}
          {searchLinks.map((l, i) => (
            <a
              key={l.url}
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm transition-colors',
                i === 0
                  ? 'bg-amber-400 font-semibold text-slate-950 hover:bg-amber-300'
                  : 'border border-white/10 bg-white/5 font-medium text-slate-200 hover:border-white/20'
              )}
            >
              {i === 0 ? <Ticket className="h-4 w-4" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />} {l.label}
              <ExternalLink className="ml-auto h-3.5 w-3.5 opacity-60" aria-hidden="true" />
            </a>
          ))}
          {cinemaLinks.length > 0 && (
            <div className="pt-2">
              <h3 className="text-xs font-medium uppercase tracking-wider text-slate-400">Your cinemas</h3>
              <ul className="mt-2 space-y-1.5">
                {cinemaLinks.map((l) => (
                  <li key={l.url + l.label}>
                    <a href={l.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-slate-200 hover:text-white">
                      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden="true" /> {l.label}
                      <ExternalLink className="h-3 w-3 text-slate-500" aria-hidden="true" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {cinemaLinks.length === 0 && hasLocation && (
            <p className="pt-1 text-xs text-slate-500">Star cinemas on Now Showing to get quick links to them here.</p>
          )}
        </div>
      )}

      {showtimes.isSuccess && !hasLocation && (
        <div className="mt-5 border-t border-white/5 pt-4">
          {settingLocation ? (
            <LocationPicker onSaved={() => setSettingLocation(false)} />
          ) : (
            <button type="button" onClick={() => setSettingLocation(true)} className="inline-flex items-center gap-1.5 text-sm text-amber-300 hover:underline">
              <MapPin className="h-3.5 w-3.5" aria-hidden="true" /> Set your location for showtimes nearby
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function groupByCinema(showtimes) {
  const groups = new Map();
  for (const s of showtimes) {
    if (!groups.has(s.cinema_name)) groups.set(s.cinema_name, []);
    groups.get(s.cinema_name).push(s);
  }
  return [...groups].map(([name, times]) => ({ name, times: times.sort((a, b) => a.starts_at.localeCompare(b.starts_at)) }));
}

/** "2026-10-03T19:30:00" -> "7:30 pm" (local time as given by the provider). */
function formatTime(iso) {
  const [, hh = '0', mm = '00'] = iso.match(/T(\d{2}):(\d{2})/) ?? [];
  const h = Number(hh);
  return `${h % 12 || 12}:${mm} ${h < 12 ? 'am' : 'pm'}`;
}
