import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, Lightbulb, Tv } from 'lucide-react';
import { cn } from '@/lib/utils';
import ErrorBox from '@/components/ErrorBox';
import { useProfile } from '@/hooks/use-profile';
import { countryName, titlePath } from '@/lib/tmdb';
import { tmdbImage } from '@/lib/tmdb-images';
import { useCountry, useMovies } from '@/features/movies/hooks';
import { useWatchlist } from '@/features/watchlist/hooks';
import { coverage, serviceRows, suggestPlan } from '@/features/services/plan';

// A service the user pays for with this few titles from their list is worth pausing.
const LOW = 2;

/**
 * "Which services should I keep?": how the user's watchlist spreads across
 * streaming services in their country, with a suggested combination.
 */
export default function ServicesPage() {
  const country = useCountry();
  const { data: profile } = useProfile();
  const watchlist = useWatchlist();
  const toWatch = (watchlist.data ?? []).filter((i) => i.status === 'want_to_watch');
  const movies = useMovies(toWatch.filter((i) => i.media_type !== 'tv').map((i) => i.tmdb_id), country);
  const series = useMovies(toWatch.filter((i) => i.media_type === 'tv').map((i) => i.tmdb_id), country, 'tv');
  const mine = useMemo(() => new Set((profile?.streaming_services ?? []).map(Number)), [profile]);

  const titles = toWatch
    .map((i) => {
      const d = (i.media_type === 'tv' ? series.data : movies.data)?.get(i.tmdb_id);
      return d && { ...d, media_type: i.media_type };
    })
    .filter(Boolean);
  const items = coverage(titles, country);
  const rows = serviceRows(items, mine);
  const plan = suggestPlan(items, rows);
  const notStreaming = items.filter((i) => i.services.length === 0).map((i) => i.title);
  // Only suggest pausing services the plan doesn't rely on.
  const lowMine = rows.filter((r) => r.mine && !r.free && r.titles.length <= LOW && !plan.paid.includes(r));
  const unusedMine = [...mine].filter((id) => !rows.some((r) => r.service.provider_id === id));

  const loading = watchlist.isPending || (toWatch.length > 0 && titles.length === 0 && (movies.isPending || series.isPending));
  const error = watchlist.error ?? movies.error ?? series.error;

  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-10 sm:px-8 sm:py-14 lg:px-12">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-white">Your streaming services</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-400">
        Which services in {countryName(country)} carry the films and series on your watchlist, so you can keep, pause or rotate
        subscriptions. Based on {toWatch.length} title{toWatch.length === 1 ? '' : 's'} you want to watch.
      </p>

      {loading && <div className="mt-8 h-40 animate-pulse rounded-2xl bg-white/5" />}
      {error && <div className="mt-8"><ErrorBox message={error.message} onRetry={() => { watchlist.refetch(); movies.refetch(); series.refetch(); }} /></div>}

      {!loading && !error && toWatch.length === 0 && (
        <p className="mt-8 rounded-2xl border border-white/5 bg-white/[0.03] px-6 py-10 text-center text-sm text-slate-400">
          Save a few films or series to your watchlist first. Then this page shows which services have them.{' '}
          <Link to="/" className="text-amber-300 hover:underline">Get some picks</Link>
        </p>
      )}

      {!loading && !error && titles.length > 0 && (
        <>
          <section aria-labelledby="plan" className="mt-8 rounded-2xl border border-amber-400/25 bg-amber-400/5 p-5 sm:p-6">
            <h2 id="plan" className="flex items-center gap-2 font-display text-lg font-semibold text-white">
              <Lightbulb className="h-5 w-5 text-amber-300" aria-hidden="true" /> Suggested
            </h2>
            {plan.streamable === 0 ? (
              <p className="mt-2 text-sm text-slate-300">Nothing on your list is streaming here right now.</p>
            ) : (
              <>
                <p className="mt-2 text-sm text-slate-200">
                  {plan.paid.length > 0 ? (
                    <>
                      Keep <strong>{plan.paid.map((r) => r.service.provider_name).join(' + ')}</strong>
                      {plan.free.length > 0 && <> (plus free {plan.free.map((r) => r.service.provider_name).join(', ')})</>}:
                    </>
                  ) : (
                    <>Free services are enough ({plan.free.map((r) => r.service.provider_name).join(', ')}):</>
                  )}{' '}
                  that covers <strong>{plan.covered} of {plan.streamable}</strong> streamable title{plan.streamable === 1 ? '' : 's'} on your list.
                </p>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {[...plan.paid, ...plan.free].map((r) => <ServiceChip key={r.service.provider_id} row={r} />)}
                </ul>
              </>
            )}
            {(lowMine.length > 0 || unusedMine.length > 0) && (
              <ul className="mt-4 space-y-1 text-sm text-slate-300">
                {lowMine.map((r) => (
                  <li key={r.service.provider_id}>
                    • You pay for <strong>{r.service.provider_name}</strong>, but only {r.titles.length} title{r.titles.length === 1 ? ' is' : 's are'} on your list there. Could be one to pause for now.
                  </li>
                ))}
                {unusedMine.length > 0 && (
                  <li>• {unusedMine.length === 1 ? 'One of your services has' : `${unusedMine.length} of your services have`} nothing from your list right now.</li>
                )}
              </ul>
            )}
            <p className="mt-3 text-xs text-slate-500">
              Availability changes often. Streaming data from JustWatch via TMDB.{' '}
              <Link to="/profile" className="underline hover:text-slate-300">Update your services</Link>
            </p>
          </section>

          <section aria-labelledby="by-service" className="mt-8">
            <h2 id="by-service" className="mb-3 font-display text-lg font-semibold text-white">Your list, by service</h2>
            <ul className="space-y-2">
              {rows.map((r) => <ServiceRow key={r.service.provider_id} row={r} total={titles.length} />)}
            </ul>
          </section>

          {notStreaming.length > 0 && (
            <section aria-labelledby="not-streaming" className="mt-8">
              <h2 id="not-streaming" className="font-display text-lg font-semibold text-white">Not streaming right now ({notStreaming.length})</h2>
              <p className="mt-1 text-sm text-slate-400">To rent or buy, in cinemas, or not out yet.</p>
              <TitleStrip titles={notStreaming} />
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Logo({ service, className }) {
  return service.logo_path ? (
    <img src={tmdbImage(service.logo_path, 'w92')} alt="" className={cn('rounded-lg', className)} loading="lazy" />
  ) : (
    <span className={cn('flex items-center justify-center rounded-lg bg-white/10', className)} aria-hidden="true"><Tv className="h-4 w-4 text-slate-400" /></span>
  );
}

function ServiceChip({ row }) {
  return (
    <li className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/60 py-1 pl-1 pr-3 text-sm text-slate-100">
      <Logo service={row.service} className="h-7 w-7" />
      {row.service.provider_name}
      <span className="text-xs text-slate-400">{row.titles.length}</span>
    </li>
  );
}

function ServiceRow({ row, total }) {
  const [open, setOpen] = useState(false);
  const share = Math.round((row.titles.length / total) * 100);
  return (
    <li className="rounded-2xl border border-white/5 bg-white/[0.03]">
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 p-3 text-left">
        <Logo service={row.service} className="h-10 w-10 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-slate-100">{row.service.provider_name}</span>
            {row.mine && <span className="rounded bg-amber-400/15 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-amber-200">You have it</span>}
            {row.free && <span className="rounded bg-emerald-400/15 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-emerald-200">Free</span>}
          </span>
          <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
            <span className="block h-full rounded-full bg-amber-400" style={{ width: `${share}%` }} />
          </span>
        </span>
        <span className="shrink-0 text-right text-sm text-slate-300">
          {row.titles.length}<span className="text-slate-500"> / {total}</span>
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-slate-500 transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>
      {open && <div className="px-3 pb-3"><TitleStrip titles={row.titles} /></div>}
    </li>
  );
}

function TitleStrip({ titles }) {
  return (
    <ul className="mt-2 flex gap-2 overflow-x-auto pb-1">
      {titles.map((t) => (
        <li key={`${t.media_type}:${t.id}`} className="w-16 shrink-0">
          <Link to={titlePath(t)} title={t.title} className="block">
            {t.poster_path ? (
              <img src={tmdbImage(t.poster_path, 'w92')} alt={t.title} loading="lazy" className="aspect-[2/3] w-16 rounded object-cover" />
            ) : (
              <span className="flex aspect-[2/3] w-16 items-center justify-center rounded bg-white/5 p-1 text-center text-[10px] text-slate-400">{t.title}</span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
