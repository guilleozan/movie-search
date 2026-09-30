import React from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * 1-5 stars as a radio group (arrow keys work). Clicking the current value clears it.
 *
 * @param {{ value: number | null, onChange: (value: number | null) => void, size?: 'md' | 'sm' }} props
 */
export function RatingInput({ value, onChange, size = 'md' }) {
  return (
    <div role="radiogroup" aria-label="Your rating" className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          tabIndex={value === n || (!value && n === 1) ? 0 : -1}
          onClick={() => onChange(value === n ? null : n)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
              e.preventDefault();
              onChange(Math.min(5, (value ?? 0) + 1));
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
              e.preventDefault();
              onChange(Math.max(1, (value ?? 2) - 1));
            }
          }}
          className={cn('rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400', size === 'sm' ? 'p-0.5' : 'p-1')}
        >
          <Star
            className={cn(size === 'sm' ? 'h-5 w-5' : 'h-7 w-7', 'transition-colors', value && n <= value ? 'fill-amber-400 text-amber-400' : 'text-slate-600')}
            aria-hidden="true"
          />
        </button>
      ))}
    </div>
  );
}

/** Read-only stars for a saved rating. */
export function RatingStars({ value, className }) {
  if (!value) return null;
  return (
    <span className={cn('inline-flex items-center gap-0.5', className)} aria-label={`Rated ${value} out of 5`} role="img">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={cn('h-3.5 w-3.5', n <= value ? 'fill-amber-400 text-amber-400' : 'text-slate-700')} aria-hidden="true" />
      ))}
    </span>
  );
}
