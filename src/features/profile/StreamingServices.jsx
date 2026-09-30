import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/use-toast';
import ErrorBox from '@/components/ErrorBox';
import { tmdbImage } from '@/lib/tmdb-images';
import { countryName } from '@/lib/tmdb';
import { useStreamingProviders } from '@/features/movies/hooks';

const INITIAL_COUNT = 18;

/**
 * The streaming services the user pays for (TMDB provider ids in
 * profiles.streaming_services). Recommendations rank titles on them higher and
 * show "On Neon" etc. Each tap saves straight away.
 *
 * @param {{ profile: { id: string, country_code: string, streaming_services: string[] } }} props
 */
export default function StreamingServices({ profile }) {
  const queryClient = useQueryClient();
  const providers = useStreamingProviders(profile.country_code);
  const [showAll, setShowAll] = useState(false);
  const selected = new Set((profile.streaming_services ?? []).map(Number));

  const save = useMutation({
    /** @param {number[]} ids */
    mutationFn: async (ids) => {
      const { error } = await supabase
        .from('profiles')
        .update({ streaming_services: ids.map(String) })
        .eq('id', profile.id);
      if (error) throw error;
    },
    onMutate: async (ids) => {
      const key = ['profile', profile.id];
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData(key);
      queryClient.setQueryData(key, (p) => p && { ...p, streaming_services: ids.map(String) });
      return { previous };
    },
    onError: (error, _ids, context) => {
      queryClient.setQueryData(['profile', profile.id], context?.previous);
      toast({ variant: 'destructive', title: "Couldn't save your services", description: error.message });
    },
    // Picks depend on the services, so fetch fresh ones next time.
    onSuccess: () => queryClient.removeQueries({ queryKey: ['recommendations'] }),
  });

  const toggle = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    save.mutate([...next]);
  };

  const list = providers.data ?? [];
  // Chosen services always show, even past the first rows.
  const visible = showAll ? list : list.filter((p, i) => i < INITIAL_COUNT || selected.has(p.provider_id));

  return (
    <section aria-labelledby="services-heading" className="rounded-2xl border border-white/5 bg-white/[0.03] p-5 sm:p-6">
      <h2 id="services-heading" className="font-display text-lg font-semibold text-white">Your streaming services</h2>
      <p className="mt-1 text-sm text-slate-400">
        Tap the ones you pay for in {countryName(profile.country_code)}. Picks on them rank higher and say where to watch.
      </p>

      {providers.isPending && <div className="mt-4 h-28 animate-pulse rounded-xl bg-white/5" />}
      {providers.isError && <div className="mt-4"><ErrorBox message={providers.error.message} onRetry={() => providers.refetch()} /></div>}

      {list.length > 0 && (
        <>
          <ul className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {visible.map((p) => {
              const on = selected.has(p.provider_id);
              return (
                <li key={p.provider_id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(p.provider_id)}
                    className={cn(
                      'relative flex w-full flex-col items-center gap-1.5 rounded-xl border p-2 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400',
                      on ? 'border-amber-400 bg-amber-400/10' : 'border-white/10 bg-white/5 hover:border-white/25'
                    )}
                  >
                    {p.logo_path ? (
                      <img src={tmdbImage(p.logo_path, 'w92')} alt="" loading="lazy" className="h-10 w-10 rounded-lg" />
                    ) : (
                      <span className="h-10 w-10 rounded-lg bg-white/10" aria-hidden="true" />
                    )}
                    <span className="line-clamp-2 text-[11px] leading-tight text-slate-300">{p.provider_name}</span>
                    {on && (
                      <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 text-slate-950">
                        <Check className="h-3 w-3" aria-hidden="true" />
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          {list.length > INITIAL_COUNT && (
            <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-3 text-sm text-amber-300 hover:underline">
              {showAll ? 'Show fewer' : `Show all ${list.length} services`}
            </button>
          )}
          <p className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span>Streaming data from JustWatch via TMDB.</span>
            <Link to="/services" className="text-sm text-amber-300 hover:underline">Which ones should I keep? →</Link>
          </p>
        </>
      )}
    </section>
  );
}
