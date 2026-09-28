import React from 'react';

/** TMDB attribution, required by the TMDB API terms. */
export default function Footer() {
  return (
    <footer className="mt-auto border-t border-white/5 px-5 sm:px-8 lg:px-12 py-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center">
        <a href="https://www.themoviedb.org" target="_blank" rel="noopener noreferrer" className="shrink-0">
          <img src="/tmdb-logo.svg" alt="The Movie Database (TMDB)" className="h-3" />
        </a>
        <p className="text-xs text-slate-500">
          This product uses the TMDB API but is not endorsed or certified by TMDB.
        </p>
      </div>
    </footer>
  );
}
