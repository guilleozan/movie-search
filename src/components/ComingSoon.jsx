import React from 'react';

/** Placeholder panel for views whose data layer is still being rebuilt. */
export default function ComingSoon({ icon: Icon, title, children }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-white/5 bg-white/[0.03] px-6 py-16 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5 text-amber-300">
        <Icon className="h-7 w-7" aria-hidden="true" />
      </span>
      <p className="mt-4 font-medium text-slate-200">{title}</p>
      <div className="mt-1 max-w-sm text-sm text-slate-500">{children}</div>
    </div>
  );
}
