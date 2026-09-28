import React from 'react';
import { Bookmark } from 'lucide-react';
import ComingSoon from '@/components/ComingSoon';

// Rebuilt on the Supabase watchlist_items table in Phase 3.
export default function Watchlist() {
  return (
    <div className="px-5 sm:px-8 lg:px-12 py-10 sm:py-14 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-white">Watchlist</h1>
        <p className="mt-1 text-sm text-slate-400">Films you've saved to come back to.</p>
      </div>
      <ComingSoon icon={Bookmark} title="Your watchlist is coming soon">
        Saving films, marking them as watched and rating them will be back shortly.
      </ComingSoon>
    </div>
  );
}
