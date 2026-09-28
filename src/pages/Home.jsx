import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, RefreshCw } from 'lucide-react';
import Quiz from '@/components/Quiz';
import ComingSoon from '@/components/ComingSoon';

// Recommendations are rebuilt on TMDB + the `recommend` Edge Function in Phase 4.
// Until then the quiz runs as before but results are a placeholder.
export default function Home() {
  const [answered, setAnswered] = useState(false);

  return (
    <div className="px-5 sm:px-8 lg:px-12 py-10 sm:py-14 max-w-6xl mx-auto">
      {!answered && (
        <>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-10"
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-medium text-amber-300">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> AI taste quiz
            </div>
            <h1 className="mt-5 font-display text-4xl sm:text-5xl font-semibold tracking-tight text-white">
              Find your next favorite film
            </h1>
            <p className="mt-3 text-slate-400 max-w-md mx-auto">
              Answer a few questions about your taste and get a curated list of films picked just for you.
            </p>
          </motion.div>
          <Quiz onComplete={() => setAnswered(true)} loading={false} />
        </>
      )}

      {answered && (
        <div className="mx-auto max-w-xl">
          <ComingSoon icon={Sparkles} title="Your picks are on the way">
            <p>Recommendations are being rebuilt on real movie data, with posters, trailers and where to watch.</p>
            <button
              onClick={() => setAnswered(false)}
              className="mt-5 inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 hover:border-white/20"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Retake quiz
            </button>
          </ComingSoon>
        </div>
      )}
    </div>
  );
}
