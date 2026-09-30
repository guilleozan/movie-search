// Which streaming services cover the user's watchlist. Pure functions, so the
// page stays a thin view over them.

/**
 * @typedef {{ provider_id: number, provider_name: string, logo_path: string | null }} Service
 * @typedef {{ key: string, title: object, services: (Service & { free: boolean })[] }} Coverage
 * @typedef {{ service: Service, free: boolean, titles: object[], mine: boolean }} ServiceRow
 */

/**
 * Where each title streams in `country` (subscription, free or with ads).
 *
 * @param {object[]} titles summaries with watch_providers for the country
 * @param {string} country
 * @returns {Coverage[]}
 */
export function coverage(titles, country) {
  return titles.map((t) => {
    const entry = t.watch_providers?.[country];
    const free = new Set([...(entry?.free ?? []), ...(entry?.ads ?? [])].map((p) => p.provider_id));
    const seen = new Set();
    const services = [...(entry?.flatrate ?? []), ...(entry?.free ?? []), ...(entry?.ads ?? [])]
      .filter((p) => !seen.has(p.provider_id) && seen.add(p.provider_id))
      .map((p) => ({ provider_id: p.provider_id, provider_name: p.provider_name, logo_path: p.logo_path, free: free.has(p.provider_id) }));
    return { key: `${t.media_type ?? 'movie'}:${t.id}`, title: t, services };
  });
}

/**
 * Services ranked by how many titles they carry.
 *
 * @param {Coverage[]} items
 * @param {Set<number>} mine the user's current services
 * @returns {ServiceRow[]}
 */
export function serviceRows(items, mine) {
  const rows = new Map();
  for (const { title, services } of items) {
    for (const s of services) {
      const row = rows.get(s.provider_id) ?? { service: s, free: s.free, titles: [], mine: mine.has(s.provider_id) };
      // "Free" only if it's free for every title it has.
      row.free = row.free && s.free;
      row.titles.push(title);
      rows.set(s.provider_id, row);
    }
  }
  return [...rows.values()].sort((a, b) => b.titles.length - a.titles.length || Number(b.mine) - Number(a.mine));
}

/**
 * A small set of services that covers as much as possible: every free service,
 * then paid ones greedily by how many uncovered titles each adds. Ties go to
 * services the user already has, then to direct subscriptions over add-on
 * channels (e.g. "HBO Max" over "HBO Max Amazon Channel"). Stops when a service
 * would add nothing.
 *
 * @param {Coverage[]} items
 * @param {ServiceRow[]} rows
 * @param {number} [maxPaid]
 */
export function suggestPlan(items, rows, maxPaid = 3) {
  const uncovered = new Set(items.filter((i) => i.services.length).map((i) => i.key));
  const keysFor = (row) => new Set(items.filter((i) => i.services.some((s) => s.provider_id === row.service.provider_id)).map((i) => i.key));
  const take = (row) => keysFor(row).forEach((k) => uncovered.delete(k));

  const free = rows.filter((r) => r.free);
  free.forEach(take);
  const paid = [];
  while (paid.length < maxPaid && uncovered.size) {
    let best = null;
    let bestGain = 0;
    for (const row of rows) {
      if (row.free || paid.includes(row)) continue;
      const gain = [...keysFor(row)].filter((k) => uncovered.has(k)).length;
      if (gain > bestGain || (gain === bestGain && gain > 0 && preferred(row, best))) {
        best = row;
        bestGain = gain;
      }
    }
    if (!best) break;
    paid.push(best);
    take(best);
  }
  const streamable = items.filter((i) => i.services.length).length;
  return { free, paid, covered: streamable - uncovered.size, streamable };
}

// Add-on subscriptions sold through another service, e.g. "Hayu Amazon Channel".
const isChannel = (row) => /\bchannel\b/i.test(row.service.provider_name);

/** On a tie, is `row` a better suggestion than `best`? */
function preferred(row, best) {
  if (!best) return true;
  if (row.mine !== best.mine) return row.mine;
  return isChannel(best) && !isChannel(row);
}
