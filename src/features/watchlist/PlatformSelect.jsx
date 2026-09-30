import React from 'react';
import { useProfile } from '@/hooks/use-profile';
import { useCountry, useStreamingProviders } from '@/features/movies/hooks';

const OTHER_SERVICES_SHOWN = 15;

/**
 * "Where did you watch it?": the user's services first, then other services in
 * their country, then Cinema / Other. Stores the service's name.
 *
 * @param {{ value: string | null, onChange: (value: string | null) => void, id?: string, className?: string }} props
 */
export default function PlatformSelect({ value, onChange, id, className }) {
  const country = useCountry();
  const { data: profile } = useProfile();
  const { data: providers = [] } = useStreamingProviders(country);

  const mine = new Set((profile?.streaming_services ?? []).map(Number));
  const yours = providers.filter((p) => mine.has(p.provider_id));
  const others = providers.filter((p) => !mine.has(p.provider_id)).slice(0, OTHER_SERVICES_SHOWN);
  // Keep a saved value selectable even if it's no longer in the lists.
  const known = new Set([...providers.map((p) => p.provider_name), 'Cinema', 'Other']);

  return (
    <select
      id={id}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      className={
        className ??
        'h-10 w-full rounded-lg border border-white/10 bg-slate-900 px-2 text-sm text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400'
      }
    >
      <option value="">Don't remember</option>
      {value && !known.has(value) && <option value={value}>{value}</option>}
      {yours.length > 0 && (
        <optgroup label="Your services">
          {yours.map((p) => <option key={p.provider_id} value={p.provider_name}>{p.provider_name}</option>)}
        </optgroup>
      )}
      <optgroup label={yours.length ? 'Other services' : 'Streaming services'}>
        {others.map((p) => <option key={p.provider_id} value={p.provider_name}>{p.provider_name}</option>)}
      </optgroup>
      <optgroup label="Elsewhere">
        <option value="Cinema">Cinema</option>
        <option value="Other">Other</option>
      </optgroup>
    </select>
  );
}
