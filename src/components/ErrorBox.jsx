import React from 'react';
import { RefreshCw } from 'lucide-react';

/** Inline error with a "Try again" button, for failed queries. */
export default function ErrorBox({ message, onRetry }) {
  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.03] py-10 text-center">
      <p className="text-rose-300">{message}</p>
      <button onClick={onRetry} className="mt-3 inline-flex items-center gap-1.5 text-sm text-amber-300 hover:underline">
        <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Try again
      </button>
    </div>
  );
}
