import React, { useState } from 'react';
import { ExternalLink, MapPin, Star, Ticket } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui/use-toast';
import ErrorBox from '@/components/ErrorBox';
import { useProfile } from '@/hooks/use-profile';
import { useCinemasNear, useFavouriteCinemas, useToggleFavouriteCinema } from '@/features/cinemas/hooks';
import LocationPicker from '@/features/cinemas/LocationPicker';

const googleSearch = (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`;
const INITIAL_COUNT = 6;

/** "Cinemas near you" on Now Showing: asks for a location first if there isn't one. */
export default function CinemasNear() {
  const { data: profile, isPending: profilePending } = useProfile();
  const cinemas = useCinemasNear();
  const favourites = useFavouriteCinemas();
  const toggle = useToggleFavouriteCinema();
  const [changing, setChanging] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const hasLocation = profile?.lat != null && profile?.lng != null;
  const favouriteIds = new Set((favourites.data ?? []).map((f) => `${f.provider}:${f.external_id}`));
  const isFavourite = (c) => favouriteIds.has(`${c.provider}:${c.id}`);

  // Favourites first, then by distance.
  const list = [...(cinemas.data?.cinemas ?? [])].sort((a, b) => Number(isFavourite(b)) - Number(isFavourite(a)));
  const visible = showAll ? list : list.slice(0, INITIAL_COUNT);

  const onToggle = (cinema) => {
    const favourite = !isFavourite(cinema);
    toggle.mutate(
      { cinema, favourite },
      { onError: (error) => toast({ variant: 'destructive', title: "Couldn't update your cinemas", description: error.message }) }
    );
  };

  return (
    <section aria-labelledby="cinemas-near" className="mb-12">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <div className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-amber-400" aria-hidden="true" />
          <h2 id="cinemas-near" className="font-display text-xl font-semibold text-white">Cinemas near you</h2>
          {hasLocation && profile.city && <span className="text-sm text-slate-500">· {profile.city}</span>}
        </div>
        {hasLocation && (
          <button type="button" onClick={() => setChanging((v) => !v)} className="text-sm text-amber-300 hover:underline">
            {changing ? 'Cancel' : 'Change location'}
          </button>
        )}
      </div>

      {!profilePending && (!hasLocation || changing) && (
        <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-5 sm:p-6">
          {!hasLocation && (
            <p className="mb-4 text-sm text-slate-300">Tell us where you are to see cinemas nearby and find showtimes.</p>
          )}
          <LocationPicker onSaved={() => setChanging(false)} />
        </div>
      )}

      {hasLocation && !changing && (
        <>
          {cinemas.isPending && (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Loading cinemas">
              {Array.from({ length: 3 }, (_, i) => <li key={i} className="h-28 animate-pulse rounded-2xl bg-white/5" />)}
            </ul>
          )}
          {cinemas.isError && <ErrorBox message={cinemas.error.message} onRetry={() => cinemas.refetch()} />}
          {cinemas.isSuccess && list.length === 0 && (
            <p className="rounded-2xl border border-white/5 bg-white/[0.03] px-5 py-8 text-center text-sm text-slate-400">
              We couldn't find cinemas within 15 km.{' '}
              <a href={googleSearch(`cinemas near ${profile.city ?? ''}`)} target="_blank" rel="noopener noreferrer" className="text-amber-300 hover:underline">
                Search the web
              </a>
            </p>
          )}
          {list.length > 0 && (
            <>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {visible.map((c) => (
                  <CinemaCard key={c.id} cinema={c} favourite={isFavourite(c)} onToggle={() => onToggle(c)} />
                ))}
              </ul>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                {list.length > INITIAL_COUNT ? (
                  <button type="button" onClick={() => setShowAll((v) => !v)} className="text-sm text-amber-300 hover:underline">
                    {showAll ? 'Show fewer' : `Show all ${list.length} cinemas`}
                  </button>
                ) : <span />}
                <p className="text-xs text-slate-500">
                  Cinema data ©{' '}
                  <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-300">
                    OpenStreetMap contributors
                  </a>
                </p>
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}

function CinemaCard({ cinema, favourite, onToggle }) {
  return (
    <li className="flex flex-col rounded-2xl border border-white/5 bg-white/[0.03] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-sm font-semibold leading-snug text-white">{cinema.name}</h3>
          <p className="mt-0.5 text-xs text-slate-400">
            {[cinema.distance_km != null && `${cinema.distance_km} km`, cinema.address].filter(Boolean).join(' · ')}
          </p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={favourite}
          aria-label={favourite ? `Remove ${cinema.name} from your cinemas` : `Save ${cinema.name} to your cinemas`}
          title={favourite ? 'Saved' : 'Save cinema'}
          className={cn(
            'shrink-0 rounded-full p-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400',
            favourite ? 'bg-amber-400 text-slate-950 hover:bg-amber-300' : 'bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white'
          )}
        >
          <Star className={cn('h-4 w-4', favourite && 'fill-slate-950')} aria-hidden="true" />
        </button>
      </div>
      <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 pt-3 text-sm">
        <a
          href={googleSearch(`${cinema.name} showtimes`)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-amber-300 hover:underline"
        >
          <Ticket className="h-3.5 w-3.5" aria-hidden="true" /> Showtimes
        </a>
        {cinema.url && (
          <a href={cinema.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-slate-300 hover:text-white">
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> Website
          </a>
        )}
      </div>
    </li>
  );
}
