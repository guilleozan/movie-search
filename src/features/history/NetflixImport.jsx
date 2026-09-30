import React, { useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, FileUp, Film, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { callTmdb, releaseYear } from '@/lib/tmdb';
import { tmdbImage } from '@/lib/tmdb-images';
import { useCountry } from '@/features/movies/hooks';
import { useImportHistory, useWatchlist } from '@/features/watchlist/hooks';
import { parseNetflixCsv } from '@/features/history/netflix';

// Unique titles matched per import: the most recent ones. Keeps a very long
// history from taking minutes to match.
const MAX_TITLES = 600;
const BATCH = 25;

/**
 * Import Netflix viewing history: parse the CSV in the browser, match each title to
 * TMDB (the `match` op only accepts confident matches), let the user review, then
 * add the chosen ones as watched on Netflix with their last watch date.
 */
export default function NetflixImport() {
  const country = useCountry();
  const watchlist = useWatchlist();
  const importHistory = useImportHistory();
  const fileRef = useRef(null);
  const [phase, setPhase] = useState('idle'); // idle | matching | review | done
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [parsed, setParsed] = useState(null); // { rows, titles, skipped }
  const [matches, setMatches] = useState([]); // grouped matched titles
  const [unmatched, setUnmatched] = useState([]);
  const [chosen, setChosen] = useState(() => new Set());
  const [error, setError] = useState('');

  const alreadyWatched = useMemo(
    () => new Set((watchlist.data ?? []).filter((i) => i.status === 'watched').map((i) => `${i.media_type}:${i.tmdb_id}`)),
    [watchlist.data]
  );

  const onFile = async (file) => {
    setError('');
    try {
      const { titles, rows } = parseNetflixCsv(await file.text(), country);
      if (titles.length === 0) throw new Error('No titles found in that file.');
      const kept = titles.slice(0, MAX_TITLES).filter((t) => t.name.length <= 200);
      setParsed({ rows, titles: kept, skipped: titles.length - kept.length });
      setPhase('matching');
      await match(kept);
    } catch (err) {
      setError(err.message);
      setPhase('idle');
    }
  };

  const match = async (titles) => {
    const found = new Map(); // title key -> TMDB summary
    const passes = [
      { list: titles.filter((t) => t.media === 'movie'), media: 'movie', name: (t) => t.name },
      { list: titles.filter((t) => t.media === 'tv'), media: 'tv', name: (t) => t.name },
    ];
    // Retry what didn't match under its alternative name, as a series.
    const retry = () => titles.filter((t) => !found.has(t.key) && t.alt);
    const batches = (list) => Math.ceil(list.length / BATCH);
    let done = 0;
    let total = passes.reduce((n, p) => n + batches(p.list), 0);
    setProgress({ done, total });

    const run = async (list, media, name) => {
      for (let i = 0; i < list.length; i += BATCH) {
        const chunk = list.slice(i, i + BATCH);
        const { results } = await callTmdb('match', { media, titles: chunk.map(name) });
        results.forEach((r, j) => r.match && found.set(chunk[j].key, { ...r.match, media_type: media }));
        done += 1;
        setProgress({ done, total });
      }
    };
    for (const p of passes) await run(p.list, p.media, p.name);
    const second = retry();
    total += batches(second);
    await run(second, 'tv', (t) => t.alt);

    // Several Netflix names can land on the same title (e.g. "Stranger Things 3" and "4").
    const grouped = new Map();
    for (const t of titles) {
      const m = found.get(t.key);
      if (!m) continue;
      const key = `${m.media_type}:${m.id}`;
      const g = grouped.get(key) ?? { key, movie: m, count: 0, lastWatched: null };
      g.count += t.count;
      if (t.lastWatched && (!g.lastWatched || t.lastWatched > g.lastWatched)) g.lastWatched = t.lastWatched;
      grouped.set(key, g);
    }
    const list = [...grouped.values()].sort((a, b) => (b.lastWatched ?? '').localeCompare(a.lastWatched ?? ''));
    setMatches(list);
    setUnmatched(titles.filter((t) => !found.has(t.key)).map((t) => t.name));
    setChosen(new Set(list.filter((g) => !alreadyWatched.has(g.key)).map((g) => g.key)));
    setPhase('review');
  };

  const toggle = (key) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const confirm = () => {
    const rows = matches
      .filter((g) => chosen.has(g.key))
      .map((g) => ({ tmdb_id: g.movie.id, media_type: g.movie.media_type, watched_on: 'Netflix', watched_at: g.lastWatched }));
    importHistory.mutate(
      { rows },
      {
        onSuccess: (n) => {
          toast({ title: `Added ${n} titles to your history`, description: 'Your picks will use them from now on.' });
          setPhase('done');
        },
        onError: (err) => toast({ variant: 'destructive', title: "Couldn't import your history", description: err.message }),
      }
    );
  };

  const reset = () => {
    setPhase('idle');
    setParsed(null);
    setMatches([]);
    setUnmatched([]);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div>
      {phase === 'idle' && (
        <>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-300">
            <li>
              On netflix.com open{' '}
              <a href="https://www.netflix.com/viewingactivity" target="_blank" rel="noopener noreferrer" className="text-amber-300 hover:underline">
                Account → Profile → Viewing activity
              </a>
              .
            </li>
            <li>Scroll to the bottom and choose <strong>Download all</strong>. You get a CSV file.</li>
            <li>Choose that file here. It is read on your device; only the titles are looked up.</li>
          </ol>
          <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-amber-300 focus-within:ring-2 focus-within:ring-amber-400 focus-within:ring-offset-2 focus-within:ring-offset-slate-950">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            />
            <FileUp className="h-4 w-4" aria-hidden="true" /> Choose Netflix CSV
          </label>
          {error && <p className="mt-3 text-sm text-rose-300" role="alert">{error}</p>}
        </>
      )}

      {phase === 'matching' && (
        <div aria-live="polite">
          <p className="flex items-center gap-2 text-sm text-slate-300">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Matching {parsed?.titles.length} titles with the movie database…
          </p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full bg-amber-400 transition-all"
              style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }}
            />
          </div>
        </div>
      )}

      {phase === 'review' && (
        <div>
          <p className="text-sm text-slate-300">
            Found <strong>{matches.length}</strong> titles from {parsed.rows} things watched.
            {unmatched.length > 0 && ` ${unmatched.length} couldn't be matched and are left out.`}
            {parsed.skipped > 0 && ` Only your ${MAX_TITLES} most recent titles were checked.`}
          </p>
          <p className="mt-1 text-xs text-slate-500">Untick anything that's wrong. Titles already in your history start unticked.</p>

          <div className="mt-3 flex items-center gap-3 text-sm">
            <button type="button" onClick={() => setChosen(new Set(matches.map((g) => g.key)))} className="text-amber-300 hover:underline">Select all</button>
            <button type="button" onClick={() => setChosen(new Set())} className="text-amber-300 hover:underline">Select none</button>
          </div>

          <ul className="mt-3 max-h-[28rem] divide-y divide-white/5 overflow-y-auto rounded-xl border border-white/10" aria-label="Titles to import">
            {matches.map((g) => {
              const on = chosen.has(g.key);
              return (
                <li key={g.key}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-white/5">
                    <input type="checkbox" checked={on} onChange={() => toggle(g.key)} className="sr-only" />
                    <span
                      aria-hidden="true"
                      className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded border', on ? 'border-amber-400 bg-amber-400 text-slate-950' : 'border-white/30')}
                    >
                      {on && <Check className="h-3.5 w-3.5" />}
                    </span>
                    {g.movie.poster_path ? (
                      <img src={tmdbImage(g.movie.poster_path, 'w92')} alt="" loading="lazy" className="h-12 w-8 shrink-0 rounded object-cover" />
                    ) : (
                      <span className="flex h-12 w-8 shrink-0 items-center justify-center rounded bg-white/5"><Film className="h-3.5 w-3.5 text-slate-600" aria-hidden="true" /></span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-slate-100">
                        {g.movie.title} <span className="text-slate-500">({releaseYear(g.movie.release_date) || 'n/a'})</span>
                      </span>
                      <span className="block text-xs text-slate-500">
                        {g.movie.media_type === 'tv' ? `Series · ${g.count} episode${g.count > 1 ? 's' : ''}` : 'Film'}
                        {g.lastWatched && ` · last watched ${new Date(g.lastWatched).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                        {alreadyWatched.has(g.key) && ' · already in your history'}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>

          {unmatched.length > 0 && (
            <details className="group mt-3 text-sm">
              <summary className="flex cursor-pointer list-none items-center gap-1 text-slate-400 hover:text-slate-200">
                <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" />
                Not matched ({unmatched.length}) — add these by searching below
              </summary>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">{unmatched.join(' · ')}</p>
            </details>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button onClick={confirm} disabled={chosen.size === 0 || importHistory.isPending}>
              {importHistory.isPending ? 'Adding…' : `Add ${chosen.size} to my history`}
            </Button>
            <Button variant="ghost" onClick={reset} className="text-slate-400 hover:bg-white/5 hover:text-slate-100">Cancel</Button>
          </div>
        </div>
      )}

      {phase === 'done' && (
        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
          <Check className="h-4 w-4 text-emerald-400" aria-hidden="true" /> Imported. Your recommendations now take it into account.
          <button type="button" onClick={reset} className="text-amber-300 hover:underline">Import another file</button>
        </div>
      )}
    </div>
  );
}
