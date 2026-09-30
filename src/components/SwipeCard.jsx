import React from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';
import { Film } from 'lucide-react';
import { cn } from '@/lib/utils';
import { releaseYear } from '@/lib/tmdb';
import { tmdbImage, posterSrcSet } from '@/lib/tmdb-images';

const SWIPE_DISTANCE = 110;

const exitVariants = {
  exit: (direction) => ({ x: direction * 480, y: direction === 0 ? 480 : 0, rotate: direction * 18, opacity: 0, transition: { duration: 0.28 } }),
};

/**
 * A poster card you drag left or right (used by Quick rate and movie night votes).
 * Place inside <AnimatePresence custom={-1 | 0 | 1}> so it flies off the right way.
 *
 * @param {{ title: object, rightLabel: string, leftLabel: string, onSwipe: (dir: 'left' | 'right') => void, note?: string }} props
 */
export default function SwipeCard({ title, rightLabel, leftLabel, onSwipe, note }) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-240, 240], [-14, 14]);
  const rightOpacity = useTransform(x, [30, SWIPE_DISTANCE], [0, 1]);
  const leftOpacity = useTransform(x, [-SWIPE_DISTANCE, -30], [1, 0]);

  return (
    <motion.div
      className="absolute inset-0 cursor-grab touch-none active:cursor-grabbing"
      style={{ x, rotate }}
      drag="x"
      dragSnapToOrigin
      dragElastic={0.9}
      onDragEnd={(_e, info) => {
        const fling = info.offset.x + info.velocity.x * 0.2;
        if (fling > SWIPE_DISTANCE) onSwipe('right');
        else if (fling < -SWIPE_DISTANCE) onSwipe('left');
      }}
      initial={{ scale: 0.95 }}
      animate={{ scale: 1 }}
      variants={exitVariants}
      exit="exit"
    >
      <SwipePoster title={title} note={note} />
      <motion.span style={{ opacity: rightOpacity }} className="pointer-events-none absolute left-4 top-4 rotate-[-12deg] rounded-lg border-2 border-emerald-400 px-2 py-1 text-lg font-bold uppercase text-emerald-300">
        {rightLabel}
      </motion.span>
      <motion.span style={{ opacity: leftOpacity }} className="pointer-events-none absolute right-4 top-4 rotate-[12deg] rounded-lg border-2 border-rose-400 px-2 py-1 text-lg font-bold uppercase text-rose-300">
        {leftLabel}
      </motion.span>
    </motion.div>
  );
}

/** The poster with its title (and an optional note) along the bottom. */
export function SwipePoster({ title, className, caption = true, note }) {
  return (
    <div className={cn('relative h-full w-full overflow-hidden rounded-3xl border border-white/10 bg-slate-900 shadow-2xl', className)}>
      {title.poster_path ? (
        <img
          src={tmdbImage(title.poster_path, 'w500')}
          srcSet={posterSrcSet(title.poster_path)}
          sizes="(min-width: 448px) 400px, 90vw"
          alt={`${title.title} poster`}
          draggable={false}
          className="h-full w-full select-none object-cover"
        />
      ) : (
        <span className="flex h-full items-center justify-center"><Film className="h-10 w-10 text-slate-600" aria-hidden="true" /></span>
      )}
      {caption && (
        <div className="absolute inset-x-0 bottom-0 rounded-b-3xl bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent p-5 pt-16">
          <p className="font-display text-xl font-semibold text-white">{title.title}</p>
          <p className="mt-0.5 text-sm text-slate-300">
            {[releaseYear(title.release_date), title.genres?.slice(0, 2).map((g) => g.name).join(' · ')].filter(Boolean).join(' · ')}
          </p>
          {note && <p className="mt-1.5 text-xs text-amber-200">{note}</p>}
        </div>
      )}
    </div>
  );
}
