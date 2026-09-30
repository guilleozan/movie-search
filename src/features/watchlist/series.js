// Series progress: which episode comes next and whether it has aired.

/**
 * @typedef {{ season_number: number, episode_count: number }} Season
 * @typedef {{ season_number: number, episode_number: number, air_date: string | null }} Episode
 * @typedef {{ season: number, episode: number, aired: boolean, airDate: string | null }} NextUp
 */

/** "S2 E5" */
export function episodeLabel(season, episode) {
  return `S${season} E${episode}`;
}

/**
 * The episode after the last one watched (rolling over to the next season), or
 * null when there's nothing after it in TMDB's list. `aired` is false when it's the
 * announced next episode or later.
 *
 * @param {{ progress_season: number | null, progress_episode: number | null }} item
 * @param {{ season_list?: Season[], next_episode?: Episode | null }} series
 * @returns {NextUp | null}
 */
export function nextEpisode(item, series) {
  const seasons = [...(series?.season_list ?? [])].sort((a, b) => a.season_number - b.season_number);
  if (seasons.length === 0) return null;
  let season;
  let episode;
  if (!item.progress_season) {
    [season, episode] = [seasons[0].season_number, 1];
  } else {
    const current = seasons.find((s) => s.season_number === item.progress_season);
    if (current && item.progress_episode < current.episode_count) {
      [season, episode] = [item.progress_season, item.progress_episode + 1];
    } else {
      const following = seasons.find((s) => s.season_number > item.progress_season);
      if (!following) return null;
      [season, episode] = [following.season_number, 1];
    }
  }
  const upcoming = series.next_episode;
  const notYet =
    !!upcoming &&
    (season > upcoming.season_number || (season === upcoming.season_number && episode >= upcoming.episode_number));
  const exact = upcoming && upcoming.season_number === season && upcoming.episode_number === episode;
  return { season, episode, aired: !notYet, airDate: exact ? upcoming.air_date : null };
}

/** "Tue 14 Oct" for an ISO date. */
export function formatAirDate(isoDate) {
  if (!isoDate) return '';
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** "Next: S2 E6", "S3 E1 airs Tue 14 Oct" or "You're up to date". */
export function nextLine(next) {
  if (!next) return "You're up to date.";
  const label = episodeLabel(next.season, next.episode);
  if (next.aired) return `Next: ${label}`;
  return next.airDate ? `${label} airs ${formatAirDate(next.airDate)}` : `Waiting for ${label}`;
}
