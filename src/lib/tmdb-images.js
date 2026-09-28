// TMDB image URLs. Sizes: https://developer.themoviedb.org/docs/image-basics

const IMAGE_BASE = 'https://image.tmdb.org/t/p';

/**
 * @param {string | null | undefined} path e.g. "/abc.jpg" from TMDB
 * @param {'w92'|'w185'|'w342'|'w500'|'w780'|'w1280'|'original'} size
 * @returns {string | null}
 */
export function tmdbImage(path, size) {
  return path ? `${IMAGE_BASE}/${size}${path}` : null;
}

/** srcset for posters at the three widths cards use. */
export function posterSrcSet(path) {
  if (!path) return undefined;
  return ['w185', 'w342', 'w500'].map((size) => `${IMAGE_BASE}/${size}${path} ${size.slice(1)}w`).join(', ');
}

/** srcset for full-width backdrops. */
export function backdropSrcSet(path) {
  if (!path) return undefined;
  return ['w780', 'w1280'].map((size) => `${IMAGE_BASE}/${size}${path} ${size.slice(1)}w`).join(', ');
}
