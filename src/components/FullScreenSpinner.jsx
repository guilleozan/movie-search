import React from 'react';

export default function FullScreenSpinner() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background" role="status">
      <div className="w-8 h-8 border-4 border-white/15 border-t-amber-400 rounded-full animate-spin" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
