import React from 'react';
import { Clapperboard } from 'lucide-react';
import ComingSoon from '@/components/ComingSoon';

// Rebuilt on TMDB now_playing / upcoming for the user's region in Phases 2 and 5.
export default function NowShowing() {
  return (
    <div className="px-5 sm:px-8 lg:px-12 py-10 sm:py-14 max-w-6xl mx-auto">
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-medium text-amber-300">
          <Clapperboard className="h-3.5 w-3.5" aria-hidden="true" /> Now showing
        </div>
        <h1 className="mt-4 font-display text-3xl sm:text-4xl font-semibold tracking-tight text-white">
          In cinemas & coming soon
        </h1>
        <p className="mt-2 text-slate-400 max-w-md">
          What's playing right now and what's headed to the big screen. Bookmark anything you want to catch.
        </p>
      </div>
      <ComingSoon icon={Clapperboard} title="Showtimes are coming soon">
        We're connecting real cinema listings for your area.
      </ComingSoon>
    </div>
  );
}
