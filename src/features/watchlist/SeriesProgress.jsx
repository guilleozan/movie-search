import React from 'react';
import { CheckCheck, Play, Plus } from 'lucide-react';
import { useSaveWatchlistItem, useWatchlistItem } from '@/features/watchlist/hooks';
import { episodeLabel, nextEpisode, nextLine } from '@/features/watchlist/series';

const selectClass =
  'h-9 rounded-lg border border-white/10 bg-slate-900 px-2 text-sm text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400';

/**
 * Progress tracking on a series page: start watching, set the last episode seen,
 * step one episode on, or mark the series finished.
 *
 * @param {{ series: { id: number, title: string, season_list?: { season_number: number, episode_count: number }[], next_episode?: object | null } }} props
 */
export default function SeriesProgress({ series }) {
  const item = useWatchlistItem(series.id, 'tv');
  const save = useSaveWatchlistItem();
  const seasons = [...(series.season_list ?? [])].sort((a, b) => a.season_number - b.season_number);
  const key = { tmdb_id: series.id, media_type: 'tv' };

  if (seasons.length === 0) return null;

  const watching = item?.status === 'watching';
  const setProgress = (season, episode) => save.mutate({ ...key, status: 'watching', progress_season: season, progress_episode: episode });
  const next = watching ? nextEpisode(item, series) : null;

  if (!watching) {
    return (
      <section aria-labelledby="progress-heading" className="mt-5 rounded-2xl border border-white/5 bg-white/[0.03] p-4">
        <h2 id="progress-heading" className="text-sm font-medium text-slate-200">Your progress</h2>
        <p className="mt-1 text-sm text-slate-400">
          {item?.status === 'watched' ? 'You finished this one. Rewatching?' : 'Track where you are and see what’s up next.'}
        </p>
        <button
          type="button"
          onClick={() => save.mutate({ ...key, status: 'watching' })}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-amber-400 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-300"
        >
          <Play className="h-4 w-4" aria-hidden="true" /> I'm watching this
        </button>
      </section>
    );
  }

  const season = item.progress_season ?? '';
  const episodes = seasons.find((s) => s.season_number === item.progress_season)?.episode_count ?? 0;

  return (
    <section aria-labelledby="progress-heading" className="mt-5 rounded-2xl border border-amber-400/25 bg-amber-400/5 p-4">
      <h2 id="progress-heading" className="text-sm font-medium text-slate-200">Your progress</h2>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          Last watched: season
          <select
            value={season}
            onChange={(e) => setProgress(Number(e.target.value), 1)}
            className={selectClass}
          >
            {!item.progress_season && <option value="">–</option>}
            {seasons.map((s) => <option key={s.season_number} value={s.season_number}>{s.season_number}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          episode
          <select
            value={item.progress_episode ?? ''}
            disabled={!item.progress_season}
            onChange={(e) => setProgress(item.progress_season, Number(e.target.value))}
            className={selectClass}
          >
            {!item.progress_episode && <option value="">–</option>}
            {Array.from({ length: episodes }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
          </select>
        </label>
        {next?.aired && (
          <button
            type="button"
            onClick={() => setProgress(next.season, next.episode)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-slate-100 hover:border-white/25"
          >
            <Plus className="h-4 w-4" aria-hidden="true" /> Watched {episodeLabel(next.season, next.episode)}
          </button>
        )}
        <button
          type="button"
          onClick={() => save.mutate({ ...key, status: 'watched' })}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm text-slate-300 hover:bg-white/5 hover:text-white"
        >
          <CheckCheck className="h-4 w-4" aria-hidden="true" /> Finished it
        </button>
      </div>
      <p className="mt-2 text-sm text-slate-300">{nextLine(next)}</p>
    </section>
  );
}
